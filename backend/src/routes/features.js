import express from "express";
import { getActiveAcademicTerm, getRegistrationTerm, getSupervisorTermCapacity, listSupervisorsWithTermCapacity } from "../academicTerms.js";
import { query } from "../db.js";
import { allowRoles, requireApproved, requireAuth } from "../middleware.js";
import { assistantBenchmarkCases } from "../assistantBenchmark.js";

export const featuresRouter = express.Router();
featuresRouter.use(requireAuth, requireApproved);

function list(value) {
  return String(value || "").split(/[,،]/).map((item) => item.trim()).filter(Boolean);
}

function overlapScore(a = [], b = []) {
  const left = a.map((item) => item.toLowerCase());
  const right = b.map((item) => item.toLowerCase());
  return left.filter((item) => right.some((other) => item.includes(other) || other.includes(item))).length;
}

function normalizeQuestion(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNormalizedPhrase(text, phrases) {
  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeQuestion(phrase);
    const pattern = new RegExp(`(^|[\\s.,،؛:؟?])${escapeRegex(normalizedPhrase)}(?=$|[\\s.,،؛:؟?])`);
    return pattern.test(text);
  });
}

function dateText(value) {
  return value ? String(value).slice(0, 10) : "غير محدد";
}

function normalizeToken(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
}

function arrayRecall(expected = [], actual = []) {
  if (!expected.length) return { matched: [], missing: [], score: 100 };
  const actualTokens = actual.map((item) => normalizeToken(item)).filter(Boolean);
  const matched = expected.filter((item) => {
    const token = normalizeToken(item);
    return actualTokens.some((actualToken) => actualToken === token || actualToken.includes(token) || token.includes(actualToken));
  });
  const missing = expected.filter((item) => !matched.includes(item));
  return {
    matched,
    missing,
    score: Math.round((matched.length / expected.length) * 100)
  };
}

function relationshipRecall(expected = [], actual = []) {
  if (!expected.length) return { matched: [], missing: [], score: 100 };
  const actualPairs = actual.map((item) => {
    if (typeof item === "string") return normalizeToken(item);
    return normalizeToken(`${item.left || ""}-${item.right || ""}-${item.label || ""}`);
  });
  const matched = expected.filter((item) => {
    const [left, right] = String(item).split("-");
    const leftToken = normalizeToken(left);
    const rightToken = normalizeToken(right);
    return actualPairs.some((pair) => pair.includes(leftToken) && pair.includes(rightToken));
  });
  const missing = expected.filter((item) => !matched.includes(item));
  return {
    matched,
    missing,
    score: Math.round((matched.length / expected.length) * 100)
  };
}

function average(values = []) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

async function studentAssistantContext(user) {
  const [student] = await query(`
    SELECT st.*, supervisor.full_name AS supervisor_name, supervisor.email AS supervisor_email, supervisor.phone AS supervisor_phone
    FROM students st
    LEFT JOIN users supervisor ON supervisor.id = st.supervisor_id
    WHERE st.user_id = $1
  `, [user.id]);
  const projects = await query("SELECT * FROM projects WHERE student_id = $1 ORDER BY created_at DESC LIMIT 3", [user.id]);
  const activeProject = projects[0];
  const milestones = activeProject ? await query("SELECT * FROM milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST, id", [activeProject.id]) : [];
  const submissions = activeProject ? await query("SELECT * FROM submissions WHERE project_id = $1 ORDER BY submitted_at DESC", [activeProject.id]) : [];
  return { student, projects, activeProject, milestones, submissions };
}

async function supervisorAssistantContext(user) {
  const assigned = await query(`
    SELECT student.full_name AS student_name, p.title, p.status, p.tech_stack,
      COALESCE(ms.total, 0)::int AS total_milestones,
      COALESCE(ms.done, 0)::int AS done_milestones
    FROM students st
    JOIN users student ON student.id = st.user_id
    LEFT JOIN projects p ON p.student_id = st.user_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'done' OR completed_at IS NOT NULL) AS done
      FROM milestones WHERE project_id = p.id
    ) ms ON true
    WHERE st.supervisor_id = $1
    ORDER BY student.full_name
    LIMIT 8
  `, [user.id]);
  const pending = await query(`
    SELECT p.title, student.full_name AS student_name
    FROM projects p
    JOIN users student ON student.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.status = 'pending_review' AND (p.preferred_supervisor_id = $1 OR st.supervisor_id = $1)
    ORDER BY p.created_at DESC
    LIMIT 5
  `, [user.id]);
  return { assigned, pending };
}

