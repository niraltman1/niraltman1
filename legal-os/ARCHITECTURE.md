# Legal-OS — Architecture Reference

## 1. Monorepo Layout

```
legal-os/
├── apps/
│   ├── dashboard/          # React + Vite + TailwindCSS — RTL Hebrew UI (port 5173 dev)
│   └── installer/          # PowerShell START-HERE.ps1 — Windows one-click setup
├── packages/
│   ├── ai/                 # OllamaClient — wraps local Ollama HTTP API
│   ├── api/                # Express REST server (port 3001)
│   │   └── src/
│   │       ├── modules/    # Feature modules: canvas, evidence, gmail, security, updates
│   │       ├── routes/     # REST endpoints (one file per resource)
│   │       └── utils/      # Shared utilities: MediaPipeline, RAG worker, seed, etc.
│   ├── database/           # better-sqlite3 repositories + MigrationRunner
│   │   └── src/queries/    # One repository class per table group
│   └── shared/             # TypeScript interfaces shared across packages
├── migrations/             # SQL files 001–022, run exactly once by MigrationRunner
├── powershell/
│   ├── lib/Config.ps1      # Office root: C:\אלטמן משרד עורכי דין - סדר 2026
│   └── scripts/
│       ├── 01-SystemCheck.ps1      # RAM/GPU detection → AI tier decision
│       ├── 02-SetupAIModels.ps1    # Pull base model → create legal-brain alias
│       ├── 03-CreateFolderStructure.ps1
│       └── …
├── Modelfile               # Ollama definition for law-il-E2B (high-end hardware)
├── Modelfile.gemma2        # Ollama definition for gemma2:9b / 2b (standard / low)
└── ARCHITECTURE.md         # This file
```

## 2. Data Flow

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
RAG Worker (Ollama — legal-brain)
  ├── Batch of 3 unenriched documents per cycle (60s interval)
  ├── Extracts: caseNumber, courtName, judgeName, charges, nextHearing, procedureType
  ├── DocumentInsights table (per-document AI entities)
  ├── Documents.ai_enriched = 1
  ├── Cases.judge_name / court_name / procedure_type (when case matched)
  └── Canvas enrichment (court receipt + PDF signature detection)
       │
       ▼
SQLite Database (_data/legal-os.db)
  ├── FTS5 full-text search (fts_documents, fts_study_questions)
  └── 22 migrations (idempotent, MigrationRunner)
       │
       ▼
Express REST API (port 3001)
       │
       ▼
