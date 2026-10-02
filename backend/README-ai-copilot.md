# BhoomiSetu AI Copilot — Architecture and Troubleshooting

Context-aware assistant over `/api/ai/chat`. Answers questions about cases,
parcels, stages, compensation, grievances, documents, risk, notifications, and
dashboard analytics using **only records the signed-in user is authorized to
see**. Enforces the same RBAC as the rest of the API, server-side.

## Running it

Two terminals. The database is already migrated and seeded.

```powershell
# Terminal 1
cd C:\bhoomisetu\backend
npm run dev            # http://localhost:4000

# Terminal 2
cd C:\bhoomisetu\frontend
npm run dev            # http://localhost:5173
```

Sign in at `/login`. All seeded accounts use password `demo1234`:

| Role | Email |
|---|---|
| Super Admin | `admin@bhoomisetu.demo` |
| DoLR Officer | `dolr.officer@bhoomisetu.demo` |
| State Officer | `state.officer@bhoomisetu.demo` |
| District Officer | `district.officer@bhoomisetu.demo` |
| Landowner | `landowner@bhoomisetu.demo` |
| Land-Requiring Agency | `agency@bhoomisetu.demo` |

Use `district.officer@bhoomisetu.demo` to test the Copilot. Super Admin sees
everything, which masks authorization bugs.

Verify the backend independently: `http://localhost:4000/api/health`.

After changing `useAIChat` or any Copilot component, **restart both dev servers
and hard-reload the browser** (`Ctrl + Shift + R`). A stale bundle is the most
common cause of misleading behaviour.

## Configuration

Backend-only, in `backend/.env`. Keys are never sent to the frontend.

```bash
AI_PROVIDER=local        # local | openai | gemini
AI_MODEL=gpt-4o-mini
AI_API_KEY=              # required for openai/gemini
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.3
```

`AI_PROVIDER` is trimmed and lowercased, so `Local` and ` openai ` both resolve.
An unrecognized value throws at request time rather than silently degrading.

### Provider behaviour

**`local`** is a first-class data-grounded provider, not a stub. It composes the
answer directly from authorized rows via `generateLocalResponse()`. Needs no API
key, is fully deterministic, and never fabricates a value. This is the correct
choice for demos and offline work.

**`openai` / `gemini`** receive a prompt built from the same authorized rows by
`buildContextPrompt()`, which instructs the model to use only the supplied data
and to state when information is absent.

If an external provider fails — missing key, network error, malformed or empty
completion — the request falls back to the deterministic local answer over the
same data and logs the reason. The user sees a correct answer rather than an
error. Watch for `provider=openai->local` in the logs.

## Request and response contract

`POST /api/ai/chat` — authenticated. Max message length 2000.

```json
{
  "message": "Why is this case delayed?",
  "context": { "page": "case-details", "caseId": "<uuid>", "caseNumber": "BS-2026-00124" },
  "conversationHistory": []
}
```

`caseId` is the internal UUID used for the database lookup; `caseNumber` is the
human-readable number shown in the UI badge. The backend authorizes against
`caseId`.

Response uses the standard envelope, `{ "success": true, "data": ... }`:

```json
{
  "success": true,
  "data": {
    "message": "CASE: BS-2026-00124\nSTATUS: DELAYED\n...",
    "intent": "CASE_DELAY",
    "sources": [{ "type": "case", "id": "<uuid>", "label": "Case BS-2026-00124" }],
    "contextUsed": { "caseId": "<uuid>", "provider": "local" },
    "suggestedActions": [{ "label": "View Case", "type": "VIEW_CASE", "targetId": "<uuid>" }],
    "disclaimer": "BhoomiSetu AI provides informational..."
  }
}
```

`POST /api/ai/suggested-prompts` takes `{ context }` **in the body** and returns
a `string[]` tuned to that context.

Frontend note: `apiPost()` unwraps the envelope, so callers receive `data`
directly. Do not test `res.success` in a component — that field is already gone.

## Frontend state architecture

`useAIChat()` (`frontend/src/hooks/useAIChat.ts`) is a module-level store read
through `useSyncExternalStore`. One shared `isOpen` and one shared `context`
serve the topbar trigger and every dashboard page.

**Why not plain `useState`:** the Copilot is triggered from the dashboard topbar
but must receive context from whichever page is mounted. With `useState`, each
`useAIChat()` call gets a private copy, so the topbar button opened a drawer
with an empty context while the page-level drawer holding the real case context
never opened. Context silently never reached the backend.

**Two constraints worth preserving when editing this hook:**

1. `open`, `close`, `setContext`, and `updateContext` must stay at module scope.
   Defined inside the hook body, they get a new identity every render, which
   turns any `useEffect` listing them as a dependency into an infinite render
   loop. React unmounts the tree and the app renders a blank white page. Neither
   `tsc` nor `vite build` catches this — it fails only at runtime in the browser.
2. Publishing identical context is a no-op (`sameContext`). Without it, a page
   effect re-publishes a fresh object each render and never settles.

Context is **not** cleared on close, so reopening on the same page still reports
the correct case or parcel.

One Copilot panel is rendered, in `AIAssistantButton` in the topbar. Pages call
`setContext()` and render no drawer of their own.

