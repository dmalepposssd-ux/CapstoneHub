CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'supervisor', 'admin')),
  full_name TEXT NOT NULL,
  department TEXT NOT NULL,
  phone TEXT,
  profile_status TEXT NOT NULL DEFAULT 'pending' CHECK (profile_status IN ('pending', 'pending_approval', 'approved')),
  profile_confirmation JSONB,
  profile_submitted_at TIMESTAMPTZ,
  profile_approved_at TIMESTAMPTZ,
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supervisors (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expertise_keywords TEXT[] NOT NULL DEFAULT '{}',
  specialization TEXT NOT NULL DEFAULT '',
  languages TEXT[] NOT NULL DEFAULT '{}',
  tools TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT NOT NULL DEFAULT '',
  max_students_capacity INTEGER NOT NULL DEFAULT 5,
  current_load INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  interests_text TEXT NOT NULL DEFAULT '',
  supervisor_id INTEGER REFERENCES supervisors(user_id),
  project_status TEXT NOT NULL DEFAULT 'proposal'
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  proposal_pdf_url TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  archive_review_notified_at TIMESTAMPTZ,
  archive_approved_by INTEGER REFERENCES users(id),
  preferred_supervisor_id INTEGER REFERENCES supervisors(user_id),
  tech_stack TEXT[] NOT NULL DEFAULT '{}',
  supervisor_feedback TEXT,
  academic_term TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'todo'
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  chapter_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feedback TEXT,
  score NUMERIC(5,2)
);

CREATE TABLE IF NOT EXISTS ai_matchings (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES supervisors(user_id) ON DELETE CASCADE,
  similarity_score NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  supervisor_id INTEGER NOT NULL REFERENCES supervisors(user_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_deadlines (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  department TEXT
);

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

CREATE TABLE IF NOT EXISTS technical_reports (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screenshot_url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

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

CREATE TABLE IF NOT EXISTS ai_document_analyses (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  file_url TEXT,
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_student_id ON projects(student_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_student_term ON projects(student_id, academic_term);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_project_id ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_lab_helpers_department ON lab_helpers(department);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_matchings_student_id ON ai_matchings(student_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_student_id ON technical_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_technical_reports_status ON technical_reports(status);
CREATE INDEX IF NOT EXISTS idx_survey_forms_audience ON survey_forms(audience);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_project_ideas_department ON project_ideas(department);
CREATE INDEX IF NOT EXISTS idx_rubric_evaluations_project_id ON rubric_evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_document_analyses_submission_id ON ai_document_analyses(submission_id);
CREATE INDEX IF NOT EXISTS idx_ai_document_analyses_project_id ON ai_document_analyses(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_documents_source ON ai_documents(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ai_documents_metadata ON ai_documents USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_document_id ON ai_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata ON ai_chunks USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_ai_model_runs_pipeline ON ai_model_runs(pipeline_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_embedding_hnsw ON ai_chunks USING hnsw (embedding vector_cosine_ops);
