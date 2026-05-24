# Factum-IL — Task Tracker

## Phase 0 — Stability ✅ COMPLETE
- TypeScript typecheck errors fixed across 7 packages
- vitest 1.x → 3.x upgrade
- CSV parser fixed (Hebrew mid-field quote)
- GitHub Actions CI wired (typecheck + test + evals jobs)
- Husky pre-commit hooks wired
- PII redacted from all console.log calls

## Phase 1 — Infrastructure Spine ✅ COMPLETE
- `@factum-il/events` — typed domain event bus, idempotent handlers, dead-letter queue
- `@factum-il/observability` — AsyncLocalStorage trace IDs, metrics SQLite sink, Express middleware
- `@factum-il/model-router` — per-model circuit breakers, routing policies
- migrations/040 — Metrics table
- migrations/041 — EventStore, EventHandlerLog, DeadLetterQueue
- RAG worker migrated from 60s polling → event-driven (OCRCompleted)
- activity-emitter wired to EventBus

## Phase 2 — Intelligence Foundation ✅ COMPLETE
- `@factum-il/legal-ontology` — entity types, court hierarchy, synonym registry (migration 042)
- `@factum-il/memory` — case memory, session store, context assembler (migration 043)
- `@factum-il/retrieval` — clause chunker, embedder, hybrid BM25+vector search (migration 044)

## Phase 3 — AI Safety ✅ COMPLETE
- `@factum-il/evals` — golden datasets, eval runner, precision/recall metrics, CI regression job
- `@factum-il/ai-guardrails` — hallucination detector, citation verifier, confidence gate
- Streaming Ollama client + SSE endpoint in API

## Phase 4 — Agent Layer ✅ COMPLETE
- `@factum-il/agent-core` — tool-runner (parallel), prompt-builder (Hebrew 5-step), ollama-caller (graceful degradation), agent-runner (confidence gate + human-review flag)
- `db-tools.ts` — 4 Tool factories (case, documents, tasks, hearings)
- Case Summarizer — POST /api/agents/summarize
- Timeline Builder — POST /api/agents/timeline
- Research Agent — POST /api/agents/research (with guardrail check)
- migrations/045 — AgentResults table

## Phase 5 — Document Intelligence ✅ COMPLETE
- OCRmyPDF fast lane in pipeline (deskew + rotate-pages → pdftotext, fallback to Ghostscript+Tesseract)
- Docling OCR lane (layout-aware, 3rd fallback before Ghostscript)
- `@factum-il/litigation-intelligence` — completeness checker (seeded from Rules_Engine), risk scorer (weighted 40/30/20/10), evidence gap analyzer, contradiction detector, filing dependency graph
- migrations/046: ProceduralChecklist + RiskAssessments tables
- DocumentVersions + Annotations tables (migrations/047) + repositories in database
- PDF annotation types: highlight, note, redline, bookmark

## Phase 6 — Extensibility ✅ COMPLETE
- `@factum-il/sdk` — plugin manifest validator, ExtensionPointRegistry (fire hooks across plugins), loadPlugin with capability sandboxing; 8/8 tests
- RBAC: admin/attorney/assistant/reviewer/read_only roles + requireRole middleware
- Contract Review Agent — POST /api/agents/contract-review (clauses, risks, missing sections; always flagForReview)
- Discovery Agent — POST /api/agents/discovery (pre-computes evidence gaps + completeness via litigation-intelligence; always flagForReview)
- db-tools: makeDocumentTool, makeDocumentInsightsTool, makeCaseEvidenceTool
- Local SHA-256 e-signature system — migration/048 (DocumentSignatures table), 5 API endpoints, DocumentSigningPanel UI
- Eval regression suite — baselines/v1.json, regression.ts, run-evals.ts, CI job

## Phase 7 — Control Plane ✅ COMPLETE
- `@factum-il/orchestrator` — workflow stage coordinator (STAGE_ORDER enforcement), document-level advisory lock, idempotency deduplication engine
- `@factum-il/policy-engine` — memory write policy (FACT=allow, AI_SUMMARY=threshold-gated, AI_HYPOTHESIS=deny), agent run policy (deny if already running), retrieval policy stub
- migrations/049 — WorkflowStates, WorkflowIdempotencyLog, AgentRunRegistry tables
- `memory-guard.ts` (additive) — guardMemoryWrite filter in @factum-il/memory
- `deterministic-wrapper.ts` (additive) — stable secondary sort + session cache in @factum-il/retrieval
- `execution-guard.ts` (additive) — canRunAgent / markAgentCompleted / markAgentFailed in @factum-il/agent-core
- 5 control-plane observability metrics added to @factum-il/observability

