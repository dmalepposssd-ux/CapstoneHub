import bcrypt from "bcryptjs";
import express from "express";
import { dateError, dateTimeError, isValidDateInput, isValidDateTimeInput } from "../dateValidation.js";
import { query } from "../db.js";
import { allowRoles, requireAuth } from "../middleware.js";

export const adminRouter = express.Router();
adminRouter.use(requireAuth, allowRoles("admin"));

adminRouter.get("/users", async (_, res) => {
  res.json(await query("SELECT id, email, role, full_name, department, phone, profile_status, profile_confirmation, profile_submitted_at, created_at FROM users ORDER BY created_at DESC"));
});

adminRouter.get("/supervisors", async (_, res) => {
  res.json(await query(`
    SELECT u.id, u.full_name, u.department, u.avatar_url, s.specialization, s.languages, s.tools, s.expertise_keywords, s.bio, s.current_load, s.max_students_capacity
    FROM supervisors s JOIN users u ON u.id = s.user_id
    ORDER BY u.full_name
  `));
});

function validateTermPayload(body) {
  const code = String(body.code || "").trim();
  const label = String(body.label || "").trim();
  const startsAt = String(body.startsAt || "").trim();
  const endsAt = String(body.endsAt || "").trim();
  const registrationStartsAt = String(body.registrationStartsAt || "").trim();
  const registrationEndsAt = String(body.registrationEndsAt || "").trim();

  if (!code || !label) return { error: "رمز الفصل واسمه مطلوبان" };
  for (const [field, value] of [
    ["بداية الفصل", startsAt],
    ["نهاية الفصل", endsAt],
    ["بداية تسجيل المشاريع", registrationStartsAt],
    ["نهاية تسجيل المشاريع", registrationEndsAt]
  ]) {
    if (!isValidDateInput(value)) return { error: dateError(field) };
  }
  if (startsAt > endsAt) return { error: "بداية الفصل يجب أن تكون قبل نهايته" };
  if (registrationStartsAt > registrationEndsAt) return { error: "بداية تسجيل المشاريع يجب أن تكون قبل نهايتها" };
  if (registrationStartsAt < startsAt || registrationEndsAt > endsAt) {
    return { error: "فترة تسجيل المشاريع يجب أن تكون ضمن تاريخ بداية ونهاية الفصل" };
  }
  return { code, label, startsAt, endsAt, registrationStartsAt, registrationEndsAt, isActive: Boolean(body.isActive) };
}

adminRouter.get("/terms", async (_, res) => {
  res.json(await query(`
    SELECT *,
      (CURRENT_DATE BETWEEN starts_at AND ends_at) AS date_is_inside_term,
      (CURRENT_DATE BETWEEN registration_starts_at AND registration_ends_at) AS registration_is_open
    FROM academic_terms
    ORDER BY starts_at DESC, id DESC
  `));
});

