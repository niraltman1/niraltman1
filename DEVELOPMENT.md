# Factum-IL — Claude Code Reference

## Quick Commands

```bash
# Development (both servers concurrently)
pnpm dev

# Build all packages
pnpm -r build

# Build specific package
pnpm --filter @factum-il/api build
pnpm --filter @factum-il/dashboard build

# Tests
pnpm test

# Type-check all packages
pnpm -r typecheck

# Install all dependencies
pnpm install
```

## Architecture

Monorepo managed with pnpm workspaces.

```
factum-il/
├── apps/
│   ├── dashboard/          # React 19 + Vite + TailwindCSS (RTL Hebrew UI, port 5173 dev)
│   └── FactumIL.Desktop/   # C# WPF + WebView2 — Windows-only desktop shell
├── packages/
│   ├── shared/             # TypeScript interfaces and types shared across all packages
│   ├── database/           # better-sqlite3 repositories + MigrationRunner (WAL, FTS5, sqlite-vec)
│   ├── legal-ontology/     # Israeli legal taxonomy, court hierarchy, procedure type definitions
│   ├── events/             # In-process event bus (typed publish/subscribe)
│   ├── observability/      # Metrics, structured logging, PII-safe log sinks
│   ├── model-router/       # AI model selection and health-check wrapper
│   ├── policy-engine/      # RBAC policy evaluation (admin/attorney/assistant/reviewer/read_only)
│   ├── memory/             # Per-case conversation memory (SQLite-backed, case-scoped)
│   ├── retrieval/          # sqlite-vec KNN retrieval, hybrid search (FTS5 + vector)
│   ├── ai/                 # OllamaClient — wraps local Ollama HTTP API, 5-step reasoning chain
│   ├── ai-guardrails/      # Input/output safety filters, PII detection, privilege protection
│   ├── citation-engine/    # Deterministic Israeli citation parser (Nevo 2021 / כללי הציטוט האחיד)
│   ├── pipeline/           # Document processing pipeline (OCR multi-lane, audio, enrichment)
│   ├── evals/              # AI evaluation harness, regression test fixtures
│   ├── orchestrator/       # Multi-agent task orchestration, step sequencing
│   ├── agent-core/         # Base agent interface, tool registry, CaseExecutionContext
│   ├── support-diagnostics/# Crash reporting, health diagnostics, safe-mode coordinator
│   ├── update-core/        # Auto-update checks, version management, UpdateLog
│   ├── litigation-intelligence/ # Litigation analytics, deadline risk scoring
│   ├── enterprise-hooks/   # Extension points for enterprise customization
│   ├── encrypted-backup/   # AES-256-GCM scheduled backups, restore pipeline
│   ├── sdk/                # Public TypeScript SDK for external integrations
│   └── api/                # Express REST server (port 3001) — all 40+ route modules
├── migrations/             # SQL files 001–060, run exactly once by MigrationRunner
├── powershell/
│   ├── lib/
│   │   ├── Config.ps1              # Office root: C:\אלטמן משרד עורכי דין - סדר 2026
│   │   ├── Legal_Registry.json     # 126-entry Net HaMishpat offline case taxonomy
│   │   └── User_Extensions/        # gitignored user deadline-rule overrides (.gitkeep tracked)
│   └── scripts/
│       ├── 01-CreateFolderStructure.ps1
│       ├── 01-SystemCheck.ps1
│       ├── 02-SetupAIModels.ps1
│       ├── 11-Open-Workspace.ps1
│       └── …
├── publish.ps1             # 12-step staging pipeline → FactumIL_Dist\
├── installer.iss           # Inno Setup 6 production installer script
└── Modelfile               # Ollama model definition for law-il-E2B
```

## AI Model — BrainboxAI/law-il-E2B

The **only** permitted AI model for this project:

```
BrainboxAI/law-il-E2B:Q4_K_M
```

This model is trained specifically on Israeli law, court verdicts, and legal Hebrew. No other model may be used for any AI feature in this project — not for testing, not as a fallback, not as an alternative.

```bash
# Pull via Ollama's native HF registry handler
ollama pull hf.co/BrainboxAI/law-il-E2B:Q4_K_M
```

