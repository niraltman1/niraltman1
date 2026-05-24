# Factum IL — Production Release Manifest

**Branch:** `claude/factum-il-phase-1-init-0EkMh`  
**Date:** 2026-05-16  
**Migrations applied:** 001–024  
**TypeScript errors:** 0 (API + Dashboard)

---

## What Was Built (Session Log)

### Phase 1 — Vacuum Protocol Lifecycle
End-to-end wiring of the 4-phase document ingestion orchestrator:

| Component | File | Description |
|-----------|------|-------------|
| DB table | `migrations/023_vacuum_sessions.sql` | `VacuumSessions` with 7-state CHECK, progress_percentage, raw_logs (append-only), session_uuid |
| Repository | `packages/database/src/queries/vacuum.ts` | `VacuumRepository`: create, findById, updateProgress (raw_logs append), markFailed, listRecent |
| API routes | `packages/api/src/routes/vacuum.ts` | POST /start, GET /session/:id, GET /sessions, POST /progress/:id (localhost-only) |
| PowerShell | `powershell/scripts/Invoke-VacuumProtocol.ps1` | 4-phase orchestrator; POSTs progress back to API; uses `-LiteralPath` throughout |
| Hooks | `apps/dashboard/src/api/hooks.ts` | `useStartVacuum`, `useVacuumStatus` (adaptive polling, stops on terminal state) |
| UI | `apps/dashboard/src/features/admin/DiagnosticsPage.tsx` | `VacuumProtocolPanel`: path input, gold progress bar, green-on-black log terminal |

**Security:** `POST /progress/:id` checks `req.socket.remoteAddress` against `{127.0.0.1, ::1, ::ffff:127.0.0.1}` — external calls return 403.

---

### Phase 2 — Unified Autonomous Legal Engine & Active Learning
Wired the missing Entity Router layer: pipeline extractions now create live DB rows.

#### New Migration
- `024_learning_feedback.sql` — `LearningFeedback(document_id, field_name, original_value, corrected_value, corrected_by, created_at)` with indexes on `document_id` and `field_name`

#### New Module: `entity-router.ts`

The connective tissue that was completely missing. Called after every `rag-worker` enrichment and every `media/ingest`. Operations:

1. **Client auto-creation** — for each Luhn-validated Israeli ID in `DiscoveredFields.israeliIds`, find existing `Clients` row by `id_number` or create stub (`nameHe: "לקוח <id>"`, `idType: 'personal'`). Writes `Documents.client_id`.
2. **Case auto-creation** — if `caseNumber` extracted and no matching `Cases` row exists AND `clientId` is known, creates stub case (`titleHe: "תיק <num>"`, `status: 'open'`). Writes `Documents.case_id`.
3. **Contact auto-population** — creates `Contacts` row for extracted prosecution entity (`role: 'prosecutor'`) and judge names (`role: 'court_clerk'`), links to case via `CaseContacts`.

Each section is independently try/catch wrapped so one failure never blocks others.

#### New API Endpoints
| Method | Path | File |
|--------|------|------|
| GET | `/api/documents/:id/insights` | `routes/documents.ts` |
| GET | `/api/cases/:id/insights` | `routes/cases.ts` |
| GET | `/api/queue/review-pending` | `routes/queue.ts` |
| POST | `/api/queue/approve/:id` | `routes/queue.ts` |
| POST | `/api/queue/correct/:id` | `routes/queue.ts` |

#### Frontend Wiring
| Surface | Before | After |
|---------|--------|-------|
| `ActionQueue.tsx` | `MOCK_ITEMS = []`, no API calls | Live `useReviewPendingItems()`, split-screen OCR + editable AI fields, correct-then-approve |
| `DocumentDetail.tsx` | Placeholder text | Real `useDocumentInsights()` rendering case number, court, judge, offense, hearing date |
| `CaseDetail.tsx` insights tab | Static "coming soon" | Live `useCaseInsights()` with per-document extraction cards |
| `/contacts` route | Missing | `ContactsPage.tsx` with RTL Hebrew FTS search |

