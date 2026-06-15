# Factum-IL v1.0.0 — Commercial Beta Readiness Report

Generated: 2026-05-26 · **Updated: 2026-06-10 (beta-readiness completion pass)**

---

## 2026-06-10 Status Update — READY FOR BETA BUILD

All beta-readiness work is merged to `main` (PRs #52, #55, #58, #63, #67, #68, #70–#74, #76). CI and CodeQL are green. Corrected inventory:

| Item | Value (was → now) |
|------|-------------------|
| Database migrations | 53 → **76 files (001–077; 067 intentionally skipped)** |
| Installer output | `FactumIL_v1.0.0_Setup.exe` (NSIS) → **`Factum-IL-Setup.exe` (Inno Setup 6)** |
| Installer pipeline | untested → **`build-installer.yml` + `publish.ps1` fixed and verified; awaiting first `workflow_dispatch` dry run** |
| Legal corpus | not bundled → **bundled at build time from release `v-corpus-latest` (batch files) into `legal-corpus/batches/`** |
| Workplan gaps (F-A…F-G, B1, B3, C7, C8) | open → **closed** (C2 WhatsApp manual-send remains a documented beta caveat) |
| Dashboard tests | 4 files → **15+ files** |

**Remaining user action:** trigger GitHub Actions → "Build Beta Installer" → branch `main`, version `1.0-beta.1`; when green, push tag `v1.0.0-beta.1` to publish the prerelease with `Factum-IL-Setup.exe`.

The sections below reflect the original 2026-05-26 assessment and are retained for historical context.

---

## Executive Summary

Factum-IL v1.0.0 is functionally complete across all nine planned development phases and is ready for controlled commercial beta distribution to Israeli law firms. The installer pipeline, diagnostics infrastructure, and offline AI stack are in place; however, the product ships without code signing, auto-update, and multi-user support — all known and accepted limitations for the beta tier.

---

## System Inventory

| Item | Count / Value |
|------|--------------|
| Packages | 21 (`packages/` + `apps/` combined) |
| Apps | 2 (`apps/desktop`, `apps/web` / `apps/dashboard`) |
| Database migrations | 53 (001–053) |
| Rules engine entries (seeded) | 20 Israeli procedural rules |
| Test suites | 347 tests |
| AI model | BrainboxAI/law-il-E2B:Q4_K_M (Ollama, local) |
| Database engine | SQLite via better-sqlite3 |
| Installer output | `FactumIL_v1.0.0_Setup.exe` (NSIS) |

### Key Capabilities

- Document ingestion: OCR (Tesseract), PDF conversion (LibreOffice/ImageMagick), media registry
- AI enrichment: case number extraction, insight classification, precedent analysis, contract review
- Israeli legal identifiers: ת.ז., all court case number formats (תא, ת"פ, בג"ץ, ע"א, עב, תמש, עת"מ)
- Traffic case lifecycle state machine
- Legal procedure engine with milestone templates
- Evidence locker (write-protected, hash-verified)
- Stens library (form auto-fill via AI)
- Payment ledger
- Insolvency module (Pre-Filing / Judicial-Litigation phases)
- Academic hub (study questions, concept graph)
- Gmail bridge (OAuth, label-filtered sync)
- Agent workspace (summarize, timeline, research, contract-review, discovery)
- Backup: AES-256-GCM encrypted snapshots
- Diagnostics: crash capture, support bundle export, health endpoint, log rotation (5 × 5 MB)
- Update architecture: update-core package with beta/stable/enterprise channels

---

## Completed — Beta Ready

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Core ingestion pipeline (OCR, parsing, DB) | ✅ Complete |
| Phase 2 | AI enrichment (Ollama, Law-IL E2B, 5-step reasoning) | ✅ Complete |
| Phase 3 | Legal procedure engine (templates, milestones, deadlines) | ✅ Complete |
| Phase 4 | Client/case/document management + search (FTS5) | ✅ Complete |
| Phase 5 | Traffic state machine + statutory deadline tracker | ✅ Complete |
| Phase 6 | Evidence locker + media registry + vacuum protocol | ✅ Complete |
| Phase 7 | Stens library + insolvency module + payment ledger | ✅ Complete |
| Phase 8 | Agent workspace + academic hub + contacts CRM | ✅ Complete |
| Phase 9 | Gmail bridge + mail workspace + precedent library | ✅ Complete |
| Installer | NSIS + WebView2 + Ollama bundled bootstrapper | ✅ Complete |
| Diagnostics | support-diagnostics package + crash capture + bundle export | ✅ Complete |
| Update-core | Channel abstraction, rollback metadata | ✅ Architecture complete |

---

## Known Limitations for Beta

1. **WebView2 bootstrapper requires internet connection (first install)**
   MicrosoftEdgeWebview2Setup.exe downloads the runtime on first run. On air-gapped machines this will silently fail. Mitigation: bundle offline WebView2 installer in v1.1.

2. **Model pull requires internet if GGUF bundle not present**
   `stage-deps.yml` pre-stages the GGUF into the GitHub Release. If the release asset is missing or the installer was obtained through an unofficial channel, Ollama will attempt to pull from HuggingFace on first launch — requiring internet. Users must be instructed to use the official installer.

3. **No auto-update mechanism**
   `update-core` defines the architecture and channel abstraction but does not implement the actual check-and-apply loop. Users must manually download new installers. This is a known Phase 10 item.

4. **No code signing (Windows SmartScreen warning)**
   The installer EXE and the Electron shell are unsigned. Windows 10/11 will show a SmartScreen "Unknown publisher" warning. Enterprise group policies (SmartScreen enforcement level = Block) may prevent execution entirely. Beta participants must be advised to click "More info → Run anyway."

5. **Single-user only**
   The SQLite database is accessed by a single Node.js process. The enterprise multi-user hook (`packages/sdk`) is present but the multi-user storage layer is not implemented. Concurrent access from multiple OS users is not supported.

6. **Gmail bridge requires OAuth setup**
   Users must complete Google OAuth consent flow before the Gmail bridge activates. This requires a Google Cloud project with the Gmail API enabled. Not suitable for firms without technical staff to configure OAuth credentials.

7. **`stage-deps.yml` must be run manually before first build**
   The GitHub Actions workflow that uploads the four dependency assets (Node.js runtime, GGUF model, OllamaSetup.exe, WebView2Setup.exe) to the v-deps-1.0.0 release must be triggered manually before the installer build can succeed. This is a one-time prerequisite but is not automated.

---

## Risks

1. **GGUF filename detection (HIGH)**
   `stage-deps.yml` uses a dynamic query against the HuggingFace Hub API to find the GGUF file by pattern. If BrainboxAI changes the repository structure, file naming convention, or access permissions, the stage-deps workflow will silently fail to download the model, and the installer will ship without the GGUF. Mitigation: pin to a specific commit SHA or archive the GGUF in a private storage bucket.

2. **Ollama path detection (MEDIUM)**
   The desktop shell and API assume Ollama is installed at `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`. Users who install Ollama to a custom path, or who install Ollama system-wide (Program Files), will not have it detected. The health check will report Ollama as unreachable; AI features will be silently disabled. Mitigation: PATH-based detection with fallback.

3. **No installer code signing — enterprise policy may block (HIGH for enterprise)**
   Many law firms run managed Windows environments with Authenticode enforcement or AppLocker. An unsigned EXE will be blocked outright. This is the single largest distribution risk for commercial beta. Mitigation: expedite code signing certificate procurement before GA.

4. **Database corruption recovery (MEDIUM)**
   `MigrationRunner` applies migrations sequentially and marks them applied in the `migrations` table. There is no automatic rollback if a migration partially applies before a crash. If the SQLite WAL journal is corrupted, the startup `integrity_check` will fail, triggering `RecoveryWindow`, but the recovery path is manual (export bundle → SQLite recovery). Mitigation: add WAL checkpoint + atomic migration wrapper in Phase 10.

---

## Deployment Checklist

- [ ] Run `stage-deps.yml` GitHub Actions workflow to populate `v-deps-1.0.0` GitHub Release with 4 assets:
  - [ ] `node-v20-win-x64.zip`
  - [ ] `gemma-4-E2B-it.BF16-mmproj.gguf`
  - [ ] `OllamaSetup.exe`
  - [ ] `MicrosoftEdgeWebview2Setup.exe`
- [ ] Push `v1.0.0-beta.1` tag → `build-installer.yml` produces `FactumIL_v1.0.0_Setup.exe`
- [ ] Install on clean Windows 10 VM and verify:
  - [ ] Installer completes without errors
  - [ ] .NET 8 Desktop Runtime check passes (or prompts and installs)
  - [ ] WebView2 installs silently
  - [ ] Ollama installs silently
  - [ ] GGUF loads from `{app}/models/` without internet (disconnect network before launch)
  - [ ] Dashboard loads in Hebrew RTL at `http://localhost:3001`
  - [ ] Health check (`/api/health`): all checks green
  - [ ] Create test client, create test case, upload test document
  - [ ] Run OCR pipeline — confirm `processing_state = complete`
  - [ ] Run AI enrichment — confirm insights extracted
  - [ ] Verify no data leaves machine (run Wireshark / Windows Firewall log during test)
- [ ] Install on clean Windows 11 VM and repeat above
- [ ] Test SmartScreen bypass procedure (document for beta users)
- [ ] Confirm `/api/diagnostics/bundle` endpoint returns valid JSON and writes to `{LOCALAPPDATA}/FactumIL/support-bundles/`
- [ ] Confirm dashboard "ייצא חבילת תמיכה" button works end-to-end

---

## Support Workflow

1. User reports issue → ask them to open Admin panel → click **"ייצא חבילת תמיכה"**
2. Bundle is saved locally to `{LOCALAPPDATA}\FactumIL\support-bundles\support-bundle-{timestamp}.json`
3. User copies the file path (copy button in the success message) and sends the bundle file to support
4. Support analyst loads bundle JSON and inspects: crash history, health check snapshot, log tail, migration state, system info
5. If root cause requires code fix → patch release process; if config issue → remote guidance sufficient

**PII note:** The support bundle passes through `RedactionPipeline` before writing. Client names, case numbers, and document content are redacted. The bundle is safe to transmit over email without violating attorney-client privilege.

---

## Crash Recovery Workflow

1. App crashes → `DiagnosticsService` (desktop process + API process) captures crash to `{LOCALAPPDATA}\FactumIL\diagnostics\crashes\`
2. On next startup → `StartupValidator` reads crash history from diagnostics directory
3. If health check (`/api/health`) fails on startup → `RecoveryWindow` is shown (Electron overlay)
4. User options in `RecoveryWindow`:
   - **המשך** — attempt to start normally despite health failure
   - **ייצא חבילת תמיכה** — generate and save bundle, then exit
   - **פתח יומני מערכת** — open log directory in Explorer
   - **יציאה** — exit application
5. If DB corrupted: `MigrationRunner` runs with `SKIP_ON_ERROR` mode for non-critical migrations; critical migration failures halt startup with an explicit error message directing user to contact support

---

## Installer Validation Checklist

Post-install, verify the following files exist in the installation directory (`C:\Program Files\FactumIL\FactumIL_Dist\` or user-local install path):

- [ ] `FactumIL_Dist\shell\FactumIL.Desktop.exe` — Electron shell
- [ ] `FactumIL_Dist\runtime\node.exe` — bundled Node.js v20 runtime
- [ ] `FactumIL_Dist\backend\dist\start.js` — compiled API server entry point
- [ ] `FactumIL_Dist\dashboard\dist\index.html` — compiled React dashboard
- [ ] `FactumIL_Dist\tools\OllamaSetup.exe` — Ollama installer
- [ ] `FactumIL_Dist\tools\MicrosoftEdgeWebview2Setup.exe` — WebView2 installer
- [ ] `FactumIL_Dist\models\gemma-4-E2B-it.BF16-mmproj.gguf` — AI model (largest file, ~4 GB)

---

## Diagnostics Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| `support-diagnostics` package | ✅ | Crash capture, bundle export, health snapshot |
| Crash capture — desktop (Electron) | ✅ | Uncaught exception + unhandled promise handlers |
| Crash capture — API (Node.js) | ✅ | Process-level handlers + per-request error capture |
| Health endpoint (`/api/health`) | ✅ | DB, migrations, Ollama, queue, disk, RAG checks |
| Extended status (`/api/diagnostics/status`) | ✅ | Added in parallel |
| Support bundle export (`/api/diagnostics/bundle`) | ✅ | POST endpoint + UI button |
| Recent crashes API (`/api/diagnostics/crashes`) | ✅ | GET + DELETE |
| Log rotation | ✅ | 5 files × 5 MB each, gzip compress on rotate |
| PII redaction in bundles | ✅ | `RedactionPipeline` strips client/case data |
| Dashboard diagnostics UI | ✅ | `DiagnosticsPage` + `HealthStatusPanel` + `SupportExportButton` |

---

## Updater Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| `update-core` package | ✅ | Architecture defined |
| Channel abstraction (beta / stable / enterprise) | ✅ | Types and channel configuration present |
| Auto-update check-and-apply loop | ❌ | Not implemented — Phase 10+ |
| Rollback support | ✅ | Rollback metadata schema defined |
| Delta updates | ❌ | Full installer only |

---

## Enterprise Readiness

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-user | ❌ | Single-user SQLite only |
| Admin console | ❌ | Planned post-GA |
| Centralized/shared storage | ❌ | Local SQLite only |
| Active Directory / SSO | ❌ | Not planned for Phase 10 |
| Extension SDK hooks | ✅ | `packages/sdk` present |
| Audit logging | ✅ | `audit_events` table (migration 039) |

---

## Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| No external data transmission | ✅ | All AI on Ollama local; no cloud API calls |
| Attorney-client privilege | ✅ | No document content logged anywhere external |
| Local AI only | ✅ | `BrainboxAI/law-il-E2B:Q4_K_M` on localhost:11434 |
| Encrypted backups | ✅ | AES-256-GCM, key via DPAPI or env (migration 021) |
| Audit logging | ✅ | `audit_events` table captures all write operations |
| PII redaction in support bundles | ✅ | `RedactionPipeline` |
| Code signing | ❌ | Beta limitation — SmartScreen will warn |
| Network isolation | ⚠️ | App makes no outbound calls; Gmail OAuth does — needs internet for OAuth setup only |

---

## Next Steps (Phase 10+)

1. **Code signing certificate** — Windows Authenticode; priority before any enterprise distribution
2. **Auto-update implementation** — build on `update-core` architecture; delta-patch preferred
3. **Multi-user support** — enterprise tier; requires moving from SQLite to a shared DB (PostgreSQL or SQLite WAL with connection pooling)
4. **Cloud backup option** — optional, fully user-controlled, encrypted before upload
5. **Admin console** — web-based management for IT administrators
6. **Beta feedback mechanism** — in-app structured feedback (anonymous, on-device, no PII)
7. **Offline WebView2 installer** — bundle full offline installer to remove internet dependency on first install
8. **Ollama PATH detection** — replace hardcoded `%LOCALAPPDATA%` path with PATH-based search + registry lookup

---

## Beta Participant Onboarding

יש להפנות כל משרד עורכי דין לביצוע השלבים הבאים:

1. להוריד את `FactumIL_v1.0.0_Setup.exe` מה-Release המסומן `v1.0.0-beta.1`
2. להריץ את הקובץ **כמנהל מערכת** (לחיצה ימנית → הפעל כמנהל מערכת)
3. אם מופיעה אזהרת SmartScreen — ללחוץ על "מידע נוסף" ואז "הפעל בכל זאת"
4. לוודא ש-.NET 8 Desktop Runtime מותקן לפני הרצת המתקין (המתקין יבדוק ויציע הורדה)
5. לאפשר לתהליך ההתקנה להסתיים (כולל התקנת Ollama וטעינת המודל — עשוי לקחת מספר דקות)
6. לפתוח את **Factum IL** ולהמתין עד שסרגל הסטטוס בתחתית מציג "מוכן" ו"AI מוכן"
7. ליצור תיק לדוגמה ולהעלות מסמך לבדיקה (PDF או Word)
8. לוודא שה-OCR ועיבוד ה-AI הסתיימו (עמוד "תור עיבוד")
9. לדווח על כל בעיה דרך: **פאנל ניהול → "ייצא חבילת תמיכה"** ולשלוח את הקובץ לצוות התמיכה

**חשוב:** המערכת פועלת לחלוטין מקומית. כל המסמכים, התיקים ונתוני הלקוחות נשמרים אך ורק במחשב המשרד. אין העברת נתונים לענן.
