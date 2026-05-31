# Implementation Plan — Document-Insight Verification (human-in-the-loop)

> **Scope:** Approve / edit / reject UI for AI-extracted document insights. Implements
> **§4.2.1** of [`UX-MODERNIZATION-ROADMAP.md`](./UX-MODERNIZATION-ROADMAP.md) — Phase 0, P0.
> **Constraint posture:** strictly local-first. No new AI calls (extraction already ran);
> this is a verification surface over existing data. Verified data is the defensible artifact.

---

## 1. Context & problem

AI extracts case#/court/judge with a confidence score, but **AI output is never confirmed by a
human** — there is no approve/reject UI. Unverified AI in a legal product is a liability.

**Grounded current state (verified in code):**

- `GET /documents/:id/insights` → `documents.findInsights(id)`
  (`packages/api/src/routes/documents.ts:37`, `packages/database/src/queries/documents.ts:115`).
- `POST /documents/insights/:id/verify` with body `{ state: 'approved' | 'rejected' }`
  (`documents.ts:47`). It updates `DocumentInsights.verification_state`, writes an audit event
  (`logAuditEvent`) **and** emits a `verification_completed` activity (`emitActivity`). ✅
- Confidence lives in `DocumentInsights.confidence`
  (joined as `ai_confidence` in `documents.ts:107`).

> ⚠️ **Schema reality vs. wireframe.** `findInsights` does `SELECT * … .get(documentId)` — i.e.
> **one row per document**, not one row per extracted field. The §4.2.1 wireframe shows a
> *per-field* table (court / case# / judge, each with its own confidence and ✔/✎/✗). The
> existing `verify` endpoint also keys on a single `insightId`. So:
>
> - **MVP (this plan):** present the insight row's fields read-only with the single
>   row-level `confidence`, and wire **row-level** approve/reject to the existing endpoint.
> - **Field-level verify** (independent confidence + state per field) needs a schema change
>   (a `DocumentInsightFields` table or per-field columns + per-field verify). **Deferred** —
>   flagged below, not built here, to keep Phase 0 small.

**Host surface.** The roadmap places this in the §4.1.2 Document Reader right rail — but the
Reader is **Phase 1 and does not exist yet**. To avoid blocking, host the panel on the existing
**document detail page** now; it will lift into the Reader's right rail unchanged later.

---

## 2. Target (MVP, row-level)

```
תובנות AI — ממתין לאימות                       ביטחון כולל 88%
ביהמ״ש        מחוזי ת״א
מס׳ תיק        ת״א-2024-042
שופט           כהן
                                   [✔ אשר]   [✎ ערוך]   [✗ דחה]
```

- Badge styling by confidence band (e.g. ≥85% green ✔, 60–84% amber, <60% red "מודגש לבדיקה").
- `verification_state` drives the header pill: `pending` / `approved` / `rejected`.
- "✎ ערוך" opens inline edit of the extracted values (PATCH; see §3.3 — optional for MVP, can
  ship as approve/reject only and add edit in a fast-follow).

---

## 3. Files to change

### 3.1 NEW — `apps/dashboard/src/api/useInsights.ts`
React Query: `useDocumentInsights(documentId)` → `GET /documents/:id/insights`;
`useVerifyInsight()` mutation → `POST /documents/insights/:id/verify` with optimistic state
flip + `invalidateQueries(['document-insights', documentId])`.

### 3.2 NEW — `apps/dashboard/src/components/documents/InsightVerificationPanel.tsx`
- Renders the insight row's known fields (court / case# / judge / dates — whatever columns
  `DocumentInsights` exposes) as label→value rows.
- Confidence badge component with the three bands; low-confidence row visually emphasized.
- ✔ / ✗ buttons call `useVerifyInsight`. Disabled + spinner while pending. Empty-state when
  `findInsights` returned `{}` ("אין תובנות AI למסמך זה").

### 3.3 MODIFY (optional, fast-follow) — add edit
If inline edit is in scope: add `PATCH /documents/insights/:id` to update extracted values
before approving, with an audit event mirroring the verify handler. **MVP can omit this** and
ship approve/reject only.

### 3.4 MODIFY — document detail page
Mount `<InsightVerificationPanel documentId={id} />` in the existing document detail view's
side region. (Locate the current detail page under `apps/dashboard/src/.../documents` and add
the panel; no route changes.)

---

## 4. Reuse (don't reinvent)
- The `verify` endpoint, its audit (`logAuditEvent`) + activity (`emitActivity`) wiring — **do
  not duplicate**; the UI just calls it.
- Confidence value already flows through `findInsights` / `ai_confidence`.
- Existing card / badge / button styling from the dashboard component library.

## 5. Risks / edge cases
- **No insights row** → panel shows empty-state, never errors (`findInsights` returns `{}`).
- **Already verified** → show the resulting pill; allow re-verify (endpoint is idempotent on
  `state`), or lock — decide with owner. MVP: allow re-verify.
- **Row-level vs field-level mismatch** → documented above; do not silently fake per-field
  verify against a single-row endpoint.
- **Privilege:** extracted values (case#, judge) are sensitive but stay local; the verify
  handler already audits locally only.

## 6. Verification
- Seed a `DocumentInsights` row with `confidence=0.54`, `verification_state='pending'`.
- Panel renders fields; the row is emphasized (low band); header pill = "ממתין".
- Click ✔ → `POST …/verify {state:'approved'}` → pill flips to "אושר"; an audit row + a
  `verification_completed` activity appear.
- Click ✗ on another → `rejected`. Optimistic UI matches server after refetch.
- Typecheck + vitest green; RTL layout correct.

## 7. Out of scope (tracked elsewhere)
- **Field-level** confidence + per-field verify (needs schema change). → follow-up item.
- The §4.1.2 **Document Reader** itself (Phase 1) — this panel is built to drop into it later.
- Review Queue + correction-learning loop — that's **§4.2.2** (separate Phase 1 item).
