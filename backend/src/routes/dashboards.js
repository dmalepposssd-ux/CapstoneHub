import express from "express";
import { fallbackAcademicTerm, getActiveAcademicTerm, listSupervisorsWithTermCapacity } from "../academicTerms.js";
import { query } from "../db.js";
import { allowRoles, requireApproved, requireAuth } from "../middleware.js";

export const dashboardsRouter = express.Router();
dashboardsRouter.use(requireAuth, requireApproved);

async function notifyArchiveCandidates() {
  const candidates = await query(`
    UPDATE projects p
    SET archive_review_notified_at = now()
    WHERE p.is_archived = false
      AND p.archive_review_notified_at IS NULL
      AND p.status = 'approved'
      AND EXISTS (
        SELECT 1 FROM milestones ms
        WHERE ms.project_id = p.id
          AND ms.title = 'Defense'
          AND (ms.status = 'done' OR ms.completed_at IS NOT NULL OR ms.due_date <= CURRENT_DATE)
      )
    RETURNING p.id, p.title
  `);
  if (!candidates.length) return;

  const admins = await query("SELECT id FROM users WHERE role = 'admin'");
  await Promise.all(candidates.flatMap((project) => admins.map((admin) => query(
    "INSERT INTO notifications (user_id, type, message) VALUES ($1, 'archive_review', $2)",
    [admin.id, `مشروع منتهي يحتاج مراجعة للحفظ كمرجع مستقبلي: ${project.title}`]
  ))));
}

