import math
from typing import Any

from embeddings import embed_query
from reranking import rerank_results
from vector_store import search_chunks


BENCHMARK_CASES = [
    {
        "id": "rag-001",
        "query": "مشروع تخرج يستخدم الذكاء الاصطناعي لمطابقة الطلاب مع المشرفين",
        "expected_terms": ["ذكاء", "مشرف", "طلاب", "مطابقة", "تخرج", "ai", "supervisor"],
    },
    {
        "id": "rag-002",
        "query": "تحليل ملفات PDF و Word للأطروحات واستخراج الملاحظات الأكاديمية",
        "expected_terms": ["pdf", "word", "أطروحة", "تحليل", "ملفات", "ملاحظات"],
    },
    {
        "id": "rag-003",
        "query": "نظام يتحقق من تكرار فكرة مشروع مع مشاريع مؤرشفة سابقة",
        "expected_terms": ["تكرار", "مشاريع", "مؤرشفة", "تشابه", "فكرة"],
    },
    {
        "id": "rag-004",
        "query": "لوحة مخاطر تتنبأ بتأخر الطالب حسب آخر دخول ورفع الملفات",
        "expected_terms": ["مخاطر", "تأخر", "طالب", "رفع", "ملفات", "دخول"],
    },
]


def contains_expected(result: dict[str, Any], expected_terms: list[str]) -> bool:
    text = f"{result.get('title', '')} {result.get('content', '')}".lower()
    return any(term.lower() in text for term in expected_terms)


def dcg(relevances: list[int]) -> float:
    return sum(rel / math.log2(index + 2) for index, rel in enumerate(relevances))


def evaluate_case(case: dict[str, Any], top_k: int = 5, source_type: str | None = None) -> dict[str, Any]:
    raw_results = search_chunks(query_embedding=embed_query(case["query"]), top_k=top_k, source_type=source_type)
    results = rerank_results(case["query"], raw_results, top_k)
    relevances = [1 if contains_expected(item, case["expected_terms"]) else 0 for item in results]
    relevant_count = sum(relevances)
    precision = relevant_count / max(1, len(results))
    first_relevant = next((index + 1 for index, rel in enumerate(relevances) if rel), None)
    reciprocal_rank = 1 / first_relevant if first_relevant else 0
    ideal = sorted(relevances, reverse=True)
    ndcg = dcg(relevances) / dcg(ideal) if any(ideal) else 0
    return {
        "id": case["id"],
        "query": case["query"],
        "expected_terms": case["expected_terms"],
        "result_count": len(results),
        "precision_at_k": round(precision * 100, 2),
        "reciprocal_rank": round(reciprocal_rank, 4),
        "ndcg": round(ndcg, 4),
        "matches": relevant_count,
        "top_results": [
            {
                "title": item.get("title"),
                "source_type": item.get("source_type"),
                "source_id": item.get("source_id"),
                "similarity": item.get("similarity"),
                "rerank_score": item.get("rerank_score"),
                "relevant": bool(rel),
            }
            for item, rel in zip(results, relevances)
        ],
    }


def run_retrieval_benchmark(top_k: int = 5, source_type: str | None = None) -> dict[str, Any]:
    cases = [evaluate_case(case, top_k, source_type) for case in BENCHMARK_CASES]
    total = len(cases)
    avg_precision = sum(item["precision_at_k"] for item in cases) / max(1, total)
    mrr = sum(item["reciprocal_rank"] for item in cases) / max(1, total)
    avg_ndcg = sum(item["ndcg"] for item in cases) / max(1, total)
    return {
        "summary": {
            "total_cases": total,
            "top_k": top_k,
            "source_type": source_type,
            "average_precision_at_k": round(avg_precision, 2),
            "mrr": round(mrr, 4),
            "average_ndcg": round(avg_ndcg, 4),
            "cases_with_results": sum(1 for item in cases if item["result_count"] > 0),
        },
        "cases": cases,
        "note": "This benchmark measures retrieval quality over currently indexed pgvector chunks. Run project reindexing before using it for research reporting.",
    }
