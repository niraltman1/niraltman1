# Action Plan — Factum-IL v1.0.0

## Overview

The Action Plan is the human-approval gate between document discovery and filesystem mutation. The UI never moves or renames files directly; it generates a `SignedActionPlan` JSON blob that the pipeline engine reads and executes.

**RBAC requirement:** Signing an action plan (`POST /api/action-plan/sign`) requires the `attorney` role. Assistants can approve individual entries but cannot sign the plan.

---

## Data Model

```sql
ActionPlan (
  plan_id        TEXT PRIMARY KEY,          -- UUID v4
  document_id    INTEGER REFERENCES Documents,
  original_name  TEXT NOT NULL,
  suggested_name TEXT,
  source_folder  TEXT NOT NULL DEFAULT 'ידני',  -- e.g. "תיקיית הורדות"
  original_path  TEXT NOT NULL,
  suggested_path TEXT,                      -- always under FactumIL_Root
  action_type    TEXT CHECK IN ('RENAME','MOVE','RENAME_AND_MOVE','SKIP'),
  status         TEXT CHECK IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED'),
  ai_enriched    INTEGER DEFAULT 0,
  confidence     REAL CHECK BETWEEN 0.0 AND 1.0,
  signed_by      INTEGER REFERENCES Users,  -- attorney who signed
  signed_at      TEXT,
  executed_at    TEXT,
  error_message  TEXT,
  created_at     TEXT,
  updated_at     TEXT
)
```

---

## Source Attribution

Every entry carries a `source_folder` label derived from the WatchFolder that detected the file:

| WatchFolder path | source_folder value |
|-----------------|---------------------|
| `%USERPROFILE%\Downloads` | `תיקיית הורדות` |
| `%USERPROFILE%\Documents` | `תיקיית מסמכים` |
| Manual upload | `ידני` |

The UI renders a colour-coded badge per source.

---

## Workflow

```
FileWatcher detects file
       │
       ▼
Data Firewall check (EXCLUDED_PATTERNS)
  ├─ Blocked → reject, log DATA_FIREWALL_BLOCKED
  └─ Allowed ↓
       │
       ▼
ActionPlan entry created (status=PENDING)
       │
       ▼
Human reviews in ActionPlanPage (assistant or attorney)
  ├─ Approve → status=APPROVED
  └─ Reject  → status=REJECTED
       │
       ▼ (only when ≥1 APPROVED)
"חתום על תוכנית" button (attorney role required)
  → POST /api/action-plan/sign {planIds}
  → RBAC check: must be attorney role
  → getSignedPlan() returns SignedActionPlan JSON
  → Pipeline engine executes FS operations
       │
       ▼
markExecuted(planId, success)
  ├─ success → status=EXECUTED
  └─ failure → status=FAILED + error_message
```

---

## RBAC Enforcement

```typescript
// packages/api/src/routes/action-plan.ts
router.post('/sign', requireRole('attorney'), async (req, res) => {
  const { planIds } = req.body;
  // attorney must be assigned to the case of each plan entry
  await enforceAssignment(req.user, planIds);
  // ...
});
```

- Reviewing and approving entries: `assistant` role or higher
- Signing the plan: `attorney` role only
- The sign button in the UI is hidden for `assistant` and lower roles

---

## SignedActionPlan Structure

```typescript
interface SignedActionPlan {
  signedAt:      string;           // ISO-8601
  signedBy:      number;           // user ID of the attorney
  entries:       ActionPlanEntry[];
  totalEntries:  number;
}
```

---

## API Endpoints

| Method | Path | Role required |
|--------|------|--------------|
| `GET` | `/api/action-plan` | `assistant` |
| `GET` | `/api/action-plan/:id` | `assistant` |
| `POST` | `/api/action-plan/approve/:id` | `assistant` |
| `POST` | `/api/action-plan/reject/:id` | `assistant` |
| `POST` | `/api/action-plan/sign` | `attorney` |
| `GET` | `/api/action-plan/signed/:id` | `attorney` |

---

## Suggested Path Convention

All `suggested_path` values must be absolute paths under the branded office root:

```
C:\אלטמן משרד עורכי דין - סדר 2026\<SubFolder>\<filename>
```

The UI truncates the root prefix to show only the sub-folder portion in the table column.

---

## Safety Guarantees

- The pipeline executes a `ManifestSnapshot` before any move operation
- Every executed action is logged to `ActionLog` (see `docs/recovery.md`)
- `REJECTED` entries can never be approved again without a new `PENDING` entry
- The UI sign button is disabled until at least one entry has `status = 'APPROVED'`
- The sign button is hidden entirely for non-attorney roles
- `signed_by` records the attorney's user ID for the immutable audit trail

---

## Confidence and Review Thresholds

| Confidence | Outcome |
|-----------|---------|
| ≥ 0.75 | Auto-approved (if `ai_enriched = 1`) — still requires human sign |
| 0.50–0.74 | `REVIEW_PENDING` — must be manually reviewed before approval |
| < 0.50 | Flagged for correction in the Action Queue before entering the plan |

AI confidence never overrides the human approval step. Every action plan must be signed by an attorney regardless of confidence score.