## Closing the panel

Three paths, all calling `close()`:

- the **X** button, `aria-label="Close BhoomiSetu Copilot"`
- the **Escape** key, via a `keydown` listener attached only while open
- the **backdrop**, which is a sibling of the panel rather than its parent, so
  clicks inside the panel never reach it

The panel is `position: fixed`, so the page behind it neither scrolls nor
navigates on close.

## Grounding guarantees

Answers are composed from records scoped by `getAuthorizedCaseIds()`:

| Role | Sees |
|---|---|
| `landowner` | cases on their own parcels |
| `district_officer` | cases in their district |
| `state_officer`, `super_admin`, `dolr_officer` | all cases |

Parcel access requires a link to an authorized case. Notification summaries are
scoped to `notifications.user_id` **and** the authorized case set.

The model is instructed to answer "I could not find this information in the
authorized BhoomiSetu records" when data is absent. Ask it something the data
genuinely lacks — `What is the weather in Nagpur?` — and confirm it declines
rather than inventing an answer. That is the highest-signal check available.

## Demo questions

On a case page, the header badge should read `Context: Case BS-2026-00124` and
the answer must repeat that number back.

| Question | Expect |
|---|---|
| `Why is this case delayed?` | case number, STATUS, CURRENT STAGE, overdue days, next step |
| `What stage is this case in and what is the next step?` | matches the Stage Workflow panel |
| `What documents are missing?` | `pending verification` count, matches the Document Vault |
| `What is the compensation status?` | assessment amount in ₹ plus approval/disbursement state |
| `Are there any open grievances on this case?` | a grievance number from the Grievances page |
| `Why is the risk high?` | risk score and reasons, matching the Risk Score panel |

On the dashboard:

| Question | Expect |
|---|---|
| `What needs attention today?` | DASHBOARD SNAPSHOT KPIs, top bottleneck stage, delayed-case list |
| `Which stages are causing delays?` | stage numbers with counts |
| `Summarize my notifications.` | your actual alerts with read/unread state |
| `Show delayed cases.` | case numbers, districts, overdue days |

On the Land Map, with a parcel selected:

| Question | Expect |
|---|---|
| `What case is linked to this parcel?` | ULPIN and a linked case number |

Cross-check at least one number against the on-screen value. If the Copilot
invents a figure that does not match the UI, grounding is broken.

## Logging

Two lines per request:

```
[AI Chat] User: ... | Message: "Why is this case delayed?" | Context: { caseId: ... }
[AI] provider=local intent=CASE_DELAY hasCase=true hasParcel=false hasDashboard=false notifications=5 messageLength=342
```

`provider=openai->local` means the external call failed and the local answer was
substituted. `AI Service Error` means an exception escaped — that should not
occur in normal operation.

## Verification

```powershell
cd C:\bhoomisetu\backend
npm test              # 44 tests, 7 suites
npm run typecheck
cd C:\bhoomisetu\frontend
npm run build
```

`backend/tests/aiChat.test.ts` covers authentication, empty messages, case-scoped
grounding, response-envelope shape, notification and dashboard intents,
unauthorized case refusal, absence of the old stub text, and suggested-prompt
body parsing.

Note `pretest` reseeds the database, and the suite mutates rows — a created case, a
grievance, an updated stage. Run `npm run db:seed` afterward to restore pristine
demo data.

## Troubleshooting

**Blank white page after login.** Almost always the `useAIChat` identity trap
described above. Confirm with `F12` → Console. Both dev servers must be
restarted and the browser hard-reloaded to discard the old bundle.

**"I'm running in prototype mode…"** Stale bundle. Hard-reload and restart.

**Context badge shows a UUID, or `BS-…` is never echoed back.** Context is not
reaching the backend. Check the `[AI Chat] User:` log line — the `Context:` it
prints should contain a populated `caseId`.

**Suggested prompts are generic on a case page.** The handler is reading the
wrong location for context; it must read `req.body.context`, not `req.query`.

**Panel closes then reopens.** A close handler wired to `open()`.

**`sources: 0` with a generic answer.** No data branch matched the detected
intent. Check the `hasCase` / `hasParcel` / `hasDashboard` fields in the `[AI]`
log line to see what was retrieved.

**Backend returns "AI assistant is temporarily unavailable".** An exception
escaped `processChatRequest`. Historically caused by `camelCaseKeys()` throwing
on an absent single row; that is now guarded, but check the stack trace.

## Known limitations

- Local mode is deterministic template composition, not natural language. It is
  accurate and grounded but will not paraphrase or handle questions outside its
  patterns; those fall through to the honest "could not find" reply.
- Conversation history is sent but the local provider does not use it. Only
  external providers can hold multi-turn context.
- `AI_PROVIDER=openai` and `gemini` are wired and error-handled but have not been
  exercised against live APIs in this environment.
- Landowner scoping applies to the Copilot, but the general `GET /api/cases` and
  `GET /api/parcels` endpoints remain open to any authenticated role.
- Browser click-through has never been automated in this environment; the
  verification above is API-level. The white-page regression described in this
  file is a reminder that typecheck and build passing does not imply the UI
  renders.
