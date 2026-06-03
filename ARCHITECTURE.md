# Factum-IL — Architecture Reference

## 1. Monorepo Layout

```
factum-il/
├── apps/
│   ├── dashboard/          # React 19 + Vite + TailwindCSS — RTL Hebrew UI (port 5173 dev)
│   └── FactumIL.Desktop/   # C# WPF + WebView2 — Windows-only desktop shell
├── packages/               # 25 shared packages (see section 2)
│   ├── shared/
│   ├── database/
│   │   └── src/queries/    # One repository class per table group
│   ├── legal-ontology/
│   ├── events/
│   ├── observability/
│   ├── model-router/
│   ├── policy-engine/
│   ├── memory/
│   ├── retrieval/
│   ├── ai/
│   ├── ai-guardrails/
│   ├── citation-engine/
│   ├── pipeline/
│   ├── evals/
│   ├── orchestrator/
│   ├── agent-core/
│   ├── support-diagnostics/
│   ├── update-core/
│   ├── litigation-intelligence/
│   ├── enterprise-hooks/
│   ├── encrypted-backup/
│   ├── sdk/
│   └── api/
│       └── src/
│           ├── modules/    # Feature modules: canvas, evidence, gmail, security, updates
│           ├── routes/     # REST endpoints (one file per resource, 40+ routes)
│           └── utils/      # MediaPipeline, RAG worker, legal-registry-loader, ingest-adapter
├── migrations/             # SQL files 001–060, run exactly once by MigrationRunner
├── powershell/
│   ├── lib/
│   │   ├── Config.ps1              # Office root: C:\אלטמן משרד עורכי דין - סדר 2026
│   │   ├── Legal_Registry.json     # 126-entry Net HaMishpat offline case taxonomy
│   │   └── User_Extensions/        # gitignored user deadline-rule overrides (.gitkeep tracked)
│   └── scripts/
│       ├── 01-CreateFolderStructure.ps1
│       ├── 01-SystemCheck.ps1      # RAM/GPU detection → AI tier decision
│       ├── 02-SetupAIModels.ps1    # Pull law-il-E2B model
│       ├── 11-Open-Workspace.ps1   # Per-case workspace launcher (opens Explorer)
│       └── …
├── publish.ps1             # 12-step staging pipeline → FactumIL_Dist\
├── installer.iss           # Inno Setup 6 production installer script
└── Modelfile               # Ollama definition for law-il-E2B
```

## 2. Package Dependency Map

`database` has NO internal dependencies — everything else may depend on it. No circular dependencies permitted.

```
shared          ← no internal deps
database        ← shared
legal-ontology  ← shared, database
events          ← shared
observability   ← shared
model-router    ← shared, ai
policy-engine   ← shared, database
memory          ← shared, database
retrieval       ← shared, database
ai              ← shared, database
ai-guardrails   ← shared, ai
citation-engine ← shared, database, legal-ontology
pipeline        ← shared, database, ai, ai-guardrails
evals           ← shared, ai
orchestrator    ← shared, agent-core, events
agent-core      ← shared, database, ai, policy-engine, memory, retrieval
support-diagnostics ← shared, database, observability
update-core     ← shared, database
litigation-intelligence ← shared, database, ai
enterprise-hooks ← shared
encrypted-backup ← shared, database
sdk             ← shared
api             ← all of the above
```

## 3. Data Flow

