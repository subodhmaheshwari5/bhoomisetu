-- BhoomiSetu schema
-- Requires the PostGIS extension (enabled in migrate.ts / README setup steps).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin', 'dolr_officer', 'state_officer', 'district_officer', 'landowner', 'land_agency'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE case_status AS ENUM ('on_track', 'at_risk', 'delayed', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stage_status AS ENUM ('not_started', 'in_progress', 'completed', 'delayed', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('pending_verification', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- Reference / directory tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS districts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  state_name    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, state_name)
);

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  agency        TEXT NOT NULL,
  district_id   UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           user_role NOT NULL,
  district_id    UUID REFERENCES districts(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS landowners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landowner_ref TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  contact       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotent: safe to re-run migrate.ts against a database created before this column existed.
ALTER TABLE landowners ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_landowners_user ON landowners (user_id);

-- ---------------------------------------------------------------------
-- Land parcels (PostGIS geometry)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS land_parcels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ulpin          TEXT NOT NULL UNIQUE,
  district_id    UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  landowner_id   UUID REFERENCES landowners(id) ON DELETE SET NULL,
  area_hectares  NUMERIC(10, 2) NOT NULL CHECK (area_hectares > 0),
  land_use       TEXT NOT NULL,
  centroid       GEOMETRY(Point, 4326) NOT NULL,
  boundary       GEOMETRY(Polygon, 4326) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_land_parcels_boundary ON land_parcels USING GIST (boundary);
CREATE INDEX IF NOT EXISTS idx_land_parcels_district ON land_parcels (district_id);

-- ---------------------------------------------------------------------
-- Acquisition cases + stages
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acquisition_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number       TEXT NOT NULL UNIQUE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  parcel_id         UUID NOT NULL REFERENCES land_parcels(id) ON DELETE RESTRICT,
  district_id       UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  current_stage     SMALLINT NOT NULL CHECK (current_stage BETWEEN 1 AND 10),
  status            case_status NOT NULL DEFAULT 'on_track',
  risk_level        risk_level NOT NULL DEFAULT 'low',
  assigned_officer  TEXT NOT NULL,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cases_district ON acquisition_cases (district_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON acquisition_cases (status);

CREATE TABLE IF NOT EXISTS acquisition_stages (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  stage_number           SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 10),
  stage_name             TEXT NOT NULL,
  status                 stage_status NOT NULL DEFAULT 'not_started',
  start_date             DATE,
  completion_date        DATE,
  due_date               DATE,
  responsible_department TEXT NOT NULL,
  responsible_officer    TEXT NOT NULL,
  remarks                TEXT,
  delay_days             INTEGER,
  UNIQUE (case_id, stage_number)
);
CREATE INDEX IF NOT EXISTS idx_stages_case ON acquisition_stages (case_id);

-- ---------------------------------------------------------------------
-- Documents, compensation, rehabilitation
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  document_type       TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  uploaded_by         TEXT NOT NULL,
  verification_status document_status NOT NULL DEFAULT 'pending_verification',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents (case_id);

CREATE TABLE IF NOT EXISTS compensation (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              UUID NOT NULL UNIQUE REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  assessment_amount    NUMERIC(14, 2) CHECK (assessment_amount >= 0),
  approval_status      TEXT NOT NULL DEFAULT 'pending',
  disbursement_status  TEXT NOT NULL DEFAULT 'pending',
  payment_date         DATE,
  payment_reference    TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rehabilitation (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'not_started',
  details      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Grievances, notifications, audit log, risk scores
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grievances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_number  TEXT NOT NULL UNIQUE,
  case_id           UUID REFERENCES acquisition_cases(id) ON DELETE SET NULL,
  landowner_id      UUID REFERENCES landowners(id) ON DELETE SET NULL,
  category          TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'submitted',
  assigned_officer  TEXT,
  resolution        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grievances_case ON grievances (case_id);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  case_id      UUID REFERENCES acquisition_cases(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  previous_value  JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity, entity_id);

CREATE TABLE IF NOT EXISTS risk_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL UNIQUE REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  score          SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  level          risk_level NOT NULL,
  reasons        JSONB NOT NULL DEFAULT '[]',
  recommendation TEXT,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Acquisition Intelligence Engine
--
-- Design notes:
--   * Blockers and evidence are NOT persisted. They are recomputed on demand
--     from the authoritative tables above, so they can never drift out of sync
--     with the case. Only human decisions (resolutions) are persisted.
--   * `verified_precedents` is a read model over resolutions whose status is
--     'verified'. Only verified rows are ever presented as institutional
--     knowledge.
--   * analysis_version makes a stored analysis reproducible: re-running with
--     the same version must yield the same result.
-- ---------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE resolution_status AS ENUM (
    'draft', 'submitted', 'under_review', 'verified', 'rejected', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bottleneck_type AS ENUM (
    'document_blocker',
    'approval_blocker',
    'compensation_blocker',
    'r_and_r_blocker',
    'legal_blocker',
    'grievance_blocker',
    'survey_blocker',
    'data_quality_blocker',
    'dependency_blocker',
    'department_handoff_blocker',
    'deadline_blocker',
    'ownership_verification_blocker',
    'payment_blocker',
    'gis_parcel_blocker',
    'unknown_blocker'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Human-recorded resolution of a detected bottleneck.
CREATE TABLE IF NOT EXISTS case_resolutions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  -- The bottleneck this resolution addresses, as a stable machine key.
  problem_type             TEXT NOT NULL,
  stage_number             SMALLINT,
  problem_description      TEXT NOT NULL,
  root_cause               TEXT NOT NULL,
  action_taken             TEXT NOT NULL,
  responsible_department   TEXT NOT NULL,
  resolution               TEXT NOT NULL,
  outcome                  TEXT NOT NULL,
  resolution_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  supporting_document_refs  TEXT[] NOT NULL DEFAULT '{}',
  -- Only set once a senior authority verifies the record.
  status                   resolution_status NOT NULL DEFAULT 'draft',
  recorded_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verified_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at              TIMESTAMPTZ,
  rejection_reason         TEXT,
  analysis_version         TEXT NOT NULL DEFAULT 'BHOOMI_INTELLIGENCE_V1',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resolutions_case ON case_resolutions (case_id);
-- Only verified rows are retrievable as institutional knowledge; this partial
-- index keeps that lookup cheap and makes the rule structural, not just code.
CREATE INDEX IF NOT EXISTS idx_resolutions_verified
  ON case_resolutions (problem_type, stage_number)
  WHERE status = 'verified';

-- Append-only audit of every intelligence analysis and every resolution
-- transition. Distinct from audit_logs, which records entity mutations.
CREATE TABLE IF NOT EXISTS intelligence_audit_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  analysis_version TEXT NOT NULL DEFAULT 'BHOOMI_INTELLIGENCE_V1',
  -- Detected blockers and generated recommendations, as JSONB. Never stores
  -- raw prompts, API keys, or other secrets.
  detail           JSONB NOT NULL DEFAULT '{}',
  resolution_id    UUID REFERENCES case_resolutions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_audit_case ON intelligence_audit_logs (case_id, created_at DESC);