async function adminAssistantContext() {
  const [stats] = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS students,
      (SELECT COUNT(*)::int FROM users WHERE role = 'supervisor') AS supervisors,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'pending_review') AS pending_projects,
      (SELECT COUNT(*)::int FROM technical_reports WHERE status <> 'resolved') AS open_reports,
      (SELECT COUNT(*)::int FROM students st WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.student_id = st.user_id)) AS students_without_projects
  `);
  return { stats };
}

function projectStatusLabel(status) {
  return {
    pending_review: "بانتظار مراجعة المشرف",
    approved: "مقبول",
    revision_requested: "بحاجة إلى تعديل",
    rejected: "مرفوض"
  }[status] || status || "غير محدد";
}

const assistantStopWords = new Set([
  "هذا", "هذه", "التي", "الذي", "على", "الى", "إلى", "عن", "من", "في", "مع", "او", "أو", "هو", "هي",
  "انا", "نحن", "بدي", "اريد", "أريد", "مشروع", "المشروع", "نظام", "تطبيق", "منصة", "using", "with",
  "project", "system", "app", "application", "platform", "the", "and", "for"
]);

function assistantTokens(value = "") {
  const normalized = normalizeQuestion(value);
  const words = normalized.match(/[a-z][a-z0-9+#.-]{2,}|[\u0621-\u064a]{3,}/g) || [];
  return [...new Set(words.map((word) => word.trim()).filter((word) => word && !assistantStopWords.has(word)))];
}

function tokenSimilarity(leftText = "", rightText = "", leftBoost = []) {
  const left = new Set([...assistantTokens(leftText), ...leftBoost.map((item) => normalizeToken(item)).filter(Boolean)]);
  const right = new Set(assistantTokens(rightText));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((token) => [...right].some((candidate) => candidate === token || candidate.includes(token) || token.includes(candidate)));
  const coverage = shared.length / Math.max(1, left.size);
  const density = shared.length / Math.max(1, right.size);
  return Math.round(Math.min(100, (coverage * 72 + density * 28)));
}

function detectAssistantIntent(question, text, tech) {
  if (hasAny(question, ["مشرف مناسب", "اقترح مشرف", "مين اختار", "توفيق"])) return { id: "supervisor_match", label: "توفيق مشرف", task: "supervisor_match" };
  if (hasAny(question, ["تكرار", "مكرر", "تشابه", "فكره قديمه", "فكرة قديمة"])) return { id: "novelty", label: "فحص تكرار الفكرة", task: "novelty" };
  if (hasAny(question, ["خطه", "خطة", "مراحل", "roadmap", "timeline"])) return { id: "roadmap", label: "خطة تنفيذ", task: "academic_help" };
  if (hasAny(question, ["اطروحه", "أطروحة", "فصل", "ملف", "تحليل"])) return { id: "thesis_feedback", label: "مراجعة أطروحة", task: "thesis_feedback" };
  if (hasAny(question, ["قاعده", "قاعدة", "جداول", "erd", "api", "مخطط", "blueprint"])) return { id: "blueprint", label: "تصميم Blueprint", task: "academic_help" };
  if (tech.length || text.length > 60) return { id: "project_advisor", label: "تحليل فكرة مشروع", task: "academic_help" };
  return { id: "guidance", label: "إرشاد داخل المنصة", task: "academic_help" };
}

function assessProjectIdea(text, tech = []) {
  const normalized = normalizeQuestion(text);
  const checks = [
    { id: "problem", label: "المشكلة واضحة", score: hasAny(normalized, ["مشكله", "مشكلة", "يعاني", "حل", "يساعد"]) ? 100 : 45, fix: "اذكر المشكلة التي يحلها المشروع بجملة مباشرة." },
    { id: "users", label: "المستخدمون محددون", score: hasAny(normalized, ["طالب", "مشرف", "اداره", "إدارة", "مستخدم", "عميل", "مريض", "طبيب"]) ? 100 : 55, fix: "حدد من سيستخدم النظام وما صلاحيات كل دور." },
    { id: "scope", label: "النطاق قابل للتنفيذ", score: text.length > 80 && text.length < 1600 ? 92 : text.length >= 1600 ? 62 : 50, fix: "اكتب نطاق MVP صغيراً يمكن إنجازه ضمن وقت مشروع التخرج." },
    { id: "tech", label: "التقنيات مذكورة", score: tech.length ? Math.min(100, 55 + tech.length * 12) : 35, fix: "أضف التقنيات الأساسية مثل React, Node.js, PostgreSQL, Python." },
    { id: "data", label: "البيانات والجداول متوقعة", score: hasAny(normalized, ["بيانات", "جدول", "جداول", "ملف", "تقارير", "مستخدمين"]) ? 92 : 55, fix: "اذكر أهم البيانات التي سيخزنها النظام." },
    { id: "outputs", label: "المخرجات قابلة للقياس", score: hasAny(normalized, ["تقرير", "تنبيه", "تحليل", "تقييم", "نسبه", "لوحه"]) ? 94 : 58, fix: "حدد مخرجات قابلة للقياس: تقرير، لوحة، تنبيه، تحليل." },
    { id: "novelty", label: "الإضافة الجديدة مذكورة", score: hasAny(normalized, ["ذكاء", "ai", "rag", "تنبؤ", "تحليل", "توصيه", "ذكي"]) ? 95 : 60, fix: "أضف فقرة توضّح ما الجديد مقارنة بالمشاريع السابقة." },
    { id: "evaluation", label: "طريقة التقييم ممكنة", score: hasAny(normalized, ["دقه", "قياس", "اختبار", "rubric", "تقييم"]) ? 90 : 52, fix: "اذكر كيف ستثبت أن المشروع نجح: دقة، زمن، رضا مستخدمين، أو Rubric." }
  ];
  const score = average(checks.map((item) => item.score));
  return {
    score,
    label: score >= 85 ? "قوية وجاهزة للنقاش" : score >= 70 ? "جيدة وتحتاج تدقيق" : "تحتاج توضيح قبل الإرسال",
    checks,
    missing: checks.filter((item) => item.score < 70).map((item) => item.fix)
  };
}

const assistantRequirementSlots = [
  {
    id: "problem",
    label: "المشكلة",
    weight: 12,
    question: "ما المشكلة الأكاديمية أو العملية التي سيحلها المشروع؟ اكتبها بجملة واحدة واضحة.",
    detector: (normalized, text) => hasAny(normalized, ["مشكله", "مشكلة", "يعاني", "صعوبه", "تأخير", "تاخير", "فوضى", "حل", "problem", "issue", "pain", "solve"]) || text.length > 140
  },
  {
    id: "users",
    label: "المستخدمون والصلاحيات",
    weight: 11,
    question: "من هم المستخدمون الأساسيون؟ وما صلاحية كل دور داخل النظام؟",
    detector: (normalized) => hasAny(normalized, ["طالب", "طلاب", "مشرف", "مشرفين", "اداره", "إدارة", "مدير", "لجنه", "لجنة", "مستخدم", "عميل", "طبيب", "مريض", "student", "students", "supervisor", "supervisors", "admin", "committee", "user", "users"])
  },
  {
    id: "features",
    label: "الميزات الأساسية",
    weight: 12,
    question: "ما أهم 4 أو 5 ميزات يجب أن تكون موجودة في نسخة MVP الأولى؟",
    detector: (normalized) => hasAny(normalized, ["يرفع", "رفع", "يقترح", "اقتراح", "يفحص", "تحليل", "تقييم", "تنبيه", "اشعار", "إشعار", "لوحه", "لوحة", "بحث", "حجز", "مخطط", "تعليق", "توليد", "مطابقه", "مطابقة", "upload", "analyze", "analysis", "match", "matching", "detect", "generate", "comment", "report", "dashboard", "diagram", "diagrams"])
  },
  {
    id: "data",
    label: "البيانات والجداول",
    weight: 10,
    question: "ما البيانات التي سيخزنها النظام؟ مثال: مشاريع، ملفات، مستخدمين، تقييمات، اجتماعات.",
    detector: (normalized) => hasAny(normalized, ["بيانات", "جداول", "جدول", "قاعده", "قاعدة", "ملفات", "تقارير", "مستخدمين", "اجتماعات", "تقييمات", "درجات", "data", "database", "tables", "files", "reports", "users", "meetings", "scores"])
  },
  {
    id: "tech",
    label: "التقنيات",
    weight: 10,
    question: "ما التقنيات التي تريد اعتمادها للواجهة، الخلفية، قاعدة البيانات، وخدمة الذكاء؟",
    detector: (normalized, text, tech) => tech.length >= 2 || hasAny(normalized, ["react", "node", "postgres", "python", "fastapi", "laravel", "flutter", "mysql", "mongodb", "docker"])
  },
  {
    id: "ai_scope",
    label: "دور الذكاء الاصطناعي",
    weight: 10,
    question: "ما القرار أو التحليل الذي تريد من الذكاء الاصطناعي أن يقدمه تحديداً؟",
    detector: (normalized) => hasAny(normalized, ["ذكاء", "ذكي", "ai", "rag", "nlp", "تعلم", "تنبؤ", "توصيه", "توصية", "تصنيف", "تحليل", "مطابقه", "مطابقة", "تشابه", "machine learning", "prediction", "recommendation", "semantic", "similarity"])
  },
  {
    id: "outputs",
    label: "المخرجات",
    weight: 9,
    question: "ما المخرجات التي يجب أن يراها المستخدم؟ تقرير، نسبة ثقة، مخطط، إشعار، لوحة متابعة؟",
    detector: (normalized) => hasAny(normalized, ["تقرير", "تقارير", "نسبه", "نسبة", "ثقه", "ثقة", "مخطط", "لوحه", "لوحة", "تنبيه", "اشعار", "إشعار", "تقييم", "report", "reports", "confidence", "diagram", "dashboard", "alert", "notification", "score"])
  },
  {
    id: "novelty",
    label: "الإضافة الجديدة",
    weight: 9,
    question: "ما الشيء الجديد الذي يميز فكرتك عن مشروع مشابه سابق؟",
    detector: (normalized) => hasAny(normalized, ["جديد", "يميز", "يختلف", "اختلاف", "تطوير", "تحسين", "ليس مكرر", "غير مكرر", "novelty", "unique", "different", "duplicate", "duplicated", "improve", "improvement"])
  },
  {
    id: "evaluation",
    label: "طريقة التقييم",
    weight: 8,
    question: "كيف سنثبت أن المشروع نجح؟ دقة النموذج، زمن إنجاز، رضا المستخدمين، أو Rubric؟",
    detector: (normalized) => hasAny(normalized, ["دقه", "دقة", "قياس", "اختبار", "تجربه", "تجربة", "rubric", "رضا", "مؤشر", "مقياس", "accuracy", "test", "testing", "metric", "measure", "evaluation"])
  },
  {
    id: "timeline",
    label: "الخطة الزمنية",
    weight: 6,
    question: "كم مدة التنفيذ؟ وهل تريد تقسيمه إلى مراحل أسبوعية أو شهرية؟",
    detector: (normalized) => hasAny(normalized, ["اسبوع", "أسبوع", "شهر", "مرحله", "مرحلة", "مراحل", "خطة", "خطه", "timeline", "roadmap", "mvp", "week", "month", "milestone", "phase"])
  },
  {
    id: "constraints",
    label: "القيود والمخاطر",
    weight: 5,
    question: "هل يوجد قيود مهمة؟ مثل وقت محدود، بيانات قليلة، خصوصية ملفات، أو صعوبة تدريب نموذج.",
    detector: (normalized) => hasAny(normalized, ["خصوصيه", "خصوصية", "مخاطر", "قيود", "وقت", "بيانات قليله", "بيانات قليلة", "صعوبه", "صعوبة", "امن", "أمن", "privacy", "risk", "risks", "constraint", "constraints", "security", "limited"])
  }
];

function buildRequirementSession(text, tech = [], quality = null, blueprint = null) {
  const normalized = normalizeQuestion(text);
  const slots = assistantRequirementSlots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    weight: slot.weight,
    question: slot.question,
    answered: Boolean(slot.detector(normalized, text, tech)),
    reason: slot.detector(normalized, text, tech) ? "تم التقاطها من وصف الطالب." : "ما زالت ناقصة لبناء مشروع متكامل."
  }));
  const totalWeight = slots.reduce((sum, slot) => sum + slot.weight, 0);
  const answeredWeight = slots.filter((slot) => slot.answered).reduce((sum, slot) => sum + slot.weight, 0);
  const qualityBoost = quality ? Math.max(0, Math.round((quality.score - 60) * 0.2)) : 0;
  const blueprintBoost = blueprint ? 8 : 0;
  const completion = Math.min(100, Math.round((answeredWeight / Math.max(1, totalWeight)) * 100 + qualityBoost + blueprintBoost));
  const missing = slots.filter((slot) => !slot.answered).sort((a, b) => b.weight - a.weight);
  const mustHave = ["problem", "users", "features", "data", "tech", "ai_scope"];
  const mustHaveDone = mustHave.every((id) => slots.find((slot) => slot.id === id)?.answered);
  const readyForBlueprint = completion >= 80 && mustHaveDone;
  const stage = readyForBlueprint
    ? "جاهز لبناء Blueprint متكامل"
    : completion >= 65
      ? "تدقيق المتطلبات والتقييم"
      : completion >= 40
        ? "تجميع الميزات والبيانات"
        : "تعريف المشكلة والمستخدمين";
  const followUpQuestions = missing.slice(0, readyForBlueprint ? 1 : 3).map((slot, index) => ({
    id: slot.id,
    label: slot.label,
    question: slot.question,
    priority: index + 1,
    why: slot.reason
  }));
  if (readyForBlueprint && !followUpQuestions.length) {
    followUpQuestions.push({
      id: "confirm_blueprint",
      label: "تأكيد التصميم",
      question: "هل تريدني الآن أن أحول المتطلبات المجمعة إلى Blueprint كامل مع الجداول والصفحات والـ APIs؟",
      priority: 1,
      why: "المتطلبات الأساسية أصبحت كافية للانتقال للتصميم."
    });
  }
  return {
    stage,
    completion,
    readyForBlueprint,
    answered: slots.filter((slot) => slot.answered).map((slot) => slot.label),
    missing: missing.map((slot) => ({ id: slot.id, label: slot.label, question: slot.question })),
    followUpQuestions,
    nextQuestion: followUpQuestions[0]?.question || "هل تريدني أن أحول المتطلبات إلى Blueprint كامل قابل للنقاش مع المشرف؟"
  };
}

function buildActionPlan(intent, quality, hasBlueprint) {
  const base = [
    "اكتب المشكلة والمستخدمين والمخرجات النهائية في فقرة واحدة.",
    "ثبّت التقنيات الأساسية ولا توسّع النطاق قبل موافقة المشرف.",
    "قارن فكرتك مع أقرب مشروعين مؤرشفين واكتب نقطة الاختلاف.",
    "حوّل الفكرة إلى MVP بثلاث مراحل قابلة للتسليم."
  ];
  if (intent.id === "supervisor_match") base.unshift("اختر المشرف بناءً على الكلمات المشتركة والسعة، لا بناءً على الاسم فقط.");
  if (intent.id === "novelty") base.unshift("اكتب فقرة novelty واضحة: ما الذي يختلف عن المشاريع السابقة؟");
  if (hasBlueprint) base.push("راجع الجداول والعلاقات التي ولّدها Blueprint وعدّلها قبل حفظ المقترح.");
  if (quality.score < 75) base.push("أعد صياغة الفكرة بعد معالجة النقاط الناقصة الظاهرة في بطاقة الجودة.");
  return base.slice(0, 6);
}

function inferAssistantRisks(text, tech = [], quality, evidence = []) {
  const normalized = normalizeQuestion(text);
  const risks = [];
  if (quality.score < 70) risks.push({ level: "متوسط", title: "الفكرة غير مكتملة", mitigation: "أكمل المشكلة والمستخدمين والمخرجات قبل إرسالها للمشرف." });
  if (tech.length > 7) risks.push({ level: "متوسط", title: "تشتت تقني", mitigation: "اختر 3-5 تقنيات أساسية فقط في نسخة MVP." });
  if (hasAny(normalized, ["كل", "كامل", "شامل", "منصه متكامله", "منصة متكاملة"])) risks.push({ level: "مرتفع", title: "النطاق واسع جداً", mitigation: "قسّم المشروع إلى مراحل وابدأ بالمسار الأكاديمي الأساسي." });
  const topSimilarity = Number(evidence[0]?.similarity || evidence[0]?.match_score || 0);
  if (topSimilarity >= 75) risks.push({ level: "مرتفع", title: "تشابه مرتفع مع مشروع سابق", mitigation: "غيّر النطاق أو أضف مساهمة بحثية/تقنية واضحة." });
  if (!risks.length) risks.push({ level: "منخفض", title: "لا توجد مخاطر حرجة ظاهرة", mitigation: "استمر بتوثيق القرارات وتأكيد المتطلبات مع المشرف." });
  return risks;
}

async function projectEvidenceForAssistant(text, tech = [], limit = 5) {
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
    LIMIT 80
  `);
  return rows
    .map((project) => {
      const projectText = `${project.title} ${project.abstract} ${(project.tech_stack || []).join(" ")}`;
      const lexical = tokenSimilarity(`${text} ${tech.join(" ")}`, projectText, tech);
      const techOverlap = overlapScore(project.tech_stack || [], tech);
      const score = Math.min(100, Math.round(lexical * 0.78 + Math.min(100, techOverlap * 22) * 0.22));
      return {
        project_id: project.id,
        title: project.title,
        status: project.status,
        is_archived: project.is_archived,
        student_name: project.student_name,
        supervisor_name: project.supervisor_name,
        similarity: score,
        shared_technologies: (project.tech_stack || []).filter((item) => tech.some((term) => normalizeToken(item) === normalizeToken(term) || normalizeToken(item).includes(normalizeToken(term)) || normalizeToken(term).includes(normalizeToken(item)))).slice(0, 8),
        reason: score >= 75 ? "تشابه قوي في الفكرة أو التقنيات" : score >= 50 ? "تشابه جزئي يمكن الاستفادة منه" : "مرجع قريب بدرجة منخفضة",
        snippet: String(project.abstract || "").slice(0, 220)
      };
    })
    .filter((item) => item.similarity >= 25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

async function supervisorEvidenceForAssistant(text, tech = [], limit = 4) {
  const supervisors = await listSupervisorsWithTermCapacity((await getActiveAcademicTerm())?.code || null);
  return supervisors
    .map((supervisor) => {
      const skills = [...(supervisor.expertise_keywords || []), ...(supervisor.languages || []), ...(supervisor.tools || [])];
      const skillText = `${supervisor.specialization || ""} ${supervisor.bio || ""} ${skills.join(" ")}`;
      const lexical = tokenSimilarity(`${text} ${tech.join(" ")}`, skillText, tech);
      const overlap = overlapScore(skills, [...tech, ...assistantTokens(text)]);
      const capacity = Math.max(Number(supervisor.max_students_capacity || 1), 1);
      const availability = Math.max(0, 100 - Math.round((Number(supervisor.current_load || 0) / capacity) * 100));
      const score = Math.min(100, Math.round(lexical * 0.55 + Math.min(100, overlap * 22) * 0.3 + availability * 0.15));
      return {
        id: supervisor.id,
        name: supervisor.full_name,
        specialization: supervisor.specialization,
        match_score: score,
        availability,
        current_load: supervisor.current_load,
        max_students_capacity: supervisor.max_students_capacity,
        shared_keywords: [...new Set(skills.filter((skill) => [...tech, ...assistantTokens(text)].some((term) => normalizeToken(skill).includes(normalizeToken(term)) || normalizeToken(term).includes(normalizeToken(skill)))))].slice(0, 8),
        profile_complete: supervisor.profile_complete
      };
    })
    .filter((item) => item.profile_complete && item.match_score >= 25)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

function calibratedAssistantConfidence({ text, tech, quality, evidence, supervisors, roleContext = false, blueprint = null }) {
  if (text.length < 18 && !tech.length && !roleContext) return 48;
  const evidenceScore = Number(evidence[0]?.similarity || 0);
  const supervisorScore = Number(supervisors[0]?.match_score || 0);
  const blueprintScore = Number(blueprint?.qualityScore || 0);
  const base = roleContext ? 78 : 55;
  const score = Math.round(
    base
    + quality.score * 0.18
    + Math.min(100, evidenceScore) * 0.14
    + Math.min(100, supervisorScore) * 0.1
    + Math.min(100, blueprintScore) * 0.08
    + Math.min(12, tech.length * 2)
  );
  if (!roleContext && text.length < 60 && tech.length < 2) {
    return Math.min(72, Math.max(45, score));
  }
  if (!roleContext && text.length < 100 && tech.length < 2) {
    return Math.min(79, Math.max(55, score));
  }
  const hasEnoughSignal = text.length >= 100 || tech.length >= 2 || roleContext || Number(blueprint?.qualityScore || 0) >= 80;
  return Math.max(hasEnoughSignal ? 80 : 55, Math.min(97, score));
}

async function buildAssistantIntelligence({ text, tech, user, blueprint = null, roleContext = false }) {
  const question = normalizeQuestion(text);
  const intent = detectAssistantIntent(question, text, tech);
  const quality = assessProjectIdea(text, tech);
  const requirements = buildRequirementSession(text, tech, quality, blueprint);
  const evidence = text || tech.length ? await projectEvidenceForAssistant(text, tech) : [];
  const supervisorMatches = text || tech.length ? await supervisorEvidenceForAssistant(text, tech) : [];
  const confidence = calibratedAssistantConfidence({ text, tech, quality, evidence, supervisors: supervisorMatches, roleContext, blueprint });
  return {
    version: "assistant-v3-grounded-advisor",
    intent,
    confidence,
    confidenceLabel: confidence >= 90 ? "عالية جداً" : confidence >= 80 ? "عالية" : confidence >= 65 ? "متوسطة" : "منخفضة",
    quality,
    evidence,
    supervisorMatches,
    actionPlan: buildActionPlan(intent, quality, Boolean(blueprint)),
    risks: inferAssistantRisks(text, tech, quality, evidence),
    requirements,
    reliabilityFactors: [
      { label: "وضوح الفكرة", value: quality.score },
      { label: "قوة الأدلة", value: evidence[0]?.similarity || 0 },
      { label: "تطابق المشرفين", value: supervisorMatches[0]?.match_score || 0 },
      { label: "اكتمال التقنيات", value: Math.min(100, tech.length * 18) },
      { label: "اكتمال المتطلبات", value: requirements.completion }
    ],
    followUpQuestions: requirements.followUpQuestions,
    nextBestQuestion: requirements.nextQuestion || quality.missing[0] || "هل تريد تحويل هذا التحليل إلى Blueprint قابل للإرسال للمشرف؟",
    auditedAt: new Date().toISOString(),
    role: user.role
  };
}

const blueprintDomains = [
  {
    id: "healthcare",
    label: "نظام صحي / عيادة",
    keywords: ["عياده", "طبيب", "مريض", "مرضى", "وصفه", "طبي", "صيدليه", "موعد"],
    entities: ["User", "Doctor", "Patient", "Appointment", "Prescription", "MedicalRecord"],
    pages: ["إدارة المرضى", "إدارة الأطباء", "حجز موعد", "الملف الطبي", "الوصفات الطبية"],
    flows: ["تسجيل المريض", "حجز موعد", "فحص الطبيب", "إصدار وصفة", "تحديث الملف الطبي"]
  },
  {
    id: "commerce",
    label: "متجر إلكتروني",
    keywords: ["متجر", "منتج", "سله", "طلب", "دفع", "فاتوره", "شحن", "زبون"],
    entities: ["User", "Customer", "Product", "Category", "Cart", "Order", "Payment", "Shipment"],
    pages: ["قائمة المنتجات", "تفاصيل المنتج", "السلة", "الدفع", "إدارة الطلبات"],
    flows: ["تصفح المنتجات", "إضافة للسلة", "تأكيد الطلب", "الدفع", "تتبع الشحنة"]
  },
  {
    id: "education",
    label: "نظام تعليمي",
    keywords: ["طالب", "مدرس", "مشرف", "جامعه", "مقرر", "امتحان", "علامه", "واجب"],
    entities: ["User", "Student", "Instructor", "Course", "Enrollment", "Assignment", "Submission", "Grade"],
    pages: ["إدارة الطلاب", "إدارة المقررات", "الواجبات", "التسليمات", "الدرجات"],
    flows: ["إنشاء مقرر", "تسجيل طالب", "نشر واجب", "رفع حل", "تقييم الطالب"]
  },
  {
    id: "capstone",
    label: "إدارة مشاريع تخرج",
    keywords: ["مشروع تخرج", "مشاريع التخرج", "مقترح", "مشرف", "مراحل", "رفع ملفات", "تقييم نهائي"],
    entities: ["User", "Student", "Instructor", "Project", "Submission", "File", "Review", "Grade", "StatusHistory", "Notification"],
    pages: ["طلب مشروع", "مراجعة المقترحات", "رفع الملفات", "المخطط الزمني", "التقييم"],
    flows: ["إرسال مقترح", "مراجعة المشرف", "رفع الملفات", "تحديث المراحل", "إدخال التقييم النهائي"]
  },
  {
    id: "survey",
    label: "منصة استبيانات",
    keywords: ["استبيان", "استبيانات", "كوبو", "نموذج", "اسئله", "أسئلة", "اجابات", "إجابات", "excel"],
    entities: ["User", "SurveyForm", "SurveyQuestion", "SurveyResponse", "SurveyAnswer", "File", "Report"],
    pages: ["إنشاء استبيان", "تعبئة استبيان", "نتائج الاستبيان", "تصدير Excel"],
    flows: ["تصميم النموذج", "تحديد الجمهور", "تعبئة الإجابات", "تحليل النتائج", "تصدير Excel"]
  },
  {
    id: "ai_documents",
    label: "مساعد ذكي لتحليل الملفات",
    keywords: ["مساعد ذكي", "word", "pdf", "تحليل ملفات", "يقرأ ملفات", "تصحيح لغوي", "erd", "use case"],
    entities: ["User", "Project", "File", "DocumentAnalysis", "Review", "Report", "Notification"],
    pages: ["رفع ملف", "نتيجة التحليل", "مخططات مقترحة", "مراجعة المشرف"],
    flows: ["رفع ملف", "استخراج النص", "تحليل المحتوى", "توليد مخططات", "عرض توصيات"]
  },
  {
    id: "booking",
    label: "نظام حجوزات",
    keywords: ["حجز", "حجوزات", "موعد", "قاعة", "قاعه", "مخبر", "مخابر", "lab", "labs", "booking", "reservation", "slot", "فندق", "رحله", "تذكرة", "تذاكر", "مقعد"],
    entities: ["User", "Resource", "Schedule", "Booking", "Approval", "Notification", "Report"],
    pages: ["بحث الموارد", "تقويم الحجوزات", "إنشاء حجز", "مراجعة الحجوزات", "إدارة الحجوزات", "التقارير"],
    flows: ["اختيار مورد", "اختيار موعد", "إرسال طلب الحجز", "قبول أو رفض الطلب", "إرسال تنبيه"]
  },
  {
    id: "inventory",
    label: "مخزون ومستودعات",
    keywords: ["مخزون", "مستودع", "مورد", "شراء", "بيع", "كميه", "منتجات"],
    entities: ["User", "Warehouse", "Supplier", "Item", "StockMovement", "PurchaseOrder", "InventoryAlert"],
    pages: ["إدارة المواد", "حركة المخزون", "الموردون", "أوامر الشراء", "تنبيهات النقص"],
    flows: ["إضافة مادة", "استلام توريد", "صرف مخزون", "توليد تنبيه نقص"]
  },
  {
    id: "restaurant",
    label: "مطعم وطلبات طعام",
    keywords: ["مطعم", "طعام", "وجبه", "وجبات", "منيو", "توصيل", "مطبخ", "طلب"],
    entities: ["User", "Customer", "MenuItem", "Category", "Order", "OrderItem", "Payment", "Delivery"],
    pages: ["قائمة الطعام", "تفاصيل الوجبة", "السلة", "متابعة الطلب", "إدارة المطبخ"],
    flows: ["اختيار الوجبات", "تأكيد الطلب", "تحضير الطلب", "الدفع", "التوصيل"]
  },
  {
    id: "library",
    label: "مكتبة وإعارة كتب",
    keywords: ["مكتبه", "كتاب", "كتب", "اعاره", "استعاره", "مؤلف", "قارئ"],
    entities: ["User", "Member", "Book", "Author", "Category", "Loan", "Fine"],
    pages: ["فهرس الكتب", "إدارة الأعضاء", "إعارة كتاب", "الغرامات", "تقارير الكتب"],
    flows: ["بحث عن كتاب", "طلب إعارة", "تأكيد الإعارة", "إرجاع الكتاب", "حساب غرامة"]
  },
  {
    id: "realestate",
    label: "عقارات وتأجير",
    keywords: ["عقار", "شقه", "منزل", "ايجار", "بيع عقار", "مالك", "مستاجر"],
    entities: ["User", "Owner", "Tenant", "Property", "Listing", "Contract", "Payment"],
    pages: ["قائمة العقارات", "تفاصيل العقار", "إدارة العقود", "المدفوعات", "طلبات التواصل"],
    flows: ["نشر عقار", "بحث واستعراض", "طلب تواصل", "إنشاء عقد", "تسجيل دفعة"]
  },
  {
    id: "transport",
    label: "نقل وتوصيل",
    keywords: ["نقل", "توصيل", "سائق", "رحله", "مركبه", "سياره", "مسار", "شحنه"],
    entities: ["User", "Driver", "Vehicle", "Trip", "Route", "Shipment", "Payment", "TrackingEvent"],
    pages: ["إدارة الرحلات", "السائقون", "المركبات", "تتبع الشحنات", "المدفوعات"],
    flows: ["إنشاء طلب نقل", "تعيين سائق", "بدء الرحلة", "تحديث التتبع", "إنهاء الطلب"]
  }
];

const keywordEntityRules = [
  { keywords: ["مستخدم", "حساب", "تسجيل دخول", "login"], entities: ["User", "Role"] },
  { keywords: ["طالب", "طلاب"], entities: ["Student"] },
  { keywords: ["مشرف", "دكتور", "مدرس"], entities: ["Instructor"] },
  { keywords: ["ادمن", "اداره", "صلاحيات"], entities: ["Role", "Permission"] },
  { keywords: ["موعد", "حجز", "جدوله"], entities: ["Appointment", "Booking", "Schedule"] },
  { keywords: ["دفع", "فاتوره", "سداد", "اشتراك"], entities: ["Payment", "Invoice"] },
  { keywords: ["رسائل", "محادثه", "شات"], entities: ["Conversation", "Message"] },
  { keywords: ["تقييم", "مراجعه", "نجوم", "تعليق"], entities: ["Review", "Rating"] },
  { keywords: ["ملف", "مرفق", "صوره", "وثيقه"], entities: ["Attachment", "File"] },
  { keywords: ["استبيان", "استبيانات", "كوبو", "نموذج"], entities: ["SurveyForm", "SurveyQuestion", "SurveyResponse", "SurveyAnswer"] },
  { keywords: ["مساعد ذكي", "تحليل ملفات", "word", "pdf"], entities: ["DocumentAnalysis"] },
  { keywords: ["اشعار", "تنبيه", "notification"], entities: ["Notification"] },
  { keywords: ["تقرير", "احصائيات", "تحليل"], entities: ["Report"] },
  { keywords: ["موقع", "خريطه", "عنوان"], entities: ["Location"] },
  { keywords: ["كوبون", "خصم", "عرض"], entities: ["Coupon"] },
  { keywords: ["حاله", "تتبع"], entities: ["StatusHistory"] },
  { keywords: ["موافقه", "موافقة", "يوافق", "يرفض", "قبول", "رفض"], entities: ["Approval", "StatusHistory"] },
  { keywords: ["مريض", "مرضى"], entities: ["Patient", "MedicalRecord"] },
  { keywords: ["طبيب", "اطباء"], entities: ["Doctor"] },
  { keywords: ["وصفه", "دواء"], entities: ["Prescription"] },
  { keywords: ["منتج", "منتجات"], entities: ["Product", "Category"] },
  { keywords: ["سله"], entities: ["Cart"] },
  { keywords: ["طلب", "طلبات"], entities: ["Order"] },
  { keywords: ["كتاب", "كتب"], entities: ["Book", "Author"] },
  { keywords: ["مستودع", "مخزون"], entities: ["Warehouse", "Item", "StockMovement"] },
  { keywords: ["مورد"], entities: ["Supplier"] },
  { keywords: ["عقار", "شقه", "منزل"], entities: ["Property", "Listing"] },
  { keywords: ["عقد"], entities: ["Contract"] },
  { keywords: ["سائق"], entities: ["Driver"] },
  { keywords: ["مركبه", "سياره"], entities: ["Vehicle"] },
  { keywords: ["رحله", "مسار"], entities: ["Trip", "Route"] }
];

function cleanIdentifier(value) {
  return String(value || "Entity").replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "Entity";
}

function inferBlueprintDomain(text) {
  const normalized = normalizeQuestion(text);
  if (hasAny(normalized, ["عياده", "طبيب", "مريض", "مرضى", "وصفه", "طبية", "صيدليه"])) return blueprintDomains.find((domain) => domain.id === "healthcare");
  if (hasAny(normalized, ["استبيان", "استبيانات", "كوبو"])) return blueprintDomains.find((domain) => domain.id === "survey");
  if (hasAny(normalized, ["مساعد ذكي", "تحليل ملفات", "يقرأ ملفات", "word", "pdf"])) return blueprintDomains.find((domain) => domain.id === "ai_documents");
  if (hasAny(normalized, ["مشاريع التخرج", "مشروع تخرج"]) || (hasAny(normalized, ["طالب", "مشرف"]) && hasAny(normalized, ["مقترح", "رفع ملفات", "تقييم نهائي"]))) return blueprintDomains.find((domain) => domain.id === "capstone");
  if (hasAny(normalized, ["حجز", "حجوزات", "booking", "reservation"]) && hasAny(normalized, ["قاعه", "قاعة", "موعد", "مخبر", "مخابر", "lab", "slot"])) return blueprintDomains.find((domain) => domain.id === "booking");
  if (hasAny(normalized, ["توصيل"]) && hasAny(normalized, ["سائق", "رحله", "رحلة", "تتبع"])) return blueprintDomains.find((domain) => domain.id === "transport");
  const scored = blueprintDomains.map((domain) => ({
    ...domain,
    score: domain.keywords.filter((keyword) => normalized.includes(keyword)).length
  })).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0] : {
    id: "generic",
    label: "نظام برمجي عام",
    entities: ["User", "Role", "Project", "Task", "File", "Notification", "Report"],
    pages: ["تسجيل الدخول", "لوحة التحكم", "إدارة البيانات", "التقارير", "الإعدادات"],
    flows: ["تسجيل الدخول", "إدارة الصلاحيات", "إنشاء سجل", "تحديث الحالة", "توليد تقرير"]
  };
}

function enhanceEntities(baseEntities, text) {
  const normalized = normalizeQuestion(text);
  const extra = [];
  if (hasAny(normalized, ["دفع", "فاتوره", "اشتراك"])) extra.push("Payment", "Invoice");
  if (hasAny(normalized, ["محادثه", "رسائل", "شات"])) extra.push("Message", "Conversation");
  if (hasAny(normalized, ["تقييم", "مراجعه", "نجوم"])) extra.push("Review", "Rating");
  if (hasAny(normalized, ["ملف", "صوره", "مرفق", "وثيقه"])) extra.push("Attachment");
  if (hasAny(normalized, ["تنبيه", "اشعار", "موعد"])) extra.push("Notification");
  if (hasAny(normalized, ["صلاحيات", "ادوار", "ادمن"])) extra.push("Role", "Permission");
  keywordEntityRules.forEach((rule) => {
    if (hasAny(normalized, rule.keywords)) extra.push(...rule.entities);
  });
  return [...new Set([...baseEntities, ...extra])].slice(0, 14);
}

function inferActors(text, domain) {
  const normalized = normalizeQuestion(text);
  const actors = ["Admin"];
  if (hasAny(normalized, ["طالب", "طلاب"])) actors.push("Student");
  if (hasAny(normalized, ["مشرف", "دكتور"])) actors.push("Supervisor");
  if (hasAny(normalized, ["مدرس"])) actors.push("Instructor");
  if (hasAny(normalized, ["مريض", "مرضى"])) actors.push("Patient");
  if (hasAny(normalized, ["طبيب", "اطباء"])) actors.push("Doctor");
  if (hasAny(normalized, ["زبون", "عميل"])) actors.push("Customer");
  if (hasAny(normalized, ["مستخدم"])) actors.push("User");
  if (hasAny(normalized, ["عضو", "اعضاء", "أعضاء"])) actors.push("Member");
  if (hasAny(normalized, ["سائق"])) actors.push("Driver");
  if (hasAny(normalized, ["مورد"])) actors.push("Supplier");
  if (hasAny(normalized, ["مالك"])) actors.push("Owner");
  if (hasAny(normalized, ["مستاجر"])) actors.push("Tenant");
  if (actors.length === 1) {
    if (domain.id === "healthcare") actors.push("Patient", "Doctor");
    else if (domain.id === "commerce" || domain.id === "restaurant") actors.push("Customer");
    else if (domain.id === "education") actors.push("Student", "Instructor");
    else actors.push("User");
  }
  return [...new Set(actors)];
}

function fieldsForEntity(entity) {
  const common = ["id SERIAL PRIMARY KEY", "created_at TIMESTAMP", "updated_at TIMESTAMP"];
  const map = {
    User: ["full_name VARCHAR(150)", "email VARCHAR(150) UNIQUE", "password_hash TEXT", "role VARCHAR(50)", ...common],
    Role: ["name VARCHAR(80)", "description TEXT", ...common],
    Permission: ["name VARCHAR(100)", "code VARCHAR(100)", ...common],
    Student: ["user_id INT FK", "student_number VARCHAR(50)", "department VARCHAR(100)", ...common],
    Instructor: ["user_id INT FK", "specialization VARCHAR(150)", ...common],
    Doctor: ["user_id INT FK", "specialization VARCHAR(150)", "clinic_room VARCHAR(50)", ...common],
    Patient: ["user_id INT FK", "birth_date DATE", "phone VARCHAR(30)", ...common],
    Appointment: ["user_id INT FK", "scheduled_at TIMESTAMP", "status VARCHAR(50)", "notes TEXT", ...common],
    Prescription: ["appointment_id INT FK", "medicine TEXT", "dosage TEXT", ...common],
    MedicalRecord: ["patient_id INT FK", "diagnosis TEXT", "notes TEXT", ...common],
    Product: ["name VARCHAR(150)", "price DECIMAL(10,2)", "stock INT", "category_id INT FK", ...common],
    Category: ["name VARCHAR(120)", "description TEXT", ...common],
    Cart: ["user_id INT FK", "status VARCHAR(50)", ...common],
    Order: ["user_id INT FK", "total DECIMAL(10,2)", "status VARCHAR(50)", ...common],
    Payment: ["order_id INT FK", "amount DECIMAL(10,2)", "method VARCHAR(50)", "status VARCHAR(50)", ...common],
    Invoice: ["user_id INT FK", "amount DECIMAL(10,2)", "status VARCHAR(50)", "issued_at TIMESTAMP", ...common],
    Shipment: ["order_id INT FK", "address TEXT", "tracking_code VARCHAR(100)", ...common],
    Delivery: ["order_id INT FK", "driver_id INT FK", "status VARCHAR(50)", "delivered_at TIMESTAMP", ...common],
    MenuItem: ["category_id INT FK", "name VARCHAR(150)", "price DECIMAL(10,2)", "is_available BOOLEAN", ...common],
    OrderItem: ["order_id INT FK", "item_id INT FK", "quantity INT", "unit_price DECIMAL(10,2)", ...common],
    Course: ["title VARCHAR(150)", "code VARCHAR(50)", "instructor_id INT FK", ...common],
    Enrollment: ["student_id INT FK", "course_id INT FK", "status VARCHAR(50)", ...common],
    Assignment: ["course_id INT FK", "title VARCHAR(150)", "due_date DATE", ...common],
    Submission: ["assignment_id INT FK", "student_id INT FK", "file_url TEXT", "score DECIMAL(5,2)", ...common],
    Grade: ["student_id INT FK", "course_id INT FK", "value DECIMAL(5,2)", ...common],
    Resource: ["name VARCHAR(150)", "type VARCHAR(80)", "capacity INT", ...common],
    Schedule: ["resource_id INT FK", "starts_at TIMESTAMP", "ends_at TIMESTAMP", ...common],
    Booking: ["user_id INT FK", "resource_id INT FK", "scheduled_at TIMESTAMP", "status VARCHAR(50)", ...common],
    Approval: ["booking_id INT FK", "reviewer_id INT FK", "decision VARCHAR(50)", "notes TEXT", "decided_at TIMESTAMP", ...common],
    Warehouse: ["name VARCHAR(150)", "location TEXT", ...common],
    Supplier: ["name VARCHAR(150)", "phone VARCHAR(30)", "email VARCHAR(150)", ...common],
    Item: ["name VARCHAR(150)", "sku VARCHAR(80)", "quantity INT", "warehouse_id INT FK", ...common],
    StockMovement: ["item_id INT FK", "type VARCHAR(50)", "quantity INT", "notes TEXT", ...common],
    PurchaseOrder: ["supplier_id INT FK", "status VARCHAR(50)", "total DECIMAL(10,2)", ...common],
    InventoryAlert: ["item_id INT FK", "threshold INT", "message TEXT", ...common],
    Member: ["user_id INT FK", "membership_number VARCHAR(60)", "status VARCHAR(50)", ...common],
    Book: ["title VARCHAR(180)", "isbn VARCHAR(40)", "author_id INT FK", "category_id INT FK", ...common],
    Author: ["name VARCHAR(150)", "bio TEXT", ...common],
    Loan: ["book_id INT FK", "member_id INT FK", "borrowed_at TIMESTAMP", "due_date DATE", ...common],
    Fine: ["loan_id INT FK", "amount DECIMAL(10,2)", "status VARCHAR(50)", ...common],
    Owner: ["user_id INT FK", "phone VARCHAR(30)", ...common],
    Tenant: ["user_id INT FK", "phone VARCHAR(30)", ...common],
    Property: ["owner_id INT FK", "title VARCHAR(150)", "address TEXT", "price DECIMAL(12,2)", ...common],
    Listing: ["property_id INT FK", "status VARCHAR(50)", "published_at TIMESTAMP", ...common],
    Contract: ["property_id INT FK", "tenant_id INT FK", "starts_at DATE", "ends_at DATE", ...common],
    Driver: ["user_id INT FK", "license_number VARCHAR(80)", "status VARCHAR(50)", ...common],
    Vehicle: ["driver_id INT FK", "plate_number VARCHAR(30)", "type VARCHAR(80)", ...common],
    Trip: ["driver_id INT FK", "route_id INT FK", "status VARCHAR(50)", "started_at TIMESTAMP", ...common],
    Route: ["origin TEXT", "destination TEXT", "distance_km DECIMAL(8,2)", ...common],
    TrackingEvent: ["trip_id INT FK", "status VARCHAR(80)", "location TEXT", "event_at TIMESTAMP", ...common],
    Project: ["owner_id INT FK", "title VARCHAR(150)", "description TEXT", "status VARCHAR(50)", ...common],
    Task: ["project_id INT FK", "assignee_id INT FK", "title VARCHAR(150)", "status VARCHAR(50)", ...common],
    File: ["owner_id INT FK", "file_url TEXT", "file_type VARCHAR(50)", ...common],
    Attachment: ["owner_type VARCHAR(80)", "owner_id INT", "file_url TEXT", ...common],
    Message: ["sender_id INT FK", "recipient_id INT FK", "body TEXT", "read_at TIMESTAMP", ...common],
    Conversation: ["title VARCHAR(150)", "created_by INT FK", ...common],
    Notification: ["user_id INT FK", "message TEXT", "is_read BOOLEAN", ...common],
    Review: ["reviewer_id INT FK", "target_id INT", "comment TEXT", ...common],
    Rating: ["review_id INT FK", "value INT", ...common],
    Report: ["title VARCHAR(150)", "filters JSONB", "generated_by INT FK", ...common],
    Location: ["name VARCHAR(150)", "latitude DECIMAL(10,7)", "longitude DECIMAL(10,7)", "address TEXT", ...common],
    Coupon: ["code VARCHAR(60)", "discount_percent DECIMAL(5,2)", "expires_at TIMESTAMP", ...common],
    StatusHistory: ["entity_type VARCHAR(80)", "entity_id INT", "status VARCHAR(80)", "changed_by INT FK", ...common],
    SurveyForm: ["title VARCHAR(180)", "description TEXT", "audience VARCHAR(50)", "is_active BOOLEAN", ...common],
    SurveyQuestion: ["survey_form_id INT FK", "label TEXT", "type VARCHAR(50)", "is_required BOOLEAN", ...common],
    SurveyResponse: ["survey_form_id INT FK", "user_id INT FK", "submitted_at TIMESTAMP", ...common],
    SurveyAnswer: ["survey_response_id INT FK", "question_id INT FK", "answer JSONB", ...common],
    DocumentAnalysis: ["file_id INT FK", "project_id INT FK", "readiness_score DECIMAL(5,2)", "analysis JSONB", ...common]
  };
  return map[entity] || ["name VARCHAR(150)", "description TEXT", ...common];
}

function relationshipForPair(a, b) {
  const pairs = [
    ["User", "Role", "belongs_to", "many-to-one", "User belongs to Role"],
    ["Role", "Permission", "grants", "many-to-many", "Role grants Permissions"],
    ["User", "Notification", "receives", "one-to-many", "User receives many Notifications"],
    ["User", "Message", "sends", "one-to-many", "User sends many Messages"],
    ["Conversation", "Message", "contains", "one-to-many", "Conversation contains many Messages"],
    ["Doctor", "Appointment", "handles", "one-to-many", "Doctor has many Appointments"],
    ["Patient", "Appointment", "books", "one-to-many", "Patient has many Appointments"],
    ["Appointment", "Prescription", "produces", "one-to-one", "Appointment has one Prescription"],
    ["Patient", "MedicalRecord", "owns", "one-to-many", "Patient has many MedicalRecords"],
    ["Category", "Product", "classifies", "one-to-many", "Category has many Products"],
    ["Category", "MenuItem", "classifies", "one-to-many", "Category has many MenuItems"],
    ["Cart", "Product", "contains", "many-to-many", "Cart contains many Products"],
    ["Order", "OrderItem", "contains", "one-to-many", "Order contains many OrderItems"],
    ["MenuItem", "OrderItem", "selected_in", "one-to-many", "MenuItem appears in many OrderItems"],
    ["User", "Order", "places", "one-to-many", "User places many Orders"],
    ["Customer", "Order", "places", "one-to-many", "Customer places many Orders"],
    ["Order", "Payment", "paid_by", "one-to-one", "Order has one Payment"],
    ["Order", "Invoice", "billed_by", "one-to-one", "Order has one Invoice"],
    ["Order", "Shipment", "shipped_by", "one-to-one", "Order has one Shipment"],
    ["Order", "Delivery", "delivered_by", "one-to-one", "Order has one Delivery"],
    ["Instructor", "Course", "teaches", "one-to-many", "Instructor teaches many Courses"],
    ["Course", "Assignment", "has", "one-to-many", "Course has many Assignments"],
    ["Student", "Enrollment", "enrolls", "one-to-many", "Student has many Enrollments"],
    ["Course", "Enrollment", "includes", "one-to-many", "Course has many Enrollments"],
    ["Assignment", "Submission", "receives", "one-to-many", "Assignment has many Submissions"],
    ["Student", "Submission", "sends", "one-to-many", "Student sends many Submissions"],
    ["Submission", "Grade", "receives", "one-to-one", "Submission receives Grade"],
    ["Category", "Book", "classifies", "one-to-many", "Category has many Books"],
    ["Book", "Author", "written_by", "many-to-one", "Book belongs to Author"],
    ["Book", "Loan", "borrowed_in", "one-to-many", "Book has many Loans"],
    ["Member", "Loan", "borrows", "one-to-many", "Member has many Loans"],
    ["Loan", "Fine", "may_generate", "one-to-one", "Loan may generate Fine"],
    ["Resource", "Booking", "reserved_by", "one-to-many", "Resource has many Bookings"],
    ["User", "Booking", "creates", "one-to-many", "User creates many Bookings"],
    ["Booking", "Approval", "reviewed_by", "one-to-many", "Booking has approval decisions"],
    ["User", "Approval", "decides", "one-to-many", "User reviews many Approvals"],
    ["Warehouse", "Item", "stores", "one-to-many", "Warehouse stores many Items"],
    ["Supplier", "PurchaseOrder", "receives", "one-to-many", "Supplier has many PurchaseOrders"],
    ["Item", "StockMovement", "moves", "one-to-many", "Item has many StockMovements"],
    ["Item", "InventoryAlert", "triggers", "one-to-many", "Item has many InventoryAlerts"],
    ["Owner", "Property", "owns", "one-to-many", "Owner owns many Properties"],
    ["Property", "Listing", "published_as", "one-to-many", "Property has many Listings"],
    ["Property", "Contract", "leased_by", "one-to-many", "Property has many Contracts"],
    ["Tenant", "Contract", "signs", "one-to-many", "Tenant signs many Contracts"],
    ["Contract", "Payment", "paid_by", "one-to-many", "Contract has many Payments"],
    ["Driver", "Vehicle", "drives", "one-to-many", "Driver drives Vehicles"],
    ["Driver", "Trip", "assigned_to", "one-to-many", "Driver has many Trips"],
    ["Route", "Trip", "used_by", "one-to-many", "Route has many Trips"],
    ["Trip", "TrackingEvent", "tracked_by", "one-to-many", "Trip has many TrackingEvents"],
    ["Trip", "Payment", "paid_by", "one-to-one", "Trip has one Payment"],
    ["Project", "Task", "has", "one-to-many", "Project has many Tasks"],
    ["User", "Project", "owns", "one-to-many", "User owns many Projects"],
    ["Student", "Project", "submits", "one-to-many", "Student has many Projects"],
    ["Instructor", "Project", "supervises", "one-to-many", "Instructor supervises many Projects"],
    ["Project", "Submission", "receives", "one-to-many", "Project has many Submissions"],
    ["Project", "File", "contains", "one-to-many", "Project has many Files"],
    ["Project", "Review", "reviewed_by", "one-to-many", "Project has many Reviews"],
    ["Project", "StatusHistory", "changes", "one-to-many", "Project has many StatusHistory records"],
    ["User", "File", "uploads", "one-to-many", "User uploads many Files"],
    ["File", "Attachment", "referenced_by", "one-to-many", "File may be referenced by Attachments"],
    ["Review", "Rating", "has", "one-to-one", "Review has one Rating"],
    ["SurveyForm", "SurveyQuestion", "contains", "one-to-many", "SurveyForm has many SurveyQuestions"],
    ["SurveyForm", "SurveyResponse", "receives", "one-to-many", "SurveyForm has many SurveyResponses"],
    ["SurveyResponse", "SurveyAnswer", "contains", "one-to-many", "SurveyResponse has many SurveyAnswers"],
    ["User", "SurveyResponse", "submits", "one-to-many", "User submits many SurveyResponses"],
    ["Report", "File", "exported_as", "one-to-many", "Report can be exported as Files"],
    ["File", "DocumentAnalysis", "analyzed_by", "one-to-one", "File has one DocumentAnalysis"],
    ["Project", "DocumentAnalysis", "summarized_by", "one-to-many", "Project has many DocumentAnalyses"],
    ["DocumentAnalysis", "Report", "produces", "one-to-one", "DocumentAnalysis produces Report"]
  ];
  const match = pairs.find(([left, right]) => (left === a && right === b) || (left === b && right === a));
  if (!match) return null;
  const [left, right, verb, cardinality, label] = match;
  return { left, right, verb, cardinality, label };
}

function inferModules(entities, domain, text) {
  const normalized = normalizeQuestion(text);
  const modules = [
    { name: "Authentication & Roles", reason: "إدارة الدخول والصلاحيات", entities: entities.filter((item) => ["User", "Role", "Permission"].includes(item)) },
    { name: `${domain.label} Core`, reason: "العمليات الأساسية للمجال", entities: entities.filter((item) => !["User", "Role", "Permission", "Notification", "Report"].includes(item)).slice(0, 6) },
    { name: "Notifications & Reports", reason: "متابعة الأحداث والتقارير", entities: entities.filter((item) => ["Notification", "Report", "StatusHistory"].includes(item)) }
  ].filter((module) => module.entities.length);
  if (hasAny(normalized, ["دفع", "فاتوره", "اشتراك"])) modules.push({ name: "Billing", reason: "المدفوعات والفواتير", entities: entities.filter((item) => ["Payment", "Invoice", "Coupon"].includes(item)) });
  if (hasAny(normalized, ["محادثه", "رسائل", "شات"])) modules.push({ name: "Communication", reason: "المحادثات والرسائل", entities: entities.filter((item) => ["Conversation", "Message"].includes(item)) });
  return modules;
}

function inferRequirements(text, domain, entities) {
  const normalized = normalizeQuestion(text);
  const functional = [
    ...domain.flows.map((flow) => `يستطيع المستخدم تنفيذ عملية: ${flow}`),
    ...entities.filter((item) => !["User", "Role", "Permission"].includes(item)).slice(0, 5).map((entity) => `إدارة بيانات ${entity} إضافة وتعديل وبحثاً`)
  ];
  if (hasAny(normalized, ["تقرير", "احصائيات"])) functional.push("توليد تقارير وإحصائيات حسب الفترة والحالة");
  if (hasAny(normalized, ["اشعار", "تنبيه"])) functional.push("إرسال تنبيهات عند تغيّر الحالة أو اقتراب موعد مهم");
  if (hasAny(normalized, ["دفع", "فاتوره"])) functional.push("تسجيل المدفوعات وتتبع حالة الفواتير");
  return {
    functional: [...new Set(functional)].slice(0, 10),
    nonFunctional: [
      "صلاحيات واضحة حسب الدور",
      "تدقيق مدخلات النماذج قبل الحفظ",
      "حفظ سجل زمني للعمليات المهمة",
      "واجهة قابلة للبحث والتصفية",
      "نسخ احتياطي دوري لقاعدة البيانات"
    ]
  };
}

function inferMvpPlan(domain, entities) {
  const coreEntity = entities.find((item) => !["User", "Role", "Permission", "Notification", "Report"].includes(item)) || entities[0] || "Record";
  return [
    { phase: "MVP 1", title: "تثبيت الهيكل الأساسي", tasks: ["تسجيل الدخول والصلاحيات", `CRUD أساسي لـ ${coreEntity}`, "واجهة لوحة تحكم أولية"] },
    { phase: "MVP 2", title: "تشغيل دورة العمل", tasks: domain.flows.slice(0, 3) },
    { phase: "MVP 3", title: "التقارير والتحسين", tasks: ["التنبيهات", "التقارير", "تدقيق المدخلات وتجربة الاستخدام"] }
  ];
}

function inferRisks(text, entities) {
  const normalized = normalizeQuestion(text);
  const risks = [
    { level: "متوسط", title: "اتساع المتطلبات", mitigation: "ثبّت نسخة MVP صغيرة قبل إضافة ميزات ثانوية." },
    { level: "متوسط", title: "خلط صلاحيات المستخدمين", mitigation: "اعمل Role/Permission واضح واختبر كل دور بحساب مستقل." },
    { level: "منخفض", title: "ضعف جودة البيانات", mitigation: "استخدم قيود قاعدة بيانات وتحقق من المدخلات في الباك والواجهة." }
  ];
  if (entities.includes("Payment")) risks.push({ level: "عال", title: "حساسية المدفوعات", mitigation: "لا تخزن بيانات دفع حساسة واستخدم مزود دفع أو محاكاة آمنة." });
  if (entities.includes("DocumentAnalysis")) risks.push({ level: "عال", title: "الملفات الكبيرة والخصوصية", mitigation: "استخرج النص محلياً وحدد حجم الملف وخزن نتائج التحليل فقط." });
  if (hasAny(normalized, ["موقع", "تتبع", "خريطه", "خريطة"])) risks.push({ level: "متوسط", title: "دقة التتبع والموقع", mitigation: "اعتمد تحديثات دورية وحدد هامش خطأ واضح للمستخدم." });
  return risks.slice(0, 6);
}

function inferAcceptanceCriteria(domain, entities) {
  const criteria = [
    "لا يستطيع المستخدم الوصول إلا للصفحات المسموحة حسب دوره.",
    "كل عملية إنشاء أو تعديل تعرض رسالة نجاح أو خطأ واضحة.",
    "كل الجداول الأساسية قابلة للبحث أو التصفية من الواجهة.",
    "لا يتم حفظ سجل ناقص أو تاريخ غير منطقي في قاعدة البيانات."
  ];
  if (entities.includes("Notification")) criteria.push("عند حدوث حدث مهم يظهر تنبيه للمستخدم المستهدف فقط.");
  if (entities.includes("File") || entities.includes("Attachment")) criteria.push("رفع الملفات يقبل الأنواع المسموحة فقط ويعرض رابطاً صالحاً.");
  if (entities.includes("Report")) criteria.push("التقارير قابلة للتصدير وتطابق الأرقام الظاهرة في لوحة التحكم.");
  criteria.push(`تغطي الاختبارات دورة عمل واحدة كاملة من ${domain.flows[0] || "إنشاء السجل"} حتى التقرير.`);
  return criteria.slice(0, 8);
}

function inferDefenseQuestions(domain, entities) {
  return [
    `لماذا اخترت تقسيم النظام إلى هذه الجداول لمجال ${domain.label}؟`,
    "ما الفرق بين المتطلبات الوظيفية وغير الوظيفية في مشروعك؟",
    "كيف منعت المستخدم من الوصول لبيانات لا تخصه؟",
    "ما أهم علاقة في قاعدة البيانات ولماذا؟",
    entities.includes("Notification") ? "كيف تحدد من يجب أن يستقبل التنبيه؟" : "ما الميزة التي يمكن إضافتها لاحقاً دون تغيير كبير في قاعدة البيانات؟",
    "ما الاختبار الذي يثبت أن دورة العمل الأساسية تعمل بشكل صحيح؟"
  ];
}

function sqlName(value) {
  return cleanIdentifier(value).replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function sqlColumnFromField(field) {
  const text = String(field || "");
  const [nameRaw, ...rest] = text.split(/\s+/);
  const name = sqlName(nameRaw || "field");
  let type = rest.join(" ").replace("FK", "").trim();
  if (!type || type === "SERIAL PRIMARY KEY") type = text.includes("PRIMARY KEY") ? "SERIAL PRIMARY KEY" : "TEXT";
  if (text.includes("FK")) type = "INTEGER";
  return `  ${name} ${type}`;
}

function generateSqlSchema(tables) {
  return tables.slice(0, 8).map((table) => {
    const columns = table.fields.slice(0, 8).map(sqlColumnFromField);
    if (!columns.some((column) => column.includes("PRIMARY KEY"))) columns.unshift("  id SERIAL PRIMARY KEY");
    return `CREATE TABLE ${sqlName(table.name)} (\n${[...new Set(columns)].join(",\n")}\n);`;
  }).join("\n\n");
}

function inferQualityScore(blueprint) {
  const tableScore = Math.min(100, blueprint.tables.length * 8);
  const relationScore = Math.min(100, blueprint.structuredRelationships.length * 12);
  const requirementScore = Math.min(100, (blueprint.requirements.functional.length + blueprint.requirements.nonFunctional.length) * 6);
  return Math.round((tableScore * 0.35) + (relationScore * 0.35) + (requirementScore * 0.3));
}

function blueprintQuestions(text, entities) {
  const normalized = normalizeQuestion(text);
  const questions = [];
  if (!hasAny(normalized, ["دور", "ادمن", "مستخدم", "طالب", "طبيب", "زبون", "سائق"])) questions.push("ما هي أدوار المستخدمين المطلوبة بالتفصيل؟");
  if (!hasAny(normalized, ["حاله", "status", "مقبول", "مرفوض", "مكتمل"])) questions.push("ما الحالات التي تمر بها العملية الأساسية؟");
  if (!hasAny(normalized, ["تقرير", "احصائيات"])) questions.push("ما التقارير التي تحتاجها الإدارة أو المستخدم؟");
  if (entities.includes("Payment") && !hasAny(normalized, ["الكتروني", "كاش", "حواله"])) questions.push("ما طرق الدفع المطلوبة؟");
  if (entities.includes("Notification") && !hasAny(normalized, ["ايميل", "رساله", "داخل النظام"])) questions.push("كيف تريد أن تصل التنبيهات للمستخدمين؟");
  return questions.slice(0, 5);
}

function blueprintAssumptions(domain, entities) {
  const assumptions = [
    `تم اعتبار المشروع من نوع: ${domain.label}.`,
    "تمت إضافة جدول User لإدارة الدخول حتى لو لم يذكر صراحة.",
    "تمت إضافة created_at و updated_at لمعظم الجداول لدعم التتبع."
  ];
  if (entities.includes("Role")) assumptions.push("تم افتراض وجود صلاحيات وأدوار مختلفة.");
  if (entities.includes("Notification")) assumptions.push("تم افتراض وجود تنبيهات داخل النظام.");
  return assumptions;
}

function inferPages(text, domain, entities) {
  const normalized = normalizeQuestion(text);
  const pages = [...domain.pages];
  const addIf = (condition, nextPages) => {
    if (condition) pages.push(...nextPages);
  };
  addIf(entities.includes("Patient"), ["إدارة المرضى", "الملف الطبي"]);
  addIf(entities.includes("Doctor"), ["إدارة الأطباء"]);
  addIf(entities.includes("Appointment") || entities.includes("Booking"), ["حجز موعد", "تقويم الحجوزات", "طلب حجز"]);
  addIf(hasAny(normalized, ["قاعه", "قاعة", "قاعات"]), ["تقويم القاعات", "مراجعة الحجوزات"]);
  addIf(entities.includes("Product"), ["قائمة المنتجات", "تفاصيل المنتج"]);
  addIf(entities.includes("Cart"), ["السلة"]);
  addIf(entities.includes("Payment"), ["الدفع", "المدفوعات"]);
  addIf(entities.includes("Shipment"), ["تتبع الشحنة"]);
  addIf(entities.includes("Course"), ["إدارة المقررات"]);
  addIf(entities.includes("Assignment"), ["صفحة الواجبات"]);
  addIf(entities.includes("Submission"), ["رفع التسليم", "رفع الملفات"]);
  addIf(entities.includes("Grade"), ["الدرجات", "التقييم"]);
  addIf(entities.includes("Message"), ["المحادثات"]);
  addIf(entities.includes("SurveyForm"), ["إنشاء استبيان", "تعبئة استبيان", "نتائج الاستبيان", "تصدير Excel"]);
  addIf(entities.includes("DocumentAnalysis"), ["رفع ملف", "نتيجة التحليل", "مخططات مقترحة", "مراجعة المشرف"]);
  addIf(entities.includes("Project") && hasAny(normalized, ["مشروع", "مقترح"]), ["طلب مشروع", "مراجعة المقترحات", "المخطط الزمني"]);
  addIf(entities.includes("TrackingEvent"), ["تتبع الطلب", "إدارة الرحلات"]);
  addIf(entities.includes("Driver") || entities.includes("Trip"), ["إنشاء طلب", "تعيين سائق", "إدارة الرحلات"]);
  addIf(entities.includes("Order") && entities.includes("MenuItem"), ["قائمة الطعام", "إدارة المطبخ", "متابعة الطلب"]);
  pages.push("لوحة تحكم", "إدارة المستخدمين", "التقارير");
  return [...new Set(pages)].slice(0, 12);
}

function generateBlueprint(idea, techStack = "") {
  const domain = inferBlueprintDomain(idea);
  const entities = enhanceEntities(domain.entities, `${idea} ${techStack}`);
  const actors = inferActors(idea, domain);
  const tables = entities.map((entity) => ({
    name: cleanIdentifier(entity),
    purpose: `يمثل ${entity} ضمن ${domain.label}`,
    fields: fieldsForEntity(entity)
  }));
  const structuredRelationships = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const relation = relationshipForPair(entities[i], entities[j]);
      if (relation) structuredRelationships.push(relation);
    }
  }
  if (!structuredRelationships.length && entities.length > 1) {
    structuredRelationships.push({ left: entities[0], right: entities[1], verb: "has", cardinality: "one-to-many", label: `${entities[0]} has many ${entities[1]}` });
  }
  const relationships = structuredRelationships.map((relation) => relation.label);
  const pages = inferPages(idea, domain, entities);
  const apiEndpoints = [
    ...entities.slice(0, 6).flatMap((entity) => {
      const route = cleanIdentifier(entity).toLowerCase();
      return [`GET /api/${route}`, `POST /api/${route}`, `PUT /api/${route}/:id`, `DELETE /api/${route}/:id`];
    })
  ].slice(0, 18);
  const erdLines = ["erDiagram"];
  tables.slice(0, 7).forEach((table) => {
    erdLines.push(`  ${table.name} {`);
    table.fields.slice(0, 6).forEach((field) => erdLines.push(`    ${field.replace(/\s+/g, " ")}`));
    erdLines.push("  }");
  });
  structuredRelationships.slice(0, 10).forEach((relation) => {
    const left = cleanIdentifier(relation.left);
    const right = cleanIdentifier(relation.right);
    const connector = relation.cardinality === "one-to-one" ? "||--||" : relation.cardinality === "many-to-many" ? "}o--o{" : "||--o{";
    if (left !== right) erdLines.push(`  ${left} ${connector} ${right} : ${relation.verb}`);
  });
  const flowLines = ["flowchart TD", ...domain.flows.map((flow, index) => `  S${index + 1}[${flow}]${index < domain.flows.length - 1 ? ` --> S${index + 2}` : ""}`)];
  const useCaseLines = [
    "flowchart LR",
    ...actors.map((actor) => `  ${cleanIdentifier(actor)}((${actor})) --> Login[تسجيل الدخول]`),
    ...pages.slice(0, 5).map((page, index) => `  ${cleanIdentifier(actors[Math.min(index, actors.length - 1)])} --> UC${index + 1}[${page}]`),
    "  Admin((الإدارة)) --> Reports[التقارير وإدارة الصلاحيات]"
  ];
  const requirements = inferRequirements(idea, domain, entities);
  const modules = inferModules(entities, domain, idea);
  const clarifyingQuestions = blueprintQuestions(idea, entities);
  const assumptions = blueprintAssumptions(domain, entities);
  const mvpPlan = inferMvpPlan(domain, entities);
  const risks = inferRisks(idea, entities);
  const acceptanceCriteria = inferAcceptanceCriteria(domain, entities);
  const defenseQuestions = inferDefenseQuestions(domain, entities);
  const confidence = Math.min(95, 45 + domain.keywords?.filter((keyword) => normalizeQuestion(idea).includes(keyword)).length * 10 + entities.length * 3 + (techStack ? 8 : 0));
  const blueprint = {
    domainId: domain.id,
    domain: domain.label,
    confidence,
    actors,
    entities,
    tables,
    relationships,
    structuredRelationships,
    modules,
    requirements,
    mvpPlan,
    risks,
    acceptanceCriteria,
    defenseQuestions,
    assumptions,
    clarifyingQuestions,
    pages,
    apiEndpoints,
    sqlSchema: generateSqlSchema(tables),
    researchValue: [
      "يمكن تقييم جودة التصميم الناتج عبر Rubric من المشرفين.",
      "يمكن مقارنة تصميم المساعد مع تصميم الطالب اليدوي.",
      "يمكن قياس الوقت اللازم للوصول إلى ERD أولي قبل وبعد استخدام المساعد."
    ],
    mermaid: {
      erd: erdLines.join("\n"),
      flowchart: flowLines.join("\n"),
      useCase: useCaseLines.join("\n")
    }
  };
  blueprint.qualityScore = inferQualityScore(blueprint);
  return blueprint;
}

