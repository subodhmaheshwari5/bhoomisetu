# BhoomiSetu Backend

Node.js + Express + TypeScript REST API backed by PostgreSQL + PostGIS.
Implements Phase 6 of the master build plan: real persistence, JWT
authentication, and server-side authorization behind every endpoint the
frontend currently calls out to a demo dataset for.

> **Prototype status.** This is a working backend with real auth and a
> real database — but it has not been used with real citizen data, and
> is not connected to DILRMP/ULPIN/NGDRS/SVAMITVA or any other government
> system. See the frontend's README for the full set of prototype
> disclaimers, which apply here too.

> **As of Phase 6.5, the frontend is connected to this backend** — see
> [`../frontend/README.md`](../frontend/README.md#phase-65-integration)
> for the integration status and how it was verified end-to-end.

## Tech stack

- Node.js + Express 5 + TypeScript (ESM, `NodeNext` module resolution)
- PostgreSQL 16 + PostGIS (parcel geometry stored as native `GEOMETRY`,
  returned to clients as GeoJSON via `ST_AsGeoJSON`)
- JWT auth (`jsonwebtoken`) with `bcryptjs` password hashing
- Validation via `zod`
- `helmet`, `cors`, `express-rate-limit`, `morgan` for baseline security/ops

## Prerequisites

- Node.js 20+
- A PostgreSQL 14+ server with the **PostGIS** extension available
  (the migration runs `CREATE EXTENSION IF NOT EXISTS postgis;` for you —
  the extension package itself just needs to be installed on the server,
  e.g. `apt install postgresql-16-postgis-3` or use a `postgis/postgis`
  Docker image). `CREATE EXTENSION` requires the connecting role to be a
  superuser (or already have the extension pre-enabled on the database) —
  the official `postgis/postgis` Docker image's default `postgres` user
  has this by default, so it's a non-issue there; on a self-managed
  server, run `CREATE EXTENSION IF NOT EXISTS postgis;` once as a
  superuser before `npm run db:migrate` if your app role isn't one.

## Getting started

```bash
cp .env.example .env
# edit .env: DATABASE_URL, JWT_SECRET at minimum

npm install
npm run db:migrate   # applies src/database/schema.sql
npm run db:seed      # loads the fictional demo dataset (safe to re-run)
npm run dev           # starts the API on http://localhost:4000
```

Other scripts:

```bash
npm run build       # type-check and compile to dist/
npm run start        # run the compiled build (node dist/server.js)
npm run typecheck    # tsc --noEmit only
```

### Quick local Postgres with Docker

If you don't already have Postgres/PostGIS running:

```bash
docker run --name bhoomisetu-db -e POSTGRES_USER=bhoomisetu \
  -e POSTGRES_PASSWORD=bhoomisetu_dev -e POSTGRES_DB=bhoomisetu \
  -p 5432:5432 -d postgis/postgis:16-3.4
```

That matches the `DATABASE_URL` in `.env.example` out of the box.

## Demo accounts

Seeded by `npm run db:seed`, matching the frontend's `authData.ts` exactly
(same emails, same shared dev-only password):

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@bhoomisetu.demo` | `demo1234` |
| DoLR Officer | `dolr.officer@bhoomisetu.demo` | `demo1234` |
| State Officer | `state.officer@bhoomisetu.demo` | `demo1234` |
| District Officer | `district.officer@bhoomisetu.demo` | `demo1234` |
| Landowner | `landowner@bhoomisetu.demo` | `demo1234` |
| Land-Requiring Agency | `agency@bhoomisetu.demo` | `demo1234` |

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"district.officer@bhoomisetu.demo","password":"demo1234"}'
```

Use the returned `token` as `Authorization: Bearer <token>` on every other
request — every route except `POST /api/auth/login` requires it. This is
enforced server-side (`middleware/auth.ts`), independent of whatever the
frontend does; a request without a valid JWT is rejected with `401`
regardless of what the browser would have shown.

## API surface (section 36 of the brief)

All responses use the standard envelope from section 37:
`{ "success": true, "data": ... }` or
`{ "success": false, "error": { "code", "message" } }`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | The only unauthenticated route |
| GET | `/api/auth/me` | Current user from the JWT |
| GET | `/api/dashboard` | KPI summary + priority alerts |
| GET | `/api/cases` | Filters: `status`, `riskLevel`, `districtId`, `search` |
| POST | `/api/cases` | Officer roles only |
| GET | `/api/cases/:id` | |
| PUT | `/api/cases/:id` | Officer roles only |
| GET | `/api/cases/:id/stages` | |
| PUT | `/api/cases/:id/stages/:stageId` | Officer roles only |
| GET | `/api/cases/:id/documents` | Added in Phase 6.5 to back the frontend's Document Vault UI |
| GET | `/api/parcels` | Filter: `districtId`; geometry as GeoJSON |
| GET | `/api/parcels/:ulpin` | |
| GET | `/api/projects` | |
| GET | `/api/compensation` | |
| GET | `/api/grievances` | Filters: `status`, `category` |
| POST | `/api/grievances` | Any authenticated role |
| PUT | `/api/grievances/:id` | Officer roles only |
| GET | `/api/analytics` | Stage distribution, district performance, case status, bottlenecks |
| GET | `/api/reports?type=...` | `progress` \| `delayed` \| `compensation` \| `district-performance` \| `grievance-status`; add `&format=csv` to download |
| GET | `/api/landowner/me/parcels` | Self-scoped to the signed-in landowner (via `landowners.user_id`); empty array for non-landowner accounts |
| GET | `/api/landowner/me/cases` | Cases for the landowner's own parcels |
| GET | `/api/landowner/me/compensation` | Compensation for the landowner's own cases |
| GET | `/api/landowner/me/grievances` | Grievances filed by the landowner (matched via `landowners.user_id`) |
| GET | `/api/cases/:id/risk-score` | Officer roles only. Computes an explainable 0-100 delay-risk score and persists it to `risk_scores` |
| POST | `/api/admin/alerts/run` | Super Admin / DoLR Officer only. Manually triggers the automated alert scan (also runs on a 5-minute interval automatically) |
| GET | `/api/notifications` | Scoped to the current user |
| PUT | `/api/notifications/:id/read` | Marks one notification read (owner-scoped) |
| PUT | `/api/notifications/read-all` | Marks every notification for the current user read |
| GET | `/api/health` | Unauthenticated liveness check |

"Officer roles" = Super Admin, DoLR Officer, State Officer, District
Officer. Landowner and Land-Requiring Agency accounts get a `403` from
those routes, matching the frontend's Administration-section gating.

## Database

`src/database/schema.sql` creates: `districts`, `projects`, `users`,
`landowners`, `land_parcels` (PostGIS `GEOMETRY(Point)` centroid +
`GEOMETRY(Polygon)` boundary), `acquisition_cases`, `acquisition_stages`,
`documents`, `compensation`, `rehabilitation`, `grievances`,
`notifications`, `audit_logs`, `risk_scores`. Foreign keys and check
constraints enforce the same invariants the frontend types encode (e.g.
`current_stage BETWEEN 1 AND 10`).

`src/database/seed.ts` deterministically regenerates the same fictional
dataset the frontend ships with — same 5 districts, same 10 projects, same
case numbers (including the flagship `BS-2026-00124`), same 10-stage
pipeline generation logic — so a demo audience sees a consistent story
whether they're looking at the frontend's local demo data or a real
frontend-to-backend call. It's safe to re-run; it truncates the relevant
tables first.

## Automated alert engine (Phase 9)

`services/alertEngineService.ts` implements section 44 of the brief:

- **Deadline exceeded**: in-progress stages whose `due_date` has passed get
  automatically marked `delayed` (with `delay_days` computed), the parent
  case's status flips to `delayed`, an audit log entry is written, and
  every officer-role user gets a `deadline_exceeded` notification.
- **Deadline approaching**: in-progress stages due within the next 3 days
  get a `deadline_approaching` heads-up.
- **High-risk cases**: any case with `risk_level` `high` or `critical`
  gets a `high_risk_case` notification.
- Notifications are deduplicated per case+type within a rolling 24-hour
  window, so re-running the scan doesn't spam the same alert.

It runs two ways: automatically on a 5-minute `setInterval` in
`server.ts` (a real deployment would use a proper cron/queue instead),
and on demand via `POST /api/admin/alerts/run` (Super Admin / DoLR
Officer only) — the frontend's dashboard has a "Run Alert Scan" button
for Super Admin/DoLR Officer accounts so a demo doesn't have to wait for
the interval.

## Testing (Phase 10)

A real integration test suite using Node's built-in test runner (`node:test`, zero extra dependencies) — starts the actual Express app on an ephemeral port and drives it with real HTTP requests against a real (reseeded) database:

```bash
npm test
```

`pretest` runs `prepare:test`, which isolates, migrates, and reseeds a
**test target** before the suite runs. The seed truncates and rewrites every
domain table, so isolation is mandatory and `prepare:test` refuses to run unless
the target's name contains `test`:

- **By default** a dedicated schema (`bhoomisetu_test`) on the configured
  server. It needs no superuser rights, and because the test schema shadows
  `public` on every connection, the seed can only reach tables it created
  itself. Your development data is never touched.
- **Optionally** a dedicated database, by setting `TEST_DATABASE_URL` in
  `.env.test` to a database whose name contains `test` (e.g.
  `bhoomisetu_test`). Created automatically if the role has `CREATEDB`.
  Otherwise create it once as a superuser:

  ```bash
  psql -U postgres -d postgres -c "CREATE DATABASE bhoomisetu_test OWNER bhoomisetu;"
  ```

Configuration lives in `.env.test`, which the test scripts load explicitly via
node's `--env-file` flag.

Test files run one at a time (`--test-concurrency=1`). They share a single
database, and some commit fixtures that are visible to the whole run, so
serialising the files is what keeps one suite's rows from perturbing another's
counts.

`npm test` leaves the demo data in `public` untouched. To restore pristine demo
data afterwards, run `npm run seed:demo`.

166 tests across 13 suites, covering:

- **Authentication**: valid/invalid login, unknown email, malformed body, missing/garbage token, `GET /auth/me`.
- **Authorization (RBAC)**: a Landowner is blocked (`403`) from creating/updating a case, viewing another case's risk score, and running the admin alert scan; a District Officer can create a case; a Super Admin can run the alert scan; any role can submit a grievance but only officers can update one.
- **Case retrieval**: list, detail, 404 on unknown id, exactly 10 stages per case.
- **Stage updates**: an officer's update is persisted and visible on refetch; updating a stage that doesn't belong to the case is `404`.
- **Compensation**: records are linked to real cases.
- **Risk scoring**: score is within 0–100, has a valid level, non-empty reasons and recommendation, disclaims it's not a trained model, is deterministic on unchanged data, and 404s for an unknown case.
- **AI Copilot** (`tests/aiChat.test.ts`): authentication required, empty-message
  rejection, case-scoped answers grounded in the requested case with citations,
  the `{ success, data }` response shape, notification and dashboard intents,
  refusal of unauthorized case context, absence of the old prototype-stub text,
  and suggested prompts read from the POST body.
- **API validation**: malformed ULPIN, unknown-but-valid ULPIN, grievance
  description too short, invalid grievance category, missing required fields on
  case creation, invalid report type, and unknown routes all fail cleanly — never
  a raw 500.

Frontend interactions are still verified the same way they have been
throughout this project: live, end-to-end, against the running backend
(there's no browser available in the environment these phases were built
in) — see the frontend README's "How this was verified" note in the
Phase 6.5 section for what that means in practice.

## Security notes

- Every route except login requires a valid JWT, checked here, not just
  in the frontend (section 26: "never rely only on frontend route
  protection").
- Passwords are hashed with bcrypt (`bcryptjs`), never stored or logged in
  plaintext.
- All SQL is parameterized (`pg`'s `$1, $2, ...` placeholders) — no string
  concatenation into queries.
- `helmet` sets baseline security headers; `cors` is restricted to
  `CORS_ORIGIN`; `express-rate-limit` caps requests per IP (600 per 15 min
  across the API).
- **Login has its own tighter rate limit** (20 attempts per 15 minutes per
  IP, added in Phase 10) to slow down credential-stuffing / brute-force
  attempts specifically, on top of the general API limit.
- **`trust proxy` is enabled in production** so rate limiting and logging
  key off the real client IP (from `X-Forwarded-For`) rather than the
  reverse proxy's IP — required once this runs behind Docker/Nginx.
- `.env` is git-ignored; only `.env.example` (placeholders) is committed.

## Deployment (Phase 10)

Dockerfiles for both halves plus a root `docker-compose.yml` (PostGIS
database + backend + frontend/Nginx) live at the repo root — see the root
[`README.md`](../README.md#docker-deployment-phase-10) for the full
walkthrough. In short:

```bash
cp .env.example .env   # set JWT_SECRET at minimum
docker compose up -d --build
docker compose exec backend node dist/database/migrate.js
docker compose exec backend node dist/database/seed.js
```

Frontend on `http://localhost:8080`, backend directly on
`http://localhost:4000` if you need it. The frontend's Nginx config
reverse-proxies `/api/*` to the backend container, so in the containerized
setup the two never need to know about CORS between them — only a browser
hitting the backend directly from a different origin does.

**Honesty note**: these Dockerfiles and the compose file were written
following standard, well-established patterns (multi-stage Node builds,
Nginx SPA + reverse-proxy config) and reviewed carefully, but this
sandbox has no Docker daemon available to actually build and run the
containers — so unlike everything else in this project, this part was
not verified end-to-end by me. Please treat it as a solid starting point
to test, not as something already proven to work.

## AI Copilot

The Copilot (`/api/ai/chat`) is documented separately in
[`README-ai-copilot.md`](./README-ai-copilot.md) — running instructions, the
request/response contract, `local` vs `openai` vs `gemini` provider behaviour,
the frontend shared-state architecture, demo questions, and troubleshooting.

## Known limitations (honest, not fixed yet)

- **No refresh tokens** — the JWT simply expires (`JWT_EXPIRES_IN`, default
  8h) and the user has to log in again. No revocation list either.
- **Landowner scoping is now implemented (Phase 7)** via `landowners.user_id`
  and the `/api/landowner/me/*` endpoints, but `GET /api/cases` and
  `GET /api/parcels` (the general, officer-facing endpoints) still return
  everything to any authenticated role — a landowner isn't blocked from
  those, they just have their own scoped endpoints as well. Locking down
  the general endpoints per-role is still open work.
- **Document uploads are metadata-only.** `documents.storage_path` is a
  string; there's no object storage wired up yet (matches the frontend's
  vault, which is explicitly illustrative-only).
- **The risk-scoring engine is now built (Phase 8).** `GET /api/cases/:id/risk-score`
  computes and persists an explainable 0-100 score from real workflow
  indicators (overdue days, prior stage delays, pending/rejected
  documents, open grievances, stuck compensation) with human-readable
  reasons and a recommendation — see `services/riskEngineService.ts`. It's
  a transparent rules engine, not a trained model, and says so in its own
  API response. A case's `risk_level` field is still manually set by
  officers (via `PUT /api/cases/:id`); the computed score is a separate,
  informational signal, not an auto-applied override — an officer decides
  whether to act on it.
