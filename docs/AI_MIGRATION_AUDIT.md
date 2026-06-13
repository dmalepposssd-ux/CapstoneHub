# AI Migration Audit: Baseline to Academic RAG v2

## Scope

This audit covers the current AI-related implementation in CapstoneHub and defines what should be kept, refactored, replaced, or added during the migration to an Academic RAG architecture.

## Current AI Baseline

The current assistant is an explainable baseline built with TF-IDF, cosine similarity, regular expressions, keyword rules, and heuristic scoring. It is useful and should remain available for comparison during the research phase.

## File-Level Decisions

| File | Status | Decision |
| --- | --- | --- |
| `ai-service/main.py` | REFACTOR | Keep all current endpoints as baseline. Move new semantic/RAG logic into separate modules and expose additive endpoints. |
| `backend/src/routes/ai.js` | REFACTOR | Keep auth and file bridge. Add semantic search and RAG routes that call new FastAPI endpoints. |
| `backend/src/routes/features.js` | KEEP/REFACTOR | Keep blueprint and benchmark logic as baseline. Later compare it against RAG-enhanced blueprint generation. |
| `backend/src/db.js` | REFACTOR | Extend runtime schema creation with pgvector document/chunk tables and model-run tracking. |
| `db/init.sql` | REFACTOR | Add persistent pgvector tables and indexes for fresh Docker databases. |
| `frontend/src/components/FloatingMessages.jsx` | REFACTOR LATER | Keep current assistant UI. Later add RAG mode, evidence snippets, and pipeline labels. |
| `frontend/src/components/AssistantAnalytics.jsx` | REFACTOR LATER | Keep current research dashboard. Later add benchmark v2 and pipeline comparison metrics. |
| `backend/src/assistantBenchmark.js` | KEEP | Keep as the first benchmark dataset. Extend later with retrieval and groundedness metrics. |

## Keep

- Role-based authentication and authorization.
- File upload and local file reading flow.
- Existing PDF/DOCX extraction support.
- Current AI endpoints as baseline:
  - `/match`
  - `/match-advanced`
  - `/concept-check`
  - `/roadmap`
  - `/score-proposal`
  - `/analyze-thesis`
  - `/grade-thesis`
  - `/risk`
  - `/risk-batch`
- Assistant feedback collection.
- Project blueprint storage and supervisor review.
- Benchmark export and feedback export.

## Refactor

- Split new AI v2 logic into modules:
  - `chunking.py`
  - `embeddings.py`
  - `vector_store.py`
- Keep current `main.py`, but only attach new semantic endpoints there for now.
- Add database schema idempotently in both `db/init.sql` and `backend/src/db.js`.
- Add `DATABASE_URL` to the AI service container so FastAPI can access PostgreSQL directly.

## Replace Later

These should not be deleted until the RAG pipeline is validated:

- TF-IDF as the primary project similarity mechanism.
- Regex-only academic document scoring.
- Rule-only blueprint generation.
- Keyword-only supervisor recommendation.

## Add Now

- `ai_documents` table.
- `ai_chunks` table with `embedding vector(768)`.
- `ai_model_runs` table.
- Feedback metadata columns for future evaluation.
- Initial semantic indexing endpoint.
- Initial semantic search endpoint.

## Migration Strategy

1. Add pgvector storage without changing existing behavior.
2. Add AI service modules and endpoints.
3. Index project text manually or via future backend route.
4. Compare semantic search results with current TF-IDF baseline.
5. Add RAG and reranking only after the storage/search foundation is stable.

## Research Baseline

The current system should be explicitly reported as the baseline:

- TF-IDF + cosine similarity.
- Regex section detection.
- Rule-based domain detection.
- Heuristic risk scoring.

The proposed v2 system will be evaluated against this baseline using Precision@K, MRR, NDCG, response time, and user/supervisor feedback.