featuresRouter.get("/project-ideas", async (req, res) => {
  const search = `%${String(req.query.search || "").trim()}%`;
  res.json(await query(`
    SELECT pi.*, u.full_name AS suggested_by_name
    FROM project_ideas pi
    LEFT JOIN users u ON u.id = pi.suggested_by
    WHERE pi.is_active = true
      AND ($1 = '%%' OR pi.title ILIKE $1 OR pi.description ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(pi.tech_stack) tech WHERE tech ILIKE $1))
    ORDER BY pi.created_at DESC
  `, [search]));
});

featuresRouter.post("/project-ideas", allowRoles("admin", "supervisor"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ message: "عنوان الفكرة مطلوب" });
  const [idea] = await query(`
    INSERT INTO project_ideas (title, description, department, tech_stack, difficulty, suggested_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    title,
    String(req.body.description || "").trim(),
    String(req.body.department || req.user.department || "هندسة المعلومات").trim(),
    list(req.body.techStack),
    String(req.body.difficulty || "متوسط").trim(),
    req.user.id
  ]);
  res.status(201).json(idea);
});

featuresRouter.post("/project-ideas/:id/request", allowRoles("student"), async (req, res) => {
  const [idea] = await query("SELECT * FROM project_ideas WHERE id = $1 AND is_active = true", [req.params.id]);
  if (!idea) return res.status(404).json({ message: "الفكرة غير موجودة" });
  const registrationTerm = await getRegistrationTerm();
  if (registrationTerm.error) return res.status(400).json({ message: registrationTerm.error });
  const academicTerm = registrationTerm.code;
  const [existingTermProject] = await query(
    `SELECT id, title, status
     FROM projects
     WHERE student_id = $1 AND academic_term = $2
       AND is_archived = false
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user.id, academicTerm]
  );
  if (existingTermProject) {
    return res.status(400).json({
      message: `لا يمكنك تسجيل مشروع جديد خلال نفس الفصل. لديك مشروع مسجل لهذا الفصل: ${existingTermProject.title}`
    });
  }
  const preferredSupervisorId = req.body.preferredSupervisorId ? Number(req.body.preferredSupervisorId) : null;
  if (preferredSupervisorId) {
    const supervisor = await getSupervisorTermCapacity(preferredSupervisorId, academicTerm);
    if (!supervisor) return res.status(400).json({ message: "المشرف المحدد غير موجود" });
    if (!supervisor.profile_complete) return res.status(400).json({ message: "ملف المشرف المحدد غير مكتمل حالياً" });
    if (Number(supervisor.current_load || 0) >= Number(supervisor.max_students_capacity || 0)) {
      return res.status(400).json({ message: "لا يمكنك التسجيل عند هذا المشرف لأن العدد مكتمل لديه" });
    }
  }
  const deadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [project] = await query(`
    INSERT INTO projects (student_id, title, abstract, deadline, preferred_supervisor_id, tech_stack, academic_term, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review')
    RETURNING *
  `, [req.user.id, idea.title, idea.description, deadline, preferredSupervisorId, idea.tech_stack, academicTerm]);
  await query("INSERT INTO milestones (project_id, title, due_date) VALUES ($1, 'Proposal', $2)", [project.id, deadline]);
  if (preferredSupervisorId) {
    await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'project_request', $2)", [preferredSupervisorId, `طلب مشروع جديد من بنك الأفكار: ${idea.title}`]);
  }
  res.status(201).json(project);
});

