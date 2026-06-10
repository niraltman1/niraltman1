# Factum-IL — Production Release Manifest

**Version:** 1.0.0
**Release date:** 2026-06-03
**Installer:** Inno Setup 6 (built via `publish.ps1`, 12-step staging)
**Migrations applied:** 001–060 (60 total)
**TypeScript errors:** 0 (all packages)

---

## Installer Contents

### Bundled Packages (25 total)

| Package | Description |
|---------|-------------|
| `apps/dashboard` | React 19 + Vite + Tailwind — primary UI (RTL Hebrew) |
| `apps/FactumIL.Desktop` | C# WPF + WebView2 — Windows desktop shell |
| `packages/shared` | Types, state machine, PII sanitizer, utils |
| `packages/database` | SQLite connection, repositories, migration runner |
| `packages/legal-ontology` | Israeli court taxonomy, citation types, Hebrew synonyms |
| `packages/events` | Internal event bus |
| `packages/observability` | Metrics, logging, health probes |
| `packages/model-router` | Ollama client, health check, 5-step reasoning chain |
| `packages/policy-engine` | RBAC — 5 roles |
| `packages/memory` | Per-case memory, session persistence |
| `packages/retrieval` | RAG retrieval, hybrid FTS5 + sqlite-vec |
| `packages/ai` | AI orchestration, OllamaClient, ConfidenceCalculator |
| `packages/ai-guardrails` | Hallucination detection, PII strip, confidence thresholds |
| `packages/citation-engine` | Nevo 2021 citation parser |
| `packages/pipeline` | Document processing pipeline |
| `packages/evals` | Golden-set AI accuracy evaluation suite |
| `packages/orchestrator` | Agent coordination, policy enforcement |
| `packages/agent-core` | 5 AI agents |
| `packages/support-diagnostics` | Crash bundle, PII-scrubbed diagnostic reports |
| `packages/update-core` | Update check, version manifest |
| `packages/litigation-intelligence` | Deadline risk scoring, procedural completeness |
| `packages/enterprise-hooks` | Plugin framework |
| `packages/encrypted-backup` | AES-256-GCM hourly backup scheduler |
| `packages/sdk` | Public SDK |
| `packages/api` | Express API — all HTTP routes |

### Bundled Tools

| File | Location in installer | Purpose |
|------|-----------------------|---------|
| `sqlite-vec.dll` | `{app}\tools\sqlite-vec.dll` | KNN vector search SQLite extension |
| `whisper-fast.exe` | `{app}\tools\whisper-fast.exe` | Hebrew speech-to-text |
| `ffmpeg.exe` | `{app}\tools\ffmpeg.exe` | Audio format conversion |
| `OllamaSetup.exe` | `{app}\tools\OllamaSetup.exe` | Ollama installer (run during install) |

### Registry Environment Variables Written at Install Time

| Variable | Value |
|----------|-------|
| `FACTUM_IL_ROOT` | `{app}` |
| `WHISPER_EXE` | `{app}\tools\whisper-fast.exe` |
| `FFMPEG_EXE` | `{app}\tools\ffmpeg.exe` |
| `OLLAMA_MODEL` | `BrainboxAI/law-il-E2B:Q4_K_M` |
| `AI_TIER` | `local` |
| `SQLITE_VEC_PATH` | `{app}\tools\sqlite-vec.dll` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `FACTUM_IL_VERSION` | `1.0.0` |

---

## Database Schema Summary (Migrations 001–060)

