# Implementation Plan — Agent Streaming Progress (SSE)

> **Scope:** Live, step-aware progress for the 5-step agent reasoning chain. Implements
> **§4.2.4** of [`UX-MODERNIZATION-ROADMAP.md`](./UX-MODERNIZATION-ROADMAP.md) — Phase 0
> (roadmap labels it P2·S; it rides along in the Phase-0 batch).
> **Constraint posture:** strictly local-first. SSE streams from local Ollama / local SQLite
> only. No new external calls; graceful degradation if Ollama is down (CLAUDE.md rule #4).

---

## 1. Context & problem

Long AI runs feel frozen: the UI calls the **non-streaming** agent endpoints, so the user sees
a spinner with no insight into the 5-step chain (Context → Classification → Authorities →
Conflict/Risk → Conclusion).

**Grounded current state (verified in code):**

- A **generic** token SSE endpoint exists: `GET /api/ai/stream?prompt=…`
  (`packages/api/src/routes/ai-stream.ts`) — Bearer auth, prompt-injection guard
  (`isolateInjection`), `AbortController` on client disconnect, emits `data: <token>\n\n`,
  then `data: [DONE]` / `data: [ERROR] …`. Backed by `streamGenerate` from `@factum-il/ai`.
- The agents (`POST /api/agents/summarize|timeline|research`,
  `packages/api/src/modules/agents/*`) run the 5-step chain but return **once, non-streamed**.
- **Lifecycle journal already exists:** `AgentExecutionEvents` table (`migrations/053`) +
  `packages/agent-core/src/execution-journal.ts` (`journalEvent`), with event types
  `execution_started | execution_completed | execution_failed | stale_detected |
  concurrency_blocked | retrieval_fallback | authorization_failed`. Indexed by `execution_id`.

> ⚠️ **Roadmap correction.** §4.2.4 says "all 5 agents expose `/stream` SSE endpoints." That is
> **not accurate** — only the single generic `/api/ai/stream` token endpoint exists, and the
> journal records lifecycle events but **not the 5 reasoning steps**. So the work is: (a) emit
> per-step events into the existing journal, and (b) add a per-execution SSE that tails them.
> This reuses real infrastructure (mig 053 + `journalEvent`) rather than inventing a bus.

---

## 2. Target

```
מסכם תיק…  ▓▓▓▓▓▓░░░░ 60%
✔ שלב 1 הקשר   ✔ שלב 2 סיווג   ⏳ שלב 3 אסמכתאות   ○ סיכון   ○ מסקנה
```

- Five-step rail; each step transitions ○ pending → ⏳ running → ✔ done (or ✗ failed).
- Progress derived from completed-step count / 5.
- Terminal states: completed (show result), failed (show graceful message), Ollama-down (skip
  with a clear warning — no crash).

---

## 3. Approach (chosen)

**Event-tailing SSE over the existing journal** — *not* token streaming — because the
deliverable is *step* progress, and the journal is already the source of truth.

1. **Extend the journal vocabulary** with two additive step events:
   `step_started` and `step_completed`, payload `{ stepNumber: 1..5, stepNameHe }`.
2. **Emit them from the agent runner** at each of the 5 stages.
3. **New SSE endpoint** tails `AgentExecutionEvents` for one `execution_id` and pushes each new
   event to the client; closes on `execution_completed | execution_failed`.
4. **UI** opens the SSE when an agent run starts and renders the step rail.

The generic `/api/ai/stream` token endpoint stays as-is (it can later power a token-level
"typing" view of the final answer; not required for the step rail).

---

## 4. Files to change

### 4.1 MODIFY — `packages/agent-core/src/execution-journal.ts`
Add `'step_started' | 'step_completed'` to `JournalEventType`. No schema change —
`AgentExecutionEvents.payload_json` already stores arbitrary JSON.

### 4.2 MODIFY — agent runner (`packages/agent-core/src/agent-runner.ts` + step orchestration)
Around each of the 5 reasoning steps, call
`journalEvent(db, 'step_started', executionId, caseId, userId, { stepNumber, stepNameHe })`
before and `'step_completed'` after. Wrap so a journal write never throws into the agent path
(`journalEvent` already swallows errors). If Ollama is unreachable, emit `execution_failed`
with a reason and return gracefully (existing degradation behavior preserved).

### 4.3 MODIFY — agent routes (`packages/api/src/modules/agents/*` / `routes`)
Generate/return the `execution_id` to the client when a run starts (so the UI can subscribe).
If runs are synchronous today, return `execution_id` in the response and have the UI replay the
journal; if we want true live streaming, kick the run async and return `execution_id`
immediately. **MVP:** return `execution_id`, UI tails the journal (works for both modes).

### 4.4 NEW — `packages/api/src/routes/agent-events.ts`
`GET /api/agents/:executionId/events/stream` (SSE):
- `requireAuth(repos)`, `text/event-stream`, `flushHeaders()`, `AbortController` on
  `req.on('close')` — mirror `ai-stream.ts` exactly.
- Poll `AgentExecutionEvents WHERE execution_id = ? AND id > ?` every ~500 ms (cheap, local
  SQLite, indexed by `execution_id`), pushing each new row as
  `data: {json}\n\n`; send `[DONE]` after `execution_completed`/`execution_failed`.
- Register in `app.ts` next to `aiStreamRouter`.

### 4.5 NEW — `apps/dashboard/src/api/useAgentStream.ts`
`useAgentStream(executionId)` opens an `EventSource`, accumulates step state into
`{ steps: StepState[5], status }`, cleans up on unmount / `[DONE]`. (Note: `EventSource`
can't set Bearer headers — if the API requires header auth, expose a short-lived query-token
or cookie for SSE, consistent with how `ai-stream` is consumed today; confirm during build.)

### 4.6 MODIFY — agents UI (`apps/dashboard/src/.../agents`)
Replace the opaque spinner with a `<AgentStepRail steps … />` driven by `useAgentStream`.
Show result on completion, graceful warning on failure / Ollama-down.

---

## 5. Reuse (don't reinvent)
- `ai-stream.ts` as the **template** for SSE headers, abort-on-disconnect, `[DONE]`/`[ERROR]`.
- `AgentExecutionEvents` (mig 053) + `journalEvent` — the event store already exists.
- The 5-step Hebrew chain definition in `prompt-builder` for step names/order.

## 6. Risks / edge cases
- **EventSource auth:** browser `EventSource` can't send Authorization headers — resolve auth
  for SSE (query token or cookie) during build; same constraint already applies to `ai-stream`.
- **Polling vs push:** 500 ms journal polling is simple and local; if it ever matters, swap to
  the in-process `@factum-il/events` bus — but don't over-engineer Phase 0.
- **Client disconnect mid-run:** `AbortController` closes the stream; the agent run itself is
  unaffected (journal keeps recording).
- **Ollama down:** runner emits `execution_failed`; UI shows warning, never crashes (rule #4).
- **Multiple concurrent runs:** keyed by `execution_id`, so streams don't cross.

## 7. Verification
- Trigger `POST /api/agents/summarize`; confirm 5 `step_started`/`step_completed` pairs land in
  `AgentExecutionEvents` in order, then `execution_completed`.
- `curl -N /api/agents/<id>/events/stream` shows events arriving live, ending with `[DONE]`.
- UI step rail advances ○→⏳→✔ per step; failure path shows ✗ + message.
- Kill Ollama → run degrades gracefully, rail shows failure, app stays up.
- Typecheck + vitest green.

## 8. Out of scope (tracked elsewhere)
- Token-level "typing" rendering of the final answer (the generic `/api/ai/stream` can power
  this later).
- Cancel-run UI / retry — fast-follow.
- Persisting/replaying historical runs in a dedicated viewer — relates to §4.2.2 review queue.