featuresRouter.get("/library", async (req, res) => {
  const search = `%${String(req.query.search || "").trim()}%`;
  res.json(await query(`
    SELECT p.id, p.title, p.abstract, p.tech_stack, p.archived_at, student.full_name AS student_name, u.department, supervisor.full_name AS supervisor_name
    FROM projects p
    JOIN users student ON student.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    LEFT JOIN users supervisor ON supervisor.id = st.supervisor_id
    LEFT JOIN users u ON u.id = p.student_id
    WHERE p.is_archived = true
      AND ($1 = '%%' OR p.title ILIKE $1 OR p.abstract ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(p.tech_stack) tech WHERE tech ILIKE $1))
    ORDER BY p.archived_at DESC NULLS LAST, p.created_at DESC
    LIMIT 50
  `, [search]));
});

featuresRouter.get("/supervisor-suggestions", allowRoles("student", "admin"), async (req, res) => {
  const tech = list(req.query.techStack);
  const textTerms = list(`${req.query.title || ""},${req.query.abstract || ""}`);
  const activeTerm = await getActiveAcademicTerm();
  const supervisors = await listSupervisorsWithTermCapacity(activeTerm?.code || null);
  const ranked = supervisors.map((supervisor) => {
    const skills = [...(supervisor.expertise_keywords || []), ...(supervisor.languages || []), ...(supervisor.tools || [])];
    const match = overlapScore(skills, [...tech, ...textTerms]);
    const capacity = Math.max(Number(supervisor.max_students_capacity || 1), 1);
    const loadPenalty = Number(supervisor.current_load || 0) / capacity;
    return {
      ...supervisor,
      match_score: Math.max(0, Math.round((match * 25 + (1 - loadPenalty) * 25) * 10) / 10),
      match_reasons: skills.filter((skill) => [...tech, ...textTerms].some((term) => skill.toLowerCase().includes(term.toLowerCase()) || term.toLowerCase().includes(skill.toLowerCase()))).slice(0, 6)
    };
  }).sort((a, b) => b.match_score - a.match_score);
  res.json(ranked.slice(0, 6));
});