| Migration | Table(s) / Change |
|-----------|-------------------|
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
| 014 | Cases.judge_name, procedure_type, statute_deadline; Documents.ai_enriched |
| 015 | DocumentInsights |
| 016 | AcademicSubjects, AcademicCourses, StudyQuestions, GraphNodes, fts_study_questions |
| 017 | Documents.is_court_receipt, is_signed_pdf, court_receipt_detected_at |
| 018 | EvidenceItems, fts_evidence |
| 019 | StensTemplates, StensSubmissions |
| 020 | GmailSyncConfig, GmailSyncLog |
| 021 | BackupSnapshots.is_encrypted, encryption_iv, encryption_tag, key_derivation |
| 022 | UpdateLog |
| 023 | VacuumSessions |
| 024 | LearningFeedback |
| 025 | WorkerHealth |
| 026 | Locks, LockAuditLog |
| 027 | TransactionJournal |
| 028 | CalendarEvents, CourtHearings |
| 029 | Notifications |
| 030 | CaseAssignments (attorney-to-case RBAC v2) |
| 031 | CanvasDocuments, CanvasTasks |
| 032 | AIAuditLog |
| 033 | SearchRankingCache |
| 034 | SearchMeta (materialised search index) |
| 035 | OCRCache |
| 036 | ManifestSnapshots |
| 037 | DocumentVersions |
| 038 | DocumentTags |
| 039 | CaseBrief |
| 040 | Metrics (updated schema — renamed columns) |
| 041 | WALCheckpoints |
| 042 | RecoveryLog |
| 043 | AgentExecutionLog |
| 044 | AgentResults |
| 045 | CaseMemory |
| 046 | RetrievalCache |
| 047 | PolicyRules |
| 048 | GuardrailsLog |
| 049 | EvidenceChainOfCustody |
| 050 | EvidenceLockLog |
| 051 | UpdateManifest |
| 052 | vec_chunks (sqlite-vec KNN table, in data_store) |
| 053 | Rules_Engine (20 Israeli procedural rules, 9 procedure types) |
| 054 | Rules_Engine — procedure type expansion |
| 055 | Entities, EntityRelations (entity graph) |
| 056 | LegalCorpus (offline Knesset OData legislation) |
| 057 | LegalCorpusFTS (FTS5 over LegalCorpus) |
| 058 | WikiSourceLegislation |
| 059 | WikiSourceFTS |
| 060 | _migrations SHA-256 checksums backfill |

---

## Runtime Dependencies (all local, no internet after install)

| Tool | Version | Default location |
|------|---------|-----------------|
| Node.js | 20 LTS | `C:\Program Files\nodejs\` |
| pnpm | 9.x | via npm global |
| Ollama | latest | `%LOCALAPPDATA%\Programs\Ollama\` |
| Tesseract OCR | 5.x | `C:\Program Files\Tesseract-OCR\` |
| Ghostscript | 10+ | `C:\Program Files\gs\` |
| ffmpeg | 6.x | `{app}\tools\ffmpeg.exe` |
| whisper-fast.exe | any | `{app}\tools\whisper-fast.exe` |
| sqlite-vec.dll | bundled | `{app}\tools\sqlite-vec.dll` |
| WebView2 | system | Pre-installed on Windows 10 1903+ |

---

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Windows 10 22H2+ | Windows 11 |
| CPU | x64 | x64, 4+ cores |
| RAM | 8 GB | 16 GB |
| Disk | 10 GB free | 20 GB free |

---

## Operational Notes

1. **Ollama must be running before the API starts.** The RAG worker fails gracefully if Ollama is unreachable — documents remain `ai_enriched = 0` until the next cycle. A health check warning is logged.

2. **sqlite-vec.dll is required for vector search.** If absent, the system falls back to FTS5 keyword search only. Migration 052 (`vec_chunks`) will be skipped.

3. **`_data.db` must exist before the first run.** It is created automatically by migration 052 if `SQLITE_VEC_PATH` is set.

4. **Audio transcription is Windows-only.** `whisper-fast.exe` is a Windows binary. On non-Windows machines, audio files are registered without transcripts (graceful degradation).

5. **`Documents.case_id` is set asynchronously.** The entity router runs after ingest. Immediately after `POST /media/ingest`, `case_id` may be null — it is linked within the same request cycle.

6. **Stub clients are created with `is_active = 1`.** Review and update `nameHe` once the client's actual name is confirmed.

7. **`FACTUM_IL_VERSION` must match the installed version.** The update checker reads this registry value. If it is missing, the checker defaults to `1.0.0`.

8. **Backup encryption key.** If `BACKUP_ENCRYPT=1` and `BACKUP_ENCRYPT_KEY` is absent, a key is derived via scrypt from the machine GUID. Store the key in a secure location — without it, encrypted backups cannot be restored.

9. **User data is not removed on uninstall.** `%LOCALAPPDATA%\FactumIL\` (database, backups, logs) is preserved. Only the application files are removed.

10. **Safe mode.** Set `FACTUM_IL_SAFE_MODE=1` in the registry to disable all 6 background workers for maintenance.
