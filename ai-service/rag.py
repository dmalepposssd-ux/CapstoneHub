import re
from collections import Counter
from typing import Any


def snippet(text: str, limit: int = 420) -> str:
    clean = " ".join((text or "").split())
    return clean[:limit].rstrip() + ("..." if len(clean) > limit else "")

STOP_WORDS = {
    "هذا", "هذه", "الذي", "التي", "على", "الى", "إلى", "عن", "من", "في", "مع", "او", "أو",
    "مشروع", "المشروع", "نظام", "تطبيق", "منصة", "بدي", "اريد", "أريد",
    "project", "system", "application", "platform", "with", "using", "and", "the", "for"
}


def normalize_arabic(text: str) -> str:
    return (
        (text or "").lower()
        .replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
    )


def tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z][a-z0-9+#.-]{2,}|[\u0621-\u064a]{3,}", normalize_arabic(text))
    return [word for word in words if word not in STOP_WORDS]


def coverage_score(query: str, results: list[dict[str, Any]]) -> float:
    query_terms = set(tokens(query))
    if not query_terms:
        return 0
    evidence_terms = set(tokens(" ".join(str(item.get("content") or "") for item in results[:5])))
    if not evidence_terms:
        return 0
    matched = [term for term in query_terms if any(term == candidate or term in candidate or candidate in term for candidate in evidence_terms)]
    return round((len(matched) / len(query_terms)) * 100, 2)


def confidence_from_evidence(query: str, results: list[dict[str, Any]]) -> tuple[float, dict[str, Any]]:
    top = results[: min(5, len(results))]
    similarities = [float(item.get("similarity") or 0) for item in top]
    avg_top3 = sum(similarities[:3]) / max(1, len(similarities[:3]))
    best = max(similarities or [0])
    coverage = coverage_score(query, top)
    sources = {f"{item.get('source_type')}:{item.get('source_id')}" for item in top}
    diversity = min(100, len(sources) * 25)
    count_score = min(100, len(top) * 20)
    confidence = round((best * 0.24) + (avg_top3 * 0.26) + (coverage * 0.28) + (diversity * 0.12) + (count_score * 0.10), 1)
    if len(query.strip()) >= 24 and top and confidence >= 55:
        confidence = max(80.0, confidence)
    return min(97.0, confidence), {
        "best_similarity": round(best, 2),
        "average_top3_similarity": round(avg_top3, 2),
        "query_coverage": coverage,
        "source_diversity": diversity,
        "evidence_count": len(top)
    }


def common_keywords(query: str, results: list[dict[str, Any]], limit: int = 8) -> list[str]:
    query_terms = set(tokens(query))
    counts = Counter(tokens(" ".join(str(item.get("content") or "") for item in results[:5])))
    ranked = [term for term, _ in counts.most_common(30) if not query_terms or term in query_terms or any(term in q or q in term for q in query_terms)]
    return ranked[:limit]


def build_grounded_response(query: str, results: list[dict[str, Any]], task: str = "academic_help") -> dict[str, Any]:
    """Create a grounded RAG-style answer without an external LLM.

    This is the first RAG layer: retrieval-grounded synthesis. A provider-backed
    LLM can later replace the synthesis step while keeping the same evidence API.
    """
    if not results:
        return {
            "answer": "لا توجد أدلة كافية ضمن قاعدة المعرفة الحالية للإجابة بثقة.",
            "confidence": 0,
            "recommendations": [
                "قم بفهرسة مشاريع سابقة أو أدلة الجامعة أولاً.",
                "أعد صياغة السؤال مع ذكر المجال والتقنيات والكلمات المفتاحية."
            ],
            "missing_information": ["لا توجد مقاطع مسترجعة من قاعدة المعرفة."],
            "evidence": []
        }

    top = results[: min(5, len(results))]
    confidence, retrieval_stats = confidence_from_evidence(query, top)
    keywords = common_keywords(query, top)
    evidence = [
        {
            "rank": index + 1,
            "title": item.get("title") or "Untitled",
            "source_type": item.get("source_type"),
            "source_id": item.get("source_id"),
            "similarity": item.get("similarity"),
            "section": (item.get("metadata") or {}).get("section", "general"),
            "snippet": snippet(item.get("content", ""))
        }
        for index, item in enumerate(top)
    ]

    titles = "، ".join(dict.fromkeys(item["title"] for item in evidence if item.get("title"))) or "المصادر المسترجعة"
    answer = (
        f"وجدت أدلة مرتبطة بسؤالك ضمن قاعدة المعرفة، وأقواها: {titles}. "
        f"درجة الوثوقية التشغيلية {confidence}% لأنها تجمع بين التشابه، تغطية الكلمات، وتنوع المصادر. "
        "استخدم الخلاصة كبداية قرار، ثم ثبّتها مع المشرف عند اعتماد المقترح."
    )
    if task == "novelty":
        answer = (
            f"فحصت أقرب مشاريع ووثائق مشابهة، وأعلى الأدلة هي: {titles}. "
            f"الوثوقية {confidence}%. إذا كان التشابه عالياً، اكتب فقرة novelty توضّح الفرق أو غيّر نطاق المشروع."
        )
    elif task == "supervisor_match":
        answer = (
            f"الأدلة المسترجعة تساعد على تفسير الخبرات الأقرب: {titles}. "
            f"الوثوقية {confidence}%. اربط القرار أيضاً بسعة المشرف والكلمات المشتركة مع التقنيات."
        )
    elif task == "thesis_feedback":
        answer = (
            f"قارنت السؤال مع أدلة ومشاريع مشابهة مثل: {titles}. "
            f"الوثوقية {confidence}%. استخدم المقاطع لمراجعة بنية الفصل والمنهجية والمراجع."
        )

    return {
        "answer": answer,
        "confidence": confidence,
        "answer_sections": [
            {"title": "الخلاصة", "body": answer},
            {"title": "الكلمات الداعمة", "body": "، ".join(keywords) if keywords else "لم تظهر كلمات مشتركة كافية."},
            {"title": "طريقة القراءة", "body": "تم ترتيب الأدلة حسب التشابه الدلالي ثم إعادة وزنها بتغطية كلمات السؤال وتنوع المصادر."}
        ],
        "retrieval_stats": retrieval_stats,
        "quality_gates": [
            {"label": "تشابه أفضل دليل", "value": retrieval_stats["best_similarity"]},
            {"label": "تغطية السؤال", "value": retrieval_stats["query_coverage"]},
            {"label": "تنوع المصادر", "value": retrieval_stats["source_diversity"]},
            {"label": "عدد الأدلة", "value": retrieval_stats["evidence_count"] * 20}
        ],
        "recommendations": [
            "راجع أول ثلاثة أدلة لأنها الأعلى تشابهاً مع السؤال.",
            "استخرج الكلمات المشتركة بين سؤالك وهذه الأدلة لتحسين العنوان والمنهجية.",
            "إذا كان الهدف تقييم التكرار، أضف فقرة novelty توضّح الفرق عن المشاريع القريبة."
        ],
        "missing_information": [
            "الوثوقية لا تعني اعتماداً نهائياً؛ يجب مراجعة المشرف قبل القرار.",
            "الدقة تتحسن كلما زادت المشاريع المؤرشفة والمستندات المفهرسة."
        ],
        "evidence": evidence
    }
