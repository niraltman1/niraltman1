# Client Management

## Overview

The Client Card system provides full CRUD for law firm clients with real-time Israeli ID validation, case association, and a chronological timeline view.

## Israeli ID Validation

Every client record supports an optional `id_number` field. When the field is populated in the UI, the `useIsraeliIdValidation` hook validates it in real time using the Israeli Ministry of the Interior Luhn variant:

1. Strip non-numeric characters and left-pad to 9 digits.
2. For each digit at index `i`, multiply by `(i % 2) + 1`.
3. If the product exceeds 9, subtract 9.
4. Sum all values; the result must be divisible by 10.

The underlying function `validateIsraeliId()` lives in `packages/shared/src/utils/index.ts` and is reused by the hook.

## Client Form (slide-over panel)

**Route trigger:** "לקוח חדש" button on `/clients`

**Fields:**

| Field | Required | Validation |
|-------|----------|------------|
| `nameHe` | Yes | Non-empty string |
| `nameEn` | No | — |
| `idType` | No (default: `personal`) | `personal \| company \| passport \| other` |
| `idNumber` | No | Real-time Luhn — red/green feedback |
| `phone` | No | — |
| `email` | No | — |
| `addressHe` | No | — |
| `notes` | No | — |

On submit → `POST /api/clients` → redirect to `/clients/:id`.

## Client Card (`/clients/:id`)

Three tabs:

- **תיקים** — all cases linked to this client; click to navigate to `/cases/:id`
- **מסמכים** — documents where `client_id` matches; badge shows processing state
- **ציר זמן** — `ClientTimeline` component; reads `ProcessingStatus` transitions for all case documents

## API Endpoints Required

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/api/clients` | `ClientRepository.list(page, pageSize)` |
| `GET` | `/api/clients/:id` | `ClientRepository.findById(id)` |
| `POST` | `/api/clients` | `ClientRepository.create(input)` |
| `PATCH` | `/api/clients/:id` | `ClientRepository.update(id, updates)` |
| `GET` | `/api/clients/:id/timeline` | `CaseRepository.getTimeline(caseId)` for all client cases |

## Timeline Event Structure

```typescript
interface TimelineEvent {
  id:           number;
  documentId:   number;
  documentName: string;
  documentType: string | null;
  state:        string;     // target state after transition
  prevState:    string;     // origin state
  agent:        string;     // worker that performed the transition
  success:      boolean;
  errorMessage: string | null;
  occurredAt:   string;     // ISO-8601
}
```