## Agent Workspace UI ✅ COMPLETE
- `/agents` page — 5-agent tab workspace (summarize, timeline, discovery, contract-review, research)
- `AgentOutputPanel` — reusable component (confidence bar, tool accordion, review banner, Ollama badge)
- CaseDetail — collapsible "בינה מלאכותית" section (סכם תיק | בנה ציר זמן | נתח גילוי ראיות)
- DocumentDetail — "סקירת חוזה AI" button + inline AgentOutputPanel
- Sidebar — סוכני AI nav item

## Monorepo Structure (21 packages + 2 apps)

```
apps/dashboard      ← React 19 RTL, 20+ feature modules
apps/installer      ← PowerShell Windows installer

packages/
  agent-core        ← AgentRunner, tool-runner, execution-guard
  ai                ← OllamaClient, circuit breaker, streaming
  ai-guardrails     ← hallucination detector, citation verifier, confidence gate
  api               ← Express, 40+ routes
  citation-engine   ← Israeli citation parser (Nevo 2021)
  database          ← SQLite + FTS5 + 49 migrations, 17+ repositories
  evals             ← golden datasets, eval runner, regression suite
  events            ← typed domain event bus, event store
  legal-ontology    ← entity types, court hierarchy, synonyms
  litigation-intelligence ← completeness checker, risk scorer, evidence gaps
  memory            ← case memory, session store, memory-guard
  model-router      ← per-model circuit breakers, routing policies
  observability     ← pino logger, metrics SQLite sink, trace IDs
  orchestrator      ← workflow stage coordinator, idempotency engine
  pipeline          ← OCR (OCRmyPDF+Docling+Tesseract), file watcher
  policy-engine     ← memory/agent/retrieval policy rules
  retrieval         ← clause chunker, embedder, hybrid BM25+vector, deterministic-wrapper
  sdk               ← plugin manifest, ExtensionPointRegistry, loadPlugin
  shared            ← types, logging, state-machine, metrics
```

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry

Next available: **050**

## Phase 8 — Case-Isolated Intelligence Architecture ✅ COMPLETE (2026-05-24)

### What was completed this session
All 4 additive layers of the architecture audit are implemented and green. Strictly no breaking changes.

**Layer 1 — DB Architecture & Native Vector Performance**
- `packages/database/src/connection.ts` — ATTACH `_data.db` AS data_store on every non-memory connection; skipped for `:memory:` and read-only
- `migrations/052_vec_chunks.sql` — SKIP_ON_ERROR pragma; `vec_chunks` vec0 virtual table + sync trigger for ChunkEmbeddings
- `packages/retrieval/src/hybrid-search.ts` — native sqlite-vec KNN path with JS cosine fallback; audit warn when caseId absent
- `packages/retrieval/package.json` — `sqlite-vec ^0.1.6` dependency

**Layer 2 — CaseExecutionContext + User Isolation**
- `packages/agent-core/src/case-execution-context.ts` — `computeCaseStateHash`, `checkExecutionValidity` (returns `isStale`, never throws)
- `packages/agent-core/src/case-isolation-domain.ts` — RBAC v1 (active user + case existence), `AuthorizationError`, `createCaseDomain` factory

**Layer 3 — Case-Scoped Facades**
- `packages/retrieval/src/case-scoped-retriever.ts` — `createCaseScopedRetriever(caseId, db)`
- `packages/memory/src/case-scoped-memory.ts` — `createCaseScopedMemory`, `CaseScopedSessionStore` (key prefix isolation)

**Layer 4 — API Route Wiring**
- `packages/api/src/middleware/case-execution-guard.ts` — `withCaseExecutionGuard` (INSERT OR IGNORE → 409 AGENT_BUSY)
- `packages/api/src/routes/agents.ts` — all 5 routes use guard + markAgentCompleted/Failed + `{ isStale, staleReason }` response
- `packages/policy-engine/src/agent-policy.ts` — NULL-safe SQL fix: `IS ?` → `(= ? OR (IS NULL AND ? IS NULL))`

### Draft PR
https://github.com/niraltman1/niraltman1/pull/8

### What to do next
- Review & merge PR #8 when ready
- Consider adding per-attorney `CaseAssignments` table for RBAC v2 (hook point is marked in `case-isolation-domain.ts`)
- Consider moving DocumentChunks + ChunkEmbeddings + OCRCache to the `data_store` schema now that ATTACH is live

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)

Next available: **053**

## CI Status
All checks pass locally from repo root (post-hoist):
- `pnpm install --frozen-lockfile` ✓ (21 workspace packages)
- `pnpm -r typecheck` ✓ (0 errors across all 21 packages)
- `pnpm -r test` ✓ (278 tests across all packages)
- `pnpm --filter @factum-il/evals eval` ✓ (eval regression passed)
