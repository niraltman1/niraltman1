# Action Plan

## Overview

The Action Plan is the human-approval gate between document discovery and filesystem mutation. The UI never moves or renames files directly; it generates a `SignedActionPlan` JSON blob that the pipeline engine reads and executes.

## Data Model

```sql
ActionPlan (
  plan_id        TEXT PRIMARY KEY,          -- UUID v4
  document_id    INTEGER REFERENCES Documents,
  original_name  TEXT NOT NULL,
  suggested_name TEXT,
  source_folder  TEXT NOT NULL DEFAULT 'ידני', -- e.g. "תיקיית הורדות"
  original_path  TEXT NOT NULL,
  suggested_path TEXT,                      -- always under FactumIL_Root
  action_type    TEXT CHECK IN ('RENAME','MOVE','RENAME_AND_MOVE','SKIP'),
  status         TEXT CHECK IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED'),
  ai_enriched    INTEGER DEFAULT 0,
  confidence     REAL CHECK BETWEEN 0.0 AND 1.0,
  signed_at      TEXT,
  executed_at    TEXT,
  error_message  TEXT,
  created_at     TEXT,
  updated_at     TEXT
)
```

## Source Attribution

Every entry carries a `source_folder` label derived from the WatchFolder that detected the file:

| WatchFolder path | source_folder value |
|-----------------|---------------------|
| `$HOME\Downloads` | `תיקיית הורדות` |
| `$HOME\Documents` | `תיקיית מסמכים` |
| Manual upload | `ידני` |

The UI renders a colour-coded badge per source.

## Workflow

```
FileWatcher detects file
       │
       ▼
ActionPlan entry created (status=PENDING)
       │
       ▼
Human reviews in ActionPlanPage
  ├─ Approve → status=APPROVED, signed_at=now()
  └─ Reject  → status=REJECTED
       │
       ▼ (only when ≥1 APPROVED)
"חתום על תוכנית" button
  → POST /api/action-plan/sign {planIds}
  → getSignedPlan() returns SignedActionPlan JSON
  → Pipeline engine executes FS operations
       │
       ▼
markExecuted(planId, success)
  ├─ success → status=EXECUTED
  └─ failure → status=FAILED + error_message
```

## SignedActionPlan Structure

```typescript
interface SignedActionPlan {
  signedAt:     string;           // ISO-8601
  entries:      ActionPlanEntry[];
  totalEntries: number;
}
```

## Suggested Path Convention

All `suggested_path` values must be absolute paths under the branded office root:

```
C:\אלטמן משרד עורכי דין - סדר 2026\<SubFolder>\<filename>
```

The UI truncates the root prefix to show only the sub-folder portion in the table column.

## Safety Guarantees

- The pipeline executes a ManifestSnapshot before any move operation.
- Every executed action is logged to ActionLog (see `docs/recovery.md`).
- REJECTED entries can never be approved again without a new PENDING entry.
- The UI sign button is disabled until at least one entry has `status = 'APPROVED'`.