**5-step Hebrew reasoning chain (all AI responses follow this structure):**
1. Context (הקשר) — establish the case facts
2. Classification (סיווג) — identify legal procedure type
3. Authorities (סמכויות) — cite relevant statutes and precedents
4. Conflict/Risk (סיכון וסתירות) — identify contradictions and deadline risks
5. Conclusion (מסקנה) — actionable legal summary

**Health-check before every call:** `GET http://127.0.0.1:11434/api/tags`
If Ollama is down: skip AI step, log a warning (no document content), continue pipeline — never crash.

## Database

SQLite via `better-sqlite3` (fully synchronous API — no async/await in repositories).

Two database files:
- `factum-il.db` — primary: schema, metadata, indexes, FTS5
- `_data.db` — attached as `data_store`: document chunks, embeddings (heavy data)

**Key database rules:**
- `DatabaseConnection.prepare()` takes 0 type parameters — use `.all() as Type[]` for typing
- All migrations are forward-only, tracked in `_migrations` table, wrapped in transactions
- WAL mode is always on; FTS5 for full-text search; sqlite-vec for KNN vector search
- PRAGMA statements must appear before `BEGIN TRANSACTION` in migration files

### All Migrations (001–060)

| Migration | Tables / Changes Added |
|-----------|----------------------|
| 001 | Clients, Lawyers, Judges, Cases, Documents |
| 002 | FTS5 virtual tables (fts_documents) |
| 003 | ActionLog, ProcessingStatus |
| 004 | AIEnrichment |
| 005 | QueueItems (WAL queue, poison queue) |
| 006 | WorkerHealth, WatcherEvents |
| 007 | supervisor/watcher tables |
| 008 | ActionPlan |
| 009 | TrafficCases |
| 010 | TrafficCaseAlerts |
| 011 | Contacts |
| 012 | CaseContacts |
| 013 | ContactsExt (CRM roles) |
| 014 | Cases.judge_name, procedure_type, statute_deadline; Documents.ai_enriched |
| 015 | DocumentInsights (per-document AI extraction results) |
| 016 | AcademicSubjects, AcademicCourses, StudyQuestions, GraphNodes + fts_study_questions |
| 017 | EvidenceItems, EvidenceChain |
| 018 | StensTemplates, StensSubmissions |
| 019 | CanvasDocuments, CanvasTasks |
| 020 | GmailSyncConfig, GmailSyncLog |
| 021 | UpdateLog |
| 022 | DocumentCanvas |
| 023 | fix_search_meta_trigger, VacuumSessions |
| 024 | LearningFeedback, PipelineLogs |
| 025 | ComplexCrmRoles |
| 026 | PrecedentCaching |
| 027 | PaymentLedger |
| 028 | CourtHearings (hearing_date, court_name, room, judge_name, reminder_sent) |
| 029 | InsolvencyModule (debt-arrangement proceedings) |
| 030 | CaseLawRegistry (precedent tagging) |
| 031 | CitationRegistry |
| 032 | ContactAudit, ClientsExt |
| 033 | ExcelImportSessions |
| 034 | TrafficDrivingLicense |
| 035 | CitationEngine (citation match cache) |
| 036 | SecurityCompliance |
| 037 | Reliability / observability tables |
| 038 | CivilStandardProcedure |
| 039 | Cases.registry_status (`mapped` \| `manual_review_required`) |
| 040 | EventsLog (typed event bus persistence) |
| 041 | ObservabilityMetrics |
| 042 | RBACRoles, RBACPermissions, RBACUserRoles |
| 043 | AgentRuns (agent execution log) |
| 044 | CaseExecutionContexts (case-scoped AI context) |
| 045 | VectorChunks (sqlite-vec embeddings, attached to data_store) |
| 046 | RetrievalCache |
| 047 | MemorySnapshots (per-case conversation memory) |
| 048 | GuardrailsLog (AI safety filter decisions) |
| 049 | EvalResults (AI evaluation harness results) |
| 050 | LitigationScores (deadline risk + litigation analytics) |
| 051 | UpdateChannels, UpdateManifest |
| 052 | BackupManifest, RecoveryLog |
| 053 | SupportTickets, DiagnosticsSnapshot |
| 054 | Rules_Engine (20 seeded Israeli procedural rules, 9 procedure types) |
| 055 | Entities, EntityRelations (knowledge graph) |
| 056 | CorpusDocuments, CorpusChunks (offline legislation corpus) |
| 057 | KnessetBills, KnessetVersions (Knesset OData corpus) |
| 058 | WikiSourcePages (WikiSource legislation corpus) |
| 059 | CitationLinks (citation graph edges) |
| 060 | EntityEnrichmentLog |

