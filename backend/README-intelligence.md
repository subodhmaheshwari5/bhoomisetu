# Acquisition Intelligence Engine

Answers one question for a district officer: **why is this case stuck, and what should I do about it?**

## Design stance

The engine is **deterministic and rule-based**. It reads BhoomiSetu's own records and reports what it finds.

There is **no LLM in the analysis path**. This is a deliberate decision, not an unfinished one:

- Every conclusion carries evidence identifiers (`E1`, `E2`, …) that map to concrete rows the officer can inspect.
- The same case always produces the same analysis. An officer's accountability decision must not change depending on model temperature or prompt wording.
- A hallucinated root cause is worse than no root cause. In land acquisition, misattributing a delay can affect compensation and litigation outcomes.

The Copilot (`README-ai-copilot.md`) *is* model-backed. The distinction is intentional: the Copilot helps you navigate; the Intelligence Engine tells you what the records say. The engine's outputs are also supplied to the Copilot as grounding context.

## Analysis pipeline

`src/services/intelligenceService.ts` → `analyzeCase(caseId)`, version `BHOOMI_INTELLIGENCE_V1`.

1. Loads case, stages, documents, compensation, R&R, grievances, and risk score.
2. Runs each detector. Each returns a `Bottleneck` **only if its conditions hold**, with the evidence that triggered it:
   - `document_blocker` — pending or rejected documents on the active stage
   - `approval_blocker` — approval/verification pending or overdue
   - `compensation_blocker` / `payment_blocker`
   - `r_and_r_blocker` — rehabilitation incomplete
   - `grievance_blocker` — unresolved grievance
   - `ownership_verification_blocker` / `gis_parcel_blocker`
   - `data_quality_blocker` — parcel/ULPIN integrity problems
   - `deadline_blocker` — stage due date passed
   - `dependency_blocker` / `department_handoff_blocker`
3. Ranks blockers into one **primary** blocker and **contributing factors**. Ranking is internal-only: the internal composite score is not exposed, so nobody can reverse-engineer a threshold to game the ordering.
4. Builds **recommendations**, each citing the evidence it rests on.
5. Builds the **dependency chain**, showing which later stages cannot start until the blocker clears.

Blockers and evidence are **recomputed on every request**, never persisted. A stale bottleneck is worse than none.

### `confidence` vs severity

- `severity` — how bad the impact is.
- `confidence` — how strongly the stored evidence supports the classification. It is **evidence strength, not model confidence**, and is labelled as such in the UI.

### Active dependency vs blocker

"Not finished" and "blocking" are different claims, and the engine no longer conflates them. R&R recorded as `in_progress` means the process has started — that is **not** evidence it is holding the case up, so it is reported in a separate `activeDependencies` collection rather than as a blocker:

```json
"activeDependencies": [
  {
    "category": "r_and_r_blocker",
    "classification": "active_dependency",
    "title": "Rehabilitation is in progress",
    "reason": "Rehabilitation and Resettlement is currently in progress. No evidence shows it is delaying the case.",
    "severity": "info",
    "blocking": false,
    "evidenceIds": ["E15", "E16"]
  }
]
```

- An entry with `"blocking": false` appears **only** here. It never enters `allBlockers`, so it cannot be promoted to `primaryBlocker` or influence the risk score.
- An entry with `"blocking": true` is a genuine blocker and is **also** present in `allBlockers`, so nothing is lost.
- `severity: "info"` exists only on `activeDependencies`. It is deliberately not part of `BottleneckSeverity`, so an informational item cannot be typed as a bottleneck severity at all.

