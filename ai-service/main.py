import base64
import io
import re
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pypdf import PdfReader
from docx import Document
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from academic_analyzer import academic_quality_report
from classification import classify_section
from chunking import semantic_chunks
from embeddings import embed_query, embed_texts, embedding_model_name
from evaluation import run_retrieval_benchmark
from llm_adapter import synthesize_with_llm
from plagiarism import compare_against_chunks
from rag import build_grounded_response
from reranking import rerank_results
from vector_store import fetch_candidate_chunks, index_document, record_model_run, search_chunks

app = FastAPI(title="CapstoneHub AI Service", version="1.0.0")


class MatchRequest(BaseModel):
    student: dict[str, Any]
    supervisors: list[dict[str, Any]]


class ProposalRequest(BaseModel):
    text: str
    is_base64_file: bool = False
    filename: str | None = None


class RiskFeatures(BaseModel):
    days_since_last_login: float = 0
    days_since_last_file_upload: float = 0
    completed_milestones_ratio: float = 0
    average_supervisor_response_time: float = 0
    deadline_extensions_requested: float = 0


class ThesisAnalysisRequest(BaseModel):
    text: str
    is_base64_file: bool = False
    filename: str | None = None
    project_title: str = ""


class AdvancedMatchRequest(BaseModel):
    project: dict[str, Any]
    supervisors: list[dict[str, Any]]
    students: list[dict[str, Any]] = []


class ConceptCheckRequest(BaseModel):
    project: dict[str, Any]
    archived_projects: list[dict[str, Any]]


class RoadmapRequest(BaseModel):
    project: dict[str, Any]
    duration_weeks: int = 12


class ThesisGradingRequest(BaseModel):
    text: str
    is_base64_file: bool = False
    filename: str | None = None
    university_guide: dict[str, Any] | None = None


class RiskItem(BaseModel):
    student_id: int
    student_name: str = ""
    project_id: int | None = None
    project_title: str = ""
    features: RiskFeatures


class RiskBatchRequest(BaseModel):
    items: list[RiskItem]


class SemanticIndexRequest(BaseModel):
    source_type: str = "manual"
    source_id: int | None = None
    title: str = ""
    content: str
    language: str = "ar"
    metadata: dict[str, Any] = {}


class SemanticIndexDocumentRequest(BaseModel):
    source_type: str = "submission"
    source_id: int | None = None
    title: str = ""
    text: str
    is_base64_file: bool = False
    filename: str | None = None
    language: str = "ar"
    metadata: dict[str, Any] = {}


class SemanticSearchRequest(BaseModel):
    query: str
    top_k: int = 5
    source_type: str | None = None
    rerank: bool = True
    rerank_top_n: int = 5


class RagAnswerRequest(BaseModel):
    query: str
    top_k: int = 5
    source_type: str | None = None
    task: str = "academic_help"
    rerank: bool = True
    rerank_top_n: int = 5
    use_llm: bool = True


class AcademicAnalysisRequest(BaseModel):
    text: str
    is_base64_file: bool = False
    filename: str | None = None
    project_title: str = ""
    university_guide: dict[str, Any] | None = None


class PlagiarismCheckRequest(BaseModel):
    text: str
    is_base64_file: bool = False
    filename: str | None = None
    source_type: str | None = "archived_project"
    max_candidates: int = 500
    threshold: float = 0.12


class SectionClassificationRequest(BaseModel):
    text: str
    section_name: str = "general"


class RetrievalBenchmarkRequest(BaseModel):
    top_k: int = 5
    source_type: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "capstonehub-ai"}


