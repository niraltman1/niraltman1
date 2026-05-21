# Factum IL — Claude Code Reference

## Quick Commands

```bash
# Development (both servers concurrently)
pnpm dev

# Build
pnpm --filter @factum-il/api build
pnpm --filter dashboard build

# Tests
pnpm test

# Install all dependencies
pnpm install
```

## Architecture

Monorepo managed with pnpm workspaces:

```
factum-il/
├── apps/
│   ├── dashboard/          # React + Vite + TailwindCSS (RTL Hebrew UI)
│   └── installer/          # PowerShell START-HERE.ps1 (Windows desktop install)
├── packages/
│   ├── ai/                 # OllamaClient — wraps local Ollama HTTP API
│   ├── api/                # Express server :3001 — all REST endpoints
│   ├── citation-engine/    # Deterministic Israeli citation parser (Nevo 2021 / כללי הציטוט האחיד)
│   ├── database/           # better-sqlite3 repositories + migrations runner
│   └── shared/             # TypeScript interfaces shared across packages
├── migrations/             # SQL migration files 001–039, run once by MigrationRunner
├── powershell/             # Windows automation scripts
│   ├── lib/
│   │   ├── Config.ps1              # Office path: C:\אלטמן משרד עורכי דין - סדר 2026
│   │   ├── Legal_Registry.json     # 126-entry Net HaMishpat offline case taxonomy
│   │   └── User_Extensions/        # User deadline-rule overrides (gitignored, .gitkeep tracked)
│   └── scripts/            # 01-CreateFolderStructure, 02-SetupAIModels, 11-Open-Workspace, …
├── Modelfile               # Ollama model definition for law-il-E2B
└── CLAUDE.md               # This file
```

## AI Model — law-il-E2B

The primary AI model is **law-il-E2B** (BrainboxAI Gemma-4-5B, Q4_K_M quantization).

```bash
# Pull via Ollama's native HF registry handler
ollama pull hf.co/BrainboxAI/law-il-E2B:Q4_K_M

# Create local alias with system prompt + parameters
ollama create law-il-E2B -f Modelfile
```

**Environment variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_MODEL` | `law-il-E2B` | Model name used by rag-worker + studies route |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `WHISPER_EXE` | `<FACTUM_IL_ROOT>\tools\whisper-fast.exe` | Whisper speech-to-text binary |
| `FFMPEG_EXE` | `ffmpeg` (PATH) | ffmpeg for audio conversion |
| `WHISPER_MODEL` | `medium` | Whisper model size |
| `FACTUM_IL_ROOT` | `process.cwd()` | Root path for tools/ directory |
| `ACADEMIC_ROOT` | _(empty)_ | Semicolon-separated paths where medical/nursing terms are allowed |
| `FACTUM_IL_DB_PATH` | `_data/factum-il.db` | SQLite database path |

## Database

SQLite via `better-sqlite3` (fully synchronous API — no async/await in repositories).

**Migrations:** numbered files in `migrations/` run via `MigrationRunner` on server start. Each migration runs exactly once (tracked in `_migrations` table, wrapped in a transaction).

**Current migrations:** 001–039
- 001–013: core schema + contacts CRM
- 014: `judge_name`, `procedure_type`, `statute_deadline` on Cases; `ai_enriched` on Documents
- 015: `DocumentInsights` table (AI-extracted entities per document)
- 016: Academic Hub — AcademicSubjects, AcademicCourses, StudyQuestions, GraphNodes + FTS5
- 017–022: EvidenceItems, StensTemplates, CanvasDocuments, GmailSync, UpdateLog, DocumentCanvas
- 023–024: SearchMetaTrigger fix, VacuumSessions, LearningFeedback, PipelineLogs
- 025–027: ComplexCrmRoles, PrecedentCaching, PaymentLedger
- 028–030: CourtHearings, InsolvencyModule, CaseLawRegistry
- 031–035: CitationRegistry, ContactAudit/ClientsExt, ExcelImportSessions, TrafficDrivingLicense, CitationEngine
- 036–038: SecurityCompliance, Reliability/observability, CivilStandardProcedure
- 039: `Cases.registry_status` (`mapped` | `manual_review_required`) for Legal Brain tagging

## Data Firewall (Zero-Root Rule + Vacuum Protocol)

**Critical:** Chen's medical/nursing materials must NEVER enter the legal system.

Blocked paths (in `media-pipeline.ts` `EXCLUDED_PATTERNS`):
- Hebrew: `/סיעוד/`, `/רפואה/`, `/חן/`
- English: `/Nursing/`, `/Medical/`, `/Healthcare/`, `/Chen/`
- File patterns: `סיעוד.pdf`, `nursing` in filename

**Context-Aware Bypass:** Academic paths configured via `ACADEMIC_ROOT` env var bypass the medical block — these files are processed for the Academic Hub.

**100% Offline:** No document text is ever sent to external APIs. All AI inference runs locally via Ollama.

## API Routes

Base URL: `http://localhost:3001/api/`

| Prefix | Module |
|--------|--------|
| `/clients` | ClientRepository CRUD |
| `/cases` | CaseRepository CRUD |
| `/documents` | DocumentRepository + processing status |
| `/search` | FTS5 full-text search |
| `/queue` | Job queue stats + requeue |
| `/action-plan` | Approve/reject/sign rename plans |
| `/tasks` | Task management |
| `/legal-engine` | Document templates |
| `/media` | File ingest + audio pipeline |
| `/traffic` | Traffic case management |
| `/contacts` | Contacts CRM |
| `/studies` | Academic Hub — subjects, courses, questions, graph nodes |
| `/admin` | Diagnostics, workers, backups, repair |

## Coding Conventions

- **Hebrew strings in UI:** All user-facing labels are in Hebrew (RTL). Use `dir="rtl"` on container elements.
- **`exactOptionalPropertyTypes: true`:** Use conditional spreads for optional DB fields: `...(value ? { field: value } : {})`.
- **Repository pattern:** All DB access through repository classes in `packages/database/src/queries/`. No raw SQL outside repositories.
- **Error responses:** `{ success: false, error: { code: string, message: string } }` — codes from `errors/codes.ts`.
- **Async handlers:** All Express routes use `asyncHandler()` wrapper — no try/catch in route handlers.
- **No comments unless non-obvious:** Don't explain what code does; only document hidden invariants or non-obvious constraints.

## Audio Pipeline (WhatsApp Voice Notes)

Files `.ogg`, `.m4a`, `.mp3`, `.wav` are routed through `audio-pipeline.ts`:
1. ffmpeg converts non-WAV audio → 16kHz mono WAV
2. `whisper-fast.exe` transcribes to Hebrew text (language: `he`)
3. Transcript stored as `ocr_text` in Documents table

Graceful degradation: if `WHISPER_EXE` not found, file is registered without transcript.

## Academic Hub

Routes: `/studies/*` in API, `/studies` in dashboard.

Vertical for law students:
- **Subjects & Courses:** hierarchical course organization
- **StudyQuestions:** multiple-choice exam prep (auto-generated from document OCR via law-il-E2B)
- **GraphNodes:** mind map / concept graph per course (SVG visualization)
- **FTS5:** full-text search on `fts_study_questions`