```
Windows File System
       │
       ▼
FileWatcher (chokidar)
       │  WatcherEvents table
       ▼
Queue (QueueItems table)
       │  background worker polling every 5s
       ▼
MediaPipeline.ingest()
  ├── Data Firewall (EXCLUDED_PATTERNS — blocks medical/nursing content)
  ├── Hash dedup → ProcessedFiles registry
  ├── Image → Tesseract OCR → searchable PDF
  ├── Audio → ffmpeg → whisper-fast → Hebrew transcript
  ├── Documents table (storage_path, ocr_text, file_hash)
  └── EVIDENCE_AUTO_LOCK=1 → EvidenceLocker.lock()
       │
       ▼
Event Bus (packages/events — in-process typed pub/sub)
       │  EventsLog table (migration 040) for persistence
       ▼
RAG Worker (Ollama — BrainboxAI/law-il-E2B:Q4_K_M)
  ├── Batch of 3 unenriched documents per cycle (60s interval)
  ├── 5-step reasoning chain: Context → Classification → Authorities → Conflict/Risk → Conclusion
  ├── Extracts: caseNumber, courtName, judgeName, charges, nextHearing, procedureType
  ├── DocumentInsights table (per-document AI entities)
  ├── Documents.ai_enriched = 1
  ├── Entities / EntityRelations (knowledge graph, migration 055)
  ├── Cases.judge_name / court_name / procedure_type (when case matched)
  └── Canvas enrichment (court receipt + PDF signature detection)
       │
       ├── AI Guardrails (packages/ai-guardrails)
       │    └── GuardrailsLog table (migration 048)
       │
       ▼
SQLite Databases
  ├── factum-il.db  — schema, metadata, FTS5 indexes, agent state, RBAC
  └── _data.db      — VectorChunks (sqlite-vec KNN), CorpusChunks (attached as data_store)
       │
       ├── sqlite-vec extension (KNN vector search)
       │    └── Loaded from SQLITE_VEC_PATH at DB open
       ├── FTS5 (full-text search — fts_documents, fts_study_questions)
       └── WAL mode (always on)
       │
       ▼
Agent Layer (packages/agent-core + packages/orchestrator)
  ├── CaseExecutionContext (case-scoped RBAC + memory + retriever)
  ├── 5 agents: summarize, timeline, research, contract-review, discovery
  └── AgentRuns table (execution log, migration 043)
       │
       ▼
Express REST API (port 3001) — 40+ route modules
       │
       ▼
React 19 Dashboard (RTL Hebrew, Vite, TanStack Query)
  or
WPF Desktop Shell (WebView2 → http://localhost:3001)
```

## 4. Full Migration Table (001–060)

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

**Migration runner rules:**
- Each file runs exactly once; completion recorded in `_migrations` table
- PRAGMA statements (e.g., `journal_mode`, `foreign_keys`) must precede `BEGIN TRANSACTION`
- All DDL wrapped in `BEGIN TRANSACTION … COMMIT`
- MigrationRunner is in `packages/database/src/migration-runner.ts`

## 5. Security Model

### RBAC (Role-Based Access Control)

Five roles defined in RBACRoles (migration 042):

| Role | Capabilities |
|------|-------------|
| `admin` | Full access including `/admin/repair/*`, user management, safe-mode toggle |
| `attorney` | All case/client/document operations, agent invocation, evidence locker |
| `assistant` | Read/write cases and documents, no agent invocation, no evidence deletion |
| `reviewer` | Read-only access to cases, documents, citations |
| `read_only` | Read-only access to non-sensitive data |

RBAC is evaluated by `packages/policy-engine` per route, using `CaseExecutionContext` for agent calls.

### Data Firewall (Zero-Root Rule)

Medical/nursing content must never enter the legal pipeline.

Blocked by `EXCLUDED_PATTERNS` in `packages/pipeline`:
- Hebrew: `/סיעוד/`, `/רפואה/`, `/חן/`
- English: `/Nursing/`, `/Medical/`, `/Healthcare/`, `/Chen/`

Paths under `ACADEMIC_ROOT` env var bypass this filter for the Academic Hub only.

### Evidence Chain of Custody

`EvidenceLocker.lock()` computes SHA-256 hash, copies to `_evidence/<sha256[0:2]>/<sha256[2:]>`, records chain entry with timestamp and source app. Immutable once locked.

When `EVIDENCE_AUTO_LOCK=1`, every file successfully ingested via `MediaPipeline` is also locked to the Evidence Locker automatically. Default: off.

