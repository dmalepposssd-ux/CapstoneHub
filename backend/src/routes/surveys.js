import express from "express";
import { query } from "../db.js";
import { allowRoles, requireApproved, requireAuth } from "../middleware.js";

export const surveysRouter = express.Router();
surveysRouter.use(requireAuth, requireApproved);

const questionTypes = new Set(["text", "textarea", "select", "radio", "checkbox"]);

function cleanQuestions(rawQuestions = []) {
  if (!Array.isArray(rawQuestions)) return [];
  return rawQuestions.map((question, index) => {
    const type = questionTypes.has(question.type) ? question.type : "text";
    const label = String(question.label || "").trim();
    const options = Array.isArray(question.options)
      ? question.options.map((item) => String(item || "").trim()).filter(Boolean)
      : String(question.options || "").split(",").map((item) => item.trim()).filter(Boolean);
    return {
      id: question.id || `q_${index + 1}`,
      label,
      type,
      required: Boolean(question.required),
      options: ["select", "radio", "checkbox"].includes(type) ? options : []
    };
  }).filter((question) => question.label);
}

function escapeCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

surveysRouter.get("/", async (req, res) => {
  const rows = await query(`
    SELECT sf.*,
      sr.id AS response_id,
      sr.answers,
      sr.submitted_at
    FROM survey_forms sf
    LEFT JOIN survey_responses sr ON sr.survey_id = sf.id AND sr.user_id = $1
    WHERE sf.is_active = true
      AND (sf.audience = 'all' OR sf.audience = $2)
    ORDER BY sf.created_at DESC
  `, [req.user.id, req.user.role]);
  res.json(rows.map((row) => ({ ...row, answered: Boolean(row.response_id) })));
});

surveysRouter.post("/:id/responses", async (req, res) => {
  const [survey] = await query(
    "SELECT * FROM survey_forms WHERE id = $1 AND is_active = true AND (audience = 'all' OR audience = $2)",
    [req.params.id, req.user.role]
  );
  if (!survey) return res.status(404).json({ message: "الاستبيان غير موجود أو غير مخصص لك" });

  const [existingResponse] = await query(
    "SELECT id FROM survey_responses WHERE survey_id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  if (existingResponse) {
    return res.status(409).json({ message: "تمت الإجابة على هذا الاستبيان مسبقاً وهو متاح للعرض فقط" });
  }

  const answers = req.body.answers || {};
  for (const question of survey.questions || []) {
    const value = answers[question.id];
    const empty = Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
    if (question.required && empty) {
      return res.status(400).json({ message: `السؤال مطلوب: ${question.label}` });
    }
  }

  const [response] = await query(`
    INSERT INTO survey_responses (survey_id, user_id, answers)
    VALUES ($1, $2, $3)
    ON CONFLICT (survey_id, user_id) DO NOTHING
    RETURNING *
  `, [req.params.id, req.user.id, answers]);
  if (!response) {
    return res.status(409).json({ message: "تمت الإجابة على هذا الاستبيان مسبقاً وهو متاح للعرض فقط" });
  }
  res.status(201).json(response);
});

surveysRouter.get("/admin", allowRoles("admin"), async (_, res) => {
  res.json(await query(`
    SELECT sf.*,
      creator.full_name AS creator_name,
      COUNT(sr.id)::int AS response_count
    FROM survey_forms sf
    LEFT JOIN users creator ON creator.id = sf.created_by
    LEFT JOIN survey_responses sr ON sr.survey_id = sf.id
    GROUP BY sf.id, creator.full_name
    ORDER BY sf.created_at DESC
  `));
});

surveysRouter.post("/admin", allowRoles("admin"), async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const audience = ["student", "supervisor", "all"].includes(req.body.audience) ? req.body.audience : "all";
  const questions = cleanQuestions(req.body.questions);
  if (!title) return res.status(400).json({ message: "عنوان الاستبيان مطلوب" });
  if (!questions.length) return res.status(400).json({ message: "أضف سؤالاً واحداً على الأقل" });

  const [survey] = await query(`
    INSERT INTO survey_forms (title, description, audience, questions, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [title, description, audience, JSON.stringify(questions), req.user.id]);

  const users = await query(
    "SELECT id FROM users WHERE profile_status = 'approved' AND ($1 = 'all' OR role = $1)",
    [audience]
  );
  await Promise.all(users.map((user) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'survey', $2)",
    [user.id, `يوجد استبيان جديد مطلوب تعبئته: ${title}`]
  )));

  res.status(201).json(survey);
});

surveysRouter.patch("/admin/:id", allowRoles("admin"), async (req, res) => {
  const [survey] = await query(
    "UPDATE survey_forms SET is_active = COALESCE($1, is_active) WHERE id = $2 RETURNING *",
    [typeof req.body.isActive === "boolean" ? req.body.isActive : null, req.params.id]
  );
  if (!survey) return res.status(404).json({ message: "الاستبيان غير موجود" });
  res.json(survey);
});

surveysRouter.get("/admin/:id/responses.xls", allowRoles("admin"), async (req, res) => {
  const [survey] = await query("SELECT * FROM survey_forms WHERE id = $1", [req.params.id]);
  if (!survey) return res.status(404).json({ message: "الاستبيان غير موجود" });
  const responses = await query(`
    SELECT sr.*, u.full_name, u.email, u.role, u.department
    FROM survey_responses sr
    JOIN users u ON u.id = sr.user_id
    WHERE sr.survey_id = $1
    ORDER BY sr.submitted_at DESC
  `, [req.params.id]);
  const questions = survey.questions || [];
  const header = ["الاسم", "البريد", "الدور", "القسم", "تاريخ الإرسال", ...questions.map((question) => question.label)];
  const rows = responses.map((response) => [
    response.full_name,
    response.email,
    response.role,
    response.department,
    response.submitted_at?.toISOString?.() || response.submitted_at,
    ...questions.map((question) => {
      const value = response.answers?.[question.id];
      return Array.isArray(value) ? value.join(", ") : value;
    })
  ]);
  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${header.map((cell) => `<th>${escapeCell(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="survey-${survey.id}-responses.xls"`);
  res.send(html);
});
