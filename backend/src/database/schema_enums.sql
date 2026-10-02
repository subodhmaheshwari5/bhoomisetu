-- BhoomiSetu schema — enum extensions (migration stage 2)
--
-- WHY THIS IS A SEPARATE FILE:
--   migrate.ts executes each file as one multi-statement query, which Postgres
--   wraps in an implicit transaction. A value added with ALTER TYPE ... ADD VALUE
--   cannot be *used* (e.g. as a column DEFAULT) until the transaction commits.
--   So enum additions must be committed in their own transaction BEFORE any DDL
--   that references the new values. migrate.ts enforces that order.
--
-- All statements are idempotent (IF NOT EXISTS), so re-running is safe.

-- ---------------------------------------------------------------------
-- user_role
--
-- The original 6 roles are preserved unchanged so existing accounts, tokens and
-- requireRole() guards keep working. The specification's operational roles are
-- ADDED alongside them rather than replacing them (renaming would break every
-- seeded account and every authorization guard).
-- ---------------------------------------------------------------------
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'state_admin'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'district_admin'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'field_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'compensation_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'rr_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'document_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'grievance_officer'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer'; EXCEPTION WHEN others THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- case_status: the specification distinguishes "on_track" from "in_progress"
-- and adds an explicit hold state. Existing values are untouched.
-- ---------------------------------------------------------------------
DO $$ BEGIN ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'in_progress'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'on_hold'; EXCEPTION WHEN others THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- document_status: the original 3 values are retained. These additions model
-- the full document lifecycle the specification requires, including a
-- MISSING state that represents a *required document that was never uploaded*
-- (the existing 'pending_verification' means "uploaded, awaiting a decision").
-- ---------------------------------------------------------------------
DO $$ BEGIN ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'uploaded'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'under_review'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'missing'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'expired'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'superseded'; EXCEPTION WHEN others THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- New enums for entities that did not exist before.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'planning', 'active', 'at_risk', 'delayed', 'completed', 'on_hold'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'todo', 'in_progress', 'blocked', 'completed', 'overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_version_action AS ENUM (
    'uploaded', 'submitted', 'under_review', 'verified', 'rejected', 'superseded', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The CREATE TYPE above is a no-op once the type exists, so any value added to
-- an ALREADY-DEPLOYED enum must also have a standalone ADD VALUE here. Without
-- this, re-running the migration on an existing database silently keeps the
-- old value list.
DO $$ BEGIN ALTER TYPE document_version_action ADD VALUE IF NOT EXISTS 'under_review'; EXCEPTION WHEN others THEN NULL; END $$;