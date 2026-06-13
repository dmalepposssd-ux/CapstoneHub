import hashlib
import json
import os
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from chunking import TextChunk


DATABASE_URL = os.getenv("DATABASE_URL", "postgres://capstone:capstone@localhost:5432/capstonehub")


def content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{float(value):.8f}" for value in values) + "]"


def connection():
    return psycopg.connect(DATABASE_URL)


def ensure_vector_schema() -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_documents (
                  id SERIAL PRIMARY KEY,
                  source_type TEXT NOT NULL,
                  source_id INTEGER,
                  title TEXT NOT NULL DEFAULT '',
                  language TEXT NOT NULL DEFAULT 'ar',
                  content_hash TEXT,
                  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_chunks (
                  id SERIAL PRIMARY KEY,
                  document_id INTEGER NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
                  chunk_index INTEGER NOT NULL,
                  content TEXT NOT NULL,
                  token_count INTEGER NOT NULL DEFAULT 0,
                  embedding vector(768),
                  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  UNIQUE (document_id, chunk_index)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS ai_model_runs (
                  id SERIAL PRIMARY KEY,
                  pipeline_type TEXT NOT NULL,
                  model_name TEXT NOT NULL DEFAULT '',
                  model_version TEXT NOT NULL DEFAULT '',
                  input_hash TEXT,
                  output JSONB NOT NULL DEFAULT '{}'::jsonb,
                  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_documents_source ON ai_documents(source_type, source_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_documents_metadata ON ai_documents USING GIN(metadata)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_id ON ai_chunks(document_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata ON ai_chunks USING GIN(metadata)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_model_runs_pipeline ON ai_model_runs(pipeline_type, created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw ON ai_chunks USING hnsw (embedding vector_cosine_ops)")
        conn.commit()


def index_document(
    *,
    source_type: str,
    title: str,
    chunks: list[TextChunk],
    embeddings: list[list[float]],
    source_id: int | None = None,
    language: str = "ar",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_vector_schema()
    full_text = "\n\n".join(chunk.content for chunk in chunks)
    metadata = metadata or {}

    with connection() as conn:
        with conn.cursor() as cur:
            if source_id is not None:
                cur.execute(
                    "DELETE FROM ai_documents WHERE source_type = %s AND source_id = %s",
                    [source_type, source_id],
                )
            cur.execute(
                """
                INSERT INTO ai_documents (source_type, source_id, title, language, content_hash, metadata)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                [source_type, source_id, title, language, content_hash(full_text), Jsonb(metadata)],
            )
            document_id = cur.fetchone()[0]
            for chunk, embedding in zip(chunks, embeddings):
                chunk_metadata = {**metadata, **chunk.metadata}
                cur.execute(
                    """
                    INSERT INTO ai_chunks (document_id, chunk_index, content, token_count, embedding, metadata)
                    VALUES (%s, %s, %s, %s, %s::vector, %s)
                    """,
                    [
                        document_id,
                        chunk.index,
                        chunk.content,
                        chunk.token_count,
                        vector_literal(embedding),
                        Jsonb(chunk_metadata),
                    ],
                )
        conn.commit()

    return {"document_id": document_id, "chunks_indexed": len(chunks)}


def search_chunks(
    *,
    query_embedding: list[float],
    top_k: int = 5,
    source_type: str | None = None,
) -> list[dict[str, Any]]:
    ensure_vector_schema()
    top_k = max(1, min(25, int(top_k or 5)))
    params: list[Any] = [vector_literal(query_embedding)]
    where = "WHERE c.embedding IS NOT NULL"
    if source_type:
        params.append(source_type)
        where += f" AND d.source_type = %s"
    params.append(top_k)

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  c.id,
                  c.document_id,
                  d.source_type,
                  d.source_id,
                  d.title,
                  c.chunk_index,
                  c.content,
                  c.metadata,
                  1 - (c.embedding <=> %s::vector) AS similarity
                FROM ai_chunks c
                JOIN ai_documents d ON d.id = c.document_id
                {where}
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
                """,
                [params[0], *params[1:-1], params[0], params[-1]] if source_type else [params[0], params[0], params[-1]],
            )
            rows = cur.fetchall()

    return [
        {
            "chunk_id": row[0],
            "document_id": row[1],
            "source_type": row[2],
            "source_id": row[3],
            "title": row[4],
            "chunk_index": row[5],
            "content": row[6],
            "metadata": row[7] if isinstance(row[7], dict) else json.loads(row[7] or "{}"),
            "similarity": round(float(row[8] or 0) * 100, 2),
        }
        for row in rows
    ]


def fetch_candidate_chunks(limit: int = 500, source_type: str | None = None) -> list[dict[str, Any]]:
    ensure_vector_schema()
    limit = max(1, min(2000, int(limit or 500)))
    where = ""
    params: list[Any] = []
    if source_type:
        where = "WHERE d.source_type = %s"
        params.append(source_type)
    params.append(limit)

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                  c.id,
                  c.document_id,
                  d.source_type,
                  d.source_id,
                  d.title,
                  c.chunk_index,
                  c.content,
                  c.metadata
                FROM ai_chunks c
                JOIN ai_documents d ON d.id = c.document_id
                {where}
                ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC, c.chunk_index
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()

    return [
        {
            "chunk_id": row[0],
            "document_id": row[1],
            "source_type": row[2],
            "source_id": row[3],
            "title": row[4],
            "chunk_index": row[5],
            "content": row[6],
            "metadata": row[7] if isinstance(row[7], dict) else json.loads(row[7] or "{}"),
        }
        for row in rows
    ]


def record_model_run(
    *,
    pipeline_type: str,
    model_name: str = "",
    model_version: str = "",
    input_text: str = "",
    output: dict[str, Any] | None = None,
    metrics: dict[str, Any] | None = None,
) -> int:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_model_runs (pipeline_type, model_name, model_version, input_hash, output, metrics)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                [
                    pipeline_type,
                    model_name,
                    model_version,
                    content_hash(input_text),
                    Jsonb(output or {}),
                    Jsonb(metrics or {}),
                ],
            )
            run_id = cur.fetchone()[0]
        conn.commit()
    return run_id
