import { query } from "./db.js";

export function fallbackAcademicTerm(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}-1`;
  if (month >= 7) return `${year - 1}-${year}-summer`;
  return `${year - 1}-${year}-2`;
}

export async function getActiveAcademicTerm() {
  const terms = await query(`
    SELECT *,
      (CURRENT_DATE BETWEEN registration_starts_at AND registration_ends_at) AS registration_is_open
    FROM academic_terms
    WHERE is_active = true
    ORDER BY starts_at DESC, id DESC
    LIMIT 1
  `);
  return terms[0] || null;
}

export async function getRegistrationTerm() {
  const [{ total }] = await query("SELECT COUNT(*)::int AS total FROM academic_terms");
  if (!total) {
    return {
      code: fallbackAcademicTerm(),
      label: "الفصل الحالي",
      registration_is_open: true,
      isFallback: true
    };
  }

  const term = await getActiveAcademicTerm();
  if (!term) {
    return { error: "لا يوجد فصل فعال حالياً. راجع الإدارة لتفعيل فصل التسجيل." };
  }
  if (!term.registration_is_open) {
    return {
      error: `تسجيل المشاريع مغلق حالياً. فترة التسجيل لهذا الفصل من ${String(term.registration_starts_at).slice(0, 10)} إلى ${String(term.registration_ends_at).slice(0, 10)}.`
    };
  }
  return term;
}

export async function getSupervisorTermCapacity(supervisorId, academicTermCode) {
  const [row] = await query(`
    SELECT
      s.user_id,
      (
        COALESCE(u.avatar_url, '') <> ''
        AND COALESCE(s.specialization, '') <> ''
        AND COALESCE(s.bio, '') <> ''
        AND cardinality(s.languages) > 0
        AND cardinality(s.tools) > 0
        AND cardinality(s.expertise_keywords) > 0
      ) AS profile_complete,
      COALESCE(stc.max_students, s.max_students_capacity, 0)::int AS max_students_capacity,
      (
        SELECT COUNT(DISTINCT p.student_id)::int
        FROM projects p
        LEFT JOIN students st ON st.user_id = p.student_id
        WHERE p.academic_term = $2
          AND p.status <> 'rejected'
          AND p.is_archived = false
          AND (p.preferred_supervisor_id = s.user_id OR st.supervisor_id = s.user_id)
      ) AS current_load
    FROM supervisors s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN academic_terms at ON at.code = $2
    LEFT JOIN supervisor_term_capacities stc ON stc.supervisor_id = s.user_id AND stc.term_id = at.id
    WHERE s.user_id = $1
  `, [supervisorId, academicTermCode]);
  return row || null;
}

export async function listSupervisorsWithTermCapacity(academicTermCode = null) {
  const termCode = academicTermCode || (await getActiveAcademicTerm())?.code || fallbackAcademicTerm();
  return query(`
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.department,
      u.avatar_url,
      s.bio,
      s.specialization,
      s.languages,
      s.tools,
      s.expertise_keywords,
      (
        COALESCE(u.avatar_url, '') <> ''
        AND COALESCE(s.specialization, '') <> ''
        AND COALESCE(s.bio, '') <> ''
        AND cardinality(s.languages) > 0
        AND cardinality(s.tools) > 0
        AND cardinality(s.expertise_keywords) > 0
      ) AS profile_complete,
      COALESCE(stc.max_students, s.max_students_capacity, 0)::int AS max_students_capacity,
      (
        SELECT COUNT(DISTINCT p.student_id)::int
        FROM projects p
        LEFT JOIN students st ON st.user_id = p.student_id
        WHERE p.academic_term = $1
          AND p.status <> 'rejected'
          AND p.is_archived = false
          AND (p.preferred_supervisor_id = s.user_id OR st.supervisor_id = s.user_id)
      ) AS current_load,
      $1::text AS academic_term
    FROM supervisors s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN academic_terms at ON at.code = $1
    LEFT JOIN supervisor_term_capacities stc ON stc.supervisor_id = s.user_id AND stc.term_id = at.id
    ORDER BY u.department, u.full_name
  `, [termCode]);
}
