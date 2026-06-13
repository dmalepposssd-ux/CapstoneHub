import os
import re
from typing import Any


RERANKER_MODEL = os.getenv("RERANKER_MODEL", "")
_cross_encoder = None
_cross_encoder_failed = False


def _load_cross_encoder():
    global _cross_encoder, _cross_encoder_failed
    if _cross_encoder or _cross_encoder_failed:
        return _cross_encoder
    if not RERANKER_MODEL:
        return None
    try:
        from sentence_transformers import CrossEncoder

        _cross_encoder = CrossEncoder(RERANKER_MODEL)
    except Exception:
        _cross_encoder_failed = True
        _cross_encoder = None
    return _cross_encoder


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.\u0621-\u064a]{2,}", (text or "").lower()))


def lexical_overlap(query: str, content: str) -> float:
    query_tokens = _tokens(query)
    content_tokens = _tokens(content)
    if not query_tokens or not content_tokens:
        return 0.0
    return len(query_tokens & content_tokens) / len(query_tokens)


def rerank_results(query: str, results: list[dict[str, Any]], top_n: int = 5) -> list[dict[str, Any]]:
    if not results:
        return []
    top_n = max(1, min(25, int(top_n or 5)))
    model = _load_cross_encoder()

    if model:
        pairs = [(query, item.get("content", "")) for item in results]
        scores = model.predict(pairs)
        reranked = []
        for item, score in zip(results, scores):
            reranked.append({
                **item,
                "rerank_score": round(float(score), 4),
                "reranker": RERANKER_MODEL,
            })
        return sorted(reranked, key=lambda item: item["rerank_score"], reverse=True)[:top_n]

    fallback = []
    for item in results:
        semantic = float(item.get("similarity") or 0) / 100
        lexical = lexical_overlap(query, item.get("content", ""))
        score = (semantic * 0.72) + (lexical * 0.28)
        fallback.append({
            **item,
            "rerank_score": round(score * 100, 2),
            "reranker": "weighted-semantic-lexical-fallback",
        })
    return sorted(fallback, key=lambda item: item["rerank_score"], reverse=True)[:top_n]