### Backup Encryption

`BACKUP_ENCRYPT=1` enables AES-256-GCM encryption of SQLite backup snapshots via `packages/encrypted-backup`.
Key priority: `BACKUP_ENCRYPT_KEY` env → scrypt(BACKUP_PASSPHRASE + hostname) → Windows DPAPI.
Backups run on a scheduled interval; `BackupManifest` and `RecoveryLog` are tracked in the DB.

### Safe Mode

When `FACTUM_IL_SAFE_MODE=1`:
- All background workers are disabled (RAG worker, file watcher, backup scheduler)
- API server starts in read-only mode
- `/recovery` (RecoveryWindow) is available for restore operations
- Coordinated by `packages/support-diagnostics`

### PII Sanitization

All log sinks in `packages/observability` strip before writing to disk:
- Israeli ID numbers (9-digit)
- Phone patterns (`05x…`)
- Email addresses

Document content is never logged anywhere.

### 100% Offline

No document text is ever sent to external APIs. All AI inference runs locally via Ollama at `http://127.0.0.1:11434`. The only permitted model is `BrainboxAI/law-il-E2B:Q4_K_M`.

## 6. AI Engine

One model. No alternatives. No fallbacks to other models.

```
BrainboxAI/law-il-E2B:Q4_K_M
```

Trained on Israeli law, court verdicts, and legal Hebrew. Understands Israeli court structure (שלום, מחוזי, עליון, עבודה, משפחה), procedural rules, and deadline logic.

**Ollama integration:**
- URL: `http://127.0.0.1:11434` (set by `OLLAMA_BASE_URL`)
- Model string: hardcoded, never read from user input
- Health-check before every call: `GET /api/tags`
- On failure: skip AI step, emit warning event, continue pipeline

**AI packages:**
- `packages/ai` — OllamaClient, 5-step reasoning chain
- `packages/ai-guardrails` — input/output safety filters, GuardrailsLog
- `packages/model-router` — health-check wrapper, graceful degradation
- `packages/evals` — evaluation harness, regression fixtures
- `packages/memory` — per-case conversation memory (MemorySnapshots)
- `packages/retrieval` — sqlite-vec KNN + FTS5 hybrid search

## 7. Environment Variables (25)

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
| `ACADEMIC_ROOT` | _(empty)_ | Semicolon-separated paths bypassing the Data Firewall (Academic Hub) |
| `EVIDENCE_AUTO_LOCK` | _(off)_ | Set to `1` to auto-lock all ingested files to Evidence Locker |
| `GMAIL_ENABLED` | _(off)_ | Set to `true` to enable Gmail Bridge |
| `GMAIL_CLIENT_ID` | _(required if Gmail enabled)_ | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | _(required if Gmail enabled)_ | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | `http://localhost:3001/api/gmail/callback` | OAuth redirect URI |

**8 registry env vars written at install time (machine-level, HKLM):**
`FACTUM_IL_ROOT`, `WHISPER_EXE`, `FFMPEG_EXE`, `OLLAMA_MODEL`, `AI_TIER`, `SQLITE_VEC_PATH`, `OLLAMA_BASE_URL`, `FACTUM_IL_VERSION`

## 8. Installer Staging Layout (FactumIL_Dist\)

Output of `publish.ps1` (12-step pipeline), consumed by `installer.iss`:

```
FactumIL_Dist\
  shell\        WPF desktop shell (FactumIL.Desktop.exe + .NET / WebView2 DLLs)
  backend\      Express API server + flat production node_modules
  dashboard\    Compiled React UI (Vite output)
  migrations\   SQL files 001–060 (applied on first run)
  runtime\      Portable node.exe (no Node.js installation required on end-user machine)
  tools\        OllamaSetup.exe + WebView2 bootstrapper + sqlite-vec.dll
  models\       law-il-E2B-Q4_K_M.gguf (~1.3 GB)
  powershell\   Legal Registry + helper scripts
```
