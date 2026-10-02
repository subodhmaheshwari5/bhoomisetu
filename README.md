# BhoomiSetu — SIH 2026 Prototype

Monorepo root. See [`frontend/README.md`](./frontend/README.md) and
[`backend/README.md`](./backend/README.md) for details on each half.

```
bhoomisetu-project/
├── frontend/   # React + Vite + TypeScript app (Phases 1-9 — implemented)
├── backend/    # Node/Express + TypeScript + PostgreSQL/PostGIS API (Phases 6-10 — implemented)
├── docker-compose.yml   # Phase 10: PostGIS + backend + frontend/Nginx
└── .env.example          # docker-compose environment template
```

## Status: one working full-stack application with AI Copilot

As of Phase 6.5, the frontend and backend are connected. There is no local
demo data left in the frontend — every screen calls the real Express API,
which reads and writes a real PostgreSQL/PostGIS database. Authentication
is real JWT auth issued by the backend; role-based access is enforced
server-side (not just hidden in the UI).

**New in this build:**
- **AI Acquisition Copilot** (`/api/ai/chat`) — context-aware assistant for cases, parcels, stages, compensation, grievances, documents, risk, and dashboard analytics
- **Explainable AI responses** — structured output with STATUS, CURRENT STAGE, KEY REASONS, RECOMMENDED NEXT STEP, SOURCES, and suggested action buttons
- **Context-aware chat** — automatically understands the current case/parcel/page context
- **AI provider abstraction** — supports OpenAI, Gemini, or a local data-grounded provider via environment variables
- **Authorization-enforced AI** — AI only sees data the user is authorized to access (same RBAC as the API)

### Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env   # point DATABASE_URL at your Postgres+PostGIS instance
npm install
npm run db:migrate && npm run seed:demo
npm run dev             # http://localhost:4000

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev             # http://localhost:5173
```

Sign in at `/login` with any of the 6 seeded demo accounts (see either
README — `demo1234` for all of them).

### Demo accounts

The demo dataset contains 90 cases. The password is `demo1234` for all demo accounts.

| Email | Role | What to look at |
|---|---|---|
| `admin@bhoomisetu.demo` | `super_admin` | Everything, including Administration pages |
| `dolr.officer@bhoomisetu.demo` | `dolr_officer` | Admin + all cases |
| `district.officer@bhoomisetu.demo` | `district_officer` | Jaipur-scoped only |
| `state.officer@bhoomisetu.demo` | `state_officer` | Rajasthan only |
| `landowner@bhoomisetu.demo` | `landowner` | Own parcels only |
| `agency@bhoomisetu.demo` | `land_agency` | Intentionally blocked |

For administration, use `admin@bhoomisetu.demo` and open **Administration** → Users, States, Districts, Settings, and Audit Logs.

Flagship intelligence case: **`BS-2026-00124`**.

### Administration Access

Administration features are role-gated:

- `super_admin` — administration access
- `dolr_officer` — administration access and all cases

### AI Configuration

Add to `backend/.env` to enable a real AI provider:

```bash
AI_PROVIDER=openai          # or "gemini" or "local" (default)
AI_MODEL=gpt-4o-mini        # model name for the provider
AI_API_KEY=sk-...           # provider API key (keep secret, backend-only)
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.3
```

In `local` mode (default), the AI answers directly from the authorized database
records — a deterministic, data-grounded provider that needs no API key and
never fabricates values. `openai` and `gemini` receive a prompt built from the
same records, and fall back to the local answer if the provider call fails.

See [`backend/README-ai-copilot.md`](./backend/README-ai-copilot.md) for the
full contract, provider behaviour, frontend state architecture, and
troubleshooting.

### Integration status

| Area | Status |
|---|---|
| Authentication (login/logout/session restore) | CONNECTED |
| Dashboard (KPIs, priority alerts, analytics charts) | CONNECTED |
| Acquisition cases (list, detail, create, status/risk update) | CONNECTED |
| Case stages (view; update verified via API, no dedicated UI control) | PARTIAL |
| Case documents | CONNECTED |
| Case timeline | CONNECTED (derived client-side from live stage data) |
| Parcels / ULPIN search + GeoJSON map | CONNECTED |
| Projects | CONNECTED |
| Compensation | CONNECTED (read-only; no write endpoint exists) |
| Grievances (list, submit, officer status update) | CONNECTED |
| Landowner Portal (My Land, case tracking, compensation, grievances, scoped to the signed-in landowner) | CONNECTED |
| Notifications (list, grouped, click-through, mark-as-read) | CONNECTED |
| Reports (JSON + CSV export) | CONNECTED |
| RBAC (officer-only writes, Administration section) | CONNECTED |
| Decision-support risk engine (explainable score, reasons, recommendation) | CONNECTED |
| Bottleneck analytics (delays by stage) | CONNECTED |
| Automated alert engine (deadline exceeded/approaching, high-risk) | CONNECTED |
| Notification Center (Today/Yesterday/Earlier, click-through, mark-as-read) | CONNECTED |
| Error handling (401/403/404/422/500, centralized) | CONNECTED |
| **AI Acquisition Copilot (context-aware, explainable, RBAC-enforced)** | **NEW — CONNECTED** |

Full detail, the exact commands used to verify it, and honest limitations
are in [`frontend/README.md`](./frontend/README.md#phase-65-integration).

## Docker deployment (Phase 10)

A root `docker-compose.yml` runs the whole stack: PostGIS database,
backend API, and the frontend served by Nginx (which also reverse-proxies
`/api/*` to the backend, so the containerized frontend and backend share
an origin and never need CORS between them).

```bash
cp .env.example .env
# edit .env: set JWT_SECRET at minimum (openssl rand -hex 32)

docker compose up -d --build
docker compose exec backend node dist/database/migrate.js
docker compose exec backend node dist/database/seed.js
```

Then open `http://localhost:8080`. The backend is also reachable directly
on `http://localhost:4000` if needed. `docker-compose.yml`, each
service's `Dockerfile`, and `frontend/nginx.conf` are all at fixed,
well-known paths — see the backend README's Deployment section for more
detail on what each piece does.

**Honesty note**: this sandbox doesn't have a Docker daemon, so unlike
everything else built in this project, the Docker setup was written
carefully but **not actually built and run** here. Test it before relying
on it for a live demo.

## Testing (Phase 10)

```bash
cd backend
npm test
```

210 integration tests (Node's built-in `node:test`, no extra dependencies)
run against the real Express app and a real, freshly-reseeded database —
covering authentication, RBAC (including the Landowner-blocked-from-
case-creation scenario verified by hand throughout this project),
case/stage CRUD, compensation, the risk-scoring engine, the AI Copilot
(grounding, response contract, authorization, provider fallback), and API
validation. See `backend/README.md#testing-phase-10` for the full list.

## Security (Phase 10 additions)

On top of what Phase 6 already had (JWT auth enforced server-side,
bcrypt password hashing, parameterized SQL, helmet, CORS, rate limiting):

- A dedicated, tighter rate limit on `POST /api/auth/login` (20 attempts
  per 15 minutes per IP) to slow down brute-force/credential-stuffing
  attempts specifically.
- `trust proxy` enabled in production, so rate limiting and logging use
  the real client IP once this runs behind Docker/Nginx, not the proxy's.
- **AI rate limiting** — `POST /api/ai/chat` inherits the general API rate limit (600 req/15min) and validates message length (max 2000 chars).
- **AI authorization** — AI queries are scoped to the user's authorized cases/parcels; never bypasses backend RBAC.
- **AI provider keys** — API keys stay backend-only (`AI_API_KEY`); never exposed to frontend.

## Final quality checklist

Ran across both halves before packaging every phase, most recently for
Phase 10:

- [x] Frontend TypeScript check (`tsc --noEmit` **and** `npm run build` —
      Phase 9 caught a real bug that only showed up in the full build,
      not `--noEmit` alone)
- [x] Frontend lint (`oxlint`, 0 warnings/errors)
- [x] Backend TypeScript check
- [x] Backend lint
- [x] Backend build (`tsc`, compiles to `dist/`, runs standalone)
- [x] Frontend production build (`vite build`)
- [x] Backend automated test suite (210/210 passing)
- [x] Manual end-to-end verification against a live PostgreSQL/PostGIS
      instance for every phase (login, RBAC 403s, CRUD, CSV export,
      risk scoring, alert scan, notifications) — see each phase's README
      section for the specific scenarios run
- [ ] Docker build/run — written, not verified (no Docker daemon in this
      environment; see the honesty note above)
- [ ] Browser click-through — never available in this environment; every
      phase substituted live API-contract verification instead, which is
      disclosed everywhere it applies rather than implied to be the same
      thing
