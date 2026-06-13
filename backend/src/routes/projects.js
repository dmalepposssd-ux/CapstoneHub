import express from "express";
import { getRegistrationTerm, getSupervisorTermCapacity } from "../academicTerms.js";
import { dateError, dateTimeError, isValidDateInput, isValidDateTimeInput } from "../dateValidation.js";
import { query } from "../db.js";
import { allowRoles, requireApproved, requireAuth } from "../middleware.js";
import { upload, verifyUploadedFile } from "../upload.js";

export const projectsRouter = express.Router();
projectsRouter.use(requireAuth);
projectsRouter.use(requireApproved);

projectsRouter.post("/similar", allowRoles("student"), async (req, res) => {
  const { title = "", abstract = "", techStack = "" } = req.body;
  const terms = `${title} ${abstract} ${techStack}`.trim().split(/[\s,،]+/).filter((term) => term.length > 2).slice(0, 12);
  const pattern = terms.map((term) => `%${term}%`);
  const [student] = await query("SELECT department FROM students WHERE user_id = $1", [req.user.id]);
  const department = student?.department || req.user.department || "هندسة المعلومات";
  const similar = await query(
    `
      SELECT p.id, p.title, p.abstract, p.status, p.tech_stack, u.full_name AS student_name, st.department,
        CASE
          WHEN cardinality($3::text[]) > 0 AND p.tech_stack && $4::text[] THEN 'tech'
          WHEN cardinality($3::text[]) > 0 AND (p.title ILIKE ANY($3::text[]) OR p.abstract ILIKE ANY($3::text[])) THEN 'similar'
          ELSE 'previous'
        END AS match_type,
        CASE
          WHEN cardinality($3::text[]) > 0 AND p.tech_stack && $4::text[] THEN 'نفس التقنيات أو لغات البرمجة'
          WHEN cardinality($3::text[]) > 0 AND p.title ILIKE ANY($3::text[]) THEN 'تشابه في عنوان المشروع'
          WHEN cardinality($3::text[]) > 0 AND p.abstract ILIKE ANY($3::text[]) THEN 'تشابه في الوصف والكلمات المفتاحية'
          ELSE 'مشروع سابق من نفس القسم'
        END AS match_reason
      FROM projects p
      JOIN users u ON u.id = p.student_id
      JOIN students st ON st.user_id = p.student_id
      WHERE p.student_id <> $1
        AND st.department = $2
        AND p.is_archived = true
      ORDER BY
        CASE
          WHEN cardinality($3::text[]) > 0 AND p.tech_stack && $4::text[] THEN 0
          WHEN cardinality($3::text[]) > 0 AND (p.title ILIKE ANY($3::text[]) OR p.abstract ILIKE ANY($3::text[])) THEN 1
          ELSE 1
        END,
        p.created_at DESC
      LIMIT 8
    `,
    [req.user.id, department, pattern, terms]
  );
  res.json(similar);
});

projectsRouter.post("/", allowRoles("student"), upload.single("proposal"), async (req, res) => {
  if (req.file) await verifyUploadedFile(req.file.path);
  const { title, abstract, deadline } = req.body;
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
  const techStack = String(req.body.techStack || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (preferredSupervisorId) {
    const supervisor = await getSupervisorTermCapacity(preferredSupervisorId, academicTerm);
    if (!supervisor) return res.status(400).json({ message: "المشرف المحدد غير موجود" });
    if (!supervisor.profile_complete) return res.status(400).json({ message: "ملف المشرف المحدد غير مكتمل حالياً" });
    if (Number(supervisor.current_load || 0) >= Number(supervisor.max_students_capacity || 0)) {
      return res.status(400).json({ message: "لا يمكنك التسجيل عند هذا المشرف لأن العدد مكتمل لديه" });
    }
  }
  if (deadline && !isValidDateInput(deadline)) return res.status(400).json({ message: dateError("موعد المشروع") });
  let blueprintPayload = null;
  if (req.body.blueprintJson) {
    try {
      blueprintPayload = JSON.parse(req.body.blueprintJson);
    } catch {
      return res.status(400).json({ message: "ملف Blueprint غير صالح" });
    }
  }
  const projectDeadline = deadline || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [project] = await query(
    "INSERT INTO projects (student_id, title, abstract, deadline, proposal_pdf_url, preferred_supervisor_id, tech_stack, academic_term, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_review') RETURNING *",
    [req.user.id, title, abstract, projectDeadline, req.file ? `/uploads/${req.file.filename}` : null, preferredSupervisorId, techStack, academicTerm]
  );
  if (blueprintPayload) {
    await query(
      `INSERT INTO project_blueprints (project_id, student_id, blueprint, source)
       VALUES ($1, $2, $3, 'proposal')
       ON CONFLICT (project_id) DO UPDATE SET blueprint = EXCLUDED.blueprint`,
      [project.id, req.user.id, JSON.stringify(blueprintPayload)]
    );
  }
  await query("INSERT INTO milestones (project_id, title, due_date) VALUES ($1, 'Proposal', $2)", [project.id, projectDeadline]);

  const recipients = await query(
    `
      SELECT $1::int AS id WHERE $1::int IS NOT NULL
    `,
    [preferredSupervisorId]
  );
  await Promise.all(recipients.map((recipient) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'project_request', $2)",
    [recipient.id, `طلب مشروع جديد بانتظار مراجعتك: ${title}`]
  )));

  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'project_request', $2)", [req.user.id, "تم إرسال طلب المشروع إلى المشرف بانتظار المراجعة"]);
  res.status(201).json(project);
});