`in_progress` is promoted to a blocker **only** when stored evidence shows it: the R&R `target_date` has passed; an R&R work item is `status = 'overdue'`; an R&R work item is incomplete past **its own `due_date`** (the action's SLA, read from the row rather than a constant); the case has advanced past stage 8 while stage 8 is not complete; or a risk reason already names R&R. No threshold is invented for these.

Every other non-completed R&R status — including `disputed` — keeps the original blocker treatment, because those are unresolved positions rather than work in progress.

### Risk disagreement

The officer-set `risk_level` on the case and the existing deterministic risk engine can disagree. When they do, both are returned and **neither is overwritten**:

```json
"riskDisagreement": {
  "caseFieldLevel": "high",
  "computedLevel": "medium",
  "computedScore": 60,
  "note": "The officer-set risk level and the computed risk score disagree. Both are shown; neither is overwritten."
}
```

## Resolution, verification, and institutional memory

`src/services/resolutionService.ts`.

A resolution moves through: `draft → submitted → under_review → verified | rejected`.

- Transitions are validated server-side; an illegal jump is rejected.
- **An officer cannot verify their own resolution.** Enforced in the service, not just hidden in the UI.
- Only `verified` resolutions are retrievable as precedent. Drafts and rejected entries never become institutional knowledge.

Precedent matching is **explicit categorical matching** on problem type and stage (`high` / `moderate` / `low`), and the UI states which fields matched. `pgvector` is not available in this database, so there is no semantic similarity — a match on stage alone is reported as `moderate`, not dressed up as strong relevance.

## Authorization

`src/services/intelligenceAuthz.ts` — fails closed.

| Situation | Result |
|---|---|
| Unknown case | 404 |
| Case outside the officer's district | 403 |
| District officer with no `districtId` on the token | 403 |
| Agency user | 403 |
| Landowner on someone else's parcel | 403 |
| Landowner on their own parcel | 200, financial fields redacted |

`districtId` is propagated into the access token at login and restored by the auth middleware. It is **not** trusted from the request body.

## API

Mounted at `/api/intelligence`, all routes behind `requireAuth`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/cases/:caseId` | Full analysis (incl. evidence, chain, risk, similar cases) |
| POST | `/cases/:caseId/analyze` | Recompute analysis |
| GET | `/cases/:caseId/blockers` | Primary + contributing factors |
| GET | `/cases/:caseId/evidence` | Evidence rows only |
| GET | `/cases/:caseId/recommendations` | Recommended next actions |
| GET | `/cases/:caseId/similar-cases` | Verified precedents |
| GET | `/cases/:caseId/resolutions` | Resolution history |
| POST | `/cases/:caseId/resolutions` | Record a resolution (creates draft) |
| GET | `/resolutions/:id` | Single resolution |
| POST | `/resolutions/:id/submit` | Submit for verification |
| POST | `/resolutions/:id/review` | Start review (verifier) |
| POST | `/resolutions/:id/verify` | Verify → becomes precedent |
| POST | `/resolutions/:id/reject` | Reject with a reason (audit) |
| GET | `/taxonomy` | Blocker taxonomy |
| GET | `/precedents` | Verified precedents across cases |

## Schema

New enums `resolution_status` and `bottleneck_type`; new tables `case_resolutions` and `intelligence_audit_logs`, plus a partial index on verified resolutions for precedent lookup.

Apply with `npm run db:migrate`. The seed creates three verified precedents on *other* cases (deliberately not the flagship, so it is retrievable rather than self-referential).

## Frontend

- `frontend/src/types/intelligence.ts` — mirrors the API contract.
- `frontend/src/components/intelligence/IntelligencePanel.tsx` — the "why is this case stuck" Case 360 block.
- `frontend/src/components/intelligence/ResolutionPanel.tsx` — record / submit / review / verify / reject.
- Rendered at the top of `CaseDetailPage`, above the existing stage and document panels.

The resolution form enforces the same minimum field lengths the backend schema requires, so an incomplete resolution is explained in the UI instead of failing as a 400.

## Not implemented

- **Semantic / vector precedent search** — `pgvector` is unavailable. Structured matching is used instead.
- **Analytics dashboards** and **scenario prediction** — out of scope for this iteration.