## API Routes

Base URL: `http://localhost:3001/api/`

| Prefix | Module |
|--------|--------|
| `/clients` | ClientRepository CRUD |
| `/cases` | CaseRepository CRUD |
| `/documents` | DocumentRepository + processing status |
| `/search` | FTS5 full-text search |
| `/queue` | Job queue stats + requeue |
| `/action-plan` | Approve / reject / sign rename plans |
| `/tasks` | Task management |
| `/legal-engine` | Document templates |
| `/media` | File ingest + audio pipeline |
| `/traffic` | Traffic case management |
| `/contacts` | Contacts CRM |
| `/studies` | Academic Hub — subjects, courses, questions, graph nodes |
| `/admin/repair/fts` | Rebuild FTS5 index |
| `/admin/repair/rag` | Requeue unenriched documents |
| `/admin/repair/manifest` | Validate installer manifest |
| `/admin/repair/integrity` | SQLite PRAGMA integrity_check |
| `/admin/repair/replay` | Replay failed pipeline events |
| `/agents/summarize` | Summarize agent |
| `/agents/timeline` | Timeline reconstruction agent |
| `/agents/research` | Legal research agent |
| `/agents/contract-review` | Contract review agent |
| `/agents/discovery` | Discovery / evidence agent |
| `/ai-stream` | Streaming AI responses (SSE) |
| `/diagnostics` | Support diagnostics + health snapshot |
| `/recovery` | RecoveryWindow — safe-mode restore |
| `/updates` | Update check + manifest |
| `/canvas` | Canvas documents + tasks |
| `/evidence` | Evidence Locker (chain of custody) |
| `/gmail` | Gmail Bridge (OAuth + attachment sync) |
| `/citations` | Citation lookup + registry |
| `/case-law` | Precedent registry |
| `/signatures` | Document signing workflow |
| `/events` | Event bus query |
| `/activity` | Activity feed |
| `/notifications` | Notifications inbox |
| `/calendar` | Calendar + court hearings |
| `/rules` | Rules Engine (Israeli procedural rules) |
| `/annotations` | Document annotations |
| `/workbench/legal` | Legal Workbench |

## Environment Variables (25)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `FACTUM_IL_DB_PATH` | `_data/factum-il.db` | Primary SQLite database path |
| `FACTUM_IL_ROOT` | `process.cwd()` | Installation root (set by installer in registry) |
| `FACTUM_IL_DATA_PATH` | `_data/_data.db` | Attached data store for chunks + embeddings |
| `FACTUM_IL_VERSION` | _(set by installer)_ | Installed version string (registry + runtime) |
| `FACTUM_IL_SAFE_MODE` | _(off)_ | Set to `1` to disable all background workers |
| `OLLAMA_MODEL` | `BrainboxAI/law-il-E2B:Q4_K_M` | Ollama model identifier — never change |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `WHISPER_EXE` | `<FACTUM_IL_ROOT>\tools\whisper-fast.exe` | Whisper speech-to-text binary |
| `FFMPEG_EXE` | `ffmpeg` | ffmpeg binary (PATH or absolute path) |
| `WHISPER_MODEL` | `medium` | Whisper model size |
| `SQLITE_VEC_PATH` | `<FACTUM_IL_ROOT>\tools\sqlite-vec.dll` | sqlite-vec extension DLL path |
| `BACKUP_ENCRYPT` | _(off)_ | Set to `1` to enable AES-256-GCM backup encryption |
| `BACKUP_ENCRYPT_KEY` | _(empty)_ | Raw hex key for backup encryption |
| `AI_TIER` | _(set by installer)_ | Hardware tier: `high` \| `standard` \| `low` |
| `RAG_INTERVAL_MS` | `60000` | RAG worker polling interval (ms) |
| `RAG_BATCH_SIZE` | `3` | Documents per RAG enrichment cycle |
| `FACTUM_IL_ADMIN_PASS` | _(required)_ | Admin password for `/admin` routes |
| `NODE_ENV` | `development` | `production` in installed builds |
| `ACADEMIC_ROOT` | _(empty)_ | Semicolon-separated paths that bypass Data Firewall (Academic Hub) |
| `EVIDENCE_AUTO_LOCK` | _(off)_ | Set to `1` to auto-lock all ingested files to Evidence Locker |
| `GMAIL_ENABLED` | _(off)_ | Set to `true` to enable Gmail Bridge |
| `GMAIL_CLIENT_ID` | _(required if Gmail enabled)_ | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | _(required if Gmail enabled)_ | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | `http://localhost:3001/api/gmail/callback` | OAuth redirect URI |