projectsRouter.get("/:id/blueprint", allowRoles("student", "supervisor", "admin"), async (req, res) => {
  const [project] = await query(`
    SELECT p.*, st.supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.id]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed = req.user.role === "admin"
    || project.student_id === req.user.id
    || project.supervisor_id === req.user.id
    || project.preferred_supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية عرض هذا التصميم" });
  const [blueprint] = await query("SELECT * FROM project_blueprints WHERE project_id = $1", [project.id]);
  res.json(blueprint || null);
});

projectsRouter.patch("/:id/blueprint/review", allowRoles("supervisor", "admin"), async (req, res) => {
  const [project] = await query(`
    SELECT p.*, st.supervisor_id
    FROM projects p
    LEFT JOIN students st ON st.user_id = p.student_id
    WHERE p.id = $1
  `, [req.params.id]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  const allowed = req.user.role === "admin" || project.supervisor_id === req.user.id || project.preferred_supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ message: "لا تملك صلاحية تقييم هذا التصميم" });
  const scoreOrNull = (value) => {
    const score = Number(value || 0);
    return Number.isInteger(score) && score >= 1 && score <= 5 ? score : null;
  };
  const [blueprint] = await query(`
    UPDATE project_blueprints
    SET tables_score = $1,
        relationships_score = $2,
        diagrams_score = $3,
        feasibility_score = $4,
        supervisor_notes = $5,
        reviewed_by = $6,
        reviewed_at = now()
    WHERE project_id = $7
    RETURNING *
  `, [
    scoreOrNull(req.body.tablesScore),
    scoreOrNull(req.body.relationshipsScore),
    scoreOrNull(req.body.diagramsScore),
    scoreOrNull(req.body.feasibilityScore),
    String(req.body.notes || "").trim(),
    req.user.id,
    project.id
  ]);
  if (!blueprint) return res.status(404).json({ message: "لا يوجد Blueprint محفوظ لهذا المشروع" });
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'blueprint_review', $2)", [project.student_id, "تم تقييم التصميم الأولي لمشروعك من قبل المشرف"]);
  res.json(blueprint);
});

projectsRouter.patch("/:id/review", allowRoles("supervisor"), async (req, res) => {
  const { decision, feedback } = req.body;
  const statusMap = { approve: "approved", revision: "revision_requested", reject: "rejected" };
  const [current] = await query(
    `SELECT p.*
     FROM projects p
     LEFT JOIN students st ON st.user_id = p.student_id
     WHERE p.id = $1
       AND (p.preferred_supervisor_id = $2 OR st.supervisor_id = $2)`,
    [req.params.id, req.user.id]
  );
  if (!current) return res.status(404).json({ message: "المشروع غير موجود ضمن طلباتك" });
  const [project] = await query(
    "UPDATE projects SET status = $1, supervisor_feedback = COALESCE($2, supervisor_feedback) WHERE id = $3 RETURNING *",
    [statusMap[decision] || "pending_review", feedback || null, req.params.id]
  );
  if (decision === "approve") {
    const supervisorId = project.preferred_supervisor_id || req.user.id;
    await query("UPDATE students SET supervisor_id = $1 WHERE user_id = $2", [supervisorId, project.student_id]);
    await query(
      "UPDATE supervisors SET current_load = (SELECT COUNT(*) FROM students WHERE supervisor_id = $1) WHERE user_id = $1",
      [supervisorId]
    );
  }
  if (feedback) {
    await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'review', $2)", [project.student_id, feedback]);
  }
  res.json(project);
});

projectsRouter.post("/:id/meeting-request", allowRoles("student"), async (req, res) => {
  const desiredAt = String(req.body.desiredAt || "").trim();
  const notes = String(req.body.notes || "").trim();
  if (!desiredAt) return res.status(400).json({ message: "حدد موعداً مقترحاً للاجتماع" });
  if (!isValidDateTimeInput(desiredAt)) return res.status(400).json({ message: dateTimeError("موعد الاجتماع") });

  const [project] = await query(
    `SELECT p.id, p.title, p.student_id, COALESCE(st.supervisor_id, p.preferred_supervisor_id) AS supervisor_id
     FROM projects p
     JOIN students st ON st.user_id = p.student_id
     WHERE p.id = $1 AND p.student_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  if (!project.supervisor_id) return res.status(400).json({ message: "لا يوجد مشرف مرتبط بالمشروع بعد" });

  const [meeting] = await query(
    "INSERT INTO meetings (supervisor_id, student_id, scheduled_at, notes, status) VALUES ($1, $2, $3, $4, 'requested') RETURNING *",
    [project.supervisor_id, req.user.id, desiredAt, notes || `طلب اجتماع بخصوص المشروع: ${project.title}`]
  );
  await query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'meeting_request', $2)",
    [project.supervisor_id, `طلب اجتماع جديد من ${req.user.fullName} بخصوص: ${project.title}`]
  );
  await query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'meeting_request', $2)",
    [req.user.id, "تم إرسال طلب الاجتماع إلى المشرف"]
  );
  res.status(201).json(meeting);
});