dashboardsRouter.get("/student", allowRoles("student"), async (req, res) => {
  const [student] = await query("SELECT * FROM students WHERE user_id = $1", [req.user.id]);
  const projects = await query(`
    SELECT p.*, pb.id AS blueprint_id, pb.blueprint, pb.tables_score, pb.relationships_score, pb.diagrams_score, pb.feasibility_score, pb.supervisor_notes, pb.reviewed_at
    FROM projects p
    LEFT JOIN project_blueprints pb ON pb.project_id = p.id
    WHERE p.student_id = $1
    ORDER BY p.created_at DESC
  `, [req.user.id]);
  const [profileStats] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'approved')::int AS completed_projects,
      ROUND(AVG(s.score), 2) AS average_score
    FROM projects p
    LEFT JOIN submissions s ON s.project_id = p.id AND s.score IS NOT NULL
    WHERE p.student_id = $1
  `, [req.user.id]);
  const milestones = projects[0] ? await query("SELECT * FROM milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST, id", [projects[0].id]) : [];
  const activeTerm = await getActiveAcademicTerm();
  const supervisors = await listSupervisorsWithTermCapacity(activeTerm?.code || projects[0]?.academic_term || fallbackAcademicTerm());
  const labHelpers = await query("SELECT * FROM lab_helpers ORDER BY department, full_name");
  const notifications = await query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8", [req.user.id]);
  const messages = await query("SELECT * FROM messages WHERE sender_id = $1 OR recipient_id = $1 ORDER BY created_at DESC LIMIT 8", [req.user.id]);
  const submissions = projects[0] ? await query("SELECT * FROM submissions WHERE project_id = $1 ORDER BY submitted_at DESC", [projects[0].id]) : [];
  const meetings = await query(`
    SELECT m.*, supervisor.full_name AS supervisor_name
    FROM meetings m
    JOIN users supervisor ON supervisor.id = m.supervisor_id
    WHERE m.student_id = $1
    ORDER BY m.scheduled_at DESC
    LIMIT 6
  `, [req.user.id]);
  const deadlines = await query("SELECT * FROM academic_deadlines WHERE department IS NULL OR department = $1 ORDER BY due_date LIMIT 8", [req.user.department]);
  res.json({ student, profileStats, projects, milestones, supervisors, activeTerm, labHelpers, notifications, messages, submissions, meetings, deadlines });
});

dashboardsRouter.get("/supervisor", allowRoles("supervisor"), async (req, res) => {
  const [profile] = await query(`
    SELECT u.id, u.full_name, u.email, u.phone, u.department, u.avatar_url, s.bio, s.specialization, s.languages, s.tools, s.expertise_keywords, s.current_load, s.max_students_capacity
    FROM supervisors s
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = $1
  `, [req.user.id]);
  const assigned = await query(`
    SELECT
      u.id AS user_id,
      u.full_name,
      u.email,
      u.phone,
      u.department,
      st.student_id,
      st.project_status,
      p.id AS project_id,
      p.title,
      p.abstract,
      p.status,
      p.deadline,
      p.tech_stack,
      COALESCE(ms.total_milestones, 0)::int AS total_milestones,
      COALESCE(ms.completed_milestones, 0)::int AS completed_milestones,
      COALESCE(sub.total_submissions, 0)::int AS total_submissions,
      pb.id AS blueprint_id,
      pb.blueprint,
      pb.tables_score,
      pb.relationships_score,
      pb.diagrams_score,
      pb.feasibility_score,
      pb.supervisor_notes,
      pb.reviewed_at
    FROM students st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN projects p ON p.student_id = st.user_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_milestones,
        COUNT(*) FILTER (WHERE status = 'done' OR completed_at IS NOT NULL)::int AS completed_milestones
      FROM milestones
      WHERE project_id = p.id
    ) ms ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total_submissions
      FROM submissions
      WHERE project_id = p.id
    ) sub ON true
    LEFT JOIN project_blueprints pb ON pb.project_id = p.id
    WHERE st.supervisor_id = $1 OR p.preferred_supervisor_id = $1
    ORDER BY
      CASE WHEN p.status = 'pending_review' THEN 0 ELSE 1 END,
      p.deadline NULLS LAST
  `, [req.user.id]);
  const pending = await query(`
    SELECT p.*, u.full_name AS student_name, pb.blueprint, pb.tables_score, pb.relationships_score, pb.diagrams_score, pb.feasibility_score, pb.supervisor_notes, pb.reviewed_at
    FROM projects p
    JOIN users u ON u.id = p.student_id
    LEFT JOIN students st ON st.user_id = p.student_id
    LEFT JOIN project_blueprints pb ON pb.project_id = p.id
    WHERE p.status = 'pending_review'
      AND (p.preferred_supervisor_id = $1 OR st.supervisor_id = $1)
    ORDER BY p.created_at DESC
  `, [req.user.id]);
  const messages = await query("SELECT * FROM messages WHERE sender_id = $1 OR recipient_id = $1 ORDER BY created_at DESC LIMIT 12", [req.user.id]);
  const tracking = await query(`
    SELECT
      p.id AS project_id,
      p.title AS project_title,
      p.status,
      p.deadline,
      student.id AS student_id,
      student.full_name AS student_name,
      st.student_id AS university_id,
      COALESCE(ms.items, '[]'::jsonb) AS milestones,
      COALESCE(sub.items, '[]'::jsonb) AS submissions,
      COALESCE(diagrams.items, '[]'::jsonb) AS diagrams,
      COALESCE(notes.items, '[]'::jsonb) AS notes,
      pb.reviewed_at,
      pb.supervisor_notes,
      pb.tables_score,
      pb.relationships_score,
      pb.diagrams_score,
      pb.feasibility_score
    FROM projects p
    JOIN students st ON st.user_id = p.student_id
    JOIN users student ON student.id = st.user_id
    LEFT JOIN project_blueprints pb ON pb.project_id = p.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'status', m.status,
        'due_date', m.due_date,
        'completed_at', m.completed_at
      ) ORDER BY m.due_date NULLS LAST, m.id) AS items
      FROM milestones m
      WHERE m.project_id = p.id
    ) ms ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'chapter_name', s.chapter_name,
        'file_url', s.file_url,
        'score', s.score,
        'feedback', s.feedback,
        'submitted_at', s.submitted_at
      ) ORDER BY s.submitted_at DESC) AS items
      FROM submissions s
      WHERE s.project_id = p.id
    ) sub ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', msg.id,
        'body', msg.body,
        'created_at', msg.created_at,
        'sender_id', msg.sender_id
      ) ORDER BY msg.created_at DESC) AS items
      FROM messages msg
      WHERE msg.topic = 'مشاركة مخطط مشروع'
        AND ((msg.sender_id = student.id AND msg.recipient_id = $1) OR (msg.sender_id = $1 AND msg.recipient_id = student.id))
    ) diagrams ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', msg.id,
        'topic', msg.topic,
        'body', msg.body,
        'created_at', msg.created_at,
        'sender_id', msg.sender_id
      ) ORDER BY msg.created_at DESC) AS items
      FROM messages msg
      WHERE msg.topic <> 'مشاركة مخطط مشروع'
        AND ((msg.sender_id = student.id AND msg.recipient_id = $1) OR (msg.sender_id = $1 AND msg.recipient_id = student.id))
    ) notes ON true
    WHERE st.supervisor_id = $1 OR p.preferred_supervisor_id = $1
    ORDER BY p.deadline NULLS LAST, p.created_at DESC
  `, [req.user.id]);
  const meetings = await query(`
    SELECT m.*, student.full_name AS student_name
    FROM meetings m JOIN users student ON student.id = m.student_id
    WHERE m.supervisor_id = $1
    ORDER BY m.scheduled_at DESC
    LIMIT 10
  `, [req.user.id]);
  const milestones = await query(`
    SELECT ms.*, p.title AS project_title, student.full_name AS student_name
    FROM milestones ms
    JOIN projects p ON p.id = ms.project_id
    JOIN students st ON st.user_id = p.student_id
    JOIN users student ON student.id = st.user_id
    WHERE st.supervisor_id = $1
    ORDER BY ms.due_date NULLS LAST, ms.id
  `, [req.user.id]);
  res.json({ profile, assigned, pending, messages, meetings, milestones, tracking });
});

dashboardsRouter.get("/admin", allowRoles("admin"), async (_, res) => {
  await notifyArchiveCandidates();
  const totals = await query(`
    SELECT
      COUNT(*) FILTER (WHERE role = 'student')::int AS students,
      COUNT(*) FILTER (WHERE role = 'supervisor')::int AS supervisors,
      COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
    FROM users
  `);
  const byDepartment = await query("SELECT department, COUNT(*)::int AS total FROM students GROUP BY department ORDER BY department");
  const projectsByStatus = await query("SELECT status, COUNT(*)::int AS total FROM projects GROUP BY status");
  const studentsWithoutProjects = await query(`
    SELECT u.id, u.full_name, u.email, u.department, st.student_id
    FROM students st
    JOIN users u ON u.id = st.user_id
    WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.student_id = st.user_id)
    ORDER BY u.full_name
  `);
  const archiveCandidates = await query(`
    SELECT p.*, u.full_name AS student_name, u.department, defense.due_date AS defense_date
    FROM projects p
    JOIN users u ON u.id = p.student_id
    JOIN milestones defense ON defense.project_id = p.id AND defense.title = 'Defense'
    WHERE p.status = 'approved'
      AND p.is_archived = false
      AND (defense.status = 'done' OR defense.completed_at IS NOT NULL OR defense.due_date <= CURRENT_DATE)
    ORDER BY defense.due_date DESC NULLS LAST, p.created_at DESC
  `);
  const activeTerm = await getActiveAcademicTerm();
  const workload = await listSupervisorsWithTermCapacity(activeTerm?.code || fallbackAcademicTerm());
  const deadlines = await query("SELECT * FROM academic_deadlines ORDER BY due_date LIMIT 8");
  const dashboardMetrics = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM projects WHERE status = 'pending_review') AS pending_projects,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'revision_requested') AS revision_projects,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'approved') AS approved_projects,
      (SELECT COUNT(*)::int FROM projects WHERE is_archived = true) AS archived_projects,
      (SELECT COALESCE(ROUND(AVG(CASE WHEN max_students_capacity > 0 THEN current_load::numeric / max_students_capacity * 100 ELSE 0 END), 1), 0) FROM supervisors) AS avg_supervisor_load
  `);
  const topTechnologies = await query(`
    SELECT tech, COUNT(*)::int AS total
    FROM projects p, unnest(p.tech_stack) tech
    GROUP BY tech
    ORDER BY total DESC, tech
    LIMIT 8
  `);
  const pendingProfiles = await query(`
    SELECT id, full_name, email, role, department, profile_submitted_at
    FROM users
    WHERE profile_status = 'pending_approval'
    ORDER BY profile_submitted_at DESC NULLS LAST, created_at DESC
    LIMIT 5
  `);
  const pendingProjects = await query(`
    SELECT p.id, p.title, p.created_at, u.full_name AS student_name, supervisor.full_name AS supervisor_name
    FROM projects p
    JOIN users u ON u.id = p.student_id
    LEFT JOIN users supervisor ON supervisor.id = p.preferred_supervisor_id
    WHERE p.status = 'pending_review'
    ORDER BY p.created_at DESC
    LIMIT 5
  `);
  const openTechnicalReports = await query(`
    SELECT tr.id, tr.note, tr.status, tr.created_at, u.full_name AS student_name
    FROM technical_reports tr
    JOIN users u ON u.id = tr.student_id
    WHERE tr.status <> 'resolved'
    ORDER BY tr.created_at DESC
    LIMIT 5
  `);
  const projectsNeedingEvaluator = await query(`
    SELECT p.id, p.title, u.full_name AS student_name, p.deadline
    FROM projects p
    JOIN users u ON u.id = p.student_id
    WHERE p.status = 'approved'
      AND p.preferred_supervisor_id IS NULL
    ORDER BY p.deadline NULLS LAST, p.created_at DESC
    LIMIT 5
  `);
  const recentActivity = await query(`
    SELECT * FROM (
      SELECT 'user' AS type, 'حساب جديد' AS label, full_name AS title, role AS details, created_at
      FROM users
      UNION ALL
      SELECT 'project' AS type, 'طلب مشروع' AS label, p.title, u.full_name AS details, p.created_at
      FROM projects p
      JOIN users u ON u.id = p.student_id
      UNION ALL
      SELECT 'technical' AS type, 'مشكلة تقنية' AS label, u.full_name AS title, tr.status AS details, tr.created_at
      FROM technical_reports tr
      JOIN users u ON u.id = tr.student_id
      UNION ALL
      SELECT 'deadline' AS type, 'موعد أكاديمي' AS label, title, COALESCE(department, 'عام') AS details, due_date::timestamptz AS created_at
      FROM academic_deadlines
    ) activity
    ORDER BY created_at DESC
    LIMIT 8
  `);
  res.json({
    totals: totals[0],
    byDepartment,
    projectsByStatus,
    studentsWithoutProjects,
    archiveCandidates,
    workload,
    deadlines,
    dashboardMetrics: dashboardMetrics[0],
    topTechnologies,
    pendingProfiles,
    pendingProjects,
    openTechnicalReports,
    projectsNeedingEvaluator,
    recentActivity
  });
});