adminRouter.post("/terms", async (req, res) => {
  const payload = validateTermPayload(req.body);
  if (payload.error) return res.status(400).json({ message: payload.error });
  if (payload.isActive) await query("UPDATE academic_terms SET is_active = false");
  const [term] = await query(
    `INSERT INTO academic_terms (code, label, starts_at, ends_at, registration_starts_at, registration_ends_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [payload.code, payload.label, payload.startsAt, payload.endsAt, payload.registrationStartsAt, payload.registrationEndsAt, payload.isActive]
  );
  res.status(201).json(term);
});

adminRouter.put("/terms/:id", async (req, res) => {
  const payload = validateTermPayload(req.body);
  if (payload.error) return res.status(400).json({ message: payload.error });
  if (payload.isActive) await query("UPDATE academic_terms SET is_active = false WHERE id <> $1", [req.params.id]);
  const [term] = await query(
    `UPDATE academic_terms
     SET code = $1,
         label = $2,
         starts_at = $3,
         ends_at = $4,
         registration_starts_at = $5,
         registration_ends_at = $6,
         is_active = $7
     WHERE id = $8
     RETURNING *`,
    [payload.code, payload.label, payload.startsAt, payload.endsAt, payload.registrationStartsAt, payload.registrationEndsAt, payload.isActive, req.params.id]
  );
  if (!term) return res.status(404).json({ message: "الفصل غير موجود" });
  res.json(term);
});

adminRouter.get("/terms/:id/capacities", async (req, res) => {
  const [term] = await query("SELECT * FROM academic_terms WHERE id = $1", [req.params.id]);
  if (!term) return res.status(404).json({ message: "الفصل غير موجود" });
  res.json(await query(`
    SELECT
      u.id AS supervisor_id,
      u.full_name,
      u.department,
      s.max_students_capacity AS default_capacity,
      COALESCE(stc.max_students, s.max_students_capacity, 0)::int AS max_students,
      (
        SELECT COUNT(DISTINCT p.student_id)::int
        FROM projects p
        LEFT JOIN students st ON st.user_id = p.student_id
        WHERE p.academic_term = $2
          AND p.status <> 'rejected'
          AND (p.preferred_supervisor_id = s.user_id OR st.supervisor_id = s.user_id)
      ) AS current_load
    FROM supervisors s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN supervisor_term_capacities stc ON stc.supervisor_id = s.user_id AND stc.term_id = $1
    ORDER BY u.full_name
  `, [term.id, term.code]));
});

adminRouter.put("/terms/:id/capacities/:supervisorId", async (req, res) => {
  const maxStudents = Number(req.body.maxStudents);
  if (!Number.isInteger(maxStudents) || maxStudents < 0 || maxStudents > 100) {
    return res.status(400).json({ message: "عدد الطلاب يجب أن يكون رقماً صحيحاً بين 0 و100" });
  }
  const [term] = await query("SELECT id FROM academic_terms WHERE id = $1", [req.params.id]);
  if (!term) return res.status(404).json({ message: "الفصل غير موجود" });
  const [supervisor] = await query("SELECT user_id FROM supervisors WHERE user_id = $1", [req.params.supervisorId]);
  if (!supervisor) return res.status(404).json({ message: "المشرف غير موجود" });
  const [capacity] = await query(`
    INSERT INTO supervisor_term_capacities (term_id, supervisor_id, max_students)
    VALUES ($1, $2, $3)
    ON CONFLICT (term_id, supervisor_id)
    DO UPDATE SET max_students = EXCLUDED.max_students, updated_at = now()
    RETURNING *
  `, [term.id, supervisor.user_id, maxStudents]);
  res.json(capacity);
});

adminRouter.get("/lab-helpers", async (_, res) => {
  res.json(await query("SELECT * FROM lab_helpers ORDER BY department, full_name"));
});

adminRouter.post("/lab-helpers", async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const department = String(req.body.department || "").trim();
  const contact = String(req.body.contact || "").trim();
  const bio = String(req.body.bio || "").trim();
  const languages = String(req.body.languages || "")
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
  const frameworks = String(req.body.frameworks || "")
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!fullName || !department) return res.status(400).json({ message: "اسم المدرس والقسم مطلوبان" });

  const [helper] = await query(
    `INSERT INTO lab_helpers (full_name, department, contact, languages, frameworks, bio)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [fullName, department, contact || null, languages, frameworks, bio]
  );
  res.status(201).json(helper);
});

adminRouter.delete("/lab-helpers/:id", async (req, res) => {
  await query("DELETE FROM lab_helpers WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

adminRouter.get("/students", async (_, res) => {
  res.json(await query(`
    SELECT u.id, u.full_name, st.student_id, st.supervisor_id, supervisor.full_name AS supervisor_name
    FROM students st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN users supervisor ON supervisor.id = st.supervisor_id
    ORDER BY st.student_id
  `));
});

adminRouter.post("/users", async (req, res) => {
  const { email, password, role, fullName, department } = req.body;
  if (!["student", "supervisor", "admin"].includes(role)) {
    return res.status(400).json({ message: "هذا النوع ليس حساب دخول. أضف مدرّس المخبر من الخيار المخصص له." });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ message: "كلمة المرور الابتدائية مطلوبة ويجب ألا تقل عن 8 أحرف" });
  }
  const hash = await bcrypt.hash(password, 10);
  const [user] = await query(
    "INSERT INTO users (email, password_hash, role, full_name, department, profile_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, full_name, department, profile_status",
    [email, hash, role, fullName, department, role === "admin" ? "approved" : "pending"]
  );
  if (role === "student") {
    await query(
      "INSERT INTO students (user_id, student_id, department, interests_text) VALUES ($1, $2, $3, '')",
      [user.id, `S${String(user.id).padStart(6, "0")}`, department]
    );
  }
  if (role === "supervisor") {
    await query("INSERT INTO supervisors (user_id, expertise_keywords, bio) VALUES ($1, '{}', '')", [user.id]);
  }
  res.status(201).json(user);
});

adminRouter.patch("/users/:id/approve-profile", async (req, res) => {
  const [user] = await query(
    `UPDATE users
     SET profile_status = 'approved', profile_approved_at = now()
     WHERE id = $1
     RETURNING id, email, role, full_name, department, phone, profile_status`,
    [req.params.id]
  );
  if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'profile_approved', $2)", [user.id, "تمت الموافقة على ملفك ويمكنك استخدام النظام"]);
  res.json(user);
});

