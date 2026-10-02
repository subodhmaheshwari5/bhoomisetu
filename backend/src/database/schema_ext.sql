-- BhoomiSetu schema — regional + operational extensions (migration stage 3)
--
-- Applied AFTER schema_enums.sql so the new enum values are committed and can
-- legally be used as column defaults below.
--
-- Everything here is ADDITIVE. No existing table is dropped and no existing
-- column is removed or retyped, so all current services, endpoints and seeded
-- data continue to work unchanged.

-- =====================================================================
-- STATES  (spec: state master with districts underneath)
--
-- districts previously stored only a free-text `state_name`. That column is
-- kept so existing queries keep working; `state_id` is the new relational link.
-- =====================================================================
CREATE TABLE IF NOT EXISTS states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  region      TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE districts ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id) ON DELETE SET NULL;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE districts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_districts_state ON districts (state_id);

-- Backfill states from whatever district rows already exist, then link them.
INSERT INTO states (name, code, region, status)
SELECT DISTINCT ON (state_name) state_name, upper(left(state_name, 3)), NULL, 'active'
FROM districts
WHERE state_name IS NOT NULL AND state_name <> ''
ORDER BY state_name
ON CONFLICT (name) DO NOTHING;

UPDATE districts d
SET state_id = s.id
FROM states s
WHERE d.state_id IS NULL AND s.name = d.state_name;

-- =====================================================================
-- VILLAGES  (spec: 30+ villages, parcels/cases/projects reference them)
-- =====================================================================
CREATE TABLE IF NOT EXISTS villages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  district_id  UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  block        TEXT,
  lgd_code     TEXT,
  population   INTEGER,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, district_id)
);
CREATE INDEX IF NOT EXISTS idx_villages_district ON villages (district_id);

