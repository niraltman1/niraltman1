# Factum-IL Architecture — v1.0.0

## System Overview

Factum-IL is a **local-first** document management, CRM, and AI-assisted legal operating system for Israeli boutique law firms. All data remains on-device. No cloud services, telemetry, or external API calls with user data occur after installation.

> For the full architecture diagram and deeper technical detail, see `ARCHITECTURE.md` in the repository root (if present). This document is a concise reference summary.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS (RTL Hebrew) |
| State | Zustand, TanStack Query |
| Routing | React Router v6 |
| Desktop shell | C# WPF + WebView2 (Windows-only; Electron is forbidden) |
| Backend | Node.js + Express 4 |
| Database | SQLite via better-sqlite3 — WAL mode, FTS5, sqlite-vec |
| AI runtime | Ollama local — BrainboxAI/law-il-E2B:Q4_K_M only |
| Audio | ffmpeg + whisper-fast.exe (Hebrew speech-to-text) |
| OCR | Tesseract 5 + Ghostscript + pdftotext |
| Testing | Vitest (unit + integration + chaos), Playwright (e2e) |
| Package mgmt | pnpm workspaces (monorepo) |
| Installer | Inno Setup 6 via publish.ps1 |

---

## Monorepo Structure — 25 Packages

```
apps/
  dashboard/           React 19 + Vite + Tailwind — primary UI (RTL Hebrew)
  FactumIL.Desktop/    C# WPF + WebView2 — Windows desktop shell

packages/
  shared/              Types, state machine, PII sanitizer, utils
  database/            SQLite connection, repositories, migration runner (60 migrations)
  legal-ontology/      Israeli court taxonomy, citation types, Hebrew synonyms
  events/              Internal event bus (OCR → AI notifications)
  observability/       Metrics, structured logging, health probes
  model-router/        Ollama client, health check, 5-step reasoning chain
  policy-engine/       RBAC — 5 roles: admin, attorney, assistant, reviewer, read_only
  memory/              Per-case memory, session persistence
  retrieval/           RAG retrieval, vector search, hybrid FTS5 + sqlite-vec
  ai/                  AI orchestration, OllamaClient, ConfidenceCalculator
  ai-guardrails/       Hallucination detection, PII strip, confidence thresholds
  citation-engine/     Nevo 2021 / כללי הציטוט האחיד deterministic citation parser
  pipeline/            Document processing pipeline, OCR, hashing, queue
  evals/               Golden-set evaluation suite for AI accuracy regression
  orchestrator/        Agent coordination, policy enforcement, lock management
  agent-core/          5 AI agents (Summarize, Timeline, Research, Contract-Review, Discovery)
  support-diagnostics/ Crash bundle, PII-scrubbed diagnostic reports
  update-core/         Update check, version manifest, rollback types
  litigation-intelligence/ Deadline risk scoring, procedural completeness (20 rules)
  enterprise-hooks/    Plugin framework — sandboxed external tool integration
  encrypted-backup/    AES-256-GCM hourly backup scheduler
  sdk/                 Public SDK for external integrations
  api/                 Express API — all HTTP routes
```

**Dependency rule:** `database` has no internal dependencies. All other packages may depend on `database`. No circular dependencies.

---

## Database Architecture

Two SQLite files:

| File | Content |
|------|---------|
| `factum-il.db` | Primary: entities, FTS5, queue, audit, RBAC, rules |
| `_data.db` | Chunks and embeddings — attached as `data_store` schema |

**60 migrations** (001–060), forward-only, SHA-256 checksummed in `_migrations` table.

Key extensions:
- **FTS5** — Hebrew full-text search with prefix normalisation and synonym expansion
- **sqlite-vec** — KNN vector search for semantic retrieval (`vec_chunks` table, migration 052)

---

## AI Architecture

### Single Model Policy

**One model only:** `BrainboxAI/law-il-E2B:Q4_K_M` via Ollama at `http://127.0.0.1:11434`.

### 5-Step Reasoning Chain

Every AI call executes:
1. Context loading
2. Classification
3. Legal authority anchoring
4. Conflict / risk identification
5. Conclusion in formal Israeli legal Hebrew

### 5 AI Agents (packages/agent-core + packages/orchestrator)

| Agent | Purpose |
|-------|---------|
| Summarize | Full case summary in Hebrew |
| Timeline | Chronological event extraction |
| Research | Relevant case law retrieval |
| Contract-Review | Risk and missing-clause detection |
| Discovery | Pre-hearing evidence completeness check |

All agents run in `CaseExecutionContext` with RBAC, isolated memory, and vector retrieval.

### Health Check

Before every Ollama call: `GET http://127.0.0.1:11434/api/tags`. If Ollama is down, the AI step is skipped, a warning is logged, and processing continues. The system never crashes on AI unavailability.

---

## RBAC — 5 Roles

Implemented in `packages/policy-engine`:

| Role | Access |
|------|--------|
| `admin` | Full system access, repair endpoints, user management |
| `attorney` | All cases they are assigned to; can sign action plans |
| `assistant` | Read + upload; cannot sign or run agents |
| `reviewer` | Read-only + review queue approval |
| `read_only` | Read-only access to assigned cases |

---

## Background Workers (6 total)

Managed by `packages/supervisor`. All disabled when `FACTUM_IL_SAFE_MODE=1`:

1. RAG worker — embeds and enriches documents on a `RAG_INTERVAL_MS` schedule
2. File watcher — monitors watched directories for new documents
3. Backup scheduler — AES-256-GCM encrypted backup every hour
4. Update scheduler — checks `FACTUM_IL_VERSION` against release manifest
5. FTS healing service — auto-rebuilds broken FTS5 index
6. Queue processor — dequeues and processes `QueueItems`

---

## Document Processing State Machine

```
DISCOVERED → HASHED → OCR_PENDING → OCR_COMPLETE → CLASSIFIED → ENRICHED → REVIEW_PENDING → APPLIED → VERIFIED
                                                                         ↓ (any failure)
                                                                       FAILED → ROLLED_BACK
```

All transitions are atomic (SQLite transaction). Every transition is logged to `ProcessingStatus`.

---

## Security Guarantees

- No data leaves the machine — all AI inference is local via Ollama
- Attorney-client privilege enforced — document content, client names, and case details are never logged externally
- PII sanitization in all log sinks (`packages/shared/src/logging/sanitizer.ts`)
- Data Firewall (Zero-Root Rule) — medical/nursing content blocked at intake
- AES-256-GCM encrypted hourly backups
- No external API calls with user data — enforced at architecture level
