# Factum IL Architecture — Phase 1

## System Overview

Factum IL is a **local-first** document management and CRM operating system for Israeli boutique law firms. All data remains on-device. No cloud services, telemetry, or external APIs are used after installation.

## Technology Stack

| Layer           | Technology                                   |
|-----------------|----------------------------------------------|
| Frontend        | React 19, TypeScript, Vite, TailwindCSS      |
| State           | Zustand, TanStack Query                      |
| Routing         | React Router v6                              |
| Icons           | Phosphor Icons                               |
| Desktop Runtime | WebView2 wrapper (Electron is forbidden)     |
| Backend/Auto    | PowerShell 7 (5.1-compatible)                |
| Database        | SQLite 3 – WAL mode, FTS5                    |
| AI Runtime      | Ollama (local) – model: law-il-E2B           |
| OCR             | Tesseract OCR + Ghostscript + pdftotext      |
| Testing         | Pester (PowerShell), Vitest, Playwright      |
| Package Mgmt    | pnpm workspaces (monorepo)                   |

## Repository Structure

```
/factum-il
 ├── /apps
 │    ├── dashboard        React 19 UI
 │    ├── installer        START-HERE.ps1 + helper scripts
 │    └── cli              Node.js CLI (Phase 2)
 ├── /packages
 │    ├── shared           Types, state machine, logging, utils
 │    ├── database         SQLite connection + repositories + migration runner
 │    ├── ai               OllamaClient, ConfidenceCalculator
 │    └── pipeline         FileQueue, HashService, ManifestService
 ├── /powershell           PowerShell module (FactumIL.psm1)
 │    └── /modules         Logger, StateMachine, ActionLog, ManifestSnapshot, HashValidator
 ├── /schemas              Canonical database schema SQL
 ├── /migrations           Ordered SQL migration files (001, 002, 003, 004…)
 ├── /tests
 │    ├── /powershell      Pester test suite
 │    ├── /unit            Vitest unit tests
 │    ├── /integration     Vitest integration tests
 │    └── /e2e             Playwright end-to-end tests
 ├── /docs                 Architecture, setup, recovery docs
 ├── /logs                 Runtime log files (gitignored)
 ├── /manifests            Manifest snapshot cache (gitignored)
 └── /samples              Sample test documents
```

## Document Processing State Machine

```
DISCOVERED
    ↓
  HASHED
    ↓
OCR_PENDING
    ↓
OCR_COMPLETE
    ↓
CLASSIFIED
    ↓ (or direct to REVIEW_PENDING)
ENRICHED
    ↓
REVIEW_PENDING
    ↓
APPLIED
    ↓
VERIFIED

Any state → FAILED → ROLLED_BACK → DISCOVERED (retry)
```

**Rules:**
- All transitions are atomic (SQLite transaction)
- Every transition is written to `ProcessingStatus` table
- A `ManifestSnapshot` is taken before any file mutation
- An `ActionLog` entry is written for every file operation
- `FAILED` → `ROLLED_BACK` restores the original file and resets metadata

## Seven-Agent Architecture

| Agent | Responsibility |
|-------|---------------|
| GovernanceController | Orchestrate all agents, enforce architecture, manage state machine |
| Provisioner | Install dependencies, configure environment, bootstrap DB |
| PipelineEngine | OCR, file hashing, auto-rotation, queue processing |
| AIStrategist | Ollama integration, enrichment passes, confidence scoring |
| DataArchitect | SQLite schema, FTS5 indexing, CRM entities, migrations |
| UIUXLead | React dashboard, RTL, keyboard navigation, Spotlight search |
| QASyncOrchestrator | Test suites, validation pipelines, rollback testing |

## Database Schema (Key Tables)

| Table              | Purpose |
|--------------------|---------|
| `Documents`        | File records with hash, paths, OCR text, processing state |
| `Clients`          | CRM client records with Israeli ID validation |
| `Cases`            | Legal case records linked to clients/lawyers/judges |
| `Lawyers`          | Lawyer records with bar numbers |
| `Judges`           | Judge records with court affiliation |
| `ActionLog`        | Immutable audit log of every file mutation |
| `ProcessingStatus` | State machine transition history |
| `ManifestSnapshots`| Pre-mutation file state captures |
| `AIEnrichment`     | LLM enrichment responses with confidence scores |

FTS5 virtual tables: `fts_documents`, `fts_clients`, `fts_cases`

## Confidence Scoring

Confidence is **deterministic** and computed from five weighted signals:

| Signal | Weight |
|--------|--------|
| OCR quality | 25% |
| Regex certainty | 30% |
| AI consistency (advisory, capped at 80%) | 20% |
| Cross-document validation | 15% |
| Metadata completeness | 10% |

Threshold: **≥ 75%** to proceed without manual review.  
AI confidence **never overrides regex authority**.

## AI Isolation Policy

Each enrichment call receives context isolated to a single document.  
LLM context windows must never include:
- Multiple unrelated clients
- Multiple unrelated cases
- Cross-domain documents

## Security

- Fully offline after installation
- No plaintext secrets
- All paths validated (path-traversal prevention)
- Duplicate processing prevention via SHA-256 content hashing
- All privileged operations logged to `ActionLog`