adminRouter.patch("/users/approve-profiles", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ message: "اختر مستخدمين للموافقة" });
  const approved = await query(
    `UPDATE users
     SET profile_status = 'approved', profile_approved_at = now()
     WHERE id = ANY($1::int[]) AND profile_status = 'pending_approval'
     RETURNING id, email, role, full_name, department, phone, profile_status`,
    [ids]
  );
  await Promise.all(approved.map((user) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'profile_approved', $2)",
    [user.id, "تمت الموافقة على ملفك ويمكنك استخدام النظام"]
  )));
  res.json({ approved });
});

adminRouter.put("/users/:id", async (req, res) => {
  const { fullName, department, phone } = req.body;
  const [user] = await query(
    "UPDATE users SET full_name = COALESCE($1, full_name), department = COALESCE($2, department), phone = COALESCE($3, phone) WHERE id = $4 RETURNING id, email, role, full_name, department, phone, profile_status, profile_confirmation, profile_submitted_at, created_at",
    [fullName, department, phone, req.params.id]
  );
  if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
  res.json(user);
});

adminRouter.patch("/users/:id/password", async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 8) return res.status(400).json({ message: "كلمة السر يجب أن تكون 8 أحرف على الأقل" });

  const hash = await bcrypt.hash(password, 10);
  const [user] = await query(
    "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email, role, full_name",
    [hash, req.params.id]
  );
  if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
  res.json({ id: user.id, email: user.email, fullName: user.full_name });
});