featuresRouter.post("/assistant", async (req, res) => {
  const currentText = String(req.body.text || "").trim();
  const contextText = String(req.body.contextText || "").trim();
  const text = [contextText, currentText].filter(Boolean).join("\n").slice(-5000).trim();
  const question = normalizeQuestion(currentText || text);
  const combinedQuestion = normalizeQuestion(text);
  const tech = list(req.body.techStack);
  const tips = [];

  let summary = "";
  let suggestedKeywords = [...new Set([...tech, ...list(text).filter((item) => item.length > 3).slice(0, 6)])].slice(0, 8);
  let blueprint = null;
  let roleContextUsed = false;

  const wantsBlueprint = Boolean(req.body.forceBlueprint) || hasAny(combinedQuestion, [
    "قاعده بيانات", "قواعد بيانات", "داتا بيز", "database", "erd", "جداول", "علاقات",
    "مخطط", "صمملي", "تصميم اولي", "use case", "flowchart", "api", "واجهات",
    "فكره مشروع", "فكرة مشروع", "بناء", "منصه", "منصة", "اقترح", "اقتراح",
    "بدي", "حابب اعمل", "حابة اعمل", "اريد", "أريد", "اريد اعمل", "أريد عمل", "اعمل نظام", "اعمل تطبيق", "تطبيق", "نظام"
  ]);
  const asksForPersonalStatus = hasNormalizedPhrase(question, ["حالتي", "حاله مشروعي", "حالة مشروعي", "مشرفي", "مين مشرفي", "من مشرفي", "المشرف الحالي", "مشرف المشروع", "الدكتور تبعي", "استاذي", "موعدي", "مراحلي"]);
  if (wantsBlueprint && !asksForPersonalStatus && text.length > 10) {
    blueprint = generateBlueprint(text, req.body.techStack);
    summary = `بنيت لك Blueprint أكاديمي أولي لمشروعك ضمن مجال: ${blueprint.domain}. اقترحت ${blueprint.tables.length} جداول، ${blueprint.relationships.length} علاقات، ${blueprint.pages.length} صفحات، ${blueprint.apiEndpoints.length} endpoint، وخطة MVP بثلاث مراحل. درجة اكتمال التصميم الأولي: ${blueprint.qualityScore}%.`;
    tips.push("راجع الجداول والعلاقات مع المشرف، ثم عدّل الأسماء والحقول حسب متطلبات المشروع الدقيقة.");
    tips.push("استخدم Mermaid ERD كبداية، وليس كتصميم نهائي قبل تحليل المتطلبات.");
    tips.push("حوّل أسئلة تدقيق التصميم إلى أسئلة تجمعها من صاحب الفكرة قبل بدء البرمجة.");
    suggestedKeywords = [...new Set([...suggestedKeywords, ...blueprint.entities])].slice(0, 10);
  }

  if (!summary && req.user.role === "student") {
    const context = await studentAssistantContext(req.user);
    const project = context.activeProject;
    const asksForOwnSupervisor = hasNormalizedPhrase(question, ["مشرفي", "مين مشرفي", "من مشرفي", "المشرف الحالي", "مشرف المشروع", "الدكتور تبعي", "استاذي"]);
    if (asksForOwnSupervisor) {
      roleContextUsed = true;
      if (context.student?.supervisor_name) {
        summary = `مشرفك الحالي هو ${context.student.supervisor_name}. البريد: ${context.student.supervisor_email || "غير محدد"}، رقم التواصل: ${context.student.supervisor_phone || "غير محدد"}. إذا بدك اجتماع معه استخدم خيار طلب اجتماع مع المشرف.`;
      } else if (project?.preferred_supervisor_id) {
        const [preferred] = await query("SELECT full_name, email, phone FROM users WHERE id = $1", [project.preferred_supervisor_id]);
        summary = preferred
          ? `المشرف الذي اخترته للطلب هو ${preferred.full_name}. الطلب لسه بحالة ${projectStatusLabel(project.status)}.`
          : "اخترت مشرفاً للطلب، لكن لم يتم اعتماد الإشراف النهائي بعد.";
      } else {
        summary = "لا يوجد مشرف مرتبط بك حالياً. ادخل إلى طلب المشروع واختر مشرفاً مناسباً حسب التقنيات، وبعد قبول الطلب سيظهر كمشرفك الحالي.";
      }
      tips.push("لو كان عندك مشروع محدد، اذكر تقنياته حتى أقترح لك مشرفاً أقرب لاختصاصه.");
    } else if (hasAny(question, ["مشروع", "حال", "حاله", "طلب"])) {
      roleContextUsed = true;
      summary = project
        ? `مشروعك الحالي: ${project.title}. الحالة: ${projectStatusLabel(project.status)}. الموعد النهائي: ${dateText(project.deadline)}.`
        : "لا يوجد مشروع مسجل حالياً. ابدأ من صفحة طلب المشروع أو بنك الأفكار واختر مشرفاً قبل الإرسال.";
      if (project?.supervisor_feedback) tips.push(`ملاحظة المشرف الأخيرة: ${project.supervisor_feedback}`);
      tips.push(project ? "تابع رفع الملفات والفصول بعد قبول المشروع من المشرف." : "اكتب عنواناً واضحاً، وصف المشكلة، التقنيات، والمشرف المطلوب.");
    } else if (hasAny(question, ["مرحله", "مراحل", "موعد", "تاخر", "تسليم"])) {
      roleContextUsed = true;
      const next = context.milestones.find((item) => item.status !== "done" && !item.completed_at);
      summary = next
        ? `أقرب مرحلة عندك هي ${next.title} وموعدها ${dateText(next.due_date)}.`
        : context.milestones.length ? "كل المراحل الحالية مكتملة أو لا يوجد موعد محدد للمرحلة القادمة." : "لا توجد مراحل مضافة بعد. المشرف يضيف المراحل بعد قبول المشروع.";
      tips.push("افتح لوحة الطالب لمتابعة المخطط الزمني ونسبة الجاهزية.");
    } else if (hasAny(question, ["ملف", "فصل", "اطروحه", "تحليل", "تصحيح"])) {
      roleContextUsed = true;
      summary = context.submissions.length
        ? `لديك ${context.submissions.length} ملف مرفوع. من صفحة الملفات والفصول اضغط تحليل بالمساعد على ملف PDF أو DOCX ليعطيك ملاحظات ومخططات.`
        : "لم ترفع ملفات بعد. بعد قبول المشروع، ارفع ملف PDF أو DOCX من صفحة الملفات والفصول ثم اضغط تحليل بالمساعد.";
      tips.push("المساعد يستخرج النص برمجياً من الملف ولا يرسل الملف الضخم مباشرة.");
    }
  }

  if (!summary && req.user.role === "supervisor") {
    const context = await supervisorAssistantContext(req.user);
    if (hasAny(question, ["طلاب", "طلابي", "مشاريع"])) {
      roleContextUsed = true;
      summary = context.assigned.length
        ? `عندك ${context.assigned.length} طالب/مشروع ظاهر في لوحة المشرف. أبرز المشاريع: ${context.assigned.slice(0, 3).map((item) => `${item.student_name}: ${item.title || "بدون مشروع"}`).join("، ")}.`
        : "لا يوجد طلاب مسجلون عندك حالياً.";
      tips.push("افتح لوحة المشرف واضغط عرض بجانب الطالب لرؤية المشروع والتقدم.");
    } else if (hasAny(question, ["مقترح", "مراجعه", "قبول", "رفض"])) {
      roleContextUsed = true;
      summary = context.pending.length
        ? `لديك ${context.pending.length} مقترحات بانتظار المراجعة: ${context.pending.map((item) => `${item.student_name} - ${item.title}`).join("، ")}.`
        : "لا توجد مقترحات بانتظار مراجعتك حالياً.";
      tips.push("من صفحة المقترحات يمكنك قبول، طلب تعديل، أو رفض المقترح مع ملاحظة للطالب.");
    } else if (hasAny(question, ["تقييم", "rubric", "درجه"])) {
      roleContextUsed = true;
      summary = "استخدم صفحة مساعد التقييم لاختيار المشروع ونموذج Rubric ثم أدخل درجات المعايير. يمكن أيضاً استخدام بطاقة AI كمساعدة أولية.";
      tips.push("التقييم النهائي يبقى قرارك، والمساعد يعطي مؤشرات فقط.");
    }
  }

  if (!summary && req.user.role === "admin") {
    const { stats } = await adminAssistantContext();
    if (hasAny(question, ["احصاء", "لوحه", "وضع", "النظام"])) {
      roleContextUsed = true;
      summary = `ملخص النظام: ${stats.students} طلاب، ${stats.supervisors} مشرفين، ${stats.pending_projects} مشاريع بانتظار المشرف، ${stats.open_reports} مشاكل تقنية مفتوحة، و${stats.students_without_projects} طلاب بدون مشروع.`;
      tips.push("افتح لوحة الإدارة لمتابعة المؤشرات السريعة والتقنيات الأكثر استخداماً.");
    } else if (hasAny(question, ["طلاب بدون", "ما سجل", "بدون مشروع"])) {
      roleContextUsed = true;
      summary = `عدد الطلاب الذين لم يسجلوا مشروعاً بعد هو ${stats.students_without_projects}.`;
      tips.push("تجد التفاصيل في تقارير المشاريع ضمن لوحة الإدارة.");
    } else if (hasAny(question, ["مشاكل", "تقنيه", "تقنية"])) {
      roleContextUsed = true;
      summary = `يوجد ${stats.open_reports} مشاكل تقنية مفتوحة حالياً.`;
      tips.push("افتح صفحة المشاكل التقنية لمراجعة اللقطات وتحديث الحالة.");
    }
  }

  if (!summary && hasAny(question, ["كيف", "استخدم", "وين", "افتح"])) {
    summary = "اسألني عن مشروعك، مشرفك، المواعيد، رفع الملفات، الاستبيانات، أو طريقة استخدام أي صفحة. سأحاول توجيهك للمكان الصحيح داخل النظام.";
    tips.push("مثال: من هو مشرفي؟ ما حالة مشروعي؟ كيف أحلل ملف الأطروحة؟ أين أجد الاستبيانات؟");
  }

  if (!summary) {
    if (text.length < 80) tips.push("الوصف قصير. حاول توضيح المشكلة، المستخدمين المستهدفين، والمخرجات المتوقعة.");
    if (!tech.length) tips.push("أضف اللغات والتقنيات حتى يستطيع النظام اقتراح مشرفين مناسبين.");
    if (!/هدف|أهداف|اهداف|مشكلة|حل/.test(question)) tips.push("اكتب الهدف والمشكلة التي يحلها المشروع بشكل مباشر.");
    if (!/قاعده|بيانات|api|واجهه|تطبيق|نظام/.test(question)) tips.push("اذكر مكونات التنفيذ الأساسية مثل الواجهة، قاعدة البيانات، أو API.");
    summary = text ? text.slice(0, 260) : "اكتب سؤالك أو فكرة مشروعك، وأنا أساعدك حسب بياناتك داخل النظام.";
  }

  if (hasAny(question, ["مشرف مناسب", "اقترح مشرف", "مين اختار"]) || tech.length) {
    const supervisors = await query(`
      SELECT u.full_name, s.expertise_keywords, s.languages, s.tools, s.current_load, s.max_students_capacity
      FROM supervisors s JOIN users u ON u.id = s.user_id
    `);
    const terms = [...tech, ...list(text)];
    const ranked = supervisors.map((supervisor) => {
      const skills = [...(supervisor.expertise_keywords || []), ...(supervisor.languages || []), ...(supervisor.tools || [])];
      return { supervisor, score: overlapScore(skills, terms), skills };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (ranked.length) {
      tips.push(`مشرفون مناسبون مبدئياً: ${ranked.map((item) => `${item.supervisor.full_name} (${item.supervisor.current_load}/${item.supervisor.max_students_capacity})`).join("، ")}.`);
      suggestedKeywords = [...new Set([...suggestedKeywords, ...ranked.flatMap((item) => item.skills).slice(0, 5)])].slice(0, 8);
    }
  }

  const intelligence = await buildAssistantIntelligence({
    text,
    tech,
    user: req.user,
    blueprint,
    roleContext: roleContextUsed
  });
  const shouldContinueRequirements = req.user.role === "student"
    && !roleContextUsed
    && Boolean(text || tech.length)
    && ["project_advisor", "blueprint", "novelty", "roadmap", "thesis_feedback", "supervisor_match"].includes(intelligence.intent?.id);
  if (shouldContinueRequirements) {
    const reqSession = intelligence.requirements;
    tips.unshift(`جلسة بناء المشروع: اكتملت المتطلبات بنسبة ${reqSession.completion}%. المرحلة الحالية: ${reqSession.stage}.`);
    if (!reqSession.readyForBlueprint) {
      summary = `${summary}\n\nحتى أبني لك المشروع بشكل كامل ومتكامل، جاوبني على السؤال التالي:\n${reqSession.nextQuestion}`;
    } else if (!blueprint) {
      summary = `${summary}\n\nالمتطلبات الأساسية صارت كافية. أقدر الآن أحولها إلى Blueprint كامل مع الجداول والصفحات والـ APIs.`;
    }
  }

  res.json({
    summary,
    tips: tips.length ? tips : ["الفكرة واضحة مبدئياً. الخطوة التالية هي تحديد المشرف المناسب وخطة التنفيذ."],
    suggestedKeywords,
    blueprint,
    requirements: intelligence.requirements,
    confidence: intelligence.confidence,
    intelligence
  });
});

featuresRouter.post("/project-blueprint", async (req, res) => {
  const idea = String(req.body.idea || req.body.text || "").trim();
  if (idea.length < 10) return res.status(400).json({ message: "اكتب وصفاً أوضح لفكرة المشروع" });
  res.json(generateBlueprint(idea, req.body.techStack));
});

featuresRouter.post("/project-blueprint/project/:projectId", allowRoles("supervisor", "admin"), async (req, res) => {
  const [project] = await query(`
    SELECT p.*, st.supervisor_id, student.full_name AS student_name
    FROM projects p
    JOIN users student ON student.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.projectId]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed = req.user.role === "admin" || project.supervisor_id === req.user.id || project.preferred_supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تحليل هذا المشروع" });

  const blueprint = generateBlueprint(`${project.title}\n${project.abstract}`, (project.tech_stack || []).join(", "));
  const [saved] = await query(`
    INSERT INTO project_blueprints (project_id, student_id, blueprint, source)
    VALUES ($1, $2, $3, 'assistant_supervisor')
    ON CONFLICT (project_id) DO UPDATE
      SET blueprint = EXCLUDED.blueprint,
          source = EXCLUDED.source
    RETURNING *
  `, [project.id, project.student_id, JSON.stringify(blueprint)]);
  res.json({ project, blueprint: saved, comparison: blueprintComparison(project, saved) });
});

featuresRouter.post("/assistant-feedback", async (req, res) => {
  const usefulness = Number(req.body.usefulness || 0);
  if (!Number.isInteger(usefulness) || usefulness < 1 || usefulness > 5) {
    return res.status(400).json({ message: "تقييم الفائدة مطلوب من 1 إلى 5" });
  }
  const scoreOrNull = (value) => {
    const score = Number(value || 0);
    return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
  };
  const [feedback] = await query(`
    INSERT INTO assistant_feedback (
      user_id, prompt, response_summary, blueprint, usefulness,
      tables_score, relationships_score, diagrams_score, comment,
      pipeline_type, model_name, evidence_score, correctness_score, hallucination_risk
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    req.user.id,
    String(req.body.prompt || "").trim(),
    String(req.body.responseSummary || "").trim(),
    req.body.blueprint ? JSON.stringify(req.body.blueprint) : null,
    usefulness,
    scoreOrNull(req.body.tablesScore),
    scoreOrNull(req.body.relationshipsScore),
    scoreOrNull(req.body.diagramsScore),
    String(req.body.comment || "").trim(),
    String(req.body.pipelineType || req.body.pipeline_type || "").trim() || null,
    String(req.body.modelName || req.body.model_name || "").trim() || null,
    scoreOrNull(req.body.evidenceScore || req.body.evidence_score),
    scoreOrNull(req.body.correctnessScore || req.body.correctness_score),
    scoreOrNull(req.body.hallucinationRisk || req.body.hallucination_risk)
  ]);
  res.status(201).json(feedback);
});

featuresRouter.get("/assistant-feedback", allowRoles("admin", "supervisor"), async (_req, res) => {
  const rows = await query(`
    SELECT af.*, u.full_name, u.role
    FROM assistant_feedback af
    LEFT JOIN users u ON u.id = af.user_id
    ORDER BY af.created_at DESC
    LIMIT 100
  `);
  const [stats] = await query(`
    SELECT
      COUNT(*)::int AS total,
      ROUND(AVG(usefulness)::numeric, 2)::float AS avg_usefulness,
      ROUND(AVG(tables_score)::numeric, 2)::float AS avg_tables,
      ROUND(AVG(relationships_score)::numeric, 2)::float AS avg_relationships,
      ROUND(AVG(diagrams_score)::numeric, 2)::float AS avg_diagrams
    FROM assistant_feedback
  `);
  res.json({ stats, rows });
});

function escapeCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

featuresRouter.get("/assistant-feedback.xls", allowRoles("admin", "supervisor"), async (_req, res) => {
  const rows = await query(`
    SELECT af.id, u.full_name, u.role, af.prompt, af.usefulness, af.tables_score,
      af.relationships_score, af.diagrams_score, af.comment, af.created_at
    FROM assistant_feedback af
    LEFT JOIN users u ON u.id = af.user_id
    ORDER BY af.created_at DESC
  `);
  const headers = ["id", "user", "role", "prompt", "usefulness", "tables_score", "relationships_score", "diagrams_score", "comment", "created_at"];
  const body = rows.map((row) => `
    <tr>
      ${headers.map((header) => `<td>${escapeCell(row[header === "user" ? "full_name" : header])}</td>`).join("")}
    </tr>
  `).join("");
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=assistant-feedback-research.xls");
  res.send(`<table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`);
});

function blueprintComparison(project, blueprintRecord) {
  const blueprint = blueprintRecord?.blueprint || {};
  const scores = {
    tables: blueprintRecord?.tables_score || null,
    relationships: blueprintRecord?.relationships_score || null,
    diagrams: blueprintRecord?.diagrams_score || null,
    feasibility: blueprintRecord?.feasibility_score || null
  };
  const reviewed = Object.values(scores).some(Boolean);
  const recommendations = [];
  if (!reviewed) recommendations.push("لم يتم تقييم هذا الـ Blueprint من المشرف بعد.");
  if ((scores.tables || 5) <= 3) recommendations.push("راجع الجداول المقترحة وتأكد من وجود مفاتيح أساسية وحقول حالة وتواريخ تدقيق.");
  if ((scores.relationships || 5) <= 3) recommendations.push("راجع العلاقات والكارديناليتي بين الجداول قبل اعتماد التصميم.");
  if ((scores.diagrams || 5) <= 3) recommendations.push("حسّن المخططات المرئية لتشرح تدفق العمل بوضوح أكبر.");
  if ((scores.feasibility || 5) <= 3) recommendations.push("قسّم المشروع إلى MVP أصغر أو قلل النطاق قبل التنفيذ.");
  if (!recommendations.length) recommendations.push("تقييم المشرف متوافق مع التصميم المقترح، ويمكن اعتماد الـ Blueprint كأساس أولي.");
  return {
    project: {
      id: project.id,
      title: project.title,
      status: project.status
    },
    assistantMetrics: {
      qualityScore: blueprint.qualityScore || 0,
      confidence: blueprint.confidence || 0,
      tables: blueprint.tables?.length || 0,
      relationships: blueprint.structuredRelationships?.length || blueprint.relationships?.length || 0,
      pages: blueprint.pages?.length || 0,
      apiEndpoints: blueprint.apiEndpoints?.length || 0
    },
    supervisorScores: scores,
    reviewed,
    supervisorNotes: blueprintRecord?.supervisor_notes || "",
    recommendations
  };
}

featuresRouter.get("/project-blueprint/comparison/:projectId", allowRoles("supervisor", "admin"), async (req, res) => {
  const [project] = await query(`
    SELECT p.*, st.supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.projectId]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed = req.user.role === "admin" || project.supervisor_id === req.user.id || project.preferred_supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية مقارنة هذا المشروع" });
  const [blueprintRecord] = await query("SELECT * FROM project_blueprints WHERE project_id = $1", [project.id]);
  if (!blueprintRecord) return res.status(404).json({ message: "لا يوجد Blueprint محفوظ لهذا المشروع" });
  res.json(blueprintComparison(project, blueprintRecord));
});

featuresRouter.get("/assistant-benchmark", allowRoles("admin", "supervisor"), async (_req, res) => {
  const results = assistantBenchmarkCases.map((item) => {
    const blueprint = generateBlueprint(item.student_prompt, "");
    const actualTables = blueprint.tables?.map((table) => table.name) || [];
    const tableRecall = arrayRecall(item.expected_tables || [], actualTables);
    const relationshipRecallResult = relationshipRecall(item.expected_relationships || [], blueprint.structuredRelationships || blueprint.relationships || []);
    const pageRecall = arrayRecall(item.expected_pages || [], blueprint.pages || []);
    const actorRecall = arrayRecall(item.expected_actors || [], blueprint.actors || []);
    const domainScore = blueprint.domainId === item.expected_domain || item.expected_domain === "generic" ? 100 : 0;
    const totalScore = average([domainScore, actorRecall.score, tableRecall.score, relationshipRecallResult.score, pageRecall.score]);
    return {
      id: item.id,
      difficulty: item.difficulty,
      prompt: item.student_prompt,
      expectedDomain: item.expected_domain,
      actualDomain: blueprint.domain,
      score: totalScore,
      domainScore,
      actors: actorRecall,
      tables: tableRecall,
      relationships: relationshipRecallResult,
      pages: pageRecall,
      evaluationFocus: item.evaluation_focus
    };
  });
  const summary = {
    totalCases: results.length,
    averageScore: average(results.map((item) => item.score)),
    averageTables: average(results.map((item) => item.tables.score)),
    averageRelationships: average(results.map((item) => item.relationships.score)),
    averagePages: average(results.map((item) => item.pages.score)),
    strongCases: results.filter((item) => item.score >= 75).length,
    weakCases: results.filter((item) => item.score < 50).length
  };
  res.json({ summary, results });
});

featuresRouter.get("/assistant-benchmark.xls", allowRoles("admin", "supervisor"), async (_req, res) => {
  const rows = assistantBenchmarkCases.map((item) => {
    const blueprint = generateBlueprint(item.student_prompt, "");
    const actualTables = blueprint.tables?.map((table) => table.name) || [];
    const tableRecall = arrayRecall(item.expected_tables || [], actualTables);
    const relationshipRecallResult = relationshipRecall(item.expected_relationships || [], blueprint.structuredRelationships || blueprint.relationships || []);
    const pageRecall = arrayRecall(item.expected_pages || [], blueprint.pages || []);
    const actorRecall = arrayRecall(item.expected_actors || [], blueprint.actors || []);
    const domainScore = blueprint.domainId === item.expected_domain || item.expected_domain === "generic" ? 100 : 0;
    return {
      id: item.id,
      difficulty: item.difficulty,
      expected_domain: item.expected_domain,
      actual_domain: blueprint.domain,
      total_score: average([domainScore, actorRecall.score, tableRecall.score, relationshipRecallResult.score, pageRecall.score]),
      domain_score: domainScore,
      actor_score: actorRecall.score,
      table_score: tableRecall.score,
      relationship_score: relationshipRecallResult.score,
      page_score: pageRecall.score,
      evaluation_focus: item.evaluation_focus
    };
  });
  const headers = Object.keys(rows[0] || {});
  const body = rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeCell(row[header])}</td>`).join("")}</tr>`).join("");
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=assistant-benchmark-results.xls");
  res.send(`<table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`);
});

featuresRouter.get("/survey-analytics/:id", allowRoles("admin"), async (req, res) => {
  const [survey] = await query("SELECT * FROM survey_forms WHERE id = $1", [req.params.id]);
  if (!survey) return res.status(404).json({ message: "الاستبيان غير موجود" });
  const responses = await query("SELECT answers FROM survey_responses WHERE survey_id = $1", [req.params.id]);
  const analytics = (survey.questions || []).map((question) => {
    const counts = {};
    responses.forEach((response) => {
      const value = response.answers?.[question.id];
      const values = Array.isArray(value) ? value : [value || "غير محدد"];
      values.forEach((item) => { counts[item] = (counts[item] || 0) + 1; });
    });
    return { question: question.label, type: question.type, counts };
  });
  res.json({ survey, totalResponses: responses.length, analytics });
});

featuresRouter.get("/rubrics", async (_, res) => {
  res.json(await query("SELECT * FROM rubric_templates WHERE is_active = true ORDER BY created_at DESC"));
});

featuresRouter.post("/rubrics", allowRoles("admin"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  const criteria = Array.isArray(req.body.criteria) ? req.body.criteria.filter((item) => item.name) : [];
  if (!title || !criteria.length) return res.status(400).json({ message: "عنوان ومعايير التقييم مطلوبة" });
  const [rubric] = await query("INSERT INTO rubric_templates (title, criteria, created_by) VALUES ($1, $2, $3) RETURNING *", [title, JSON.stringify(criteria), req.user.id]);
  res.status(201).json(rubric);
});

featuresRouter.post("/rubrics/:templateId/evaluate/:projectId", allowRoles("supervisor", "admin"), async (req, res) => {
  const [template] = await query("SELECT * FROM rubric_templates WHERE id = $1", [req.params.templateId]);
  if (!template) return res.status(404).json({ message: "نموذج التقييم غير موجود" });
  const [project] = await query(`
    SELECT p.id, st.supervisor_id, p.preferred_supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.projectId]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed = req.user.role === "admin"
    || project.supervisor_id === req.user.id
    || project.preferred_supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تقييم هذا المشروع" });
  const scores = req.body.scores || {};
  const total = (template.criteria || []).reduce((sum, criterion) => sum + Number(scores[criterion.id] || 0), 0);
  const [evaluation] = await query(`
    INSERT INTO rubric_evaluations (project_id, template_id, evaluator_id, scores, notes, total_score)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [req.params.projectId, req.params.templateId, req.user.id, scores, String(req.body.notes || ""), total]);
  res.status(201).json(evaluation);
});
