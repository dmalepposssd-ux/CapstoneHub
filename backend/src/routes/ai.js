import express from "express";
import fs from "fs";
import path from "path";
import { query } from "../db.js";
import { allowRoles, requireApproved, requireAuth } from "../middleware.js";

const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
export const aiRouter = express.Router();
aiRouter.use(requireAuth);
aiRouter.use(requireApproved);

async function aiPost(pathname, body) {
  const response = await fetch(`${aiUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.detail || payload.message || "تعذر تنفيذ طلب الذكاء الاصطناعي");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function splitTechStack(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/[,،;|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const ragStopWords = new Set(["مشروع", "المشروع", "نظام", "تطبيق", "منصة", "على", "الى", "إلى", "عن", "من", "في", "مع", "هذا", "هذه", "project", "system", "application", "platform", "with", "using"]);

function ragNormalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function ragStem(token = "") {
  return ragNormalize(token)
    .replace(/^ال/, "")
    .replace(/^(لل|بال|كال|وال)/, "")
    .replace(/(ات|ون|ين)$/g, "")
    .replace(/ه$/g, "")
    .trim();
}

function ragTokens(value = "") {
  return [...new Set((ragNormalize(value).match(/[a-z][a-z0-9+#.-]{2,}|[\u0621-\u064a]{3,}/g) || [])
    .map(ragStem)
    .filter((item) => item && item.length > 2 && !ragStopWords.has(item)))];
}

function ragProjectSimilarity(queryText, project) {
  const left = ragTokens(queryText);
  const right = ragTokens(`${project.title} ${project.abstract} ${(project.tech_stack || []).join(" ")}`);
  if (!left.length || !right.length) return 0;
  const shared = left.filter((token) => right.some((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate)));
  const queryCoverage = shared.length / left.length;
  const evidenceDensity = shared.length / Math.max(1, right.length);
  const techOverlap = (project.tech_stack || []).filter((tech) => left.some((token) => ragNormalize(tech).includes(token) || token.includes(ragNormalize(tech)))).length;
  const queryNorm = ragNormalize(queryText);
  const projectNorm = ragNormalize(`${project.title} ${project.abstract}`);
  const phraseBonus =
    (queryNorm.includes("مشاريع التخرج") && projectNorm.includes("مشاريع التخرج") ? 18 : 0)
    + (queryNorm.includes("مشرف") && projectNorm.includes("مشرف") ? 10 : 0)
    + (queryNorm.includes("اطروحه") && projectNorm.includes("اطروحه") ? 10 : 0)
    + ((queryNorm.includes("ذكاء") || queryNorm.includes("ذكي")) && (projectNorm.includes("ذكاء") || projectNorm.includes("ذكي")) ? 12 : 0);
  return Math.min(100, Math.round(queryCoverage * 65 + evidenceDensity * 20 + Math.min(15, techOverlap * 7) + phraseBonus));
}

function isDemoEvidence(item = {}) {
  const title = String(item.title || "").toLowerCase();
  return item.source_type === "manual_test"
    || title.includes("ai search test")
    || title === "qa follow up project"
    || title === "dthdh"
    || title.includes("????");
}

async function fallbackProjectEvidence(queryText, topK = 5) {
  const rows = await query(`
    SELECT p.id, p.title, p.abstract, p.tech_stack, p.status, p.is_archived,
      student.full_name AS student_name,
      supervisor.full_name AS supervisor_name
    FROM projects p
    JOIN users student ON student.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    LEFT JOIN users supervisor ON supervisor.id = COALESCE(st.supervisor_id, p.preferred_supervisor_id)
    WHERE p.title NOT LIKE '%?%' AND COALESCE(p.abstract, '') NOT LIKE '%?%'
    ORDER BY p.is_archived DESC, p.created_at DESC
    LIMIT 100
  `);
  return rows
    .map((project) => ({
      rank: 0,
      title: project.title,
      source_type: project.is_archived ? "archived_project_db" : "active_project_db",
      source_id: project.id,
      similarity: ragProjectSimilarity(queryText, project),
      section: project.status,
      snippet: String(project.abstract || "").slice(0, 420),
      student_name: project.student_name,
      supervisor_name: project.supervisor_name,
      shared_technologies: (project.tech_stack || []).filter((tech) => ragTokens(queryText).some((token) => ragNormalize(tech).includes(token) || token.includes(ragNormalize(tech)))).slice(0, 8)
    }))
    .filter((item) => !isDemoEvidence(item) && item.similarity >= 25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, Math.min(10, Number(topK || 5))))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function enhanceRagWithFallback(response, fallbackEvidence) {
  if (!fallbackEvidence.length) return response;
  const existingEvidence = (response.evidence || []).filter((item) => !isDemoEvidence(item));
  const merged = [...existingEvidence, ...fallbackEvidence]
    .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
    .slice(0, 8)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const best = Number(merged[0]?.similarity || 0);
  const avgTop3 = Math.round((merged.slice(0, 3).reduce((sum, item) => sum + Number(item.similarity || 0), 0) / Math.max(1, Math.min(3, merged.length))) * 100) / 100;
  const dbBest = Math.max(...fallbackEvidence.map((item) => Number(item.similarity || 0)));
  const dbSupportedConfidence = dbBest >= 70 ? 90 : dbBest >= 40 ? 82 : dbBest >= 35 && fallbackEvidence.length >= 2 ? 82 : dbBest >= 30 ? 76 : 55;
  const confidence = Math.max(Number(response.confidence || 0), dbSupportedConfidence);
  const titles = merged.slice(0, 3).map((item) => item.title).filter(Boolean).join("، ");
  return {
    ...response,
    confidence: Math.min(97, Math.round(confidence)),
    evidence: merged,
    pipeline_type: `${response.pipeline_type || "rag"}+db_project_fallback`,
    answer: `اعتمدت على أقرب أدلة من RAG وقاعدة مشاريع المنصة، وأقوى نتيجة هي: ${titles || "لا يوجد عنوان واضح"}. أعلى تشابه حالياً ${best}%. استخدم الأدلة المعروضة لتحديد التشابه أو الفرق قبل اعتماد الفكرة.`,
    recommendations: [
      ...(response.recommendations || []),
      "تم تعزيز الإجابة بأدلة مباشرة من قاعدة مشاريع المنصة.",
      "إذا كان أعلى تشابه فوق 70% فاكتب بوضوح ما الإضافة الجديدة في مشروعك."
    ].slice(0, 6),
    retrieval_stats: {
      ...(response.retrieval_stats || {}),
      rag_service_best_similarity: response.retrieval_stats?.best_similarity,
      best_similarity: best,
      average_top3_similarity: avgTop3,
      evidence_count: merged.length,
      db_fallback_evidence: fallbackEvidence.length,
      db_fallback_best_similarity: dbBest
    }
  };
}

async function getProjectForAi(projectId, user) {
  const [project] = await query(`
    SELECT p.*, st.supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [projectId]);
  if (!project) return null;
  const allowed =
    user.role === "admin" ||
    project.student_id === user.id ||
    project.supervisor_id === user.id ||
    project.preferred_supervisor_id === user.id;
  return allowed ? project : false;
}

