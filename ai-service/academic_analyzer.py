import re
from typing import Any


SECTION_RULES = {
    "abstract": r"\babstract\b|ملخص",
    "introduction": r"\bintroduction\b|مقدمة",
    "problem_statement": r"\bproblem statement\b|\bproblem\b|مشكلة|تحدي|فجوة",
    "objectives": r"\bobjectives?\b|أهداف|اهداف",
    "literature_review": r"\bliterature review\b|\brelated work\b|دراسات سابقة|الأدبيات|ادبيات",
    "methodology": r"\bmethodology\b|\bmethods?\b|منهجية|المنهجية|طريقة",
    "implementation": r"\bimplementation\b|\bsystem design\b|تنفيذ|تصميم النظام",
    "results": r"\bresults?\b|\bevaluation\b|نتائج|تقييم",
    "conclusion": r"\bconclusion\b|خاتمة|استنتاج",
    "references": r"\breferences\b|\bbibliography\b|المراجع|مصادر",
}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def detect_sections(text: str) -> dict[str, bool]:
    lowered = text.lower()
    return {name: bool(re.search(pattern, lowered, re.IGNORECASE)) for name, pattern in SECTION_RULES.items()}


def citation_profile(text: str) -> dict[str, Any]:
    lowered = text.lower()
    ieee = re.findall(r"\[[0-9]{1,3}\]", text)
    apa = re.findall(r"\([A-Za-z\u0621-\u064A][A-Za-z\u0621-\u064A\s-]+,\s*20[0-9]{2}\)", text)
    urls = re.findall(r"https?://\S+|www\.\S+", lowered)
    reference_heading = bool(re.search(SECTION_RULES["references"], lowered, re.IGNORECASE))
    likely_style = "IEEE" if len(ieee) >= len(apa) and ieee else "APA" if apa else "unknown"
    return {
        "ieee_citations": len(ieee),
        "apa_citations": len(apa),
        "url_mentions": len(urls),
        "has_reference_section": reference_heading,
        "likely_style": likely_style,
        "total_citation_markers": len(ieee) + len(apa),
    }


def heading_profile(text: str) -> dict[str, Any]:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    heading_candidates = []
    for line in lines:
        if len(line) <= 90 and (
            re.match(r"^([0-9]+(\.[0-9]+)*\.?\s+)?[A-Z][A-Za-z ]{3,}$", line)
            or re.search(r"^(الفصل|الباب|مقدمة|منهجية|نتائج|خاتمة|المراجع)", line)
        ):
            heading_candidates.append(line)
    numbered = [line for line in heading_candidates if re.match(r"^[0-9]+(\.[0-9]+)*", line)]
    return {
        "heading_candidates": heading_candidates[:20],
        "heading_count": len(heading_candidates),
        "numbered_heading_count": len(numbered),
        "has_numbered_structure": len(numbered) >= 3,
    }


def academic_quality_report(text: str, project_title: str = "") -> dict[str, Any]:
    clean = normalize(text)
    words = re.findall(r"\w+", clean)
    sections = detect_sections(clean)
    citations = citation_profile(clean)
    headings = heading_profile(text)
    figures = len(re.findall(r"\bfigure\b|\bfig\.\b|شكل|صورة", clean.lower()))
    tables = len(re.findall(r"\btable\b|جدول", clean.lower()))

    section_score = round((sum(1 for value in sections.values() if value) / len(sections)) * 100, 1)
    citation_score = 100 if citations["total_citation_markers"] >= 8 and citations["has_reference_section"] else 70 if citations["total_citation_markers"] >= 3 else 35 if citations["has_reference_section"] else 15
    structure_score = 85 if headings["has_numbered_structure"] else 65 if headings["heading_count"] >= 5 else 40
    depth_score = min(100, 25 + len(words) // 45)
    visual_score = min(100, (figures + tables) * 20)
    overall = round((section_score * 0.30) + (citation_score * 0.20) + (structure_score * 0.20) + (depth_score * 0.20) + (visual_score * 0.10), 1)

    missing_sections = [name for name, present in sections.items() if not present]
    recommendations = []
    if missing_sections:
        recommendations.append("Add or clarify missing academic sections: " + ", ".join(missing_sections[:5]) + ".")
    if citations["total_citation_markers"] < 5:
        recommendations.append("Increase in-text citations and make sure every cited work appears in the references section.")
    if not headings["has_numbered_structure"]:
        recommendations.append("Use a consistent numbered heading structure to make chapters and subsections easier to review.")
    if len(words) < 1500:
        recommendations.append("The extracted text is short for a full thesis; verify that all chapters were included.")
    if figures + tables < 2:
        recommendations.append("Add diagrams, tables, or evaluation figures where they support methodology and results.")
    if not recommendations:
        recommendations.append("The document has a reasonable academic structure; focus next on argument quality and supervisor-specific formatting.")

    return {
        "project_title": project_title,
        "word_count": len(words),
        "overall_academic_score": overall,
        "rubric": {
            "section_coverage": section_score,
            "citation_quality": citation_score,
            "heading_structure": structure_score,
            "content_depth": depth_score,
            "figures_and_tables": visual_score,
        },
        "sections": sections,
        "missing_sections": missing_sections,
        "citations": citations,
        "headings": headings,
        "figures": figures,
        "tables": tables,
        "recommendations": recommendations,
        "research_note": "This is a deterministic academic-structure analyzer. It can be compared against a future neural section-quality classifier."
    }
