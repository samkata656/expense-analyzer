-- 001_init: core schema for the TechCorp expense analyzer.
-- Generated with AI from the prompt in docs/prompts/db.md (no hand-written SQL).

CREATE TYPE user_role AS ENUM ('employee', 'cfo');
CREATE TYPE expense_status AS ENUM ('approved', 'rejected', 'manual_review');
CREATE TYPE expense_category AS ENUM (
  'food',            -- Policy 1
  'business_meal',   -- Policy 2
  'cigarettes',      -- Policy 3
  'city_transport',  -- Policy 4
  'travel',          -- Policy 5
  'it_equipment',    -- Policy 6
  'training',        -- Policy 7
  'other'            -- Policy 8
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100),
  last_name     text NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
  employee_code text NOT NULL UNIQUE CHECK (length(trim(employee_code)) BETWEEN 1 AND 64),
  role          user_role NOT NULL DEFAULT 'employee',
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- identity lookups are case-insensitive on names
CREATE INDEX users_identity_idx ON users (lower(first_name), lower(last_name), employee_code);

CREATE TABLE expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url      text,
  merchant       text,
  receipt_date   date,
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency       char(3) NOT NULL,
  amount_bgn     numeric(12,2),
  amount_eur     numeric(12,2),
  category       expense_category NOT NULL,
  has_alcohol    boolean NOT NULL DEFAULT false,
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,
  description    text,
  comment        text,
  status         expense_status NOT NULL,
  status_reason  text NOT NULL,
  policy         text,
  ai_raw         jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_user_created_idx ON expenses (user_id, created_at DESC);
CREATE INDEX expenses_status_idx ON expenses (status);

-- Comments in which the jailbreak guard found injected instructions.
CREATE TABLE jailbreak_attempts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES users(id) ON DELETE SET NULL,
  raw_comment            text NOT NULL,
  extracted_instructions jsonb NOT NULL DEFAULT '[]'::jsonb,
  clean_comment          text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Errors caught by the intake workflow branches and the global n8n error workflow.
CREATE TABLE error_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,          -- workflow name or 'web'
  node          text,
  error_code    text,
  message       text NOT NULL,
  execution_id  text,
  payload       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_logs_created_idx ON error_logs (created_at DESC);

-- Vector store for the CFO assistant (n8n PGVector Store node layout).
CREATE TABLE expense_embeddings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text NOT NULL,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding  vector(1536) NOT NULL
);
CREATE INDEX expense_embeddings_hnsw_idx ON expense_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX expense_embeddings_expense_idx ON expense_embeddings ((metadata->>'expense_id'));

-- CFO agent may read business data, never write, never read logs of attacks.
GRANT SELECT ON users, expenses, expense_embeddings TO cfo_readonly;