async function getStudentRiskFeatures(studentId, user) {
  const params = [studentId];
  let userFilter = "";
  if (user.role === "supervisor") {
    params.push(user.id);
    userFilter = "AND (st.supervisor_id = $2 OR p.preferred_supervisor_id = $2)";
  }
  const [row] = await query(`
    SELECT
      st.user_id AS student_id,
      u.full_name AS student_name,
      p.id AS project_id,
      p.title AS project_title,
      GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(u.last_login_at, u.created_at)))::float AS days_since_last_login,
      GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(MAX(sub.submitted_at), p.created_at)))::float AS days_since_last_file_upload,
      COALESCE(ms.completed::float / NULLIF(ms.total, 0), 0)::float AS completed_milestones_ratio,
      COALESCE(ext.extensions, 0)::float AS deadline_extensions_requested,
      CASE
        WHEN MAX(m.scheduled_at) IS NULL THEN 10
        ELSE LEAST(10, GREATEST(0, EXTRACT(DAY FROM now() - MAX(m.scheduled_at))) / 2)
      END::float AS average_supervisor_response_time
    FROM students st
    JOIN users u ON u.id = st.user_id
    JOIN projects p ON p.student_id = st.user_id
    LEFT JOIN submissions sub ON sub.project_id = p.id
    LEFT JOIN meetings m ON m.student_id = st.user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'done' OR completed_at IS NOT NULL)::int AS completed
      FROM milestones
      WHERE project_id = p.id
    ) ms ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS extensions
      FROM notifications n
      WHERE n.user_id = st.user_id AND n.message ILIKE '%تمديد%'
    ) ext ON true
    WHERE st.user_id = $1
      AND p.is_archived = false
      AND p.status IN ('approved', 'pending_review', 'revision_requested')
      ${userFilter}
    GROUP BY st.user_id, u.full_name, u.last_login_at, u.created_at, p.id, p.title, p.created_at, ms.completed, ms.total, ext.extensions
    ORDER BY p.deadline NULLS LAST, p.created_at DESC
    LIMIT 1
  `, params);
  return row || null;
}