React Dashboard (RTL Hebrew, Vite, TanStack Query)
```

## 3. V13 Modules

| ID | Module | Key Files | Status |
|----|--------|-----------|--------|
| A | Canvas Workflow | `modules/canvas/`, `routes/canvas.ts` | Complete |
| B | Evidence Locker | `modules/evidence/`, `routes/evidence.ts`, `queries/evidence.ts` | Complete |
| C | Stens Library | `routes/stens.ts`, `queries/stens.ts`, `features/stens/` | Complete |
| D | Gmail Bridge | `modules/gmail/`, `routes/gmail.ts`, `queries/gmail.ts` | Complete |
| E | AES-256 Vault | `modules/security/aes-cipher.ts`, `key-provider.ts` | Complete |
| F | Update Channels | `modules/updates/`, `routes/updates.ts` | Complete |

### Gmail Bridge (Module D) Detail

- OAuth 2.0 flow via `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REDIRECT_URI`
- Token encrypted at rest with AES-256-GCM (same key as backup encryption)
- Sync: Gmail label filter → fetch attachments → `EvidenceLocker.lock()` (chain of custody)
- Enabled only when `GMAIL_ENABLED=true`
- Sync runs on-demand (POST `/api/gmail/configs/:id/sync`) — no automatic scheduler by default

## 4. Database Schema Summary (22 Migrations)

| Range | Tables Added |
|-------|-------------|
| 001–004 | Clients, Cases, Documents, ProcessedFiles, QueueItems |
| 005–008 | ActionPlans, Tasks, Templates, BackupSnapshots |
| 006 | WorkerHealth, WatcherEvents |
| 009–010 | TrafficCases, TrafficCaseAlerts |
| 011–013 | Contacts, CaseContacts |
| 014 | Cases.judge_name / procedure_type; Documents.ai_enriched |
| 015 | DocumentInsights (RAG extraction results) |
| 016 | AcademicSubjects, AcademicCourses, StudyQuestions, GraphNodes + FTS5 |
| 017 | EvidenceItems, EvidenceChain |
| 018 | StensTemplates, StensSubmissions |
| 019 | CanvasDocuments, CanvasTasks |
| 020 | GmailSyncConfig, GmailSyncLog |
| 021 | UpdateLog |
| 022 | DocumentCanvas (canvas-document enricher) |

## 5. Security Model

### Data Firewall (Zero-Root Rule)

Chen's medical/nursing materials must never enter the legal system.

Blocked by `EXCLUDED_PATTERNS` in `media-pipeline.ts`:
- Hebrew: `/סיעוד/`, `/רפואה/`, `/חן/`
- English: `/Nursing/`, `/Medical/`, `/Healthcare/`, `/Chen/`

**Context-Aware Bypass:** Paths under `ACADEMIC_ROOT` env var are allowed — they feed the Academic Hub for law students, not the legal case system.

### Evidence Chain of Custody

`EvidenceLocker.lock()` computes SHA-256 hash, copies to `_evidence/<sha256[0:2]>/<sha256[2:]>`, records chain entry with timestamp and source app. Immutable once locked.

### EVIDENCE_AUTO_LOCK

When `EVIDENCE_AUTO_LOCK=1`, every file successfully ingested via `MediaPipeline` is also locked to the Evidence Locker (fire-and-forget). Default: off, to avoid double-storage.

### Backup Encryption

`BACKUP_ENCRYPT=1` enables AES-256-GCM encryption of SQLite backup snapshots.
Key priority: `BACKUP_ENCRYPT_KEY` env → scrypt(BACKUP_PASSPHRASE + hostname) → Windows DPAPI.

### 100% Offline

No document text is ever sent to external APIs. All AI inference runs locally via Ollama (`legal-brain` alias).

## 6. AI Engine Selection

| Hardware Tier | RAM | Base Model | Modelfile |
|---------------|-----|------------|-----------|
| High | ≥ 16 GB | `hf.co/BrainboxAI/law-il-E2B:Q4_K_M` | `Modelfile` |
| Standard | 8–15 GB | `gemma2:9b` | `Modelfile.gemma2` |
| Low | < 8 GB | `gemma2:2b` | `Modelfile.gemma2` (FROM rewritten) |

Regardless of tier, the Ollama alias `legal-brain` is always created. The Node.js server always uses `OLLAMA_MODEL=legal-brain`.

`01-SystemCheck.ps1` detects RAM + GPU → sets `$Script:AI_TIER` + `$Script:AI_BASE_MODEL`.
`02-SetupAIModels.ps1` pulls the model and runs `ollama create legal-brain`.

## 7. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `LEGAL_OS_DB_PATH` | `_data/legal-os.db` | SQLite database path |
| `OLLAMA_MODEL` | `legal-brain` | Ollama model name (set to `legal-brain` by installer) |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `WHISPER_EXE` | `<LEGAL_OS_ROOT>\tools\whisper-fast.exe` | Whisper binary path |
| `FFMPEG_EXE` | `ffmpeg` | ffmpeg binary (PATH or full path) |
| `WHISPER_MODEL` | `medium` | Whisper model size |
| `LEGAL_OS_ROOT` | `process.cwd()` | Root for `tools/` directory |
| `ACADEMIC_ROOT` | _(empty)_ | Semicolon-separated paths that bypass Data Firewall |
| `BACKUP_ENCRYPT` | _(off)_ | Set to `1` to encrypt backup snapshots |
| `BACKUP_ENCRYPT_KEY` | _(empty)_ | Raw hex key for backup encryption |
| `BACKUP_PASSPHRASE` | _(empty)_ | Passphrase → scrypt → backup key |
| `LOCKER_ROOT` | `<cwd>/_evidence` | Evidence Locker storage root |
| `EVIDENCE_AUTO_LOCK` | _(off)_ | Set to `1` to auto-lock all ingested files |
| `GMAIL_ENABLED` | _(off)_ | Set to `true` to enable Gmail Bridge |
| `GMAIL_CLIENT_ID` | _(required if Gmail enabled)_ | Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | _(required if Gmail enabled)_ | Google OAuth client secret |
| `GMAIL_REDIRECT_URI` | `http://localhost:3001/api/gmail/callback` | OAuth redirect URI |
| `AI_TIER` | _(set by installer)_ | `high` \| `standard` \| `low` |
| `RAG_INTERVAL_MS` | `60000` | RAG worker polling interval |
| `RAG_BATCH_SIZE` | `3` | Documents per RAG cycle |