---

### Phase A — Windows Path & Fault-Tolerance Hardening

#### `Invoke-VacuumProtocol.ps1`
- Added `[ValidateNotNullOrEmpty()]` to `$SessionId` and `$TargetPath` params
- Added `Set-StrictMode -Version Latest`
- Added pre-flight `Test-Path -LiteralPath` check; reports structured failure to API before `exit 1`
- `Get-ChildItem` already used `-LiteralPath "$dir"` (explicit quoting added for clarity)
- `ConvertTo-Json -Compress` handles all Unicode/backslash escaping for `filePath` in HTTP body
- Added per-file error catch in Phase 2 loop — individual file failure is logged, not fatal

#### `vacuum.ts` spawn call
- Added `resolve()` around the PS1 file path (absolute, no trailing separator)
- Added `-NonInteractive` flag to prevent PowerShell from blocking on stdin prompts

#### `entity-router.ts`
- Wrapped client-creation block, case-creation block, and each contact operation in independent try/catch
- Errors logged as `[EntityRouter] … failed doc=<id>:` warnings; engine continues regardless

---

## Isolated Client Deployment Requirements

### Hardware
- Windows 10 22H2+ or Windows 11 (x64)
- 8 GB RAM minimum; 16 GB recommended for simultaneous OCR + AI
- 20 GB free disk (Ollama model: ~3 GB, SQLite + documents: variable)

### Runtime Dependencies (all local, no internet required after setup)

| Tool | Version | Purpose | Default Location |
|------|---------|---------|-----------------|
| Node.js | 20 LTS | API server + dashboard build | `C:\Program Files\nodejs\` |
| pnpm | 9.x | Package manager | installed via `npm i -g pnpm` |
| Ollama | latest | Local AI inference | `C:\Users\<user>\AppData\Local\Programs\Ollama\` |
| Tesseract OCR | 5.x | Image → searchable PDF | `C:\Program Files\Tesseract-OCR\` |
| FFmpeg | 6.x | Audio format conversion | must be on `PATH` |
| whisper-fast.exe | any | Hebrew speech-to-text | `<FACTUM_IL_ROOT>\tools\whisper-fast.exe` |
| SQLite | bundled | Database (via better-sqlite3) | `_data\factum-il.db` |

### AI Model Setup
```powershell
# Step 1 — Pull base model (requires internet, one-time)
ollama pull hf.co/BrainboxAI/law-il-E2B:Q4_K_M

# Step 2 — Create local alias with system prompt
ollama create law-il-E2B -f .\Modelfile
```

### Environment Variables
| Variable | Default | Notes |
|----------|---------|-------|
| `OLLAMA_MODEL` | `law-il-E2B` | Must match the alias created in Step 2 |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Do not change unless Ollama port differs |
| `WHISPER_EXE` | `<FACTUM_IL_ROOT>\tools\whisper-fast.exe` | Absolute path, supports Hebrew/space in path |
| `FFMPEG_EXE` | `ffmpeg` | Must be on PATH or set to absolute path |
| `WHISPER_MODEL` | `medium` | Options: tiny, base, small, medium, large |
| `FACTUM_IL_ROOT` | `process.cwd()` | Set explicitly if running from a different directory |
| `FACTUM_IL_DB_PATH` | `_data\factum-il.db` | Directory must exist before first run |
| `ACADEMIC_ROOT` | _(empty)_ | Semicolon-separated paths for academic bypass |
| `BACKUP_ENCRYPT` | `0` | Set `1` to enable AES-256-GCM backup encryption |
| `BACKUP_ENCRYPT_KEY` | _(empty)_ | 64-char hex key; derived via scrypt if absent |
| `EVIDENCE_AUTO_LOCK` | `0` | Set `1` to auto-lock ingested files to evidence locker |

### First-Run Sequence
```powershell
# 1. Install dependencies
pnpm install