function riskFeaturesFromRow(row) {
  return {
    days_since_last_login: Number(row.days_since_last_login || 0),
    days_since_last_file_upload: Number(row.days_since_last_file_upload || 0),
    completed_milestones_ratio: Number(row.completed_milestones_ratio || 0),
    average_supervisor_response_time: Number(row.average_supervisor_response_time || 0),
    deadline_extensions_requested: Number(row.deadline_extensions_requested || 0)
  };
}

aiRouter.post("/match/:studentId", allowRoles("student", "admin"), async (req, res) => {
  const [student] = await query("SELECT * FROM students WHERE user_id = $1", [req.params.studentId]);
  if (!student) return res.status(404).json({ message: "Student not found" });
  if (req.user.role === "student" && Number(req.params.studentId) !== req.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const supervisors = await query(`
    SELECT s.user_id, u.full_name, s.expertise_keywords, s.bio
    FROM supervisors s JOIN users u ON u.id = s.user_id
  `);
  const response = await fetch(`${aiUrl}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student, supervisors })
  });
  const matches = await response.json();
  await query("DELETE FROM ai_matchings WHERE student_id = $1 AND status = 'suggested'", [student.user_id]);
  for (const match of matches.top_matches) {
    await query(
      "INSERT INTO ai_matchings (student_id, supervisor_id, similarity_score) VALUES ($1, $2, $3)",
      [student.user_id, match.supervisor_id, match.score]
    );
  }
  res.json(matches);
});

aiRouter.post("/advanced-match", allowRoles("student", "admin"), async (req, res) => {
  try {
    const studentId = req.user.role === "student" ? req.user.id : Number(req.body.studentId || req.user.id);
    const [student] = await query(`
      SELECT st.*, u.full_name, u.department
      FROM students st
      JOIN users u ON u.id = st.user_id
      WHERE st.user_id = $1
    `, [studentId]);
    if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

    const project = {
      title: req.body.title || req.body.project?.title || "",
      abstract: req.body.abstract || req.body.project?.abstract || "",
      tech_stack: splitTechStack(req.body.techStack || req.body.project?.tech_stack),
      keywords: splitTechStack(req.body.keywords || req.body.project?.keywords)
    };

    const supervisors = await query(`
      SELECT s.user_id, u.full_name, u.department, s.specialization, s.bio, s.expertise_keywords,
             s.languages, s.tools, s.current_load, s.max_students_capacity,
             COALESCE(prev.previous_projects, '') AS previous_projects
      FROM supervisors s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT string_agg(p.title || ' ' || p.abstract, ' ') AS previous_projects
        FROM projects p
        WHERE p.preferred_supervisor_id = s.user_id OR EXISTS (
          SELECT 1 FROM students st WHERE st.user_id = p.student_id AND st.supervisor_id = s.user_id
        )
      ) prev ON true
      WHERE u.profile_status = 'approved'
        AND COALESCE(u.avatar_url, '') <> ''
        AND COALESCE(s.specialization, '') <> ''
        AND COALESCE(s.bio, '') <> ''
        AND cardinality(s.languages) > 0
        AND cardinality(s.tools) > 0
        AND cardinality(s.expertise_keywords) > 0
    `);
    const students = await query(`
      SELECT st.user_id, u.full_name, u.department, st.interests_text,
             array_remove(array_agg(DISTINCT tech), NULL) AS skills,
             string_agg(DISTINCT p.title || ' ' || p.abstract, ' ') AS previous_projects
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN projects p ON p.student_id = st.user_id
      LEFT JOIN LATERAL unnest(p.tech_stack) tech ON true
      WHERE st.user_id <> $1 AND u.profile_status = 'approved'
      GROUP BY st.user_id, u.full_name, u.department, st.interests_text
      LIMIT 50
    `, [studentId]);
    const result = await aiPost("/match-advanced", { project: { ...project, student }, supervisors, students });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تنفيذ التوفيق المتقدم" });
  }
});

aiRouter.post("/semantic-search", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const queryText = String(req.body.query || "").trim();
    if (!queryText) return res.status(400).json({ message: "عبارة البحث مطلوبة" });
    res.json(await aiPost("/semantic/search", {
      query: queryText,
      top_k: Number(req.body.topK || req.body.top_k || 5),
      source_type: req.body.sourceType || req.body.source_type || null,
      rerank: req.body.rerank !== false,
      rerank_top_n: Number(req.body.rerankTopN || req.body.rerank_top_n || 5)
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تنفيذ البحث الدلالي" });
  }
});

aiRouter.post("/rag-answer", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const queryText = String(req.body.query || "").trim();
    if (!queryText) return res.status(400).json({ message: "السؤال مطلوب" });
    const response = await aiPost("/rag/answer", {
      query: queryText,
      top_k: Number(req.body.topK || req.body.top_k || 5),
      source_type: req.body.sourceType || req.body.source_type || null,
      task: req.body.task || "academic_help",
      rerank: req.body.rerank !== false,
      rerank_top_n: Number(req.body.rerankTopN || req.body.rerank_top_n || 5),
      use_llm: req.body.useLlm !== false && req.body.use_llm !== false
    });
    const needsFallback = Number(response.confidence || 0) < 80 || !(response.evidence || []).length;
    const fallbackEvidence = needsFallback ? await fallbackProjectEvidence(queryText, Number(req.body.topK || req.body.top_k || 5)) : [];
    res.json(enhanceRagWithFallback(response, fallbackEvidence));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر توليد إجابة RAG" });
  }
});

aiRouter.post("/semantic/index-project/:projectId", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const project = await getProjectForAi(req.params.projectId, req.user);
    if (project === false) return res.status(403).json({ message: "لا تملك صلاحية فهرسة هذا المشروع" });
    if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
    const content = [
      project.title,
      project.abstract,
      (project.tech_stack || []).join(", "),
      project.supervisor_feedback || ""
    ].filter(Boolean).join("\n\n");
    res.json(await aiPost("/semantic/index-text", {
      source_type: project.is_archived ? "archived_project" : "active_project",
      source_id: project.id,
      title: project.title,
      content,
      language: "ar",
      metadata: {
        status: project.status,
        academic_term: project.academic_term,
        student_id: project.student_id,
        preferred_supervisor_id: project.preferred_supervisor_id,
        tech_stack: project.tech_stack || []
      }
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر فهرسة المشروع دلالياً" });
  }
});

aiRouter.post("/semantic/reindex-projects", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.body.limit || 50)));
    const conditions = ["p.title IS NOT NULL", "p.abstract IS NOT NULL"];
    const params = [];
    if (req.body.archivedOnly || req.body.archived_only) conditions.push("p.is_archived = true");
    if (req.body.activeOnly || req.body.active_only) conditions.push("p.is_archived = false");
    if (req.user.role === "supervisor") {
      params.push(req.user.id);
      conditions.push(`(st.supervisor_id = $${params.length} OR p.preferred_supervisor_id = $${params.length})`);
    }
    params.push(limit);
    const projects = await query(`
      SELECT p.*, st.supervisor_id
      FROM projects p
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.is_archived DESC, p.archived_at DESC NULLS LAST, p.created_at DESC
      LIMIT $${params.length}
    `, params);

    const indexed = [];
    const failed = [];
    for (const project of projects) {
      const content = [
        project.title,
        project.abstract,
        (project.tech_stack || []).join(", "),
        project.supervisor_feedback || ""
      ].filter(Boolean).join("\n\n");
      try {
        const result = await aiPost("/semantic/index-text", {
          source_type: project.is_archived ? "archived_project" : "active_project",
          source_id: project.id,
          title: project.title,
          content,
          language: "ar",
          metadata: {
            status: project.status,
            academic_term: project.academic_term,
            student_id: project.student_id,
            preferred_supervisor_id: project.preferred_supervisor_id,
            tech_stack: project.tech_stack || []
          }
        });
        indexed.push({ project_id: project.id, title: project.title, ...result });
      } catch (err) {
        failed.push({ project_id: project.id, title: project.title, message: err.message });
      }
    }

    res.json({
      requested: limit,
      found: projects.length,
      indexed_count: indexed.length,
      failed_count: failed.length,
      indexed,
      failed
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر إعادة فهرسة المشاريع" });
  }
});

aiRouter.post("/semantic/index-submission/:submissionId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const [submission] = await query(`
      SELECT s.*, p.title AS project_title, p.student_id, st.supervisor_id
      FROM submissions s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE s.id = $1
    `, [req.params.submissionId]);
    if (!submission) return res.status(404).json({ message: "الملف غير موجود" });
    const allowed =
      req.user.role === "admin" ||
      (req.user.role === "student" && submission.student_id === req.user.id) ||
      (req.user.role === "supervisor" && submission.supervisor_id === req.user.id);
    if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية فهرسة هذا الملف" });

    const localPath = submission.file_url ? submission.file_url.replace("/uploads/", "uploads/") : "";
    if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ message: "ملف الرفع غير موجود على الخادم" });
    const extension = path.extname(localPath).toLowerCase();
    if (![".pdf", ".docx"].includes(extension)) return res.status(400).json({ message: "الفهرسة تدعم PDF و DOCX فقط" });
    res.json(await aiPost("/semantic/index-document", {
      source_type: "submission",
      source_id: submission.id,
      title: `${submission.project_title} - ${submission.chapter_name}`,
      text: fs.readFileSync(localPath).toString("base64"),
      is_base64_file: true,
      filename: path.basename(localPath),
      language: "ar",
      metadata: {
        project_id: submission.project_id,
        student_id: submission.student_id,
        chapter_name: submission.chapter_name
      }
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر فهرسة ملف التسليم" });
  }
});

aiRouter.post("/semantic/index-rubrics", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const rubrics = await query("SELECT * FROM rubric_templates WHERE is_active = true ORDER BY created_at DESC LIMIT 100");
    const indexed = [];
    for (const rubric of rubrics) {
      const criteria = (rubric.criteria || []).map((item) => `${item.name || ""}: ${item.description || ""} ${item.maxScore || ""}`).join("\n");
      const content = `${rubric.title}\n\n${criteria}`;
      const result = await aiPost("/semantic/index-text", {
        source_type: "rubric",
        source_id: rubric.id,
        title: rubric.title,
        content,
        language: "ar",
        metadata: {
          created_by: rubric.created_by,
          criteria_count: (rubric.criteria || []).length
        }
      });
      indexed.push({ rubric_id: rubric.id, title: rubric.title, ...result });
    }
    res.json({ indexed_count: indexed.length, indexed });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر فهرسة معايير التقييم" });
  }
});

aiRouter.post("/concept-check", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    let project = null;
    if (req.body.projectId) {
      project = await getProjectForAi(req.body.projectId, req.user);
      if (project === false) return res.status(403).json({ message: "لا تملك صلاحية فحص هذا المشروع" });
      if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
    } else {
      project = {
        title: req.body.title || "",
        abstract: req.body.abstract || "",
        tech_stack: splitTechStack(req.body.techStack)
      };
    }
    const archived = await query(`
      SELECT p.id, p.title, p.abstract, p.tech_stack, p.academic_term, EXTRACT(YEAR FROM COALESCE(p.archived_at, p.created_at))::int AS year
      FROM projects p
      WHERE p.is_archived = true
        AND ($1::int IS NULL OR p.id <> $1)
      ORDER BY p.archived_at DESC NULLS LAST, p.created_at DESC
      LIMIT 200
    `, [project.id || null]);
    res.json(await aiPost("/concept-check", { project, archived_projects: archived }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر فحص تكرار الفكرة" });
  }
});

aiRouter.post("/roadmap", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    let project = req.body.project || {
      title: req.body.title || "",
      abstract: req.body.abstract || "",
      tech_stack: splitTechStack(req.body.techStack)
    };
    if (req.body.projectId) {
      project = await getProjectForAi(req.body.projectId, req.user);
      if (project === false) return res.status(403).json({ message: "لا تملك صلاحية توليد خطة لهذا المشروع" });
      if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
    }
    res.json(await aiPost("/roadmap", {
      project,
      duration_weeks: Number(req.body.durationWeeks || req.body.duration_weeks || 12)
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر توليد الخطة الزمنية" });
  }
});

aiRouter.post("/score-proposal/:projectId", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const project = await getProjectForAi(req.params.projectId, req.user);
    if (project === false) return res.status(403).json({ message: "لا تملك صلاحية تقييم هذا المقترح" });
    if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
    const localPath = project.proposal_pdf_url ? project.proposal_pdf_url.replace("/uploads/", "uploads/") : "";
    const hasFile = Boolean(localPath && fs.existsSync(localPath));
    const text = hasFile ? fs.readFileSync(localPath).toString("base64") : `${project.title}\n${project.abstract}`;
    res.json(await aiPost("/score-proposal", { text, is_base64_file: hasFile }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تقييم المقترح" });
  }
});

aiRouter.post("/risk/:studentId", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const row = await getStudentRiskFeatures(req.params.studentId, req.user);
    if (!row) return res.status(404).json({ message: "الطالب غير موجود ضمن صلاحياتك أو لا يملك مشروعاً نشطاً" });
    res.json(await aiPost("/risk", riskFeaturesFromRow(row)));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر حساب مؤشر المخاطر" });
  }
});

aiRouter.post("/analyze-submission/:submissionId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  const [submission] = await query(`
    SELECT s.*, p.title AS project_title, p.student_id, st.supervisor_id
    FROM submissions s
    JOIN projects p ON p.id = s.project_id
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE s.id = $1
  `, [req.params.submissionId]);
  if (!submission) return res.status(404).json({ message: "الملف غير موجود" });
  const allowed =
    req.user.role === "admin" ||
    (req.user.role === "student" && submission.student_id === req.user.id) ||
    (req.user.role === "supervisor" && submission.supervisor_id === req.user.id);
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تحليل هذا الملف" });

  const localPath = submission.file_url ? submission.file_url.replace("/uploads/", "uploads/") : "";
  if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ message: "ملف الرفع غير موجود على الخادم" });
  const extension = path.extname(localPath).toLowerCase();
  if (![".pdf", ".docx"].includes(extension)) return res.status(400).json({ message: "التحليل يدعم PDF و DOCX فقط" });
  const encoded = fs.readFileSync(localPath).toString("base64");
  const response = await fetch(`${aiUrl}/analyze-thesis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: encoded,
      is_base64_file: true,
      filename: path.basename(localPath),
      project_title: submission.project_title
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return res.status(response.status).json({ message: error.detail || "تعذر تحليل الملف" });
  }
  const analysis = await response.json();
  const [saved] = await query(`
    INSERT INTO ai_document_analyses (submission_id, project_id, user_id, file_url, analysis)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [submission.id, submission.project_id, req.user.id, submission.file_url, analysis]);
  res.status(201).json(saved);
});

aiRouter.post("/academic/analyze-submission/:submissionId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const [submission] = await query(`
      SELECT s.*, p.title AS project_title, p.student_id, st.supervisor_id
      FROM submissions s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE s.id = $1
    `, [req.params.submissionId]);
    if (!submission) return res.status(404).json({ message: "الملف غير موجود" });
    const allowed =
      req.user.role === "admin" ||
      (req.user.role === "student" && submission.student_id === req.user.id) ||
      (req.user.role === "supervisor" && submission.supervisor_id === req.user.id);
    if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تحليل هذا الملف" });

    const localPath = submission.file_url ? submission.file_url.replace("/uploads/", "uploads/") : "";
    if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ message: "ملف الرفع غير موجود على الخادم" });
    const extension = path.extname(localPath).toLowerCase();
    if (![".pdf", ".docx"].includes(extension)) return res.status(400).json({ message: "التحليل الأكاديمي يدعم PDF و DOCX فقط" });
    const analysis = await aiPost("/academic/analyze-document", {
      text: fs.readFileSync(localPath).toString("base64"),
      is_base64_file: true,
      filename: path.basename(localPath),
      project_title: submission.project_title,
      university_guide: req.body.universityGuide || {}
    });
    const [saved] = await query(`
      INSERT INTO ai_document_analyses (submission_id, project_id, user_id, file_url, analysis)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [submission.id, submission.project_id, req.user.id, submission.file_url, analysis]);
    res.status(201).json(saved);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تنفيذ التحليل الأكاديمي المتقدم" });
  }
});

