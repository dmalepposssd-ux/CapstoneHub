import re
from dataclasses import dataclass
from typing import Any


LABELS = ["weak", "acceptable", "good", "excellent"]


@dataclass
class ClassificationResult:
    label: str
    score: float
    features: dict[str, Any]
    model: str


def section_features(text: str) -> dict[str, Any]:
    lowered = (text or "").lower()
    words = re.findall(r"\w+", lowered)
    citations = len(re.findall(r"\[[0-9]+\]|\([A-Za-z\u0621-\u064A][A-Za-z\u0621-\u064A\s-]+,\s*20[0-9]{2}\)", text or ""))
    method_terms = len(re.findall(r"method|methodology|algorithm|dataset|evaluation|منهجية|خوارزمية|بيانات|تقييم", lowered))
    objective_terms = len(re.findall(r"objective|goal|aim|هدف|أهداف|اهداف", lowered))
    result_terms = len(re.findall(r"result|accuracy|precision|recall|نتيجة|نتائج|دقة", lowered))
    vague_terms = len(re.findall(r"very|really|كتير|ممتاز|رائع|سهل", lowered))
    return {
        "word_count": len(words),
        "citations": citations,
        "method_terms": method_terms,
        "objective_terms": objective_terms,
        "result_terms": result_terms,
        "vague_terms": vague_terms,
        "has_numbers": bool(re.search(r"\d", text or "")),
    }


def heuristic_classify_section(text: str, section_name: str = "general") -> ClassificationResult:
    features = section_features(text)
    score = 20
    score += min(25, features["word_count"] // 18)
    score += min(20, features["citations"] * 5)
    score += min(15, features["method_terms"] * 4)
    score += min(10, features["objective_terms"] * 3)
    score += min(10, features["result_terms"] * 3)
    score += 5 if features["has_numbers"] else 0
    score -= min(10, features["vague_terms"] * 2)
    score = max(0, min(100, score))

    if score >= 82:
        label = "excellent"
    elif score >= 62:
        label = "good"
    elif score >= 40:
        label = "acceptable"
    else:
        label = "weak"

    return ClassificationResult(
        label=label,
        score=round(float(score), 1),
        features={**features, "section_name": section_name},
        model="heuristic_section_quality_baseline",
    )


def classify_section(text: str, section_name: str = "general") -> dict[str, Any]:
    result = heuristic_classify_section(text, section_name)
    recommendations = []
    if result.features["word_count"] < 120:
        recommendations.append("Expand this section with clearer academic detail and supporting explanation.")
    if result.features["citations"] < 2 and section_name in {"introduction", "literature_review", "methodology", "general"}:
        recommendations.append("Add more citations from credible academic sources.")
    if result.features["method_terms"] == 0 and section_name in {"methodology", "general"}:
        recommendations.append("Describe the method, algorithm, dataset, or evaluation process explicitly.")
    if not recommendations:
        recommendations.append("The section is acceptable as a baseline; refine it with supervisor feedback.")

    return {
        "label": result.label,
        "quality_score": result.score,
        "features": result.features,
        "model": result.model,
        "recommendations": recommendations,
    }