projectsRouter.post("/:id/milestones", allowRoles("supervisor"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  const dueDate = String(req.body.dueDate || "").trim();
  if (!title) return res.status(400).json({ message: "اسم المرحلة مطلوب" });
  if (dueDate && !isValidDateInput(dueDate)) return res.status(400).json({ message: dateError("تاريخ المرحلة") });

  const [project] = await query(
    `SELECT p.id, p.student_id
     FROM projects p
     JOIN students st ON st.user_id = p.student_id
     WHERE p.id = $1 AND st.supervisor_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!project) return res.status(404).json({ message: "المشروع غير موجود ضمن طلابك" });

  const [milestone] = await query(
    "INSERT INTO milestones (project_id, title, due_date, status) VALUES ($1, $2, $3, 'todo') RETURNING *",
    [project.id, title, dueDate || null]
  );
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'milestone', $2)", [project.student_id, `تمت إضافة مرحلة جديدة: ${title}`]);
  res.status(201).json(milestone);
});

projectsRouter.patch("/milestones/:id", allowRoles("supervisor"), async (req, res) => {
  const title = req.body.title === undefined ? null : String(req.body.title || "").trim();
  const hasDueDate = req.body.dueDate !== undefined;
  const dueDate = hasDueDate ? String(req.body.dueDate || "").trim() : null;
  const status = req.body.status === undefined ? null : String(req.body.status || "").trim();
  if (status && !["todo", "done"].includes(status)) return res.status(400).json({ message: "حالة المرحلة غير صحيحة" });
  if (dueDate && !isValidDateInput(dueDate)) return res.status(400).json({ message: dateError("تاريخ المرحلة") });

  const [current] = await query(
    `SELECT ms.*, p.student_id
     FROM milestones ms
     JOIN projects p ON p.id = ms.project_id
     JOIN students st ON st.user_id = p.student_id
     WHERE ms.id = $1 AND st.supervisor_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!current) return res.status(404).json({ message: "المرحلة غير موجودة ضمن طلابك" });

  const [milestone] = await query(
    `UPDATE milestones
     SET title = COALESCE($1, title),
         due_date = CASE WHEN $2 THEN NULLIF($3, '')::date ELSE due_date END,
         status = COALESCE($4, status),
         completed_at = CASE
           WHEN COALESCE($4, status) = 'done' THEN COALESCE(completed_at, now())
           ELSE NULL
         END
     WHERE id = $5
     RETURNING *`,
    [title || null, hasDueDate, dueDate, status || null, req.params.id]
  );
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'milestone', $2)", [current.student_id, `تم تحديث المخطط الزمني: ${milestone.title}`]);
  res.json(milestone);
});

projectsRouter.post("/:id/submissions", allowRoles("student"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "اختر ملفاً لرفعه" });
  await verifyUploadedFile(req.file.path);
  const [project] = await query(
    "SELECT id FROM projects WHERE id = $1 AND student_id = $2",
    [req.params.id, req.user.id]
  );
  if (!project) return res.status(404).json({ message: "المشروع غير موجود ضمن مشاريعك" });
  const [submission] = await query(
    "INSERT INTO submissions (project_id, file_url, chapter_name, score) VALUES ($1, $2, $3, $4) RETURNING *",
    [project.id, `/uploads/${req.file.filename}`, req.body.chapterName, req.body.score || null]
  );
  res.status(201).json(submission);
});
