# Factum-IL — Task Tracker

## Phase 0 — Stability ✅ COMPLETE
- TypeScript typecheck errors fixed across 7 packages
- vitest 1.x → 3.x upgrade
- CSV parser fixed (Hebrew mid-field quote)
- GitHub Actions CI wired
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
- `@factum-il/evals` — golden datasets, eval runner, precision/recall metrics
- `@factum-il/ai-guardrails` — hallucination detector, citation verifier, confidence gate
- Streaming Ollama client + SSE endpoint in API

## Phase 4 — Agent Layer ✅ COMPLETE
- `@factum-il/agent-core` — tool-runner (parallel), prompt-builder (Hebrew 5-step), ollama-caller (graceful degradation), agent-runner (confidence gate + human-review flag)
- `db-tools.ts` — 4 Tool factories (case, documents, tasks, hearings)
- Case Summarizer — POST /api/agents/summarize
- Timeline Builder — POST /api/agents/timeline
- Research Agent — POST /api/agents/research (with guardrail check)
- migrations/045 — AgentResults table

## Phase 5 — Document Intelligence
- OCRmyPDF integration
- `@factum-il/litigation-intelligence` — procedural completeness, risk scoring
- PDF annotation layer
- Docling integration

## Phase 6 — Extensibility
- `@factum-il/sdk` — plugin SDK
- RBAC multi-attorney roles