@app.post("/semantic/index-text")
def semantic_index_text(payload: SemanticIndexRequest):
    try:
        text = normalize_text(payload.content, 120000)
        if not text:
            raise HTTPException(status_code=400, detail="النص فارغ ولا يمكن فهرسته")
        chunks = semantic_chunks(text)
        if not chunks:
            raise HTTPException(status_code=400, detail="تعذر تقسيم النص إلى مقاطع قابلة للفهرسة")
        embeddings = embed_texts([chunk.content for chunk in chunks])
        result = index_document(
            source_type=payload.source_type,
            source_id=payload.source_id,
            title=payload.title or "Untitled academic document",
            language=payload.language,
            metadata=payload.metadata,
            chunks=chunks,
            embeddings=embeddings,
        )
        return {
            **result,
            "embedding_model": embedding_model_name(),
            "embedding_dimension": len(embeddings[0]) if embeddings else 0,
            "note": "هذه فهرسة semantic أولية قابلة للاستبدال لاحقاً بموديل multilingual E5 أو موديل مضبوط على بيانات الجامعة."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في فهرسة النص: {str(e)}")


@app.post("/semantic/index-document")
def semantic_index_document(payload: SemanticIndexDocumentRequest):
    try:
        raw_text = extract_text(ProposalRequest(
            text=payload.text,
            is_base64_file=payload.is_base64_file,
            filename=payload.filename,
        ))
        text = normalize_text(raw_text, 120000)
        if not text:
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص قابل للفهرسة")
        chunks = semantic_chunks(text)
        if not chunks:
            raise HTTPException(status_code=400, detail="تعذر تقسيم المستند إلى مقاطع")
        embeddings = embed_texts([chunk.content for chunk in chunks])
        result = index_document(
            source_type=payload.source_type,
            source_id=payload.source_id,
            title=payload.title or payload.filename or "Untitled academic document",
            language=payload.language,
            metadata={**payload.metadata, "filename": payload.filename},
            chunks=chunks,
            embeddings=embeddings,
        )
        return {
            **result,
            "filename": payload.filename,
            "extracted_characters": len(raw_text),
            "embedding_model": embedding_model_name(),
            "embedding_dimension": len(embeddings[0]) if embeddings else 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في فهرسة المستند: {str(e)}")


@app.post("/semantic/search")
def semantic_search(payload: SemanticSearchRequest):
    try:
        query = normalize_text(payload.query, 4000)
        if not query:
            raise HTTPException(status_code=400, detail="عبارة البحث فارغة")
        results = search_chunks(
            query_embedding=embed_query(query),
            top_k=payload.top_k,
            source_type=payload.source_type,
        )
        if payload.rerank:
            results = rerank_results(query, results, payload.rerank_top_n)
        return {
            "query": query,
            "top_k": max(1, min(25, int(payload.top_k or 5))),
            "embedding_model": embedding_model_name(),
            "rerank": payload.rerank,
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في البحث الدلالي: {str(e)}")


@app.post("/rag/answer")
def rag_answer(payload: RagAnswerRequest):
    try:
        query = normalize_text(payload.query, 4000)
        if not query:
            raise HTTPException(status_code=400, detail="السؤال فارغ")
        results = search_chunks(
            query_embedding=embed_query(query),
            top_k=payload.top_k,
            source_type=payload.source_type,
        )
        if payload.rerank:
            results = rerank_results(query, results, payload.rerank_top_n)
        response = build_grounded_response(query, results, payload.task)
        if payload.use_llm:
            response = synthesize_with_llm(query, response, payload.task)
        run_id = record_model_run(
            pipeline_type="hybrid_rag_llm" if response.get("llm_used") else "retrieval_grounded_template_rag",
            model_name=embedding_model_name(),
            input_text=query,
            output=response,
            metrics={
                "top_k": max(1, min(25, int(payload.top_k or 5))),
                "results": len(results),
                "confidence": response["confidence"],
            },
        )
        return {
            "query": query,
            "task": payload.task,
            "pipeline_type": "hybrid_rag_llm" if response.get("llm_used") else "retrieval_grounded_template_rag",
            "model_run_id": run_id,
            **response
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في توليد إجابة RAG: {str(e)}")


@app.post("/academic/analyze-document")
def academic_analyze_document(payload: AcademicAnalysisRequest):
    try:
        raw_text = extract_text(ProposalRequest(
            text=payload.text,
            is_base64_file=payload.is_base64_file,
            filename=payload.filename,
        ))
        text = normalize_text(raw_text, 120000)
        if not text:
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص من الملف")
        report = academic_quality_report(text, payload.project_title)
        return {
            "filename": payload.filename,
            "extracted_characters": len(raw_text),
            "analyzed_characters": len(text),
            "analysis_version": "academic_structure_v2",
            **report
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في التحليل الأكاديمي المتقدم: {str(e)}")


@app.post("/academic/plagiarism-check")
def plagiarism_check(payload: PlagiarismCheckRequest):
    try:
        raw_text = extract_text(ProposalRequest(
            text=payload.text,
            is_base64_file=payload.is_base64_file,
            filename=payload.filename,
        ))
        text = normalize_text(raw_text, 120000)
        if not text:
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص من الملف")
        candidates = fetch_candidate_chunks(payload.max_candidates, payload.source_type)
        report = compare_against_chunks(text, candidates, payload.threshold)
        return {
            "filename": payload.filename,
            "source_type_filter": payload.source_type,
            "analysis_version": "minhash_lsh_similarity_v1",
            **report,
            "note": "هذا فحص تشابه داخلي مساعد، وليس حكماً نهائياً على الانتحال."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في فحص التشابه الداخلي: {str(e)}")


@app.post("/academic/classify-section")
def academic_classify_section(payload: SectionClassificationRequest):
    try:
        text = normalize_text(payload.text, 12000)
        if not text:
            raise HTTPException(status_code=400, detail="نص القسم فارغ")
        return classify_section(text, payload.section_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تصنيف جودة القسم: {str(e)}")


@app.post("/evaluation/rag-benchmark")
def evaluation_rag_benchmark(payload: RetrievalBenchmarkRequest):
    try:
        return run_retrieval_benchmark(payload.top_k, payload.source_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تشغيل Benchmark الاسترجاع: {str(e)}")


@app.post("/match")
def match_supervisors(payload: MatchRequest):
    try:
        student_text = payload.student.get("interests_text", "")
        if not student_text.strip():
            raise HTTPException(status_code=400, detail="اهتمامات الطالب فارغة")
        
        supervisor_texts = [
            " ".join(s.get("expertise_keywords") or []) + " " + s.get("bio", "")
            for s in payload.supervisors
        ]
        
        if not supervisor_texts:
            raise HTTPException(status_code=400, detail="لا توجد مشرفين متاحين")
        
        corpus = [student_text, *supervisor_texts]
        matrix = TfidfVectorizer(ngram_range=(1, 2), stop_words=['a', 'an', 'the']).fit_transform(corpus)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
        ranked = sorted(zip(payload.supervisors, scores), key=lambda item: item[1], reverse=True)[:3]
        
        return {
            "top_matches": [
                {
                    "supervisor_id": supervisor["user_id"],
                    "name": supervisor.get("full_name"),
                    "score": round(float(score * 100), 2),
                    "keywords": supervisor.get("expertise_keywords", []),
                }
                for supervisor, score in ranked
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في معالجة المطابقة: {str(e)}")


@app.post("/match-advanced")
def match_advanced(payload: AdvancedMatchRequest):
    try:
        query_text = project_text(payload.project)
        if not query_text:
            raise HTTPException(status_code=400, detail="بيانات المشروع فارغة")

        supervisor_texts = [supervisor_text(item) for item in payload.supervisors]
        supervisor_scores = semantic_scores(query_text, supervisor_texts)
        project_terms = as_list(payload.project.get("tech_stack")) + as_list(payload.project.get("keywords"))
        supervisors = []
        for supervisor, score in zip(payload.supervisors, supervisor_scores):
            shared = overlap_terms(project_terms, as_list(supervisor.get("expertise_keywords")) + as_list(supervisor.get("languages")) + as_list(supervisor.get("tools")))
            supervisor_terms = as_list(supervisor.get("expertise_keywords")) + as_list(supervisor.get("languages")) + as_list(supervisor.get("tools"))
            overlap_base = max(1, min(len(set(item.lower() for item in project_terms if item)), len(set(item.lower() for item in supervisor_terms if item))) or 1)
            keyword_score = min(100, (len(shared) / overlap_base) * 100)
            load = float(supervisor.get("current_load") or 0)
            capacity = max(1, float(supervisor.get("max_students_capacity") or 1))
            availability_score = max(0, 100 - (load / capacity) * 100)
            shared_bonus = min(18, len(shared) * 7)
            evidence_floor = 25 if shared else 0
            final_score = min(100, evidence_floor + float(score * 35) + (keyword_score * 0.35) + (availability_score * 0.12) + shared_bonus)
            supervisors.append({
                "supervisor_id": supervisor.get("user_id") or supervisor.get("id"),
                "name": supervisor.get("full_name") or supervisor.get("name"),
                "match_score": round(final_score, 2),
                "semantic_score": round(float(score * 100), 2),
                "keyword_score": round(keyword_score, 2),
                "availability": round(availability_score, 1),
                "shared_keywords": shared[:8],
                "why": [
                    "تشابه دلالي بين فكرة المشروع وخبرة المشرف",
                    "وجود كلمات/تقنيات مشتركة" if shared else "الترشيح مبني على الوصف العام والخبرة النصية",
                    "سعة إشرافية متاحة" if load < capacity else "السعة الحالية مرتفعة"
                ]
            })
        supervisors = sorted(supervisors, key=lambda item: item["match_score"], reverse=True)[:5]

        student_texts = [student_profile_text(item) for item in payload.students]
        student_scores = semantic_scores(query_text, student_texts)
        project_keywords = set(top_keywords(query_text, 12))
        student_matches = []
        for student, score in sorted(zip(payload.students, student_scores), key=lambda item: item[1], reverse=True)[:6]:
            skills = {item.lower() for item in as_list(student.get("skills"))}
            complementary = sorted((skills - project_keywords))[:8]
            shared = sorted(skills & project_keywords)[:8]
            student_score = min(100, float(score * 55) + min(30, len(shared) * 10) + min(15, len(complementary) * 3))
            student_matches.append({
                "student_id": student.get("user_id") or student.get("id"),
                "name": student.get("full_name") or student.get("name"),
                "match_score": round(student_score, 2),
                "shared_skills": shared,
                "complementary_skills": complementary,
                "why": "مرشح كشريك لأن ملفه قريب من فكرة المشروع ويملك مهارات يمكن أن تكمل الفريق."
            })

        return {
            "supervisors": supervisors,
            "teammates": student_matches,
            "method": "Interpretable semantic vectorization with cosine similarity, keyword overlap, and capacity adjustment"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في التوفيق المتقدم: {str(e)}")


@app.post("/concept-check")
def concept_check(payload: ConceptCheckRequest):
    try:
        current_text = project_text(payload.project)
        archived_texts = [project_text(item) for item in payload.archived_projects]
        if not current_text:
            raise HTTPException(status_code=400, detail="فكرة المشروع فارغة")
        if not archived_texts:
            return {
                "duplicate_risk": "low",
                "max_similarity": 0,
                "matches": [],
                "recommendations": ["لا توجد مشاريع مؤرشفة كافية للمقارنة حالياً."]
            }

        scores = semantic_scores(current_text, archived_texts)
        matches = []
        for project, score in sorted(zip(payload.archived_projects, scores), key=lambda item: item[1], reverse=True)[:5]:
            percent = round(float(score * 100), 2)
            tech_overlap = overlap_terms(payload.project.get("tech_stack"), project.get("tech_stack"))
            matches.append({
                "project_id": project.get("id"),
                "title": project.get("title"),
                "year": project.get("year") or project.get("academic_term") or "",
                "similarity": percent,
                "shared_technologies": tech_overlap,
                "reason": "تشابه دلالي مرتفع في الفكرة" if percent >= 70 else "تشابه جزئي في المجال أو التقنيات"
            })

        max_similarity = matches[0]["similarity"] if matches else 0
        if max_similarity >= 75:
            risk = "high"
            advice = "الفكرة قريبة جداً من مشروع سابق. غيّر نطاق العمل أو أضف مساهمة جديدة واضحة."
        elif max_similarity >= 50:
            risk = "medium"
            advice = "يوجد تشابه متوسط. وضّح الفرق العلمي أو التقني قبل تقديم المقترح."
        else:
            risk = "low"
            advice = "لا يظهر تكرار فكري قوي، لكن راجع المشاريع الأقرب للتأكد."

        return {
            "duplicate_risk": risk,
            "max_similarity": max_similarity,
            "matches": matches,
            "recommendations": [advice, "أضف فقرة novelty توضّح ما الجديد في مشروعك مقارنة بالمشاريع السابقة."]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في فحص التكرار: {str(e)}")


def infer_project_domain(text: str) -> str:
    lowered = text.lower()
    if re.search(r"mobile|android|ios|flutter|موبايل|هاتف", lowered):
        return "mobile"
    if re.search(r"ai|machine learning|deep learning|nlp|ذكاء|تعلم", lowered):
        return "ai"
    if re.search(r"iot|sensor|arduino|raspberry|حساس|أجهزة", lowered):
        return "iot"
    if re.search(r"web|dashboard|portal|منصة|موقع", lowered):
        return "web"
    return "general"


@app.post("/roadmap")
def generate_roadmap(payload: RoadmapRequest):
    try:
        text = project_text(payload.project)
        weeks = max(6, min(24, int(payload.duration_weeks or 12)))
        domain = infer_project_domain(text)
        templates = {
            "mobile": ["تحليل المتطلبات", "تصميم UX/UI", "بناء واجهات التطبيق", "ربط API وقاعدة البيانات", "اختبار على أجهزة مختلفة", "توثيق وتسليم"],
            "ai": ["جمع البيانات", "تنظيف البيانات", "بناء النموذج baseline", "تحسين النموذج وتقييمه", "دمج النموذج مع النظام", "توثيق النتائج"],
            "iot": ["تحليل المتطلبات والمكونات", "تصميم الدارة والحساسات", "برمجة المتحكم", "ربط البيانات مع المنصة", "اختبارات ميدانية", "توثيق وتسليم"],
            "web": ["تحليل المتطلبات", "تصميم قاعدة البيانات", "تطوير الواجهات", "تطوير API والصلاحيات", "اختبار وقبول المستخدم", "توثيق وتسليم"],
            "general": ["تحليل المتطلبات", "التصميم", "التنفيذ", "الاختبار", "التحسين", "التوثيق"]
        }
        phases = templates[domain]
        step = max(1, weeks // len(phases))
        milestones = []
        current_week = 1
        for index, phase in enumerate(phases, start=1):
            end_week = weeks if index == len(phases) else min(weeks, current_week + step - 1)
            milestones.append({
                "week_start": current_week,
                "week_end": end_week,
                "title": phase,
                "tasks": [
                    f"تحديد مخرجات مرحلة {phase}",
                    "رفع تقرير قصير للمشرف",
                    "مراجعة الملاحظات وتحديث الخطة"
                ],
                "deliverable": f"مخرج قابل للمراجعة من مرحلة {phase}"
            })
            current_week = end_week + 1

        return {
            "domain": domain,
            "duration_weeks": weeks,
            "milestones": milestones,
            "risks": [
                {"level": "medium", "title": "اتساع النطاق", "mitigation": "ثبّت MVP واضحاً في أول أسبوعين."},
                {"level": "medium", "title": "تأخر الاختبار", "mitigation": "ابدأ الاختبارات الجزئية من منتصف الخطة."}
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في توليد الخطة الزمنية: {str(e)}")


@app.post("/grade-thesis")
def grade_thesis(payload: ThesisGradingRequest):
    try:
        raw_text = extract_text(ProposalRequest(text=payload.text, is_base64_file=payload.is_base64_file, filename=payload.filename))
        text = normalize_text(raw_text)
        if not text:
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص من الملف")
        sections = section_presence(text)
        words = re.findall(r"\w+", text)
        references = len(re.findall(r"\[[0-9]+\]|\([A-Za-z]+,\s*20[0-9]{2}\)|المراجع|references", text.lower()))
        figures = len(re.findall(r"figure|fig\.|شكل|صورة", text.lower()))
        tables = len(re.findall(r"table|جدول", text.lower()))
        format_score = 8 if references >= 3 else 5 if references else 3
        structure_score = min(10, 3 + sum(1 for present in sections.values() if present))
        content_score = min(10, 4 + len(words) // 900 + min(2, figures + tables))
        language_score = max(4, 10 - len([note for note in grammar_notes(text) if note["type"] != "مراجعة أولية"]))
        total = round(np.mean([format_score, structure_score, content_score, language_score]) * 10, 1)
        return {
            "overall_grade": total,
            "rubric": {
                "formatting_and_references": format_score,
                "structure": structure_score,
                "content_depth": content_score,
                "language_quality": language_score
            },
            "detected": {
                "word_count": len(words),
                "references": references,
                "figures": figures,
                "tables": tables,
                "sections": sections
            },
            "summary": " ".join(split_sentences(text)[:4])[:900],
            "recommendations": [
                "تحقق من الالتزام بدليل الجامعة في الهوامش والخطوط يدوياً لأن الملف النصي لا يكفي وحده لاكتشاف كل التنسيق.",
                "عزّز المراجع والاستشهادات إذا كانت قليلة.",
                "راجع الأقسام الناقصة قبل تسليم النسخة النهائية."
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تقييم الأطروحة: {str(e)}")


@app.post("/risk-batch")
def risk_batch(payload: RiskBatchRequest):
    try:
        results = []
        for item in payload.items:
            prediction = predict_risk(item.features)
            results.append({
                "student_id": item.student_id,
                "student_name": item.student_name,
                "project_id": item.project_id,
                "project_title": item.project_title,
                **prediction
            })
        summary = {
            "high": sum(1 for item in results if item["level"] == "high"),
            "medium": sum(1 for item in results if item["level"] == "medium"),
            "low": sum(1 for item in results if item["level"] == "low"),
        }
        return {"summary": summary, "projects": sorted(results, key=lambda item: item["risk_score"], reverse=True)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في لوحة المخاطر: {str(e)}")


def extract_text_from_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطأ في قراءة ملف PDF: {str(e)}")


def extract_text_from_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(paragraph.text for paragraph in doc.paragraphs)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطأ في قراءة ملف DOCX: {str(e)}")


def extract_text(payload: ProposalRequest) -> str:
    if not payload.is_base64_file:
        return payload.text
    
    try:
        data = base64.b64decode(payload.text)
        
        # Try PDF first
        try:
            return extract_text_from_pdf(data)
        except:
            pass
        
        # Try DOCX
        try:
            return extract_text_from_docx(data)
        except:
            pass
        
        return ""
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"خطأ في فك تشفير الملف: {str(e)}")


def normalize_text(text: str, limit: int = 18000) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    return cleaned[:limit]


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in re.split(r"[,،;|]+", str(value)) if item.strip()]


def project_text(project: dict[str, Any]) -> str:
    return normalize_text(" ".join([
        str(project.get("title") or ""),
        str(project.get("abstract") or ""),
        str(project.get("description") or ""),
        " ".join(as_list(project.get("tech_stack"))),
        " ".join(as_list(project.get("keywords"))),
    ]), 6000)


def supervisor_text(supervisor: dict[str, Any]) -> str:
    return normalize_text(" ".join([
        str(supervisor.get("full_name") or supervisor.get("name") or ""),
        str(supervisor.get("specialization") or ""),
        str(supervisor.get("bio") or ""),
        " ".join(as_list(supervisor.get("expertise_keywords"))),
        " ".join(as_list(supervisor.get("languages"))),
        " ".join(as_list(supervisor.get("tools"))),
        str(supervisor.get("previous_projects") or ""),
    ]), 6000)


def student_profile_text(student: dict[str, Any]) -> str:
    return normalize_text(" ".join([
        str(student.get("full_name") or student.get("name") or ""),
        str(student.get("department") or ""),
        str(student.get("interests_text") or ""),
        " ".join(as_list(student.get("skills"))),
        " ".join(as_list(student.get("completed_courses"))),
        " ".join(as_list(student.get("previous_projects"))),
    ]), 6000)


def semantic_scores(query_text: str, candidate_texts: list[str]) -> np.ndarray:
    if not candidate_texts:
        return np.array([])
    corpus = [query_text, *candidate_texts]
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=1,
        lowercase=True
    )
    char_matrix = vectorizer.fit_transform(corpus)
    char_scores = cosine_similarity(char_matrix[0:1], char_matrix[1:]).flatten()

    word_matrix = TfidfVectorizer(ngram_range=(1, 2), min_df=1, lowercase=True).fit_transform(corpus)
    word_scores = cosine_similarity(word_matrix[0:1], word_matrix[1:]).flatten()
    return (char_scores * 0.45) + (word_scores * 0.55)


def overlap_terms(left: Any, right: Any) -> list[str]:
    left_terms = {item.lower() for item in as_list(left)}
    right_terms = {item.lower() for item in as_list(right)}
    return sorted(left_terms & right_terms)


def top_keywords(text: str, limit: int = 8) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}|[\u0621-\u064A]{3,}", text.lower())
    blocked = {"project", "system", "application", "using", "with", "from", "this", "that", "المشروع", "النظام", "تطبيق", "منصة"}
    counts: dict[str, int] = {}
    for word in words:
        if word in blocked:
            continue
        counts[word] = counts.get(word, 0) + 1
    return [word for word, _ in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:limit]]


def split_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"(?<=[.!؟?])\s+|\n+", text) if item.strip()]


def section_presence(text: str) -> dict[str, bool]:
    lowered = text.lower()
    return {
        "abstract": bool(re.search(r"abstract|ملخص", lowered)),
        "introduction": bool(re.search(r"introduction|مقدمة", lowered)),
        "problem": bool(re.search(r"problem|مشكلة|تحدي|فجوة", lowered)),
        "objectives": bool(re.search(r"objectives|أهداف|اهداف", lowered)),
        "methodology": bool(re.search(r"methodology|method|منهجية|طريقة|خوارزمية", lowered)),
        "results": bool(re.search(r"results|نتائج", lowered)),
        "references": bool(re.search(r"references|المراجع|مصادر", lowered)),
    }


def grammar_notes(text: str) -> list[dict[str, str]]:
    notes = []
    sentences = split_sentences(text)
    for sentence in sentences[:80]:
        if len(sentence) > 240:
            notes.append({
                "type": "طول الجملة",
                "text": sentence[:260],
                "suggestion": "قسّم الجملة إلى جملتين أو أكثر لتصبح أوضح أكاديمياً."
            })
        if re.search(r"\s+[,،.؛:]", sentence):
            notes.append({
                "type": "ترقيم",
                "text": sentence[:220],
                "suggestion": "احذف المسافة قبل علامة الترقيم."
            })
        if re.search(r"(very|really|كتير|جداً جداً)", sentence.lower()):
            notes.append({
                "type": "أسلوب",
                "text": sentence[:220],
                "suggestion": "استخدم صياغة أكاديمية أدق بدلاً من المبالغة."
            })
    if not notes:
        notes.append({
            "type": "مراجعة أولية",
            "text": "لم تظهر مشاكل واضحة بالقواعد البسيطة.",
            "suggestion": "راجع النص مع المشرف لأن هذا الفحص مساعد وليس بديلاً عن التدقيق النهائي."
        })
    return notes[:12]


def extract_entities_for_diagrams(text: str) -> list[str]:
    candidates = re.findall(r"\b[A-Z][A-Za-z]{3,}\b|[\u0621-\u064A]{4,}", text)
    blocked = {"This", "That", "With", "From", "Project", "System", "المشروع", "النظام", "الطالب", "الجامعة"}
    entities = []
    for item in candidates:
        normalized = item.strip()
        if normalized in blocked:
            continue
        if normalized not in entities:
            entities.append(normalized)
        if len(entities) >= 6:
            break
    return entities or ["Student", "Project", "Supervisor", "Submission"]


def mermaid_diagrams(text: str, project_title: str = "") -> dict[str, str]:
    entities = extract_entities_for_diagrams(text)
    main = re.sub(r"[^A-Za-z0-9_\u0621-\u064A]", "_", (project_title or "Capstone_System"))[:32] or "Capstone_System"
    erd_lines = ["erDiagram"]
    for entity in entities[:4]:
        clean = re.sub(r"[^A-Za-z0-9_\u0621-\u064A]", "_", entity)
        erd_lines.append(f"  {clean} {{")
        erd_lines.append("    int id")
        erd_lines.append("    string name")
        erd_lines.append("  }")
    if len(entities) >= 2:
        first_entity = re.sub(r"[^A-Za-z0-9_\u0621-\u064A]", "_", entities[0])
        second_entity = re.sub(r"[^A-Za-z0-9_\u0621-\u064A]", "_", entities[1])
        erd_lines.append(f"  {first_entity} ||--o{{ {second_entity} : manages")

    return {
        "flowchart": "\n".join([
            "flowchart TD",
            f"  A[فكرة {main}] --> B[جمع المتطلبات]",
            "  B --> C[تصميم قاعدة البيانات والواجهات]",
            "  C --> D[تنفيذ النظام]",
            "  D --> E[اختبار وتحسين]",
            "  E --> F[توثيق ومناقشة]"
        ]),
        "use_case": "\n".join([
            "flowchart LR",
            "  Student((طالب)) --> UC1[تقديم طلب مشروع]",
            "  Student --> UC2[رفع ملفات الأطروحة]",
            "  Supervisor((مشرف)) --> UC3[مراجعة وتقييم]",
            "  Admin((إدارة)) --> UC4[إدارة المواعيد والتقارير]"
        ]),
        "sequence": "\n".join([
            "sequenceDiagram",
            "  participant S as Student",
            "  participant C as CapstoneHub",
            "  participant P as Supervisor",
            "  S->>C: Upload chapter",
            "  C->>C: Extract and analyze text",
            "  C->>P: Send feedback summary",
            "  P->>S: Review notes"
        ]),
        "erd": "\n".join(erd_lines)
    }


@app.post("/analyze-thesis")
def analyze_thesis(payload: ThesisAnalysisRequest):
    try:
        proposal_payload = ProposalRequest(text=payload.text, is_base64_file=payload.is_base64_file, filename=payload.filename)
        raw_text = extract_text(proposal_payload)
        text = normalize_text(raw_text)
        if not text:
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص من الملف")
        sections = section_presence(text)
        missing = [name for name, present in sections.items() if not present]
        words = re.findall(r"\w+", text)
        readiness = 35
        readiness += sum(6 for present in sections.values() if present)
        readiness += min(15, len(words) // 350)
        readiness = min(100, readiness)
        recommendations = []
        if missing:
            recommendations.append("أقسام تحتاج تدعيم: " + "، ".join(missing))
        if len(words) < 1200:
            recommendations.append("حجم النص المستخرج قصير نسبياً. تأكد أن الملف يحتوي فصول الأطروحة المطلوبة.")
        if not re.search(r"\[[0-9]+\]|\([A-Za-z]+,\s*20[0-9]{2}\)|المراجع|references", text.lower()):
            recommendations.append("أضف مراجع واستشهادات واضحة داخل النص.")
        return {
            "filename": payload.filename,
            "extracted_characters": len(raw_text),
            "analyzed_characters": len(text),
            "word_count": len(words),
            "readiness": readiness,
            "sections": sections,
            "grammar_notes": grammar_notes(text),
            "recommendations": recommendations or ["البنية الأولية جيدة. ركّز على ربط المشكلة بالأهداف والمنهجية والنتائج."],
            "diagrams": mermaid_diagrams(text, payload.project_title),
            "note": "تم استخراج النص برمجياً من الملف ثم تحليل النص المختصر، ولم يتم إرسال الملف كاملاً كنص ضخم."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تحليل الأطروحة: {str(e)}")


@app.post("/score-proposal")
def score_proposal(payload: ProposalRequest):
    try:
        text = extract_text(payload)
        if not text.strip():
            raise HTTPException(status_code=400, detail="لم يتم استخراج نص من الملف")
        
        lowered = text.lower()
        
        # Problem statement analysis
        has_problem = bool(re.search(r"problem|issue|challenge|مشكلة|تحدي|فجوة", lowered))
        has_solution = bool(re.search(r"solution|approach|system|حل|منهجية|نظام", lowered))
        problem_score = 8 if has_problem and has_solution else 5 if has_problem else 3
        
        # SMART objectives
        smart_hits = sum(bool(re.search(pattern, lowered)) for pattern in [
            r"specific|محدد", r"measurable|قياس", r"achievable|قابل", r"relevant|ملائم", r"time|زمن|موعد"
        ])
        
        # References/citations
        references = len(re.findall(r"\[[0-9]+\]|\([a-z]+,\s*20[0-9]{2}\)|references|المراجع", lowered))
        
        # Methodology
        methodology_score = 8 if re.search(r"methodology|method|منهجية|طريقة|خوارزمية|algorithm", lowered) else 4
        
        # Literature review
        literature_score = min(10, 3 + references)
        
        # Overall score
        overall = round(np.mean([problem_score, smart_hits * 2, literature_score, methodology_score]), 1)
        
        # Weaknesses
        weaknesses = []
        if problem_score < 7:
            weaknesses.append("صياغة المشكلة تحتاج إلى ربط أوضح بين الفجوة والحل المقترح.")
        if smart_hits < 4:
            weaknesses.append("الأهداف لا تغطي عناصر SMART بالكامل.")
        if literature_score < 7:
            weaknesses.append("مراجعة الأدبيات أو الاستشهادات قليلة بالنسبة لمقترح تخرج.")
        if methodology_score < 7:
            weaknesses.append("قسم المنهجية يحتاج خطوات تنفيذ وتقييم أوضح.")
        
        return {
            "problem_statement_clarity": problem_score,
            "smart_objectives_check": "Yes" if smart_hits >= 4 else "Partial" if smart_hits >= 2 else "No",
            "literature_review_adequacy": literature_score,
            "methodology_logic": methodology_score,
            "overall_score": overall,
            "weaknesses": weaknesses or ["المقترح متوازن مبدئياً، ويحتاج مراجعة المشرف النهائية."],
            "assistant_note": "هذه قراءة مساعدة فقط، والقرار النهائي للمشرف."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تقييم المقترح: {str(e)}")


@app.post("/risk")
def predict_risk(features: RiskFeatures):
    try:
        # Enhanced risk calculation with better weighting
        login_factor = min(30, features.days_since_last_login * 1.5)
        upload_factor = min(30, features.days_since_last_file_upload * 1.8)
        milestone_factor = (1 - features.completed_milestones_ratio) * 30
        response_factor = min(15, features.average_supervisor_response_time * 0.5)
        extension_factor = features.deadline_extensions_requested * 8
        
        score = login_factor + upload_factor + milestone_factor + response_factor + extension_factor
        risk = max(0, min(100, round(score, 1)))
        
        if risk >= 70:
            level = "high"
        elif risk >= 40:
            level = "medium"
        else:
            level = "low"
        
        return {
            "risk_score": risk,
            "level": level,
            "notify_supervisor": risk >= 70,
            "recommendations": generate_recommendations(features, risk, level)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في حساب المخاطر: {str(e)}")


def generate_recommendations(features: RiskFeatures, risk: float, level: str) -> list[str]:
    recommendations = []
    
    if features.days_since_last_login > 7:
        recommendations.append("التحقق من الطالب - لم يدخل المنصة منذ وقت طويل")
    if features.days_since_last_file_upload > 14:
        recommendations.append("التأكد من تقدم الطالب - لم يرفع ملفات جديدة")
    if features.completed_milestones_ratio < 0.3:
        recommendations.append("مراجعة المراحل المكتملة - التقدم بطيء")
    if features.average_supervisor_response_time > 5:
        recommendations.append("تحسين التواصل بين الطالب والمشرف")
    if features.deadline_extensions_requested > 2:
        recommendations.append("توفير دعم إضافي للطالب")
    
    return recommendations or ["الطالب يسير بشكل جيد"]