ALTER TABLE land_parcels ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES villages(id) ON DELETE SET NULL;
ALTER TABLE acquisition_cases ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES villages(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS village_count INTEGER NOT NULL DEFAULT 0;

-- =====================================================================
-- PROJECTS  (spec: project_code, description, type, department, dates, status)
--
-- The original projects table had only id/name/agency/district_id. All new
-- columns are nullable-or-defaulted so existing rows and the existing
-- projectRoutes GET / endpoint keep working.
-- =====================================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'road_widening';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status project_status NOT NULL DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_length_km NUMERIC(8, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_officers TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS boundary GEOMETRY(Polygon, 4326);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects (project_code) WHERE project_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_district ON projects (district_id);
CREATE INDEX IF NOT EXISTS idx_projects_boundary ON projects USING GIST (boundary);

-- =====================================================================
-- CASE <-> PARCEL  (many parcels per case)
--
-- acquisition_cases.parcel_id remains the PRIMARY parcel and stays NOT NULL, so
-- Case 360, the Land Map and every existing service keep resolving a case to a
-- parcel with no changes. This junction adds the additional parcels a project
-- acquisition actually touches.
-- =====================================================================
CREATE TABLE IF NOT EXISTS case_parcels (
  case_id     UUID NOT NULL REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  parcel_id   UUID NOT NULL REFERENCES land_parcels(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, parcel_id)
);
CREATE INDEX IF NOT EXISTS idx_case_parcels_parcel ON case_parcels (parcel_id);

-- Mirror the existing 1:1 link into the junction so both views agree.
INSERT INTO case_parcels (case_id, parcel_id, is_primary)
SELECT id, parcel_id, true FROM acquisition_cases
ON CONFLICT DO NOTHING;

-- =====================================================================
-- TASKS  (spec: 100+ operational tasks) — table did not exist
-- =====================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_ref         TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  description      TEXT,
  case_id          UUID REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  parcel_id        UUID REFERENCES land_parcels(id) ON DELETE SET NULL,
  assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  department       TEXT NOT NULL,
  priority         task_priority NOT NULL DEFAULT 'medium',
  status           task_status NOT NULL DEFAULT 'todo',
  due_date         DATE,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A task must belong to a case: the acquisition case is the central unit.
  CHECK (case_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tasks_case ON tasks (case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_date);

-- =====================================================================
-- DOCUMENT VERSIONING  (spec: DOC-00041 v1 rejected -> v2 uploaded -> v3 verified)
--
-- `documents` keeps representing the CURRENT state of a document.
-- `document_versions` is the append-only history the UI renders.
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number      SMALLINT NOT NULL CHECK (version_number >= 1),
  action              document_version_action NOT NULL,
  file_name           TEXT NOT NULL,
  verification_status document_status NOT NULL,
  remarks             TEXT,
  uploaded_by         TEXT NOT NULL,
  uploaded_by_user    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions (document_id, version_number DESC);

-- Stable, human-readable document reference (spec: DOC-00124).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_ref TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS current_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_ref ON documents (document_ref) WHERE document_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (verification_status);

-- Give every pre-existing document a v1 history row and a stable reference, so
-- version history is meaningful even for documents seeded before this change.
INSERT INTO document_versions (document_id, version_number, action, file_name, verification_status, uploaded_by, created_at)
SELECT d.id, 1, 'uploaded', d.file_name, d.verification_status, d.uploaded_by, d.created_at
FROM documents d
WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id);

UPDATE documents d
SET document_ref = 'DOC-' || upper(substr(replace(d.id::text, '-', ''), 1, 10))
WHERE d.document_ref IS NULL;

-- =====================================================================
-- COMPENSATION  (spec: assessment/approved/paid amounts + dispute + dates)
-- =====================================================================
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS parcel_id UUID REFERENCES land_parcels(id) ON DELETE SET NULL;
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(14, 2) CHECK (approved_amount >= 0);
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) CHECK (paid_amount >= 0);
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS assessment_date DATE;
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS approval_date DATE;
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS dispute_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS market_value NUMERIC(14, 2);
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Compensation is modelled PER PARCEL: the money attaches to land, and one
-- acquisition case can touch several parcels. The original schema enforced
-- UNIQUE(case_id) (one row per case); that constraint is replaced by
-- UNIQUE(parcel_id) plus an explicit is_primary flag.
--
-- is_primary preserves the behaviour every existing reader depends on:
-- intelligenceService and riskEngineService read "the compensation for this
-- case" with `WHERE case_id = $1` and took the single row. They now use
-- `ORDER BY is_primary DESC LIMIT 1`, which still resolves to the primary
-- parcel's compensation — the same value they saw before.
--
-- The flag is what makes "which row is the case's compensation?" a fact in the
-- data rather than an accident of insertion order.
ALTER TABLE compensation ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE compensation DROP CONSTRAINT IF EXISTS compensation_case_id_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- One compensation record per parcel: a parcel cannot be compensated twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_compensation_parcel
  ON compensation (parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compensation_case ON compensation (case_id);

-- =====================================================================
-- REHABILITATION & RESETTLEMENT  (spec: eligibility/entitlement/assistance/...)
-- status stays TEXT so the 12 values need no enum migration, but a CHECK
-- constraint enforces the closed set so an unknown status cannot be stored.
-- The list here must match REHABILITATION_STATUSES in rehabilitationService.ts:
--   not_started | in_progress | eligibility_pending | eligible |
--   entitlement_pending | entitlement_approved | assistance_pending |
--   assistance_provided | resettlement_pending | resettled | completed | disputed
-- `in_progress` means the R&R process has started but is not yet completed; it is
-- an active/in-flight state, distinct from both `completed` and `not_started`.
-- =====================================================================
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS parcel_id UUID REFERENCES land_parcels(id) ON DELETE SET NULL;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS affected_family TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS eligibility TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS entitlement TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS assistance TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS housing TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS livelihood TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS resettlement TEXT;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE rehabilitation ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_rehab_parcel
  ON rehabilitation (parcel_id) WHERE parcel_id IS NOT NULL;

-- Dropped and recreated so re-running migrate stays idempotent while still
-- picking up a change to the status vocabulary.
DO $$ BEGIN
  ALTER TABLE rehabilitation DROP CONSTRAINT IF EXISTS rehabilitation_status_check;
  ALTER TABLE rehabilitation ADD CONSTRAINT rehabilitation_status_check CHECK (
    status IN (
      'not_started', 'in_progress', 'eligibility_pending', 'eligible',
      'entitlement_pending', 'entitlement_approved', 'assistance_pending',
      'assistance_provided', 'resettlement_pending', 'resettled',
      'completed', 'disputed'
    )
  );
END $$;
CREATE INDEX IF NOT EXISTS idx_rehab_status ON rehabilitation (status);

-- =====================================================================
-- GRIEVANCES  (spec: priority, SLA, assigned department, resolved date)
-- =====================================================================
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS parcel_id UUID REFERENCES land_parcels(id) ON DELETE SET NULL;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS assigned_department TEXT;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS submitted_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS sla_date DATE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS resolved_date DATE;
ALTER TABLE grievances ADD COLUMN IF NOT EXISTS reference_number TEXT;
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances (status);
CREATE INDEX IF NOT EXISTS idx_grievances_parcel ON grievances (parcel_id);

-- =====================================================================
-- NOTIFICATIONS  (spec: must reference user, case, PROJECT and ENTITY)
-- =====================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- =====================================================================
-- AUDIT LOGS  (spec: user, role, action, entity, project, case, before/after)
-- =====================================================================
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES acquisition_cases(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_logs (case_id);

-- =====================================================================
-- USERS  (spec: department, state, district, project assignment)
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state_id UUID REFERENCES states(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS project_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- =====================================================================
-- SYSTEM SETTINGS  (spec: Workflow, SLA, Risk, Notifications, Documents,
-- Security, AI). Key/value JSONB so new categories need no schema change, and
-- so a setting can only exist if code actually reads it.
-- =====================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  category    TEXT NOT NULL,
  description TEXT,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_settings_category ON system_settings (category);

-- =====================================================================
-- ALERTS  (spec: deterministic alert generation, no duplicates per scan)
-- =====================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key     TEXT NOT NULL UNIQUE,   -- deterministic: same condition = same key
  case_id       UUID REFERENCES acquisition_cases(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  alert_type    TEXT NOT NULL,
  severity      risk_level NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     UUID,
  is_resolved   BOOLEAN NOT NULL DEFAULT false,
  resolved_at   TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_case ON alerts (case_id);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON alerts (is_resolved, severity);