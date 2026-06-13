import "dotenv/config";
import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://capstone:capstone@localhost:5432/capstonehub"
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function ensureSchema() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confirmation JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_submitted_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_approved_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
    ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS specialization TEXT NOT NULL DEFAULT '';
    ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS tools TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_review_notified_at TIMESTAMPTZ;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_approved_by INTEGER REFERENCES users(id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS preferred_supervisor_id INTEGER REFERENCES supervisors(user_id);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS tech_stack TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor_feedback TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS academic_term TEXT;
    ALTER TABLE milestones ALTER COLUMN due_date DROP NOT NULL;
    UPDATE projects
    SET academic_term = CASE
      WHEN EXTRACT(MONTH FROM created_at) BETWEEN 9 AND 12 THEN CONCAT(EXTRACT(YEAR FROM created_at)::int, '-', EXTRACT(YEAR FROM created_at)::int + 1, '-1')
      WHEN EXTRACT(MONTH FROM created_at) BETWEEN 7 AND 8 THEN CONCAT(EXTRACT(YEAR FROM created_at)::int - 1, '-', EXTRACT(YEAR FROM created_at)::int, '-summer')
      ELSE CONCAT(EXTRACT(YEAR FROM created_at)::int - 1, '-', EXTRACT(YEAR FROM created_at)::int, '-2')
    END
    WHERE academic_term IS NULL;
    CREATE INDEX IF NOT EXISTS idx_projects_student_term ON projects(student_id, academic_term);

    CREATE TABLE IF NOT EXISTS academic_terms (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      starts_at DATE NOT NULL,
      ends_at DATE NOT NULL,
      registration_starts_at DATE NOT NULL,
      registration_ends_at DATE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS supervisor_term_capacities (
      id SERIAL PRIMARY KEY,
      term_id INTEGER NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
      supervisor_id INTEGER NOT NULL REFERENCES supervisors(user_id) ON DELETE CASCADE,
      max_students INTEGER NOT NULL DEFAULT 0 CHECK (max_students >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (term_id, supervisor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_academic_terms_active ON academic_terms(is_active, starts_at);
    CREATE INDEX IF NOT EXISTS idx_supervisor_term_capacities_term ON supervisor_term_capacities(term_id);

    CREATE TABLE IF NOT EXISTS technical_reports (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      screenshot_url TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_technical_reports_student_id ON technical_reports(student_id);
    CREATE INDEX IF NOT EXISTS idx_technical_reports_status ON technical_reports(status);

    CREATE TABLE IF NOT EXISTS lab_helpers (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      contact TEXT,
      languages TEXT[] NOT NULL DEFAULT '{}',
      frameworks TEXT[] NOT NULL DEFAULT '{}',
      bio TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_lab_helpers_department ON lab_helpers(department);

    CREATE TABLE IF NOT EXISTS survey_forms (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL CHECK (audience IN ('student', 'supervisor', 'all')),
      questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      survey_id INTEGER NOT NULL REFERENCES survey_forms(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (survey_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_forms_audience ON survey_forms(audience);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);

    CREATE TABLE IF NOT EXISTS project_ideas (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT 'هندسة المعلومات',
      tech_stack TEXT[] NOT NULL DEFAULT '{}',
      difficulty TEXT NOT NULL DEFAULT 'متوسط',
      suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS rubric_templates (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS rubric_evaluations (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES rubric_templates(id) ON DELETE SET NULL,
      evaluator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      scores JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_project_ideas_department ON project_ideas(department);
    CREATE INDEX IF NOT EXISTS idx_rubric_evaluations_project_id ON rubric_evaluations(project_id);

    CREATE TABLE IF NOT EXISTS ai_document_analyses (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      file_url TEXT,
      analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_document_analyses_submission_id ON ai_document_analyses(submission_id);
    CREATE INDEX IF NOT EXISTS idx_ai_document_analyses_project_id ON ai_document_analyses(project_id);

    CREATE TABLE IF NOT EXISTS assistant_feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      prompt TEXT NOT NULL DEFAULT '',
      response_summary TEXT NOT NULL DEFAULT '',
      blueprint JSONB,
      usefulness INTEGER CHECK (usefulness BETWEEN 1 AND 5),
      tables_score INTEGER CHECK (tables_score BETWEEN 1 AND 5),
      relationships_score INTEGER CHECK (relationships_score BETWEEN 1 AND 5),
      diagrams_score INTEGER CHECK (diagrams_score BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_assistant_feedback_user_id ON assistant_feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_assistant_feedback_created_at ON assistant_feedback(created_at);

    CREATE TABLE IF NOT EXISTS project_blueprints (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'assistant',
      tables_score INTEGER CHECK (tables_score BETWEEN 1 AND 5),
      relationships_score INTEGER CHECK (relationships_score BETWEEN 1 AND 5),
      diagrams_score INTEGER CHECK (diagrams_score BETWEEN 1 AND 5),
      feasibility_score INTEGER CHECK (feasibility_score BETWEEN 1 AND 5),
      supervisor_notes TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_blueprints_project_id ON project_blueprints(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_blueprints_student_id ON project_blueprints(student_id);

    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS ai_documents (
      id SERIAL PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      title TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'ar',
      content_hash TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ai_chunks (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES ai_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      embedding vector(768),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (document_id, chunk_index)
    );
    CREATE TABLE IF NOT EXISTS ai_model_runs (
      id SERIAL PRIMARY KEY,
      pipeline_type TEXT NOT NULL,
      model_name TEXT NOT NULL DEFAULT '',
      model_version TEXT NOT NULL DEFAULT '',
      input_hash TEXT,
      output JSONB NOT NULL DEFAULT '{}'::jsonb,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS pipeline_type TEXT;
    ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS model_name TEXT;
    ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS evidence_score INTEGER CHECK (evidence_score BETWEEN 1 AND 5);
    ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS correctness_score INTEGER CHECK (correctness_score BETWEEN 1 AND 5);
    ALTER TABLE assistant_feedback ADD COLUMN IF NOT EXISTS hallucination_risk INTEGER CHECK (hallucination_risk BETWEEN 1 AND 5);
    CREATE INDEX IF NOT EXISTS idx_ai_documents_source ON ai_documents(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_ai_documents_metadata ON ai_documents USING GIN(metadata);
    CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_id ON ai_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata ON ai_chunks USING GIN(metadata);
    CREATE INDEX IF NOT EXISTS idx_ai_model_runs_pipeline ON ai_model_runs(pipeline_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw ON ai_chunks USING hnsw (embedding vector_cosine_ops);

    UPDATE projects SET status = 'pending_review' WHERE status = 'pending_admin_approval';
  `);
}
