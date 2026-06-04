# Client Management — Factum-IL v1.0.0

## Overview

The Client Card system provides full CRUD for law firm clients with real-time Israeli ID validation, case association, RBAC access control, entity graph links, and a chronological timeline view.

---

## RBAC Access Control

Client records are subject to role-based access control (`packages/policy-engine`):

| Role | Access to clients |
|------|------------------|
| `admin` | Full CRUD — all clients |
| `attorney` | Full CRUD — clients linked to their assigned cases |
| `assistant` | Read + create; no delete |
| `reviewer` | Read-only |
| `read_only` | Read-only |

**Attorney isolation:** An attorney can only see clients associated with cases assigned to them via `CaseAssignments`. Unassigned clients are not returned by `GET /api/clients` for `attorney` role.

---

## Israeli ID Validation

Every client record supports an optional `id_number` field. When populated in the UI, the `useIsraeliIdValidation` hook validates it in real time using the Israeli Ministry of the Interior Luhn variant:

1. Strip non-numeric characters and left-pad to 9 digits
2. For each digit at index `i`, multiply by `(i % 2) + 1`
3. If the product exceeds 9, subtract 9
4. Sum all values — result must be divisible by 10

The underlying function `validateIsraeliId()` lives in `packages/shared/src/utils/index.ts` and is reused by the hook and by the pipeline entity router.

---

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

---

## Client Card (`/clients/:id`)

Four tabs:

- **תיקים** — all cases linked to this client; click to navigate to `/cases/:id`
- **מסמכים** — documents where `client_id` matches; badge shows processing state
- **ציר זמן** — `ClientTimeline` component; reads `ProcessingStatus` transitions for all case documents
- **ישויות** — Entity graph links for this client (from `Entities` + `EntityRelations` tables, migration 055)

---

## Entity Graph Links (Entities Table, migration 055)

Client records are linked to the entity graph:

```sql
Entities (
  id          INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,   -- 'person' | 'company' | 'court' | 'address' | 'phone'
  canonical   TEXT NOT NULL,   -- normalised canonical form
  display     TEXT NOT NULL,   -- display form (Hebrew)
  client_id   INTEGER REFERENCES Clients,
  case_id     INTEGER REFERENCES Cases,
  created_at  TEXT DEFAULT (datetime('now'))
)

EntityRelations (
  id            INTEGER PRIMARY KEY,
  from_entity   INTEGER REFERENCES Entities,
  to_entity     INTEGER REFERENCES Entities,
  relation_type TEXT NOT NULL,  -- 'represents' | 'opposes' | 'witnesses' | 'resides_at'
  case_id       INTEGER REFERENCES Cases,
  created_at    TEXT DEFAULT (datetime('now'))
)
```

The entity router (`entity-router.ts` in `packages/pipeline`) automatically creates `Entities` rows when Israeli ID numbers, company names, or court identifiers are extracted from documents. The client card's "ישויות" tab visualises these relationships.

---

## API Endpoints

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/api/clients` | `ClientRepository.list(page, pageSize)` — filtered by RBAC |
| `GET` | `/api/clients/:id` | `ClientRepository.findById(id)` — RBAC check |
| `POST` | `/api/clients` | `ClientRepository.create(input)` |
| `PATCH` | `/api/clients/:id` | `ClientRepository.update(id, updates)` |
| `DELETE` | `/api/clients/:id` | Admin only |
| `GET` | `/api/clients/:id/timeline` | Timeline events for all client cases |
| `GET` | `/api/clients/:id/entities` | Entity graph nodes and relations for this client |

---

## Timeline Event Structure

```typescript
interface TimelineEvent {
  id:           number;
  documentId:   number;
  documentName: string;
  documentType: string | null;
  state:        string;         // target state after transition
  prevState:    string;         // origin state
  agent:        string;         // worker that performed the transition
  success:      boolean;
  errorMessage: string | null;
  occurredAt:   string;         // ISO-8601
}
```

Timeline events are sourced from `ProcessingStatus` transitions for all documents linked to all cases of this client.

The `GET /api/clients/:id/timeline` endpoint also includes:
- Court hearings from `CourtHearings` (migration 028)
- Calendar events from `CalendarEvents` (migration 028) linked to client cases
- Agent execution completions from `AgentExecutionLog`

---

## Stub Clients (Auto-Created by Entity Router)

When the pipeline extracts a new Israeli ID number from a document, the entity router auto-creates a stub client if no matching client exists:

```
nameHe: "לקוח <id>"
idType: 'personal'
id_number: <extracted_id>
is_active: 1
```

Stub clients appear immediately in the clients list. An attorney should review and update `nameHe` and other fields once the client's actual details are confirmed.

---

## FTS5 Search

Clients are indexed in `fts_clients` (migration 002). The search normaliser applies Hebrew prefix stripping and synonym expansion before querying FTS5.

```
GET /api/clients?q=כהן&page=1&pageSize=20
```

Searches `nameHe`, `nameEn`, `notes` fields in FTS5 with BM25 ranking.