adminRouter.delete("/users/:id", async (req, res) => {
  await query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

adminRouter.get("/notifications", async (_, res) => {
  res.json(await query(`
    SELECT n.id, n.user_id, n.type, n.message, n.is_read, n.created_at,
           u.full_name AS recipient_name, u.email AS recipient_email, u.role AS recipient_role, u.department AS recipient_department
    FROM notifications n
    JOIN users u ON u.id = n.user_id
    WHERE n.deleted_at IS NULL
    ORDER BY n.created_at DESC
    LIMIT 200
  `));
});

adminRouter.delete("/notifications/:id", async (req, res) => {
  const [notification] = await query(
    `UPDATE notifications
     SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [req.params.id]
  );
  if (!notification) return res.status(404).json({ message: "الإشعار غير موجود أو محذوف مسبقاً" });
  res.status(204).send();
});

adminRouter.post("/deadlines", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const dueDate = String(req.body.dueDate || "").trim();
  const department = String(req.body.department || "").trim();
  const notificationType = String(req.body.notificationType || "academic");
  const recipientIds = Array.isArray(req.body.recipientIds) ? req.body.recipientIds.map(Number).filter(Boolean) : [];
  if (!title || !dueDate) return res.status(400).json({ message: "عنوان الموعد والتاريخ مطلوبان" });
  if (!isValidDateInput(dueDate)) return res.status(400).json({ message: dateError("تاريخ الموعد") });

  const [deadline] = await query(
    "INSERT INTO academic_deadlines (title, due_date, department) VALUES ($1, $2, $3) RETURNING *",
    [title, dueDate, department || null]
  );

  const recipients = recipientIds.length
    ? await query("SELECT id FROM users WHERE role = 'student' AND id = ANY($1::int[])", [recipientIds])
    : await query(
      `SELECT u.id
       FROM users u
       JOIN students st ON st.user_id = u.id
       WHERE u.role = 'student'
         AND ($1::text IS NULL OR st.department = $1)`,
      [department || null]
    );
  const typeLabels = {
    academic: "موعد أكاديمي",
    supervisor_review: "مراجعة المشرف",
    secretariat_review: "مراجعة السكرتاريا",
    defense: "موعد مناقشة"
  };
  const message = `${typeLabels[notificationType] || "تنبيه"}: ${title} بتاريخ ${dueDate}`;
  await Promise.all(recipients.map((recipient) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'deadline', $2)",
    [recipient.id, message]
  )));

  res.status(201).json({ ...deadline, notifiedCount: recipients.length });
});

adminRouter.get("/deadlines", async (_, res) => {
  res.json(await query("SELECT * FROM academic_deadlines ORDER BY due_date"));
});

adminRouter.put("/deadlines/:id", async (req, res) => {
  if (req.body.dueDate && !isValidDateInput(String(req.body.dueDate).trim())) {
    return res.status(400).json({ message: dateError("تاريخ الموعد") });
  }
  const [deadline] = await query(
    "UPDATE academic_deadlines SET title = COALESCE($1, title), due_date = COALESCE($2, due_date), department = $3 WHERE id = $4 RETURNING *",
    [req.body.title, req.body.dueDate, req.body.department || null, req.params.id]
  );
  res.json(deadline);
});

adminRouter.delete("/deadlines/:id", async (req, res) => {
  await query("DELETE FROM academic_deadlines WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

adminRouter.get("/meetings", async (_, res) => {
  res.json(await query(`
    SELECT m.*, supervisor.full_name AS supervisor_name, student.full_name AS student_name
    FROM meetings m
    JOIN users supervisor ON supervisor.id = m.supervisor_id
    JOIN users student ON student.id = m.student_id
    ORDER BY m.scheduled_at DESC
  `));
});

adminRouter.get("/projects", async (_, res) => {
  res.json(await query(`
    SELECT p.*, student.full_name AS student_name, student.department, supervisor.full_name AS supervisor_name,
      preferred.full_name AS preferred_supervisor_name,
      defense.due_date AS defense_date
    FROM projects p
    JOIN users student ON student.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    LEFT JOIN users supervisor ON supervisor.id = st.supervisor_id
    LEFT JOIN users preferred ON preferred.id = p.preferred_supervisor_id
    LEFT JOIN milestones defense ON defense.project_id = p.id AND defense.title = 'Defense'
    ORDER BY p.created_at DESC
  `));
});

adminRouter.patch("/projects/:id/evaluator", async (req, res) => {
  const supervisorId = Number(req.body.supervisorId);
  if (!supervisorId) return res.status(400).json({ message: "اختر مشرفاً للتقييم" });
  const [supervisor] = await query("SELECT user_id FROM supervisors WHERE user_id = $1", [supervisorId]);
  if (!supervisor) return res.status(400).json({ message: "المشرف المحدد غير موجود" });

  const [project] = await query(
    `UPDATE projects
     SET preferred_supervisor_id = $1,
         status = CASE WHEN status = 'rejected' THEN 'pending_review' ELSE status END
     WHERE id = $2
     RETURNING *`,
    [supervisorId, req.params.id]
  );
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });

  await query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'project_request', $2), ($3, 'project_request', $4)",
    [
      supervisorId,
      `تم تعيينك لتقييم مشروع: ${project.title}`,
      project.student_id,
      "تم تعيين مشرف لتقييم مشروعك"
    ]
  );
  res.json(project);
});

adminRouter.post("/meetings", async (req, res) => {
  if (!isValidDateTimeInput(req.body.scheduledAt)) {
    return res.status(400).json({ message: dateTimeError("موعد الاجتماع") });
  }
  const [meeting] = await query(
    "INSERT INTO meetings (supervisor_id, student_id, scheduled_at, notes) VALUES ($1, $2, $3, $4) RETURNING *",
    [req.body.supervisorId, req.body.studentId, req.body.scheduledAt, req.body.notes || ""]
  );
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'meeting', $2), ($3, 'meeting', $2)", [req.body.supervisorId, "تم جدولة اجتماع جديد", req.body.studentId]);
  res.status(201).json(meeting);
});

adminRouter.patch("/projects/:id/defense-date", async (req, res) => {
  const dueDate = String(req.body.dueDate || "").trim();
  if (!dueDate) return res.status(400).json({ message: "تاريخ المناقشة مطلوب" });
  if (!isValidDateInput(dueDate)) return res.status(400).json({ message: dateError("تاريخ المناقشة") });

  const [project] = await query("SELECT id, student_id, title FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });

  const [existing] = await query("SELECT id FROM milestones WHERE project_id = $1 AND title = 'Defense' ORDER BY id LIMIT 1", [project.id]);
  const [milestone] = existing
    ? await query("UPDATE milestones SET due_date = $1 WHERE id = $2 RETURNING *", [dueDate, existing.id])
    : await query("INSERT INTO milestones (project_id, title, due_date, status) VALUES ($1, 'Defense', $2, 'todo') RETURNING *", [project.id, dueDate]);
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'defense', $2)", [project.student_id, `تم تحديد موعد مناقشة المشروع: ${dueDate}`]);
  res.json(milestone);
});

adminRouter.patch("/projects/:id/archive", async (req, res) => {
  const [project] = await query(
    `UPDATE projects
     SET is_archived = true,
         archived_at = now(),
         archive_approved_by = $1
     WHERE id = $2
     RETURNING *`,
    [req.user.id, req.params.id]
  );
  if (!project) return res.status(404).json({ message: "المشروع غير موجود" });
  await query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'archive_review', $2)",
    [project.student_id, "تم حفظ مشروعك كمرجع مستقبلي ضمن النظام"]
  );
  res.json(project);
});

adminRouter.post("/matchings/override", async (req, res) => {
  const { studentId, supervisorId } = req.body;
  await query("UPDATE students SET supervisor_id = $1 WHERE user_id = $2", [supervisorId, studentId]);
  await query("UPDATE supervisors SET current_load = (SELECT COUNT(*) FROM students WHERE supervisor_id = $1) WHERE user_id = $1", [supervisorId]);
  const [matching] = await query(
    "INSERT INTO ai_matchings (student_id, supervisor_id, similarity_score, status) VALUES ($1, $2, 100, 'admin_override') RETURNING *",
    [studentId, supervisorId]
  );
  res.status(201).json(matching);
});

adminRouter.get("/technical-reports", async (_, res) => {
  res.json(await query(`
    SELECT tr.*, u.full_name AS student_name, u.email AS student_email, u.department
    FROM technical_reports tr
    JOIN users u ON u.id = tr.student_id
    ORDER BY tr.created_at DESC
  `));
});

adminRouter.patch("/technical-reports/:id", async (req, res) => {
  const status = String(req.body.status || "");
  if (!["new", "in_progress", "resolved"].includes(status)) {
    return res.status(400).json({ message: "حالة التقرير غير صحيحة" });
  }

  const [report] = await query(
    `UPDATE technical_reports
     SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE NULL END
     WHERE id = $2
     RETURNING *`,
    [status, req.params.id]
  );
  if (!report) return res.status(404).json({ message: "التقرير غير موجود" });
  await query("INSERT INTO notifications (user_id, type, message) VALUES ($1, 'technical_report', $2)", [report.student_id, `تم تحديث حالة التقرير التقني إلى ${status}`]);
  res.json(report);
});

async function projectReportRows() {
  return query(`
    SELECT p.id, u.full_name AS student, u.department, p.title, p.status, p.deadline
    FROM projects p JOIN users u ON u.id = p.student_id
    ORDER BY p.deadline
  `);
}

adminRouter.get("/reports/projects.csv", async (_, res) => {
  const rows = await projectReportRows();
  const csv = [
    "id,student,department,title,status,deadline",
    ...rows.map((row) => [row.id, row.student, row.department, row.title, row.status, row.deadline].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=capstone-projects.csv");
  res.send(csv);
});

adminRouter.get("/reports/projects.xls", async (_, res) => {
  const rows = await projectReportRows();
  const cells = rows.map((row) => `<tr><td>${row.id}</td><td>${row.student}</td><td>${row.department}</td><td>${row.title}</td><td>${row.status}</td><td>${row.deadline}</td></tr>`).join("");
  const html = `<table><thead><tr><th>id</th><th>student</th><th>department</th><th>title</th><th>status</th><th>deadline</th></tr></thead><tbody>${cells}</tbody></table>`;
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=capstone-projects.xls");
  res.send(html);
});

adminRouter.get("/reports/projects.pdf", async (_, res) => {
  const rows = await projectReportRows();
  const escapePdfText = (value) => String(value ?? "").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?");
  const lines = ["CapstoneHub Projects Report", ...rows.map((row) => `${row.id}. ${row.student} - ${row.title} - ${row.status}`)].slice(0, 38);
  const content = `BT /F1 11 Tf 40 790 Td ${lines.map((line, index) => `${index ? "0 -18 Td " : ""}(${escapePdfText(line)}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=capstone-projects.pdf");
  res.send(Buffer.from(pdf));
});