aiRouter.post("/academic/plagiarism-submission/:submissionId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const [submission] = await query(`
      SELECT s.*, p.title AS project_title, p.student_id, st.supervisor_id
      FROM submissions s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE s.id = $1
    `, [req.params.submissionId]);
    if (!submission) return res.status(404).json({ message: "الملف غير موجود" });
    const allowed =
      req.user.role === "admin" ||
      (req.user.role === "student" && submission.student_id === req.user.id) ||
      (req.user.role === "supervisor" && submission.supervisor_id === req.user.id);
    if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية فحص هذا الملف" });

    const localPath = submission.file_url ? submission.file_url.replace("/uploads/", "uploads/") : "";
    if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ message: "ملف الرفع غير موجود على الخادم" });
    const extension = path.extname(localPath).toLowerCase();
    if (![".pdf", ".docx"].includes(extension)) return res.status(400).json({ message: "فحص التشابه يدعم PDF و DOCX فقط" });
    const result = await aiPost("/academic/plagiarism-check", {
      text: fs.readFileSync(localPath).toString("base64"),
      is_base64_file: true,
      filename: path.basename(localPath),
      source_type: req.body.sourceType || req.body.source_type || "archived_project",
      max_candidates: Number(req.body.maxCandidates || req.body.max_candidates || 500),
      threshold: Number(req.body.threshold || 0.12)
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تنفيذ فحص التشابه الداخلي" });
  }
});

aiRouter.post("/academic/classify-section", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "نص القسم مطلوب" });
    res.json(await aiPost("/academic/classify-section", {
      text,
      section_name: req.body.sectionName || req.body.section_name || "general"
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تصنيف جودة القسم" });
  }
});

aiRouter.post("/evaluation/rag-benchmark", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    res.json(await aiPost("/evaluation/rag-benchmark", {
      top_k: Number(req.body.topK || req.body.top_k || 5),
      source_type: req.body.sourceType || req.body.source_type || null
    }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تشغيل Benchmark الاسترجاع" });
  }
});

aiRouter.post("/grade-submission/:submissionId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  try {
    const [submission] = await query(`
      SELECT s.*, p.title AS project_title, p.student_id, st.supervisor_id
      FROM submissions s
      JOIN projects p ON p.id = s.project_id
      LEFT JOIN students st ON st.user_id = p.student_id
      WHERE s.id = $1
    `, [req.params.submissionId]);
    if (!submission) return res.status(404).json({ message: "الملف غير موجود" });
    const allowed =
      req.user.role === "admin" ||
      (req.user.role === "student" && submission.student_id === req.user.id) ||
      (req.user.role === "supervisor" && submission.supervisor_id === req.user.id);
    if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تقييم هذا الملف" });

    const localPath = submission.file_url ? submission.file_url.replace("/uploads/", "uploads/") : "";
    if (!localPath || !fs.existsSync(localPath)) return res.status(404).json({ message: "ملف الرفع غير موجود على الخادم" });
    const extension = path.extname(localPath).toLowerCase();
    if (![".pdf", ".docx"].includes(extension)) return res.status(400).json({ message: "التقييم يدعم PDF و DOCX فقط" });
    const result = await aiPost("/grade-thesis", {
      text: fs.readFileSync(localPath).toString("base64"),
      is_base64_file: true,
      filename: path.basename(localPath),
      university_guide: req.body.universityGuide || {}
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر تقييم الأطروحة" });
  }
});

aiRouter.get("/risk-dashboard", allowRoles("supervisor", "admin"), async (req, res) => {
  try {
    const params = [];
    const supervisorFilter = req.user.role === "supervisor" ? "AND (st.supervisor_id = $1 OR p.preferred_supervisor_id = $1)" : "";
    if (req.user.role === "supervisor") params.push(req.user.id);
    const rows = await query(`
      SELECT
        st.user_id AS student_id,
        u.full_name AS student_name,
        p.id AS project_id,
        p.title AS project_title,
        GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(u.last_login_at, u.created_at)))::float AS days_since_last_login,
        GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(MAX(sub.submitted_at), p.created_at)))::float AS days_since_last_file_upload,
        COALESCE(ms.completed::float / NULLIF(ms.total, 0), 0)::float AS completed_milestones_ratio,
        COALESCE(ext.extensions, 0)::float AS deadline_extensions_requested,
        CASE
          WHEN MAX(m.scheduled_at) IS NULL THEN 10
          ELSE LEAST(10, GREATEST(0, EXTRACT(DAY FROM now() - MAX(m.scheduled_at))) / 2)
        END::float AS average_supervisor_response_time
      FROM students st
      JOIN users u ON u.id = st.user_id
      JOIN projects p ON p.student_id = st.user_id
      LEFT JOIN submissions sub ON sub.project_id = p.id
      LEFT JOIN meetings m ON m.student_id = st.user_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'done' OR completed_at IS NOT NULL)::int AS completed
        FROM milestones
        WHERE project_id = p.id
      ) ms ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS extensions
        FROM notifications n
        WHERE n.user_id = st.user_id AND n.message ILIKE '%تمديد%'
      ) ext ON true
      WHERE p.is_archived = false
        AND p.status IN ('approved', 'pending_review', 'revision_requested')
      ${supervisorFilter}
      GROUP BY st.user_id, u.full_name, u.last_login_at, u.created_at, p.id, p.title, p.created_at, ms.completed, ms.total, ext.extensions
      ORDER BY p.deadline NULLS LAST, p.created_at DESC
      LIMIT 100
    `, params);
    const items = rows.map((row) => ({
      student_id: row.student_id,
      student_name: row.student_name,
      project_id: row.project_id,
      project_title: row.project_title,
      features: riskFeaturesFromRow(row)
    }));
    res.json(await aiPost("/risk-batch", { items }));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "تعذر توليد لوحة المخاطر" });
  }
});

aiRouter.get("/analyses/project/:projectId", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  const [project] = await query(`
    SELECT p.id, p.student_id, st.supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.projectId]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed =
    req.user.role === "admin" ||
    (req.user.role === "student" && project.student_id === req.user.id) ||
    (req.user.role === "supervisor" && project.supervisor_id === req.user.id);
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية عرض التحليلات" });
  res.json(await query("SELECT * FROM ai_document_analyses WHERE project_id = $1 ORDER BY created_at DESC", [req.params.projectId]));
});