**8 registry env vars set by installer (machine-level, persist across reboots):**
`FACTUM_IL_ROOT`, `WHISPER_EXE`, `FFMPEG_EXE`, `OLLAMA_MODEL`, `AI_TIER`, `SQLITE_VEC_PATH`, `OLLAMA_BASE_URL`, `FACTUM_IL_VERSION`

## Coding Conventions

- **Hebrew strings in UI:** All user-facing labels are in Hebrew (RTL). Use `dir="rtl"` on container elements.
- **`exactOptionalPropertyTypes: true`:** Use conditional spreads for optional DB fields: `...(value ? { field: value } : {})`.
- **Repository pattern:** All DB access through repository classes in `packages/database/src/queries/`. No raw SQL outside repositories.
- **Error responses:** `{ success: false, error: { code: string, message: string } }` — codes from `errors/codes.ts`.
- **Async handlers:** All Express routes use `asyncHandler()` wrapper — no try/catch in route handlers.
- **No `any` types** without an explicit justification comment. Strict mode is always on.
- **Database queries:** `db.prepare().all() as Type[]` — never use `db.prepare<[], Type>()` (not generic).
- **No comments unless non-obvious:** Only document hidden invariants or non-obvious constraints.
- **Package dependencies:** Always add `@factum-il/database` to `package.json` before importing from it.

## Audio Pipeline (WhatsApp Voice Notes)

Files `.ogg`, `.m4a`, `.mp3`, `.wav` are routed through `packages/pipeline/src/audio-pipeline.ts`:
1. ffmpeg converts non-WAV audio → 16kHz mono WAV
2. `whisper-fast.exe` transcribes to Hebrew text (language: `he`)
3. Transcript stored as `ocr_text` in Documents table

Graceful degradation: if `WHISPER_EXE` not found, file is registered without transcript.

## Agent Layer (5 Agents)

All agents implement the base interface from `packages/agent-core` and run within a `CaseExecutionContext` (case-scoped RBAC + isolated memory + retrieval).

| Agent | Route | Function |
|-------|-------|----------|
| Summarize | `/agents/summarize` | Produce a structured Hebrew case summary |
| Timeline | `/agents/timeline` | Reconstruct chronological event timeline from documents |
| Research | `/agents/research` | Query legislation corpus and precedent registry |
| Contract-Review | `/agents/contract-review` | Identify risks and obligations in contracts |
| Discovery | `/agents/discovery` | Evidence inventory and gap analysis |

All agents: health-check Ollama before calling, degrade gracefully if down, never log document content.

## Academic Hub

Routes: `/studies/*` in API, `/studies` in dashboard.

- **Subjects & Courses:** hierarchical course organization
- **StudyQuestions:** multiple-choice exam prep (auto-generated via law-il-E2B)
- **GraphNodes:** mind map / concept graph per course
- **FTS5:** full-text search on `fts_study_questions`

## Safe Mode

When `FACTUM_IL_SAFE_MODE=1`:
- All background workers are disabled (RAG worker, file watcher, backup scheduler)
- API server starts in read-only mode
- RecoveryWindow is available at `/recovery`
- Used after a failed update or detected database corruption

## Data Firewall (Zero-Root Rule)

Medical/nursing content must never enter the legal pipeline.

Blocked by `EXCLUDED_PATTERNS` in the pipeline package:
- Hebrew: `/סיעוד/`, `/רפואה/`, `/חן/`
- English: `/Nursing/`, `/Medical/`, `/Healthcare/`, `/Chen/`

Paths under `ACADEMIC_ROOT` bypass this filter for the Academic Hub only.
