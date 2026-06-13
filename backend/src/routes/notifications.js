import express from "express";
import { query } from "../db.js";
import { requireApproved, requireAuth } from "../middleware.js";

export const notificationsRouter = express.Router();
notificationsRouter.use(requireAuth);
notificationsRouter.use(requireApproved);

async function insertOnce(userId, type, message) {
  await query(
    `INSERT INTO notifications (user_id, type, message)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND message = $3
     )`,
    [userId, type, message]
  );
}

function dateLabel(value) {
  return String(value).slice(0, 10);
}

async function syncStudentNotifications(user) {
  const overdue = await query(
    `SELECT ms.title, ms.due_date
     FROM milestones ms
     JOIN projects p ON p.id = ms.project_id
     WHERE p.student_id = $1
       AND ms.due_date IS NOT NULL
       AND ms.due_date < CURRENT_DATE
       AND ms.status <> 'done'
       AND ms.completed_at IS NULL`,
    [user.id]
  );
  for (const item of overdue) {
    await insertOnce(user.id, "overdue", `تأخرت عن موعد: ${item.title} (${dateLabel(item.due_date)})`);
  }

  const needsUpdate = await query(
    "SELECT title FROM projects WHERE student_id = $1 AND status = 'revision_requested'",
    [user.id]
  );
  for (const project of needsUpdate) {
    await insertOnce(user.id, "update_required", `مشروعك يحتاج تحديث: ${project.title}`);
  }
}

async function syncSupervisorNotifications(user) {
  const overdue = await query(
    `SELECT ms.title, ms.due_date, student.full_name AS student_name
     FROM milestones ms
     JOIN projects p ON p.id = ms.project_id
     JOIN students st ON st.user_id = p.student_id
     JOIN users student ON student.id = st.user_id
     WHERE st.supervisor_id = $1
       AND ms.due_date IS NOT NULL
       AND ms.due_date < CURRENT_DATE
       AND ms.status <> 'done'
       AND ms.completed_at IS NULL`,
    [user.id]
  );
  for (const item of overdue) {
    await insertOnce(user.id, "overdue", `مرحلة متأخرة عند ${item.student_name}: ${item.title} (${dateLabel(item.due_date)})`);
  }

  const pending = await query(
    `SELECT p.title, student.full_name AS student_name
     FROM projects p
     JOIN students st ON st.user_id = p.student_id
     JOIN users student ON student.id = st.user_id
     WHERE p.status = 'pending_review'
       AND (st.supervisor_id = $1 OR p.preferred_supervisor_id = $1)`,
    [user.id]
  );
  for (const project of pending) {
    await insertOnce(user.id, "review_required", `يوجد مقترح بانتظار مراجعتك من ${project.student_name}: ${project.title}`);
  }
}

async function syncAdminNotifications(user) {
  const technicalReports = await query(
    `SELECT tr.id, student.full_name AS student_name
     FROM technical_reports tr
     JOIN users student ON student.id = tr.student_id
     WHERE tr.status = 'new'`
  );
  for (const report of technicalReports) {
    await insertOnce(user.id, "technical_report", `مشكلة تقنية جديدة من ${report.student_name} رقم ${report.id}`);
  }
}

async function syncNotifications(user) {
  if (user.role === "student") await syncStudentNotifications(user);
  if (user.role === "supervisor") await syncSupervisorNotifications(user);
  if (user.role === "admin") await syncAdminNotifications(user);
}

notificationsRouter.get("/", async (req, res) => {
  await syncNotifications(req.user);
  const rows = await query(
    "SELECT * FROM notifications WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 30",
    [req.user.id]
  );
  res.json(rows);
});

notificationsRouter.get("/unread-count", async (req, res) => {
  await syncNotifications(req.user);
  const [row] = await query("SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL", [req.user.id]);
  res.json(row);
});

notificationsRouter.patch("/read", async (req, res) => {
  await query("UPDATE notifications SET is_read = true WHERE user_id = $1 AND deleted_at IS NULL", [req.user.id]);
  res.status(204).send();
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const [notification] = await query(
    "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *",
    [req.params.id, req.user.id]
  );
  if (!notification) return res.status(404).json({ message: "التنبيه غير موجود" });
  res.json(notification);
});