# 2. Start the API server (runs migrations on startup)
pnpm --filter @factum-il/api dev

# 3. In a second terminal, start the dashboard
pnpm --filter dashboard dev

# 4. Open browser: http://localhost:5173
```

Migrations 001–024 run automatically on first server start. Each runs exactly once (tracked in `_migrations` table, wrapped in a transaction).

### Windows Path Constraints
- The application supports Windows profiles with spaces and Hebrew characters (e.g., `C:\Users\עורך דין\מסמכים`).
- PowerShell scripts use `-LiteralPath` exclusively — no glob expansion.
- The `spawn()` call in `vacuum.ts` uses `shell: false`; each argument is a separate `argv` element, so spaces in `targetPath` are safe.
- `ConvertTo-Json -Compress` handles Unicode and backslash escaping in HTTP bodies.

### Data Firewall
The following path segments are **permanently blocked** from ingestion. This is a hardcoded invariant and must never be overridden:

```
Hebrew:  /סיעוד/  /רפואה/  /חן/
English: /Nursing/  /Medical/  /Healthcare/  /Chen/
Files:   *.סיעוד.pdf  *nursing*  *medical_report*
System:  node_modules  .git  __MACOSX  System32  Windows\
```

Academic bypass: set `ACADEMIC_ROOT` to allow nursing/medical terms only in designated academic study paths.

---

## Database Schema Summary (Migrations 001–024)

| Migration | Table(s) |
|-----------|---------|
| 001 | Clients, Cases, Documents, Lawyers, Judges |
| 002 | fts_documents, fts_clients (FTS5) |
| 003 | ActionLog |
| 004 | ProcessingStatus |
| 005 | QueueItems, Metrics |
| 006 | AIPromptVersions, AIEnrichmentLog |
| 007 | SupervisorEvents, WatcherEvents |
| 008 | ActionPlanEntries |
| 009 | Tasks |
| 010 | RegulationTemplates, TemplateMilestones, CaseProcedures |
| 011 | ProcessedFiles |
| 012 | TrafficCases |
| 013 | Contacts, CaseContacts, fts_contacts |
| 014 | Cases.judge_name, .procedure_type, .statute_deadline; Documents.ai_enriched |
| 015 | DocumentInsights |
| 016 | AcademicSubjects, AcademicCourses, StudyQuestions, GraphNodes, fts_study_questions |
| 017 | Documents.is_court_receipt, .is_signed_pdf, .court_receipt_detected_at |
| 018 | EvidenceItems, fts_evidence |
| 019 | StensTemplates, StensSubmissions |
| 020 | GmailSyncConfig, GmailSyncLog |
| 021 | BackupSnapshots.is_encrypted, .encryption_iv, .encryption_tag, .key_derivation |
| 022 | UpdateLog |
| 023 | VacuumSessions |
| 024 | LearningFeedback |

---

## Known Constraints & Operational Notes

1. **Ollama must be running before the API starts.** The RAG worker fails silently if Ollama is unreachable — documents remain `ai_enriched = 0` until the next 60-second cycle.
2. **whisper-fast.exe is Windows-only.** On Linux/macOS development machines, audio files are registered without transcripts (graceful degradation).
3. **Documents.case_id is set asynchronously.** The entity router runs after ingest; immediately after calling `POST /media/ingest`, the `case_id` may still be null. The document will be linked within the same request cycle (fire-and-forget `.catch(() => {})`).
4. **Stub clients are created with `is_active = 1`.** They appear in the clients list immediately. Review and update the `nameHe` field once the client's actual name is known.
5. **The `LearningFeedback` table is write-only from the UI.** No UI currently reads correction history — this is a data collection layer for future model fine-tuning.
6. **Gmail OAuth integration** is schema-ready (migration 020) but the OAuth flow requires `googleapis` package installation and a GCP project — not enabled by default.
