# BhoomiSetu — One Nation, One Acquisition Pipeline

Prototype built for **Smart India Hackathon 2026**, PS ID 26016 —
*Real-Time National Land Acquisition & Management System for End-to-End
Digital Monitoring and Decision Support* (Ministry of Rural Development /
Department of Land Resources).

> **Prototype demonstration — not connected to live government systems.**
> All data is fictional demo data, seeded into a real database. See
> [Demo data & disclaimers](#demo-data--disclaimers) below.

## What BhoomiSetu is

Existing systems (DILRMP, ULPIN/Bhu-Aadhaar, NGDRS, SVAMITVA) digitize land
**records and ownership**. BhoomiSetu is a digital monitoring, workflow and
decision-support layer that tracks the **process of acquiring land**: one
unified case ID per parcel, followed through a fixed 10-stage pipeline from
identification to handover.

## Current status: Phase 6.5 — full-stack integration

This repository now runs against the **real backend** (`../backend`) —
there is no local demo data left in the frontend. Every screen calls the
Express API, which reads and writes a real PostgreSQL/PostGIS database.

- [x] Design system, landing page, government dashboard shell (Phases 1–2)
- [x] GIS Land Map, acquisition case pages, 10-stage pipeline (Phases 3–4)
- [x] Login, role-based access (Phase 5) — **now backed by real JWT auth**
- [x] Backend: Express + PostgreSQL/PostGIS, JWT auth, RBAC, every REST
      endpoint from section 36 of the brief (Phase 6)
- [x] **Frontend ↔ backend integration (Phase 6.5)** — see below
- [ ] Rehabilitation module UI, decision-support risk engine, deployment
      tooling — remaining items from the master 10-phase plan

## Phase 6.5 integration

### What's connected

| Area | Status | Notes |
|---|---|---|
| Authentication | **CONNECTED** | Real `POST /api/auth/login`; session restored via `GET /api/auth/me` on reload; JWT stored in `localStorage`, attached automatically to every request |
| Dashboard (KPIs, priority alerts, analytics) | **CONNECTED** | `GET /api/dashboard`, `GET /api/analytics` |
| Acquisition cases | **CONNECTED** | List/detail from `GET /api/cases`, `/api/cases/:id`; creation via `POST /api/cases` (officer roles only, with a real "New Case" form); status/risk quick-update via `PUT /api/cases/:id` |
| Case stages | **PARTIAL** | Stage list is live (`GET /api/cases/:id/stages`); there's no stage-editing control in the UI, so `PUT .../stages/:stageId` is verified via direct API testing, not a button |
| Case documents | **CONNECTED** | New `GET /api/cases/:id/documents` endpoint (added during this phase — it didn't exist before) backs the existing Document Vault UI |
| Case timeline | **CONNECTED** | Derived client-side from live stage data (`src/utils/timeline.ts`), same logic that used to run on local demo data |
| Parcels / ULPIN / GeoJSON map | **CONNECTED** | `GET /api/parcels`, exact-match `GET /api/parcels/:ulpin` on Enter (surfaces real 400/404 from the backend), PostGIS GeoJSON converted to Leaflet coordinates in `src/utils/geo.ts` |
| Projects | **CONNECTED** | `GET /api/projects` — used in the case-creation form and a new admin Projects page |
| Compensation | **CONNECTED** | `GET /api/compensation`, read-only (no write endpoint exists in the backend) |
| Grievances | **CONNECTED** | `GET /api/grievances`, submission via `POST /api/grievances` (any authenticated role), officer-only status updates via `PUT /api/grievances/:id` |
| Notifications | **CONNECTED** | Topbar bell now shows a real unread count and list from `GET /api/notifications`; there's no mark-as-read endpoint, so that part is out of scope |
| Reports | **CONNECTED** | New Reports page: report type + filters, JSON table, and a real CSV download (`GET /api/reports?...&format=csv`) |
| RBAC | **CONNECTED** | Enforced server-side; the frontend hides some controls for UX but a direct API call independently gets `403` regardless of what the UI shows |
| Error handling | **CONNECTED** | Centralized in `src/services/apiClient.ts` — 400/401/403/404/429/500 all map to a normalized `ApiRequestError`; 401 anywhere clears the session automatically |
| Loading/empty/error states | **CONNECTED** | `src/hooks/useApi.ts` + `src/components/ui/AsyncState.tsx` used on every connected screen |

### What changed to make this work

- **New**: `services/apiClient.ts` (axios instance, JWT injection, CSV
  download helper), `types/api.ts` (types mirroring the actual backend
  SELECTs), `hooks/useApi.ts`, `components/ui/AsyncState.tsx`,
  `utils/geo.ts` (GeoJSON→Leaflet), `utils/timeline.ts`.
- **Rewritten**: `features/auth/*` (real login/logout/session-restore),
  `LoginPage`, `OverviewPage` + the three dashboard charts +
  `PriorityAlertsPanel` (now prop-driven instead of self-fetching demo
  data), `CaseListPage` (+ new `CaseCreateModal`), `CaseDetailPage`,
  `CaseHeader` (+ officer-only status/risk quick-edit), `LandMapPage`,
  `ParcelMap`, `ParcelSearchPanel`, `ParcelDetailPanel`,
  `DashboardTopbar` (notifications).
- **New pages, replacing what were placeholder stubs**:
  `CompensationPage`, `GrievancesPage` (list + submission form),
  `ReportsPage`, admin `ProjectsPage`.
- **Removed**: `src/data/demoData.ts`, `src/data/dashboardAnalytics.ts`,
  `src/data/caseData.ts` — fully superseded by live API calls. `authData.ts`
  survives, now just holding role labels and the demo-account list shown
  on the login page (which sign in against the real backend).
- **Backend addition**: `GET /api/cases/:id/documents` didn't exist before
  this phase — it was added because the existing Document Vault UI needed
  something real to call.

### How this was verified

Not just "it compiles." With a live PostgreSQL/PostGIS instance running
(migrated + seeded), I started the backend and drove the same 21 scenarios
this integration was asked to support, via `curl` against the actual API:
login (valid/invalid), unauthenticated access (`401`), dashboard load,
valid/malformed/unknown ULPIN lookups (`200`/`400`/`404`), GeoJSON parcel
geometry, case list/detail, case creation as an officer (`201`), case
creation as a Landowner (**`403`**, confirmed), case update, stage update,
audit log rows for each of those writes, grievance submission (`201`),
notifications list, CSV report export, a 404 route, a validation error,
and confirming a request with no token or a garbage token is rejected the
same way a post-logout request would be. Also confirmed CORS preflight
succeeds from `http://localhost:5173` with credentials.

I could not drive an actual browser in this environment, so the piece I
did **not** verify directly is clicking through the rendered UI pixel by
pixel — I verified the exact network contract every screen relies on
(same endpoints, same payloads, same error shapes) plus full TypeScript
compilation against the real response types, which is the strongest
verification available without a browser.

### Known limitation carried over from Phase 6

Landowner/Land-Requiring Agency accounts are not yet scoped to "their own"
case — any authenticated role can currently `GET` any case (writes are
role-gated). That's real work reserved for Phase 7, not something this
integration pass silently skipped.

## Tech stack (frontend)

- React 19 + TypeScript, built with Vite
- Tailwind CSS v4 (CSS-first `@theme` tokens, see `src/styles/tokens.css`)
- React Router (protected `/dashboard/*`, dynamic `/dashboard/cases/:caseId`)
- lucide-react for icons
- recharts for dashboard analytics
- Leaflet + React Leaflet for the GIS Land Map (OpenStreetMap tiles)
- axios for the API client (`src/services/apiClient.ts`)

## Demo login

Go to **Government Login** on the landing page (or `/login` directly).
Either type credentials or click one of the six demo account cards to sign
in — this now calls the real backend:

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@bhoomisetu.demo` | `demo1234` |
| DoLR Officer | `dolr.officer@bhoomisetu.demo` | `demo1234` |
| State Officer | `state.officer@bhoomisetu.demo` | `demo1234` |
| District Officer | `district.officer@bhoomisetu.demo` | `demo1234` |
| Landowner | `landowner@bhoomisetu.demo` | `demo1234` |
| Land-Requiring Agency | `agency@bhoomisetu.demo` | `demo1234` |

Super Admin and DoLR Officer see the **Administration** section in the
sidebar; other officer roles don't. Landowner and Land-Requiring Agency
accounts are redirected to the (still-placeholder) Landowner Portal rather
than the officer dashboard.

## Getting started

Requires the backend running first — see [`../backend/README.md`](../backend/README.md).

```bash
cp .env.example .env   # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev
```

The dev server prints a local URL (typically `http://localhost:5173`).

Other scripts:

```bash
npm run build     # type-check and produce a production build in dist/
npm run preview   # serve the production build locally
npm run lint      # run oxlint
```

## Project structure

```
src/
├── components/
│   ├── ui/          # Primitives: StatCard, StatusBadge, DemoTag, AsyncState
│   ├── layout/       # Header, footer, sidebar, topbar, nav config
│   ├── landing/      # Landing page sections
│   ├── dashboard/     # Dashboard widgets: charts, PriorityAlertsPanel
│   ├── gis/          # Land Map: ParcelMap, search panel, detail panel
│   └── case/          # Case detail: header, stage workflow, timeline,
│                       #   vault, CaseCreateModal
├── layouts/          # PublicLayout, DashboardLayout (route shells)
├── pages/            # Route-level pages (dashboard/, incl. CaseListPage,
│                      #   CaseDetailPage, LandMapPage, CompensationPage,
│                      #   GrievancesPage, ReportsPage; LoginPage at root)
├── features/
│   └── auth/          # AuthContext/AuthProvider, useAuth, RequireAuth,
│                       #   RequireRole — real backend session now
├── services/          # apiClient.ts — the one place API calls are made
├── hooks/             # useApi.ts — loading/data/error for any endpoint
├── data/             # authData.ts (role labels + demo account list),
│                      #   gisData.ts (pure selectors over live API data)
├── types/            # types/index.ts (domain enums), types/api.ts
│                      #   (backend response shapes)
├── utils/            # geo.ts (GeoJSON↔Leaflet), timeline.ts
├── styles/           # Design tokens (tokens.css)
```

## Design system

- **Color**: navy (`#0B1F3A` family) as the primary institutional color, a
  single gold accent (`#D4AF37`) used sparingly for emphasis, and an
  off-white paper background rather than pure white. A dedicated
  success/warning/danger/info/neutral status system drives all badges.
- **Type**: Newsreader (serif) for headlines, IBM Plex Sans for UI/body
  text, IBM Plex Mono for identifiers and data (Case IDs, ULPINs, stats).
- **Layout**: left-aligned, hairline-rule structure; numbered sequences are
  reserved for genuinely sequential content (the 10-stage pipeline).

All tokens live in `src/styles/tokens.css` as Tailwind v4 `@theme` variables,
so `bg-navy-900`, `text-gold-500`, `bg-success-bg`, etc. are available as
utility classes throughout the app. Nothing about the visual design changed
in this integration phase — only the data source did.

## Demo data & disclaimers

- Every district, project, parcel (ULPIN), landowner reference,
  acquisition case, stage record, document, grievance and notification is
  **fictional**, seeded by `backend/src/database/seed.ts` into a real
  Postgres database. Parcel positions are deterministically scattered near
  approximate district-seat coordinates — not survey-accurate boundaries.
- The four "problem" statistics on the landing page and the NGDRS / ULPIN /
  DILRMP coverage figures in the "Why BhoomiSetu" section are taken from
  the supplied SIH reference material, not invented, and are labelled as
  problem-domain evidence rather than BhoomiSetu results.
- The document vault's Upload/Preview/Download/Verify/Reject actions are
  illustrative only — no files are stored or transmitted, and this is
  stated on the page itself.
- The six demo login accounts use a single shared development-only
  password (`demo1234`) and are not real credentials for any system.
- Nothing in this prototype connects to a real government system, real
  citizen data, or real payment infrastructure.

## Phase 7: Landowner Portal

The landowner portal (`/landowner`) is now real, not a placeholder:

- **Landing**: "Track Your Land Acquisition Case" for signed-out visitors, with a link to the same real login used by officers (see note on OTP below).
- **My Land**: fetches `GET /api/landowner/me/parcels` — the parcels actually linked to the signed-in landowner's account via a new `landowners.user_id` column.
- **Case tracking**: `GET /api/landowner/me/cases`, rendered as a plain-language 8-step checklist (`components/landowner/CaseProgressChecklist.tsx`) instead of the officer-facing 10-stage pipeline — Land Verification → Proposal → Approval → Notification → Compensation Assessment → Compensation Payment → Rehabilitation → Handover.
- **Compensation**: `GET /api/landowner/me/compensation`, clearly labelled as demo values.
- **Grievances**: `GET /api/landowner/me/grievances` + submission via `POST /api/grievances`, which now automatically links the grievance to the landowner's own record server-side.
- **Auth-aware header**: `PublicHeader` now shows the signed-in user's name and a working Log out instead of the login CTA.

### Why there's no OTP simulation

The original brief asked for an OTP-simulated login for the landowner portal. Since Phase 6.5 replaced all authentication with a real backend, adding a fake OTP flow that doesn't touch that backend would be a step backward in honesty, not a feature — so the portal reuses the same real email/password login as officers. The demo landowner account is `landowner@bhoomisetu.demo` / `demo1234`.

### Backend addition

- `landowners.user_id` column (migration is idempotent — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, safe to re-run).
- `GET /api/landowner/me/{parcels,cases,compensation,grievances}` — self-scoped by the JWT's user id, closing the "Landowner scoping is not implemented" gap flagged in Phase 6.5.
- `seed.ts` now links the demo landowner account to 2 real parcels (including the flagship case's parcel), so the portal has real, non-empty content out of the box.

### Verified live

Logged in as the demo landowner and confirmed via curl: 2 parcels owned, 3 linked cases (including the flagship, correctly shown at stage 6/delayed), 2 compensation records, and a grievance submission that automatically got the right `landownerId` attached and was immediately visible both to the landowner and to an officer viewing the full grievance list.

### Known gap, honestly

Case tracking dropdown fields, project details, and everything else read-only in the portal are correct, but there's still no self-service edit of any kind for landowners (by design — a citizen shouldn't be able to edit their own case data). Rehabilitation & Resettlement detail and a document view for landowners are not yet built.

## Phase 8: Decision-Support Risk Engine

- **Risk Score panel** on the case detail page (officers only, matching backend RBAC): a 0–100 score with a colour-coded ring, the risk level badge, a plain-language list of *why* (overdue days, prior stage delays, pending/rejected documents, open grievances, stuck compensation), and a recommendation — never just a bare percentage. A collapsible "What is this score?" note carries the required disclaimer verbatim from the backend: *"Prototype decision-support risk score based on workflow indicators, not a trained AI model."*
- **Recompute button** re-calls the same endpoint, which always recomputes fresh from current data and persists the result — so there's a real audit trail of how a case's risk changed over time in `risk_scores`.
- **Bottleneck Analytics** chart added to the dashboard Overview page — which of the 10 stages has the most delayed cases and by how many days on average, using data the backend was already computing (`GET /api/analytics`'s `bottlenecks` field) but the frontend wasn't displaying yet.

The score is deliberately a transparent, explainable rules engine — not a trained model — and never claims accuracy it doesn't have. See `backend/src/services/riskEngineService.ts` for exactly how each reason is scored.

## Phase 9: Automated Alerts & Notification Center

- **Notification Center** (`DashboardTopbar`): notifications now group into **Today / Yesterday / Earlier** (section 45), clicking one navigates to its linked case and marks it read, and there's a "Mark all read" action — all backed by two new endpoints (`PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`).
- **Alert Scan button**: Super Admin and DoLR Officer accounts see a "Run Alert Scan" control on the dashboard that manually triggers the backend's automated scan (`POST /api/admin/alerts/run`) and shows how many notifications it created — useful for a demo, since the same scan also runs automatically every 5 minutes on the server.
- The scan itself (section 44) auto-flags overdue stages as delayed, warns about stages due within 3 days, and flags high-risk cases — all of which show up as real notifications, not mocked ones.

## Phase 10: Testing, Security, Deployment

This is the final phase of the master build plan. On the frontend side
specifically:

- **Responsive design audit**: every data table added since Phase 1 uses
  a consistent `overflow-x-auto` wrapper rather than a fixed width, and a
  spot-check of the Phase 8–9 additions (risk score panel, bottleneck
  chart, alert scan button, landowner checklist) confirmed the same
  `flex-wrap`/`sm:` responsive patterns used throughout — no new gaps
  found.
- Testing for this repo is backend-only (see `backend/README.md`); there
  was never a browser available to run frontend tests against in this
  environment, so frontend correctness has been verified the same way
  throughout every phase — against the real network contract, with full
  TypeScript compilation against real response types — rather than
  simulated.
- Docker packaging for the frontend (`Dockerfile`, `nginx.conf`) lives
  here but is described in full in the root README's Docker section,
  since it only makes sense alongside the backend and database services.

## Master plan status

All 10 phases of the original master build plan are now implemented:
project setup and design system; the government dashboard with real
analytics; the GIS map; acquisition cases and the 10-stage pipeline;
authentication and RBAC; the backend and REST API; full frontend↔backend
integration; the landowner portal; the decision-support risk engine and
bottleneck analytics; the automated alert engine and notification center;
and now testing, security hardening, and deployment tooling. See the root
README for the full status table and the honest list of what's written
but not yet verified (Docker) versus what's been verified live throughout
(everything else).
