# Factum-IL — Task Tracker

## 🗓️ Session handoff — Phases 1, 2A, 3A, 3B Complete (2026-06-13)

### הושלם הפעם — Master Maturity Plan Phases 1–3

**ענף:** `claude/factum-il-maturity-plan-thfwxf` → **מוזג ל-main (PR #106)**

#### Phase 1 — Daily Legal Workspace ✅
- `DashboardHomePage.tsx` at `/workspace` (7 sections: matters, agenda, cases, comms, evidence, brain, notifications)
- `useWorkspaceOverview.ts` — single aggregation hook (10 parallel queries)
- Widget extraction: `AgendaWidget`, `ActiveCasesWidget`, `CommunicationsWidget`, `EvidenceWidget`
- New API endpoints: `GET /api/agents/runs`, `GET /api/communications/inbox/summary`, `GET /api/pipeline/failures`
- Router: `/` → `/workspace` redirect, `/support`, `/data-migration` added
- Nav: סביבת עבודה, תמיכה, ייבוא נתונים

#### Phase 2 Priority A — Legal Agents ✅
- `insolvency-agent.ts` — InsolvencyModule + PaymentLedger analysis → LegalDrafts
- `deadline-analysis-agent.ts` — Rules_Engine + CourtHearings → AgentResults
- `hearing-prep-agent.ts` — hearing briefing → LegalDrafts + AgentResults
- `case-intake-agent.ts` — new case intake (no caseId) → LegalDrafts
- API routes: POST `/api/agents/insolvency-summary`, `/deadline-analysis`, `/hearing-prep`, `/case-intake`
- AgentsWorkspacePage updated with all 4 Priority A agents

#### Phase 3A — Support Platform ✅
- `RepairRecommendationsEngine.ts` — WAL, FTS, migrations, sqlite-vec, orphan analysis
- `SelfHealingActions.ts` — rebuild-fts, wal-checkpoint, vacuum, validate-vec, validate-migrations, orphan-cleanup
- `GET /api/diagnostics/recommendations`, `POST /api/diagnostics/heal/:action`
- `SupportPage.tsx` at `/support` — system health, bundle, repair + one-click healing

#### Phase 3B — Database Intelligence Platform ✅
- `@factum-il/database-intelligence` package (13 source files)
- SQLiteConnector, CSVConnector, ExcelConnector (read-only, graceful degradation)
- LegalDataDictionary — Hebrew/English → Factum-IL table mapping
- SemanticSchemaAnalyzer, MappingRecommendationEngine, ImportPlanner
- DocumentInventoryAnalyzer (SHA-256 duplicates), FileStructureAnalyzer
- 6 endpoints: `/api/data-migration/scan|analyze|report|plan|document-inventory|file-structure`
- `DataMigrationPage.tsx` at `/data-migration` — 6-section wizard, JSON export

#### Phase 2 Priority B — Drafting & Evidence Agents ✅ (2026-06-14, PR #107)
- `draft-motion-agent.ts` — Hebrew motion/brief draft (6 motion types) → LegalDrafts, flagForReview always
- `draft-letter-agent.ts` — Hebrew letter (client/court/opposing counsel/authority) → LegalDrafts, flagForReview always
- `evidence-review-agent.ts` — evidence inconsistencies, chronology gaps, admissibility risks → AgentResults
- API routes: `POST /api/agents/draft-motion`, `/draft-letter`, `/evidence-review`
- UI: 3 new Priority B agent cards in AgentsWorkspacePage with input forms
- New hooks: `useAgentDraftMotion`, `useAgentDraftLetter`, `useAgentEvidenceReview`

### מה לעשות עכשיו
- **HARD STOP** — All Phases 1–3 + Priority B complete. Do not begin Phases 4–7 without explicit approval.

---

## 🗓️ Session handoff — packages דקיקים + B4 hardening (2026-06-13)

### הושלם הפעם

- ✅ **PR #103 — packages דקיקים מחוברים (מוזג)**
  - `orchestrator`: `transitionStage` ב-rag-worker (ENTITY_EXTRACTION_DONE / INDEXING_DONE / READY_FOR_AGENTS) + `GET /api/admin/workflow/:id`
  - `sdk`: plugin routes (GET/POST/DELETE /api/plugins), `fireCaseCreated` / `fireAgentCompleted` / `fireDocumentIngested` events
  - `encrypted-backup`: 4 admin routes (list/create/verify/restore) AES-256-GCM manifests
  - `enterprise-hooks`: `GET /api/enterprise/capabilities`
  - Dashboard: `PluginsPanel`, `EncryptedBackupPanel`, `EnterpriseCapabilitiesPanel` ב-DiagnosticsPage + 8 hooks חדשים
- ✅ **B4 — אבטחה/חיסיון**: הסרת 5 קריאות `console.log` שהדליפו שמות צדדים ומזהי לקוח
  (`preflight-agent.ts` ×4, `media-pipeline.ts` ×1) — PII לא מודפס עוד לקונסול
- ✅ **migration 080** — `performance_indexes`: 14 אינדקסים על עמודות חמות
  (Cases, Documents, DocumentInsights, Tasks, TrafficCases, WorkflowStates, AgentExecutionEvents, CommMessages, DocumentChunks, EvidenceItems)

### סלוטי Migration
- **001–080 תפוסים** (067 = gap מכוון). **הבא הפנוי: 081**

### הצעד הבא
- B4 המשך: אמינות (Ollama fallback coverage), observability מטריקות, גיבוי/שחזור testing
- C1 Telegram live validation (חסומה על allowlist)
- בניית installer: GitHub Actions → "Build Beta Installer" → main → v1.0-beta.1

---

## 🗓️ Session handoff — B2+C7 הושלמו + MD sync (2026-06-13)

### הושלם הפעם

- ✅ **PR #101 — feat(b2/c7): stens seed data, saved filters, SLA radar (מוזג `72e9182`):**
  - **B2 — Stens seed data:** migration 078 מזריע 8 תבניות עבריות (`StensTemplates`): תביעה קטנה, כתב תביעה, גירושין, מזונות, עבודה, ערר מנהלי, דוח תנועה, ערבות
  - **B2 — Saved Filters:** migration 079 + `SavedFiltersRepository` + 4 API routes (`GET/POST /api/collections/saved`, `DELETE /:id`, `GET /:id/items`) + `SmartCollectionsPage` שודרג עם ממשק pills מותאם אישית
  - **C7 — SLA Radar:** `sla-radar-scheduler.ts` — scheduler שעתי; ברירת מחדל 4 שעות; `warning`/`critical` ב-`Notifications` עם `dedupKey: 'sla:conv:<id>'` (אידמפוטנטי); auto-resolve כשמצב handled=0 יורד ל-0
  - **B2 — learning mode:** `POST /api/legal-engine/learn` עם Ollama graceful fallback
- ✅ **PR #102 — MD sync (ענף זה):** עדכון כל קבצי ה-MD לסטטוס הנוכחי (TASKS, CHANGELOG, README, ARCHITECTURE, WORKPLAN_BACKEND, WORKPLAN_COMMUNICATIONS, DEVELOPMENT)

### מצב B2/C7 לאחר PR #101

| פאזה | פריט | סטטוס |
|------|------|--------|
| B2 | חישוב מועדים / ProceduralChecklist | ✅ migration 046 + seedProceduralChecklist מחווט |
| B2 | Stens seed (8 templates) | ✅ migration 078 |
| B2 | Saved Filters | ✅ migration 079 + API + UI |
| B2 | learning mode | ✅ `POST /api/legal-engine/learn` |
| B2 | packages דקיקים | ⏳ המתנה להחלטת בעלים |
| C7 | SLA Radar | ✅ `sla-radar-scheduler.ts` |

### Migration Slots (עדכני — 2026-06-13, 78 קבצים, 067 מדולג בכוונה)
001–039: core schema | 040: Metrics | 041: EventStore | 042: Entities | 043: CaseMemory
044: DocumentChunks | 045: AgentResults | 046: ProceduralChecklist | 047: DocumentVersions
048: DocumentSignatures | 049: WorkflowStates | 050: VacuumSessions | 051: PipelineLogs
052: vec_chunks (SKIP_ON_ERROR) | 053: AgentExecutionEvents | 054: SystemEvents
055: WorkflowIdempotency TTL | 056: CaseAssignments | 057: SystemSettings | 058: Notifications
059: Notifications resolved | 060: Rules_Engine | 061: LegalSources/Sections | 062: verify_flags
063: CommChannels/Messages | 064: CommTemplates | 065: CommEvidence | 066: CallLogs
067: _(מכוון — ריק)_ | 068: CommMessages.ai_urgency/tags | 069: VerdictCorpus
070: PrecedentLibrary | 071: LegalDrafts | 072: TimeEntries | 073: LegalBrainSessions
074: LegalBrainMessages | 075: SupremeCourtVerdicts | 076: PrecedentChunks
077: vec_precedent_verdicts (SKIP_ON_ERROR) | 078: StensTemplates seed | 079: SavedFilters

**הבא הפנוי: 080**

### מה לעשות עכשיו
- **B4 production hardening** — אבטחה, ביצועים, גיבוי/שחזור, תצפיתיות — `WORKPLAN_BACKEND.md §B4`
- C1 Telegram live validation — חסום-סביבה (allowlist)
- C2 WhatsApp — חסום-סביבה (whatsapp-web.js + WebView2 מקומי)
- packages דקיקים (`orchestrator`, `sdk`, `encrypted-backup`, `enterprise-hooks`) — המתנה להחלטת בעלים

---

## 🗓️ Session handoff — Audit UX Round COMPLETE (2026-06-13)

### הושלם הפעם

- ✅ **PR #99 — Audit UX #13: טאב הערות ב-CaseDetail (מוזג `69e7b5d`):**
  - טאב "הערות" (`'notes'`) נוסף ל-`CaseDetail` עם textarea + Ctrl+Enter + מחיקה
  - משתמש בתשתית `useTasks` / `useCreateTask` / `useDeleteTask` קיימת (`source: 'note'`)
  - ללא endpoint חדש — Tasks table + `caseId` + `source: 'note'`
  - תיקון נוסף: timing-flake ב-`packages/update-core` (200ms → 1000ms threshold)

### סטטוס Audit UX — **20/20 הושלמו** ✅

| # | פריט | PR / סטטוס |
|---|------|------------|
| 1 | Global Search בסיידבר | #94 |
| 2 | מאגר חקיקה/פסיקה | #94 |
| 3 | Drafting workspace | קיים בקוד (#68) |
| 4 | Register Payment Ledger | קיים בקוד (#98) |
| 5 | "Today's View" dashboard | קיים בקוד (#98) |
| 6 | Matter Workbench | #94 |
| 7 | Unified AI agent experience | #96 |
| 8 | Citation harvesting button | #94 |
| 9 | Insolvency module | קיים בקוד (#98) |
| 10 | Research workflow | #95 |
| 11 | PDF + Word export | #97 |
| 12 | Entity graph visualization | #96 |
| 13 | Matter-level notes | #99 |
| 14 | Agent execution journal | קיים בקוד (#98) |
| 15 | AI insight batch review | #95 |
| 16 | Document version history | #95 |
| 17 | Comm ↔ matter timeline | קיים בקוד (#98) |
| 18 | Procedure-type onboarding | קיים בקוד (#98) |
| 19 | Persistent agent results | #94 |
| 20 | Scoped legal corpus search | קיים בקוד (#98) |

### מה לעשות עכשיו
- Audit UX Round הסתיים. ניתן להמשיך ל-`WORKPLAN_BACKEND.md` או `WORKPLAN_COMMUNICATIONS.md`.

---

## 🗓️ Session handoff — Platform Audit UX improvements (2026-06-13)

### הושלם הפעם

- ✅ **PR #91 — QA Phase 2** — Windows CI, E2E golden tests, FTS5/cache/validation/Pester fixes. מוזג.
- ✅ **PR #94 — Platform Audit UX Round 1 (מוזג `86b868a`):**
  - **#1** `nav`: `/search` נוסף לקבוצת "לוח בקרה" — חיפוש גלובלי גלוי לכל עו"ד
  - **#2** `nav`: `/legal-corpus` נוסף לקבוצת "מחקר משפטי" — קורפוס 1,077 חוקים נגיש
  - **#8** כפתור "חלץ אסמכתאות" ב-DocumentDetail — `useHarvestCitations` hook מחובר ל-UI
  - **#6** כפתור `⊞` שולחן עבודה על כל כרטיס תיק ב-CasesPage — גישה בקליק אחד
  - **#19** `GET /api/agents/results` + `useStoredAgentResults` + סקציית "ניתוחים קודמים" ב-CaseDetail

- 🔄 **Round 2 + Round 3 (PR #95 `claude/factum-il-audit-cont-p2`):**
  - **#16** גרסאות מסמך — `DocumentVersionRepository` מחובר ל-API (`GET /api/documents/:id/versions`), hook `useDocumentVersions`, סקציית "גרסאות מסמך" ב-DocumentDetail
  - **#15** AI Insight batch review — `GET /api/documents/insights?state=` + `useAllInsights` hook + `InsightReviewPage` + nav "בדיקת תובנות AI" בקבוצת מסמכים
  - **#10** Research workspace — `CitationsPage` + route `/citations` + nav "אסמכתאות" בקבוצת מחקר

### מצב יתרת ה-audit (AUDIT-UX-PRODUCT-2026-06.md)

פעוּלות שנותרו:
- `#12` Knowledge graph visualization — טבלאות Entities/EntityRelations מאוכלסות; `EntitiesPage` מציג רשימה שטוחה; צריך להוסיף תצוגת גרף (D3 — לא מותקן)
- `#7` Unified AI agent experience — 3 surfaces, טרם אוחדו
- `#11` PDF export — אין תשתית

### מה לעשות עכשיו
1. בדוק PR #95 — בקש merge כאשר CI ירוק
2. אפשרות: הוסף תצוגת גרף קלילה (SVG/CSS, ללא D3) ל-EntitiesPage (#12)

---

## 🗓️ Session handoff — QA Phase 2 rebase onto main (2026-06-13)

### הושלם הפעם

- ✅ **Rebased `qa/phase-2-windows-ci` onto `main`** — direct `git rebase` failed (no common ancestor; 200+ add/add conflicts). Solution: fresh branch from `origin/main`, applied only QA-unique changes.

  **קבצים שהוחלו על main:**
  1. `.github/workflows/ci.yml` — 3 jobs חדשים: `check-windows`, `check-powershell`, `e2e`
  2. `apps/dashboard/e2e/` — 5 קבצי E2E: `helpers.ts`, 4 golden specs
  3. `apps/dashboard/playwright.config.ts` — Playwright config חדש
  4. `package.json` (root) — `test:e2e` script נוסף
  5. `packages/database/src/search/engine.ts` — תיקון `buildFTSQuery` (FTS5 flat OR) + cache poisoning
  6. `packages/api/src/validation/cases.ts` — `.optional()` → `.nullish()` + שמירת `procedureType` מ-main
  7. `packages/api/src/validation/clients.ts` — `.optional()` → `.nullish()`
  8. `tests/powershell/FactumIL.Tests.ps1` — תיקוני Pester (path + null-guard)
  9. `powershell/modules/OCRProcessor.psm1` / `CrashRecovery.psm1` / `Supervisor.psm1` — PSScriptAnalyzer fixes

### הצעד הבא
- **CI לאחר ה-rebase** — אם 5/5 ירוקים → מזג PR #91.

---

## 🗓️ Session handoff — QA Phase 2 CI hardening (2026-06-13)

### הושלם הפעם

- ✅ **PR #91 — QA Phase 2: Windows CI + E2E golden tests — כל 5 בדיקות ה-CI ירוקות** (commit `f4499de`)

  **שלושה באגים עיקריים תוקנו:**

  1. **FTS5 alias bug** (`packages/database/src/search/engine.ts`):
     `WHERE fts MATCH ?` → `WHERE fts_documents MATCH ?` / `WHERE fts_cases MATCH ?`.
  2. **FTS5 parenthesized OR syntax** (`buildFTSQuery`):
     תוצרים כמו `("שרה"* OR "רה"*)` לא חוקיים ב-FTS5 — תוקן: single-token → flat `A* OR B*`.
  3. **Cache poisoning** — `cacheResults` נקראת רק כאשר `ranked.length > 0`.
  4. **E2E button mismatch** — `CasesPage` משתמשת ב-`NewCaseWizard`; כפתור הוא **'המשך'**, לא **'שמור תיק'**.

### מצב CI לפני ה-rebase (commit `f4499de`)
- ✅ Typecheck + Test + Lint
- ✅ Typecheck + Test (Windows)
- ✅ PSScriptAnalyzer + Pester (Windows)
- ✅ Playwright E2E (8 tests, 8 passed)
- ✅ Eval Regression

---

## 🗓️ Session handoff — תיקון installer (2026-06-11)

### הושלם הפעם

- ✅ **PR #78** — תיקון test ב-`media.test.ts`: הסימון `filePath: '/tmp/scan.pdf'` הוחלף ב-`filePath: resolve('/tmp/scan.pdf')` כדי לאפשר ריצה ב-Windows (ה-route מפעיל `path.resolve()` כ-CWE-22 guard). מוזג.
- ✅ **PR #79** — תיקון `publish.ps1` שורה 700: `$VecVersion:` → `${VecVersion}:` (PowerShell פרסר את `:` כ-scope qualifier; `${…}` מגדיר את שם המשתנה במפורש). מוזג.
- ✅ **PR #80** — תיקון `publish.ps1` שורה 71: `'api'` נוסף ל-`$WorkspacePackages` כדי ש-`packages/api/dist` ייבנה בשלב 6 לפני שלב 8 מנסה להעתיקו. מוזג.

### צעד נדרש (ידני)

- **הפעל את "Build Beta Installer"** מ-GitHub Actions → Actions → Build Beta Installer → Run workflow → branch: `main` → version: `1.0-beta.1` → Run workflow.
- ייצר `Factum-IL-Setup.exe` שיועלה כ-artifact.
- ⚠️ ייתכנו תקלות נוספות ב-`publish.ps1` או `installer.iss` בשלבים הבאים — אם כן, דווח.

---

## 🗓️ Session handoff — beta-readiness הושלם + עדכון תיעוד (2026-06-10 סופי)

### ✅ beta-readiness הושלם — כל ה-PRs מוזגו

#### PR #76 — F-B unified library — **מוזג** (squash `34e244d`)
- `/library` route עם שני טאבים: *חקיקה* (`LegalCorpusPage`) + *פסיקה* (`JudgmentLibraryPage`)
- נדרש rebase על main בגלל conflict ב-`nav-config.tsx` (refactor dashboard-first שנכנס ל-main);
  `/library` שולב בקבוצת `research` החדשה
- הוסר `-m-6` bleed מ-`JudgmentLibraryPage`; 4 בדיקות חדשות; CI ‏8/8 ירוק

#### מצב פאזות סופי
- ✅ **F-A…F-G** — הכל הושלם (PRs #68, #70, #73, #74, #76)
- ✅ **B1** (#58), **B3** (#73) — הושלמו
- ✅ **C7** Smart Triage (#72+#74) — תיוג+תצוגה; ראדאר SLA נותר post-beta
- ✅ **C8** מסלול-לקוח (#74) — המרת אלמונים; מסלול איש-קשר נותר post-beta
- ⚠️ **C2** (WhatsApp) — חסום-סביבה; מגבלת-beta מתועדת

#### עדכון תיעוד (כל קבצי ה-MD)
- ✅ `WORKPLAN_FRONTEND.md` — באנר השלמה + טבלת רקונסיליאציה + F-B…F-G מסומנים ✅
- ✅ `WORKPLAN_BACKEND.md` — B1, B3 מסומנים ✅
- ✅ `WORKPLAN_COMMUNICATIONS.md` — C7/C8 🟢 (חלקי-מתועד), C2 ⚠️ מגבלת-beta
- ✅ `CHANGELOG.md` — רשומת "Beta Readiness — v1.0.0-beta.1 candidate" (PRs #52–#76)
- ✅ `README.md`, `BUILD.md`, `DEVELOPMENT.md` — ספירת מיגרציות 60→76 (001–077) + corpus bundling
- ✅ `reports/commercial-beta-readiness-report.md` + `reports/דוח-מוכנות-בטא.md` — סעיפי עדכון 2026-06-10
  (ציון מעודכן 8.5/10); `reports/סיכום-מנהלים.md` + `reports/דוח-שלבי-המשך.md` — הערות-עדכון

### ⏭️ הצעד היחיד שנותר — בניית ה-installer (פעולת משתמש)
1. GitHub Actions → **"Build Beta Installer"** → Run workflow → branch `main`, version `1.0-beta.1`
2. כשירוק (artifact `Factum-IL-Setup.exe`): ‏`git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1`
   → prerelease אוטומטי עם הקובץ
3. בדיקת התקנה על Windows נקי: 76 מיגרציות, sqlite-vec נטען, corpus counts > 0,
   Ollama-down graceful, עברית RTL

### Migration ledger
- **001–077 תפוסים** (067 = gap מכוון). **הבא הפנוי: 078**

---

## 🗓️ Session handoff — beta-readiness Phase 4/F-G (2026-06-10 המשך)

### הושלם הפעם (המשך אותה פגישה)

#### Phase 4 — Communications
- ✅ **C7** — חשיפת `ai_urgency`/`ai_tags` מ-`CommMessages` דרך כל ה-stack (DB → API → hooks → UI); תגית `דחוף` + pills של תגיות AI על הודעות נכנסות ב-`MessageBubble`
- ✅ **C8** — `POST /api/communications/unknown/:id/convert`: יצירת לקוח חדש או קישור לקיים, חיבור `CommContactIdentities`, סימון resolved, audit. 5 בדיקות route חדשות (22 סה"כ). טופס המרה inline לכל שורה ב-`CommunicationsInboxPage`. hook `useConvertUnknownSender`.
- 📝 **C2 (WhatsApp)** — חסום-סביבה (דורש whatsapp-web.js + WebView2/Edge מקומי); מתועד כהגבלת-beta

#### Phase 5 — Quality hardening
- ✅ dashboard tests: 14 קבצים / 62 בדיקות (מ-4 קבצים לפני)

#### F-F
- ✅ `AiApprovalBar` (אשר/דחה/עריכה) משותף — `WorkbenchInsights`, `DocumentDetail`, `AgentOutputPanel`

#### F-G
- ✅ Route-level lazy-loading: כבר מיושם מלא ב-`lz()` helper בכל ה-routes
- ✅ Print stylesheet: `@media print` ב-`globals.css` — מסתיר sidebar/header/footer/controls, רקע לבן, RTL תקין
- ✅ Skip link a11y: `<a class="skip-link">` ב-AppShell מחובר ל-`#main-content`; `aria-label` על כפתור Spotlight; `data-no-print` על header/footer

#### Phase 6 — Release pipeline
- ✅ `build-installer.yml`: תיקון path
- ✅ `publish.ps1`: corpus batch download
- ⚠️ **Trigger נדרש ידנית**: האינטגרציה ה-MCP אינה מורשית ל-`workflow_dispatch`. יש להפעיל ידנית:
  - GitHub Actions → "Build Beta Installer" → Run workflow → `main` → version `1.0-beta.1`
  - כאשר ירוק: push tag `v1.0.0-beta.1` → prerelease אוטומטי עם `Factum-IL-Setup.exe`

### PR פתוח
- **PR #74** `claude/factum-il-beta-readiness-fzz4ky` — C7 + C8 + F-G — CI ריצה; pending merge

---

## 🗓️ Session handoff — beta-readiness Phase 1-2-6 (2026-06-10)

### Migration ledger (after this session)
- **001–072 תפוסים** (main after #68 merge). פרטים:
  - 067 — פנוי (gap; מספר זה לא שוחרר, נדלג עליו)
  - 068 — `comm_ai_tags` (#72)
  - 069 — `verdict_corpus` (#52)
  - 070 — `precedent_library` enhanced (#67)
  - 071 — `legal_drafts` (#68)
  - 072 — `time_entries` (#68)
- **הבא הפנוי:** 073 (כבר בשימוש ב-PR #71 שטרם מוזג)
- **אחרי מיזוג #71:** 073-077 תהיינה תפוסות; הבא הפנוי: **078**

### הושלם הפעם

#### Phase 1 — PR triage (מיזוגים)
- ✅ **#63** (security CWE-22, 45 path-traversal fixes) — מוזג
- ✅ **#72** (audit remediation, migration 068) — מוזג
- ✅ **#58** (hybrid-search LegalSectionEmbeddings wiring, B1) — מוזג
- ✅ **#55** (vacuum-protocol) — מוזג
- ✅ **#52** (verdict-corpus KB, migration 069) — מוזג; תוקן test שהצביע על migration ישן
- ✅ **#67** (ספריית פסקי דין viewer, migration 070) — מוזג
- ✅ **#68** (unified drafting workspace, migrations 071-072; כולל F-C shared components מ-legal-terms.ts + SharedComponents.tsx) — מוזג
- ✅ **#61** (docs/planning — TASKS.md ישן) — **סגור** (מיושן; עדכון נעשה כאן במקום)
- 🟡 **#70** (dashboard redesign) — rebased + CI רץ; ממתין למיזוג
- 🟡 **#71** (legal-brain Phase 1, migrations 073-077) — rebased + CI רץ; ממתין למיזוג (אחרי #70)

#### Phase 2 — Backend gaps
- ✅ **B3** — `notification-service.ts`: החלפת stub ב-console.log ב-no-op שקט; `insolvency.ts` form5-notify: תמיד שומר in-app notification ב-`NotificationsRepository`, שולח WhatsApp רק אם קיים `whatsapp_phone`
- ✅ **B1** — covered by #58 (hybrid-search + LegalSectionEmbeddings)

#### Phase 6 — Release pipeline
- ✅ `build-installer.yml`: תיקון path artifact/release מ-`dist-package\FactumIL_v1.0.0_Setup.exe` ל-`Factum-IL-Setup.exe`
- ✅ `publish.ps1` step 9: תיקון corpus download — במקום קובץ יחיד `legal-corpus.knesset.jsonl.gz`, מורד עכשיו כל `batch-*.jsonl.gz` + `corpus-domain-index.json` מ-`v-corpus-latest` ל-`FactumIL_Dist\legal-corpus\batches\` (תואם ל-legal-corpus-loader.ts:49-55)

### נותר לעבודה הבאה

#### Phase 1 — השלמת מיזוגים
1. המתן ל-CI על #70 ← מזג
2. המתן ל-CI על #71 ← מזג

#### Phase 3 — Frontend gaps
- **F-B** — `/library` legislation reader UI (טרם התחיל)
- **F-D** — "היום שלי" home (partially done by #70 dashboard redesign — reconcile)
- **F-E** — `MatterWorkbench` קיים ב-`apps/dashboard/src/features/cases/MatterWorkbench.tsx` — מסמן כ-done
- **F-F** — standardize AI-approval pattern across AgentOutputPanel, DocumentDetail, WorkbenchInsights
- **F-G** — a11y pass (focus, aria, contrast), print stylesheet, route-level lazy-loading

#### Phase 4 — Communications gaps
- **C2** — WhatsApp manual-send (self-hosted whatsapp-web.js + consent gate)
- **C7** — smart triage (law-il-E2B tagging of inbound messages)
- **C8** — unknown inbox → lead conversion UI

#### Phase 5 — Quality hardening
- dashboard tests: רק 4 קבצים כרגע; יעד ≥20
- full CI gate: typecheck + lint + test + evals

#### Phase 6 — Trigger build
- הפעל `workflow_dispatch` על `build-installer.yml` — זהו הריצה הראשונה אי-פעם
- כאשר ירוק: push tag `v1.0.0-beta.1` → prerelease עם `Factum-IL-Setup.exe`

### ה-PR שלנו
- PR #73: `claude/factum-il-beta-readiness-fzz4ky` — draft, מכיל B3 + Phase 6 fixes

---

## 🗓️ Session handoff — audit ממוקד-פערים + תיקון חוב טכני (2026-06-07)

### הושלם הפעם

- ✅ **אימות דוח החוב הטכני (`reports/דוח-חוב-טכני.md`)** מול הקוד הנוכחי —
  7/9 מהפריטים שדורגו "פתוחים" התבררו **כבר-מתוקנים** (GH1, GH3, GH4, GH5,
  GH6, BN1, וגם CT1 — שהתברר כדריפט-תיעוד ולא כבאג חי). הדוח עודכן עם ראיות
  file:line לכל פריט, ועם רשימת-מעקב מתוקנת ל-31 קבצי routes שנותרו ל-GH2.
- ✅ **CT2 — OTA rollback** — `RollbackMetadata` שהיה מושלך כעת נשמר ב-
  `UpdateStateStore`; נוסף `restoreFromRollback()` (`UpdateRollback.ts`) +
  `POST /api/updates/rollback`. 14 בדיקות חדשות. (הושלם בתחילת הסשן.)
- ✅ **CT1 — תיקון דריפט-תיעוד** — `docs/ocr.md` נכתב מחדש לתאר את ה-pipeline
  החי (`MediaPipeline`/`image-to-pdf.ts`, async `execFile`) במקום `OCRService`
  היתום; נוספה הערת-header ל-`ocr-service.ts` המתעדת שהוא לא-מחובר-לייצור
  אך נשמר כתשתית פוטנציאלית ל-OCR fallback (פריט-מעקב #1).
- ✅ **GH2 — Zod validation** נוסף ל-3 קבצי routes בעלי-blast-radius-גבוה:
  `agents.ts`, `admin.ts`, `erasure.ts` (PII/מחיקת-מידע) — סכמות `z.object().strict()`
  + middleware `validate()`, מחליפות `req.body as {}`. 29 בדיקות חדשות
  (agents: 9, admin: 14, erasure: 6) — כולן ירוקות. 31 קבצים נוספים תועדו
  כרשימת-מעקב מפורשת בדוח החוב הטכני.
- ✅ **`PERFORMANCE_REPORT.md`** (חדש, שורש) — benchmark DB אמיתי
  (`scripts/benchmark-db.ts`, מריץ 67 migrations + 36K שורות נתונים עבריים
  סינתטיים): lookup לפי PK/FK <0.15ms p95, חיפוש FTS5 BM25 ~5-6ms p95 על
  30K מסמכים — **אין בעיית ביצועי-DB**. גודל bundle ה-frontend: chunk יחיד
  1.1MB/270KB-gzip — מתועד כהזדמנות ל-code-splitting (פריט-מעקב #6).
  Ollama/AI latency מתועד כ-out-of-scope (דורש מודל מקומי שאינו זמין כאן).
- ✅ **`INTEGRATION_AUDIT.md`** (חדש, שורש) — תיעוד מצב Telegram (✅ מחובר,
  health-check ב-`getMe()`), Whisper (שני נתיבים — `audio-pipeline.ts` תקין,
  `whisper.ts`/`WHISPER_CMD` **חסר probe**), WhatsApp (✅ stub מתועד, כפי
  שהוחלט ב-2026-06-03 — לא נדרשת פעולה). **תוקן הפער שנמצא**: נוסף
  `probeWhisper()`/`logWhisperHealthAtStartup()` ב-`whisper.ts` (אותה תבנית
  כמו `RagHealingService.probeOllama()` — async, timeout, fail-soft, +3
  בדיקות), מחובר ב-`app.ts` ליד healing-service. גם זוהה ותועד פער חדש:
  **אין שלב תיוג-AI על הודעות נכנסות** (Telegram routing הוא SQL טהור) —
  פריט-מעקב #5 חדש בדוח החוב הטכני.

### נותר לעבודה עתידית (תועד ב-`reports/דוח-חוב-טכני.md` § "נותר לעבודה עתידית")
1. OCR fallback ל-PDF סרוקים (חיווט `runOCRInWorker`)
2. CT2 — אימות-בריאות אוטומטי לאחר עדכון (auto-rollback trigger), P2
3. GH2 — 31 קבצי routes נוספים ללא Zod validation (רשימה מפורשת בדוח)
4. `OCRService`/`ocr-runner.ts` — החלטת disposition (לשמור/למחוק)
5. **חדש:** תיוג-AI על הודעות נכנסות — מעולם לא חובר ל-`routeInbound`
6. **חדש:** code-splitting ל-bundle ה-frontend (chunk 1.1MB → `React.lazy()`)

---

## 🗓️ Session handoff — עדכון תיעוד מקיף (2026-06-04)

### הושלם הפעם

- ✅ **PR #59 — עדכון תיעוד מקיף לגרסה v1.0.0** — מוזג ל-main.
  **קבצי שורש (5):** `README.md`, `DEVELOPMENT.md`, `ARCHITECTURE.md`, `BUILD.md`, `CHANGELOG.md` —
  עודכנו לשקף 25 packages, 60 migrations, 5 agents, 6 workers, RBAC, sqlite-vec, Data Firewall,
  installer 12 שלבים + 8 registry env vars + תיקון `FACTUM_IL_VERSION`.
  **docs/ (24 קבצים):** 18 עדכונים + 6 חדשים (תוכניות-מימוש מסומנות כ-IMPLEMENTED):
  `setup`, `architecture`, `engineering-decisions`, `production-release-manifest`, `pipeline`,
  `admin-tools`, `ai-isolation`, `recovery`, `search-scaling`, `db-hardening`, `chaos-testing`,
  `supervisor`, `queue`, `ocr`, `client-management`, `action-plan`, `office-config`,
  `PROJECT-EVOLUTION-LOG` + כל 6 קבצי ה-IMPLEMENTATION-PLAN.

- ✅ **סנכרון main** — main מעודכן לאחרונה. נמצאו ב-main שינויים חדשים (ממישורי-עבודה אחרים):
  - 4 migrations חדשות: `063_communications`, `064_comm_templates`, `065_comm_evidence`, `066_call_logs`
  - מודול תקשורת מלא: `packages/api/src/routes/communications.ts`, Telegram, Whisper transcription
  - דפי נחיתה: `landing/index.html`, `accessibility.html`, `terms.html`
  - `WORKPLAN_BACKEND.md`, `WORKPLAN_COMMUNICATIONS.md`, `WORKPLAN_FRONTEND.md`
  - `.github/workflows/codeql.yml` + `ingest-knesset-corpus.yml`
  - עדכון גדול ל-`publish.ps1`

### סלוטי Migration
- **001–066 תפוסים.** הבא הפנוי: **067**

### הצעד הבא
- בניית installer מ-main ← גרסת v1.0.0 מלאה עם מודול-תקשורת
- בדיקת-התקנה מאפס (fresh install): ווידוא 66 migrations עוברות, FACTUM_IL_VERSION מדווח, sqlite-vec נטען
- (אופציונלי) F-B: דפדפן קורפוס חקיקה/פסיקה לקריאה מילולית
- (אופציונלי) F-D: Dashboard "היום שלי" מבוסס-משימות
- (חסומי-סביבה) C1 Telegram מסירה-חיה (דורש allowlist) · C5/C6 Whisper מקומי

---

## 🗓️ Session handoff — תכנון + audit (2026-06-03)
**הושלם הפעם:**
- שלוש תוכניות-עבודה מתואמות נדחפו ל-PR #54 (ענף `claude/lucid-johnson-D3EzR`):
  `WORKPLAN_FRONTEND.md`, `WORKPLAN_BACKEND.md`, `WORKPLAN_COMMUNICATIONS.md`.
- **מודול תקשורת (C-plan)** — הכרעות בעלים ננעלו: טלגרם (Bot API רשמי) ראשי · וואטסאפ (self-hosted, שליחה-ידנית) גיבוי ·
  מסמכים בקישור-מקומי · הסכמה+audit · **חשבון מרכזי אחד למשרד + Smart Routing** לתיק ולעו"ד המשויך ·
  Whisper מקומי · תיוג-AI ב-law-il-E2B בלבד · ללא הקלטת-שיחות.
- **audit מבוסס-קוד של ה-Frontend** (M1–M7): רוב התוכנית כבר מומשה. עודכן `WORKPLAN_FRONTEND.md` עם
  טבלת-רקונסיליאציה (done/partial/missing + קבצים).

**פערי-Frontend אמיתיים שנותרו (לפי ה-audit):**
1. `/search` — UI לא מרנדר תוצאות FTS5 (hook `useSearch` קיים, לא בשימוש) → F-A.
2. אין דפדפן-קורפוס חקיקה/פסיקה לקריאה מילולית (PrecedentsPage הוא אימות-תקדימים) → F-B.
3. אין `lib/legal-terms.ts` מרכזי; רכיבים משותפים לא מחולצים → F-C.
4. Dashboard עדיין KPI ולא "היום שלי" מבוסס-משימות → F-D.
5. אין שולחן-עבודה 3-פאנלים (החלטת-עיצוב) → F-E.

**הושלם בהמשך הסשן:**
- ✅ **F-A (חיפוש גלובלי)** — `SearchPage` + `SpotlightSearch` חוברו ל-contract הקנוני של FTS5
  (`SearchHit`), עם `features/search/shared.tsx` (entity-meta/href/grouping/highlight) ובדיקת-חוזה
  `engine.test.ts`. typecheck/lint/build נקיים.
- ✅ **C0 (תקשורת — תשתית מלאה)** — migration 060 (7 טבלאות), `CommunicationsRepository` (Smart Routing +
  consent gate + audit), `/api/communications` עם RBAC מדורג (admin/assistant/attorney), הצפנת credentials של
  ערוצים ב-field-cipher (AES-256-GCM; רק credential_ref נשמר). 7 בדיקות repo + 7 בדיקות route; DB(72)+API(92) ירוקים.

- 🟡 **C1 (טלגרם — Bot API)** — `modules/telegram/`: `TelegramClient` (HTTP מוזרק), `handleTelegramUpdate`→routeInbound,
  `sendTelegramText` best-effort, routes connect/webhook/set-webhook. 8 בדיקות; API(100) ירוק.
  ⚠️ `api.telegram.org` לא ב-allowlist → מסירה חיה לא אומתה כאן (הקוד מוכן לסביבה עם גישת-רשת).

- ✅ **C3 (ציר-זמן אחיד + נקודות-כניסה)** — `features/communications/`: `CommunicationsPanel` (master/detail, בועות,
  שער-הסכמה ב-UI), hooks ל-`/api/communications`, טאב "תקשורת" ב-CaseDetail+ClientCard, route `/communications` +
  פריט סיידבר "מרכז תקשורת" + תיבת אלמונים. typecheck+lint+build נקיים.
- 🔧 **יישור RBAC (תיקון):** endpoints תפעוליים של התקשורת הופכו ל-ungated (כמו /cases,/documents) כדי להתאים ל-app
  המקומי הנאמן; סודות (channels, telegram connect) נשארו admin-gated. בקרת-שליחה = consent gate(409)+audit+HITL.
- 📝 **C2 (WhatsApp) הערת-ארכיטקטורה:** Puppeteer יוגדר עם `executablePath` ל-WebView2/Edge המקומי (לא הורדת Chromium).

- ✅ **C4 (תבניות חכמות)** — migration 061 (CommTemplates+CommSecureLinks, 4 זרעים), `CommTemplatesRepository`
  (render טהור + matchTemplates specificity + secure links), routes match/render, ובורר תבניות ב-UI. 6 repo + 2 route tests.

- ✅ **C5 (ראיות + תמלול)** — migration 062 (CommEvidence נעול+content-hash, transcript col), saveMessageAsEvidence/
  listCaseEvidence/setTranscript, מודול transcription (Whisper מוזרק, WHISPER_CMD), routes save-evidence/evidence/transcribe,
  ו-UI (שמור-כראיה + תמלל + באנר מוצגים). +3 repo/+2 transcription/+2 route tests.
- ✅ **C6 (תיעוד שיחות + הכתבה + שני צירי-זמן)** — migration 063 (`CallLogs`, אדיטיבי, idempotent),
  `CallLogsRepository` (create/list-by-client+case/update/`saveAsEvidence`), הרחבת `caseTimeline()` עם אירועי
  `call` (שיחות שקודמו לראיה) + `evidence` (מוצגי-הודעות C5) → **שני צירי-זמן נפרדים** (תקשורת ↔ תיק).
  routes: `POST /communications/calls` (+פריטי-פעולה→Tasks), list, `PATCH`, `/save-evidence`, `/transcribe-audio`
  (הכתבה מקומית, 409 ללא Whisper). UI: `CallLogModal` (Modal, הקלטה→הכתבה), כרטיסי-שיחה ב-`CommunicationsPanel`,
  טאב **"ניהול תקשורת לקוח"** + כפתור "תעד שיחה" ב-ClientCard, הסרת טאב התקשורת מ-CaseDetail,
  `call`/`evidence` ב-KIND_META (CaseTimeline/Calendar/DeadlineMonitor). +4 repo/+timeline/+4 route tests.
  נדחה: העלאת-קבצים לצירופים (אין pipeline), חיוב לפי `duration_minutes`, מיפוי-אוטומטי לפי סוג-הליך.
  חסום-סביבה: הכתבה חיה דורשת `WHISPER_CMD` מקומי (מאומת דרך injection + מסלול 409).

- ✅ **קליטת-קבצים אוטומטית (Vacuum Protocol — אינטגרציה)** — חיבור שרשרת-הקליטה מקצה-לקצה
  (היה: `FileWatcher`/`FileSystemAdapter`/`MediaPipeline` קיימים אך לא מחוברים). ארכיטקטורת
  **תור עמיד דרך WatcherEvents**: ה-watcher רושם כל קובץ יציב לטבלה (processed=0); processor
  ברקע (`watcher-event-processor.ts`) מנקז, קורא ל-`MediaPipeline.ingest()`, מסמן processed
  עם queued/duplicate/excluded, ו-retry עד 3 ניסיונות לפני סגירה (לא hot-loop). שורד קריסות.
  - DB: `WatcherEventsRepository` (listUnprocessed/markProcessed/recordRetryableError/enqueue/
    recent/stats) — ללא migration (הטבלה קיימת מ-007). 5 בדיקות.
  - API: `file-ingestion.ts` (controller: watcher lifecycle + reconfigure + rescan), חיווט
    ב-`start.ts` (תחת SAFE_MODE, עם MediaPipeline) + shutdown. endpoints ב-admin:
    `GET /admin/ingestion/status|folders`, `PUT /admin/ingestion/folders` (ולידציה + hot-reconfig),
    `POST /admin/ingestion/rescan`. תוקן באג `WatcherEvents ORDER BY detected_at`→`occurred_at`.
    `@factum-il/pipeline` נוסף ל-deps של api. 6 בדיקות processor + 4 בדיקות ConfigStore.
  - תיקיות-מעקב נשמרות ב-`ConfigStore` (`watchFolders`, נורמליזציה+dedupe, שורד restart).
  - UI: `FileIngestionPanel` ב-Diagnostics (סטטיסטיקות, עריכת תיקיות, סריקה חד-פעמית, אירועים
    אחרונים) + hooks `useIngestionStatus`/`useSetWatchFolders`/`useRescanFolder`.
  - אימות: database 101 · api 146 · dashboard typecheck+lint+build · lint נקי בכל החבילות.

**הצעד הבא (אופציות):** הברחת-נתונים אמיתית (B0 #50/#52 — אכלוס קורפוסים), או הרחבות-קליטה
(metrics/דשבורד-קליטה ייעודי, זיהוי-לקוח/תיק אוטומטי בקליטה). חסומים-סביבה: C1 מסירה-חיה
(Telegram allowlist), C2 (whatsapp-web.js+WebView2), C5/C6 Whisper (מודל מקומי).

---

## Legal Corpus — Hybrid offline ingestion (Knesset OData × WikiSource) ✅ (2026-06-02)
Verbatim, per-law-isolated legislation KB, offline-first. Supersedes PR #50's hardcoded
70-law manifest. Branch `claude/upbeat-hamilton-ma4LI`.
- **Foundation (from PR #50, brought forward):** migration `061_legal_corpus.sql`
  (`LegalSources`/`LegalSections` verbatim + `UNIQUE(source_id,section_label)` isolation /
  `LegalSectionEmbeddings` / `fts_legal_sections` FTS5) · `LegalCorpusRepository` (database) ·
  read-only `GET /api/legal-corpus/{sources,sources/:key,search}` · wired into db/start/app.
- **Hybrid ingestion (new):** `@factum-il/legal-corpus-ingest` (private workspace pkg, NOT a
  dep of api/desktop → never shipped). OData `KNS_IsraelLaw` (`LawValidityDesc eq 'תקף'`,
  **1,077** valid laws) = authoritative registry; WikiSource "ספר החוקים הפתוח" = full text,
  matched **deterministically by `{{ח:מאגר|IsraelLawID}}`** (not fuzzy by name). Verbatim
  slicer ported from PR #50. Unmatched/valid → **metadata-only row** (zero sections, no
  fabricated text). Emits one-law-per-line JSONL(.gz) + optional per-section embeddings
  (`nomic-embed-text`). CLI: `pnpm ingest-knesset-odata -- [--out --embed --limit --only]`.
- **Offline loader:** `initLegalCorpus()` (api) imports the bundled artifact into SQLite on
  first boot (idempotent; reloads only when the artifact signature changes; graceful if
  absent). Zero runtime network for legislation — `packages/**` never fetches OData/WikiSource.
- **Bundling:** artifact gitignored; `publish.ps1` stages `assets/legal-corpus/*.jsonl.gz` →
  `installer.iss` → `{app}\app\legal-corpus\` (FACTUM_IL_ROOT), `skipifsourcedoesntexist`.
- **Resolver robustness:** distinguishes transient API failures (429/5xx/network, honors
  Retry-After) from definitive absence (HTTP 200 + missingtitle) so a rate-limit blip never
  silently demotes a real law to metadata-only — a two-pass run retries transient failures
  gently. `candidateTitles()` also tries a bracket-stripped variant ('… [התשס"א]' → '…') to
  catch ספר-החוקים pages titled without the version/[נוסח חדש] suffix.
- **Verified:** typecheck/lint clean; tests green — ingest 23/23, database 70/70, api 112/112.
  PR #53 CI green. Live smoke: חוק העונשין → 660 verbatim sections, 100% ID-match.
  Coverage on an 80-law live sample: **65% → 96.2% (transient two-pass) → ~100%** (bracket-strip
  recovered the rest, incl. Basic Laws הכנסת/השפיטה/הממשלה/חופש העיסוק/כבוד האדם/מבקר המדינה).
- **Next:** (1) run a full `pnpm ingest-knesset-odata -- --embed` in an egress+Ollama dev env to
  produce the real artifact + confirm match-rate across all 1,077 laws (sample validated only);
  (2) publish it as a GitHub Release asset and point `publish.ps1` at it; (3) wire
  `LegalSectionEmbeddings` into
  `hybrid-search`/`prompt-builder` with per-law scoping (deferred from PR #50); (4) optional
  wikitext `{{ח:סעיף|…}}` template parser for finer section labels. Close PR #50 in favour of this.

## Task E — Full Legal Workbench UI ✅ (2026-06-01, on top of merged PR #44)
מסך 3-פאנלים לתיק (`/cases/:id/workbench`): Timeline | Document Viewer | AI Insights — הרכבה
טהורה של פאנלים בדוקים, ללא backend חדש.
- `CaseTimeline` קיבל prop אופציונלי `onSelectDocument` (אירוע-מסמך טוען בצד במקום ניווט).
- `WorkbenchDocViewer` (צופה inline: PDF iframe / תמונה / OCR), `WorkbenchInsights` (תובנות
  המסמך הנבחר + אשר/דחה + "מקור"), `MatterWorkbench` (פריסת 3 עמודות + סקירת-תיק + דיון-הבא +
  מועדים + CaseRiskPanel + CaseCitations). ברירת-מחדל: המסמך המתוארך האחרון.
- route `/cases/:id/workbench` + כפתור "שולחן עבודה" ב-CaseDetail.
- follow-ups שנותרו: אכלוס Entities ב-pipeline · hOCR pixel-highlight · Annotations API ·
  §4.7.1 אימות Rules_Engine.

## Phase 0 — Stability ✅ COMPLETE
- TypeScript typecheck errors fixed across 7 packages
- vitest 1.x → 3.x upgrade
- CSV parser fixed (Hebrew mid-field quote)
- GitHub Actions CI wired (typecheck + test + evals jobs)
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
- `@factum-il/evals` — golden datasets, eval runner, precision/recall metrics, CI regression job
- `@factum-il/ai-guardrails` — hallucination detector, citation verifier, confidence gate
- Streaming Ollama client + SSE endpoint in API

## Phase 4 — Agent Layer ✅ COMPLETE
- `@factum-il/agent-core` — tool-runner (parallel), prompt-builder (Hebrew 5-step), ollama-caller (graceful degradation), agent-runner (confidence gate + human-review flag)
- `db-tools.ts` — 4 Tool factories (case, documents, tasks, hearings)
- Case Summarizer — POST /api/agents/summarize
- Timeline Builder — POST /api/agents/timeline
- Research Agent — POST /api/agents/research (with guardrail check)
- migrations/045 — AgentResults table

## Phase 5 — Document Intelligence ✅ COMPLETE
- OCRmyPDF fast lane in pipeline (deskew + rotate-pages → pdftotext, fallback to Ghostscript+Tesseract)
- Docling OCR lane (layout-aware, 3rd fallback before Ghostscript)
- `@factum-il/litigation-intelligence` — completeness checker (seeded from Rules_Engine), risk scorer (weighted 40/30/20/10), evidence gap analyzer, contradiction detector, filing dependency graph
- migrations/046: ProceduralChecklist + RiskAssessments tables
- DocumentVersions + Annotations tables (migrations/047) + repositories in database
- PDF annotation types: highlight, note, redline, bookmark

## Phase 6 — Extensibility ✅ COMPLETE
- `@factum-il/sdk` — plugin manifest validator, ExtensionPointRegistry (fire hooks across plugins), loadPlugin with capability sandboxing; 8/8 tests
- RBAC: admin/attorney/assistant/reviewer/read_only roles + requireRole middleware
- Contract Review Agent — POST /api/agents/contract-review (clauses, risks, missing sections; always flagForReview)
- Discovery Agent — POST /api/agents/discovery (pre-computes evidence gaps + completeness via litigation-intelligence; always flagForReview)
- db-tools: makeDocumentTool, makeDocumentInsightsTool, makeCaseEvidenceTool
- Local SHA-256 e-signature system — migration/048 (DocumentSignatures table), 5 API endpoints, DocumentSigningPanel UI
- Eval regression suite — baselines/v1.json, regression.ts, run-evals.ts, CI job

## Phase 7 — Control Plane ✅ COMPLETE
- `@factum-il/orchestrator` — workflow stage coordinator (STAGE_ORDER enforcement), document-level advisory lock, idempotency deduplication engine
- `@factum-il/policy-engine` — memory write policy (FACT=allow, AI_SUMMARY=threshold-gated, AI_HYPOTHESIS=deny), agent run policy (deny if already running), retrieval policy stub
- migrations/049 — WorkflowStates, WorkflowIdempotencyLog, AgentRunRegistry tables
- `memory-guard.ts` (additive) — guardMemoryWrite filter in @factum-il/memory
- `deterministic-wrapper.ts` (additive) — stable secondary sort + session cache in @factum-il/retrieval
- `execution-guard.ts` (additive) — canRunAgent / markAgentCompleted / markAgentFailed in @factum-il/agent-core
- 5 control-plane observability metrics added to @factum-il/observability

## Agent Workspace UI ✅ COMPLETE
- `/agents` page — 5-agent tab workspace (summarize, timeline, discovery, contract-review, research)
- `AgentOutputPanel` — reusable component (confidence bar, tool accordion, review banner, Ollama badge)
- CaseDetail — collapsible "בינה מלאכותית" section (סכם תיק | בנה ציר זמן | נתח גילוי ראיות)
- DocumentDetail — "סקירת חוזה AI" button + inline AgentOutputPanel
- Sidebar — סוכני AI nav item

## Monorepo Structure (21 packages + 2 apps)

```
apps/dashboard      ← React 19 RTL, 20+ feature modules
apps/installer      ← PowerShell Windows installer

packages/
  agent-core        ← AgentRunner, tool-runner, execution-guard
  ai                ← OllamaClient, circuit breaker, streaming
  ai-guardrails     ← hallucination detector, citation verifier, confidence gate
  api               ← Express, 40+ routes
  citation-engine   ← Israeli citation parser (Nevo 2021)
  database          ← SQLite + FTS5 + 49 migrations, 17+ repositories
  evals             ← golden datasets, eval runner, regression suite
  events            ← typed domain event bus, event store
  legal-ontology    ← entity types, court hierarchy, synonyms
  litigation-intelligence ← completeness checker, risk scorer, evidence gaps
  memory            ← case memory, session store, memory-guard
  model-router      ← per-model circuit breakers, routing policies
  observability     ← pino logger, metrics SQLite sink, trace IDs
  orchestrator      ← workflow stage coordinator, idempotency engine
  pipeline          ← OCR (OCRmyPDF+Docling+Tesseract), file watcher
  policy-engine     ← memory/agent/retrieval policy rules
  retrieval         ← clause chunker, embedder, hybrid BM25+vector, deterministic-wrapper
  sdk               ← plugin manifest, ExtensionPointRegistry, loadPlugin
  shared            ← types, logging, state-machine, metrics
```

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry

Next available: **050**

## Phase 8 — Case-Isolated Intelligence Architecture ✅ COMPLETE (2026-05-24)

### What was completed this session
All 4 additive layers of the architecture audit are implemented and green. Strictly no breaking changes.

**Layer 1 — DB Architecture & Native Vector Performance**
- `packages/database/src/connection.ts` — ATTACH `_data.db` AS data_store on every non-memory connection; skipped for `:memory:` and read-only
- `migrations/052_vec_chunks.sql` — SKIP_ON_ERROR pragma; `vec_chunks` vec0 virtual table + sync trigger for ChunkEmbeddings
- `packages/retrieval/src/hybrid-search.ts` — native sqlite-vec KNN path with JS cosine fallback; audit warn when caseId absent
- `packages/retrieval/package.json` — `sqlite-vec ^0.1.6` dependency

**Layer 2 — CaseExecutionContext + User Isolation**
- `packages/agent-core/src/case-execution-context.ts` — `computeCaseStateHash`, `checkExecutionValidity` (returns `isStale`, never throws)
- `packages/agent-core/src/case-isolation-domain.ts` — RBAC v1 (active user + case existence), `AuthorizationError`, `createCaseDomain` factory

**Layer 3 — Case-Scoped Facades**
- `packages/retrieval/src/case-scoped-retriever.ts` — `createCaseScopedRetriever(caseId, db)`
- `packages/memory/src/case-scoped-memory.ts` — `createCaseScopedMemory`, `CaseScopedSessionStore` (key prefix isolation)

**Layer 4 — API Route Wiring**
- `packages/api/src/middleware/case-execution-guard.ts` — `withCaseExecutionGuard` (INSERT OR IGNORE → 409 AGENT_BUSY)
- `packages/api/src/routes/agents.ts` — all 5 routes use guard + markAgentCompleted/Failed + `{ isStale, staleReason }` response
- `packages/policy-engine/src/agent-policy.ts` — NULL-safe SQL fix: `IS ?` → `(= ? OR (IS NULL AND ? IS NULL))`

### Draft PR
https://github.com/niraltman1/niraltman1/pull/8

### What to do next
- Review & merge PR #8 when ready
- Consider adding per-attorney `CaseAssignments` table for RBAC v2 (hook point is marked in `case-isolation-domain.ts`)
- Consider moving DocumentChunks + ChunkEmbeddings + OCRCache to the `data_store` schema now that ATTACH is live

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)

Next available: **053**

## Phase 9 — Pre-Release Validation & Merge Hardening ✅ COMPLETE (2026-05-25)

### What was completed this session

**Observability Journal (Migration 053)**
- `migrations/053_agent_execution_events.sql` — AgentExecutionEvents table + 4 indexes
- `packages/agent-core/src/execution-journal.ts` — `journalEvent()` (never throws; append-only)
- Wired into all 5 agent routes: `execution_started`, `execution_completed`, `execution_failed`, `stale_detected`
- Wired into concurrency guard middleware: `concurrency_blocked`
- Exported from `packages/agent-core/src/index.ts`

**New Test Files (69 additional tests → 347 total)**
- `packages/agent-core/src/concurrency-stress.test.ts` — 7 tests (lock race prevention, release, cross-case independence)
- `packages/agent-core/src/stale-execution.test.ts` — 8 tests (4 mutation types, DB error optimism, case deletion)
- `packages/agent-core/src/rbac-integration.test.ts` — 8 tests (auth-first order, AuthorizationError class integrity)
- `packages/agent-core/src/agent-chaos.test.ts` — 5 tests (Chaos A: execution failures, lock cleanup, DB integrity)
- `packages/retrieval/src/sqlite-vec-compat.test.ts` — 7 tests (7 fallback scenarios)
- `packages/retrieval/src/embedding-chaos.test.ts` — 7 tests (Chaos B: null/malformed/empty embeddings)
- `packages/retrieval/src/case-isolation-retrieval.test.ts` — 5 tests (scoped retrieval, audit warning)
- `packages/database/src/migration-chaos.test.ts` — 6 tests (Chaos C: SKIP_ON_ERROR, retry, DB integrity)

**Production Bug Fixed**
- `packages/retrieval/src/hybrid-search.ts` — JS cosine fallback now guards against null embeddings,
  malformed JSON, and empty vectors. Found via chaos testing (Chaos B).

**Scripts**
- `scripts/healthcheck.ts` — 6-check JSON healthcheck (sqlite, filesystem, vec_extension, port, ollama)
- `scripts/release-validate.sh` — clean-env build + test validation pipeline

**Reports (9 files in reports/)**
- `reports/static-validation-report.md`
- `reports/case-isolation-report.md`
- `reports/concurrency-report.md`
- `reports/stale-execution-report.md`
- `reports/sqlite-vec-compatibility-report.md`
- `reports/rbac-validation-report.md`
- `reports/chaos-testing-report.md`
- `reports/release-verification-report.md`
- `reports/final-release-readiness-report.md`

**Portable Runtime Bundle**
- `dist/factum-il-portable/` — start.sh, start.bat, config/.env.example, VERSION, README.md (gitignored, generated at build time)

### What to do next
- Merge PR #8 (all validation complete, verdict: READY)
- RBAC v2: add `CaseAssignments` table (hook point in `case-isolation-domain.ts`)
- vec_chunks backfill script: one-time migration for existing ChunkEmbeddings rows
- AgentExecutionEvents API + dashboard view (GET /api/admin/journal)
- ESLint configuration for monorepo

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)
053: AgentExecutionEvents

Next available: **054**

## Commercial Beta Readiness — Complete (2026-05-26)

### Completed this session

**Self-Hosted Dependencies + Local GGUF (PR #9)**
- `.github/workflows/stage-deps.yml` — manual workflow: downloads Node 22.13.1, Ollama 0.9.0, WebView2, law-il-E2B Q4_K_M GGUF (~1.3 GB) from HuggingFace → uploads all 4 to `v-deps-1.0.0` GitHub Release
- `publish.ps1` (root + apps/desktop) — all download URLs now point to `v-deps-1.0.0` GitHub Release (no external deps during CI)
- `installer.iss` — GGUF bundled to `{app}\models\law-il-E2B-Q4_K_M.gguf`
- `OllamaService.cs` — `GetBundledGgufPath()` + `CreateFromLocalAsync()`: prefers local GGUF, falls back to Ollama Hub pull

**New packages:**
- `packages/support-diagnostics` — diagnostics collection, crash reporting, redaction pipeline, support bundle export (NDJSON)
- `packages/update-core` — VersionManifest parser, UpdateChannel abstraction, RollbackMetadata, UpdateStateStore
- `packages/enterprise-hooks` — capability registry (all disabled at beta tier)
- `packages/encrypted-backup` — AES-256-GCM via Node.js built-in crypto; PBKDF2 key derivation

**Desktop shell hardening:**
- `FactumIL.Desktop/StartupValidator.cs` — 7-check boot validation
- `FactumIL.Desktop/DiagnosticsService.cs` — crash capture, startup diagnostics, support bundle trigger
- `FactumIL.Desktop/RecoveryWindow.xaml` + `.cs` — Hebrew RTL recovery UI
- `FactumIL.Desktop/ApiHostService.cs` — `Start(safeMode: bool)` sets `FACTUM_IL_SAFE_MODE=1` env var
- `FactumIL.Desktop/App.xaml.cs` — RecoveryWindow modal; after "continue", API restarted in safe mode
- `FactumIL.Desktop/FactumIL.Desktop.csproj` — `SelfContained=false` (aligned with `--no-self-contained` CLI flag)

**API routes:**
- `packages/api/src/routes/diagnostics.ts` — GET /status, POST /bundle, GET/DELETE /crashes
- `packages/api/src/routes/recovery.ts` — GET /status, GET /events, POST /event, GET /agents, GET /pipeline, POST /clear-locks
- `packages/api/src/routes/updates.ts` — NEW: GET /app-check, GET /channel, POST /channel (uses update-core)
- `packages/api/src/start.ts` — `FACTUM_IL_SAFE_MODE=1` gates all 6 background workers
- `packages/api/src/utils/server-config-writer.ts` — `safeMode: boolean` field added

**Migration:**
- `migrations/054_system_events.sql` — SystemEvents table for startup/crash/recovery event persistence

**Dashboard:**
- `apps/dashboard/src/components/admin/HealthStatusPanel.tsx` — live health widget (30s refresh)
- `apps/dashboard/src/components/admin/SupportExportButton.tsx` — support bundle export
- `apps/dashboard/src/components/admin/UpdateNotificationBanner.tsx` — NEW: auto-update notification with mandatory/optional distinction, gold Hebrew banner, download link
- Updated `DiagnosticsPage.tsx`, `MissionControlPage.tsx`, `AppShell.tsx`

**Reports:**
- `reports/commercial-beta-readiness-report.md` — full beta readiness assessment

### What to do next (user actions — cannot be automated)

1. **Run `stage-deps.yml`** manually from GitHub Actions → populates `v-deps-1.0.0` release with 4 assets
2. **Merge PR #9** after CI passes
3. **Push tag `v1.0.0-beta.1`** → triggers `build-installer.yml` → produces `FactumIL_v1.0.0_Setup.exe`
4. **Test on clean Windows machine** per checklist in `reports/commercial-beta-readiness-report.md`
5. **Code signing** — get Windows Authenticode cert for v1.0.1 (SmartScreen warning on unsigned EXE)

### What to do next (code — future phases)

- **Phase 11: Update delivery** — when `v-deps-*` pattern is established, publish a `manifest.json` per channel to GitHub Releases so `GET /api/updates/app-check` finds real updates
- **RBAC v2** — add `CaseAssignments` table (hook point in `case-isolation-domain.ts`)
- **AgentExecutionEvents API** — `GET /api/admin/journal` for dashboard visibility
- **vec_chunks backfill** — one-time migration for existing ChunkEmbeddings rows

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)
053: AgentExecutionEvents
054: SystemEvents

Next available: **055**

## CI Status
All checks pass (2026-05-26):
- `pnpm -r typecheck` ✓ (0 errors, 25 packages)
- `pnpm -r test` ✓ (347+ tests, 0 failures)
- `pnpm --filter @factum-il/evals eval` ✓ (eval regression passed)
- Pre-commit hook: ✓ (typecheck on changed packages)

## Production Build Pipeline Fixes (2026-05-27)

### Completed this session

**PR #19 — CS0051: StartupValidator accessibility (merged)**
- `FactumIL.Desktop/StartupValidator.cs` — `internal sealed class` → `public sealed class`
- Root cause: `DiagnosticsService.RecordStartupDiagnosticAsync` (public method, public class) took a parameter
  of type `StartupValidator.ValidationResult`. The nested record was `public` but the enclosing class was
  `internal`, making the nested type's effective accessibility `internal` → CS0051 at `dotnet publish`.
- Allowed `pnpm build:installer` to advance past step 7 (dotnet publish) for the first time.

**PR #20 — Copy-Item file lock retry in publish.ps1 (merged)**
- `publish.ps1` workspace dist copy loop — bare `Copy-Item` replaced with 3-attempt retry (800 ms back-off)
- Root cause: `@factum-il/shared/dist/diagnostics/index.d.ts` locked by VS Code TypeScript server or
  Windows Defender during `Copy-Item -Recurse -Force`. With `$ErrorActionPreference = 'Stop'`, the first
  locked file terminates `publish.ps1` non-zero → outer `pnpm build:installer` reports `ELIFECYCLE exit 1`.
- The retry loop handles transient locks transparently; persistent locks still surface after 3 attempts.

**PR #22 — Step 8 complete rewrite: artifact copy + flat pnpm install --prod (merged)**
- Root causes: (1) VS Code TS-server held persistent file locks on `packages/shared/dist/*.d.ts`
  — 3-retry loop was insufficient. (2) `pnpm deploy --prod` created deep `.pnpm/vite@8.0.13_…`
  content-store paths exceeding Windows 260-char MAX_PATH → bin-shim WARN/failures.
- Fix: kill `node.exe` first (releases locks), drop `pnpm deploy`, build a merged `package.json`
  collecting all third-party deps from API + all workspace packages (captures `better-sqlite3`,
  `sqlite-vec` etc. transitively), write `.npmrc` (`node-linker=hoisted`) + empty
  `pnpm-workspace.yaml`, run `pnpm install --prod --no-lockfile --node-linker=hoisted --prefer-offline`
  → flat `node_modules/` with no deep symlink tree.
- Bonus fix: `litigation-intelligence` was missing from `$PackageBuildOrder` (step 6) and
  `$WorkspacePackages` (step 8) despite being a direct `workspace:*` dep of `@factum-il/api`;
  added to both. Added `"build": "tsc"` script to `packages/litigation-intelligence/package.json`.

### What to do next

- **Run `git pull origin main && pnpm build:installer`** on Windows — PRs #19, #20, #22 all merged.
  Steps 7 and 8 should now complete cleanly (no file locks, no deep-path errors).
- **If step 8 passes but step 9/10 fails:** report the step number and error output.
- **If all 10 steps complete:** verify `FactumIL_Dist\FactumIL_v1.0.0_Setup.exe` exists and install
  on a clean Windows VM for end-to-end smoke test.
- **Remaining planned work:** Production Polish (installer metadata, port discovery, DB shield),
  Coverage & Chaos Tests, Build Environment Fixes (.nvmrc, START.cmd)

## Build Pipeline Fixes — Round 2 (2026-05-30)

### Completed this session

**PR #29 — allow-build in .npmrc (reverted/superseded)**
- ניסיון ראשון: `allow-build=better-sqlite3` ב-`.npmrc` — מפתח לא חוקי ב-pnpm, לא תיקן.

**PR #30 — pnpm.onlyBuiltDependencies ב-package.json (reverted/superseded)**
- ניסיון שני: `pnpm.onlyBuiltDependencies` ב-`package.json` — pnpm 11 התעלם עם WARN, לא תיקן.

**PR #31 — onlyBuiltDependencies ב-backend pnpm-workspace.yaml (reverted/superseded)**
- ניסיון שלישי: `onlyBuiltDependencies` ב-`pnpm-workspace.yaml` של ה-backend — pnpm קרא מ-ROOT workspace, לא מהתיקייה המבודדת.

**PR #32 — `--ignore-scripts` + `npm rebuild better-sqlite3` + overrides (merged)**
- פתרון סופי ל-`ERR_PNPM_IGNORED_BUILDS`:
  - `pnpm install --prod --ignore-scripts` עוקף את חסימת pnpm לגמרי
  - `npm rebuild better-sqlite3` מריץ את ה-native build עם Node שמותקן ב-מכונה
  - `overrides: better-sqlite3: "^11.0.0"` ב-`pnpm-workspace.yaml` — מבטיח גרסה עם Node-22 prebuilt
  - self-verification: `node -e "require('better-sqlite3')"` בסוף שלב 8

**PR #33 — Add-Member -Force לתיקון exports בשלב 8.6 (merged)**
- שגיאה: `Exception setting "exports"` — PowerShell לא יכול להצמיד property חדש ישירות ל-PSCustomObject
- תיקון: `$pkgJson | Add-Member -NotePropertyName 'exports' ... -Force`

**PR #34 — URLs רשמיים לשלבים 10-11 (merged)**
- שגיאה: `Invoke-WebRequest : Not Found` — release `v-deps-1.0.0` לא קיים בריפו
- תיקון: nodejs.org, ollama.com, go.microsoft.com, huggingface.co — כולם URLs רשמיים ציבוריים

### What to do next

- **הרץ על Windows:** `git pull origin main && .\publish.ps1`
- **שלבים 1-9** — אמורים לעבור (תוקנו ב-PRs קודמים)
- **שלב 10** — יוריד `node.exe` מ-nodejs.org (≈30 MB)
- **שלב 11** — יוריד Ollama, WebView2, GGUF (~1.3 GB); הורדת GGUF ארוכה — המתן
- **שלב 12** — `ISCC.exe installer.iss` → `Factum-IL-Setup.exe`
- אם שלב 11 נכשל בגלל GGUF: לא שגיאה קריטית — המודל יורד מ-Ollama Hub בהפעלה ראשונה
- אם כל 12 השלבים עברו: התקן על מכונת Windows נקייה ובדוק smoke test

**PR #35 — תיקון שם exe ו-dashboard path בסיכום (merged)**
- `FactumIL.Desktop.csproj`: `AssemblyName` FactumIL → FactumIL.Desktop כדי ש-`dotnet publish` ייצר `FactumIL.Desktop.exe` כפי שמצפה `installer.iss`
- `publish.ps1` סיכום: `dashboard\index.html` → `dashboard\dist\index.html` (הסטייג'ינג מעתיק לתוך `dist\`)

**PR #36 — תיקון נתיב 8.3 ב-`$env:TEMP` שלב 10 (merged 2026-05-30)**
- שגיאה: `Remove-Item : An object at the specified path C:\Users\021A~1 does not exist.`
- גורם: שם משתמש עברי (`ניר`) גורם ל-Windows להחזיר נתיב 8.3 קצר מ-`$env:TEMP`
- תיקון: `$TempDir = (Get-Item -LiteralPath $env:TEMP).FullName` ממיר לנתיב ארוך מלא
- תיקון נוסף: `-ErrorAction SilentlyContinue` על `Remove-Item` למניעת קריסה על תיקייה שיורית

### What to do next

- **הרץ על Windows:** `git pull origin main && .\publish.ps1`
- כל 12 השלבים אמורים לעבור עכשיו:
  - שלב 8: `better-sqlite3` יותקן ויאומת (`--ignore-scripts` + `npm rebuild`)
  - שלב 10: `node.exe` יועתק ל-`runtime\` ללא שגיאת נתיב
  - שלב 12: `ISCC.exe installer.iss` → `Factum-IL-Setup.exe`
- לאחר בנייה מוצלחת: התקן על מכונת Windows נקייה ובצע smoke test

**PR #37 — תיקון `faDirectory` ב-installer.iss [Code] section (2026-05-30)**
- שגיאה: `Error on line 199 ... Unknown identifier 'faDirectory'. Compile aborted.`
- גורם: שורה 199 כתובה בסגנון Delphi/SysUtils — `faDirectory` לא קיים ב-Inno Setup, ו-`FindFirst` שם מקבל `TFindRec` (לא דגל attributes) ומחזיר `Boolean`
- תיקון: `FindFirst(DesktopDir + '\8.*', FindRec)` + `FindClose(FindRec)` — שימוש ב-Inno Setup API התקין
- זהו שלב 12 (ISCC); 11 השלבים של publish.ps1 כבר עוברים במלואם

---

## UX Modernization — Phase 0 planning (2026-05-31)

נכתבו תוכניות עבודה מעוגנות-קוד לכל ארבעת פריטי Phase-0 שנותרו ברואדמאפ
(`docs/UX-MODERNIZATION-ROADMAP.md` §5 Phase 0), בנוסף לתוכנית הניווט הקיימת
(`docs/IA-NAV-IMPLEMENTATION-PLAN.md`, §4.7.6).

מסמכים חדשים תחת `docs/`:
- `NOTIFICATIONS-INBOX-IMPLEMENTATION-PLAN.md` — §4.1.3 (תיבת התראות)
- `INSIGHT-VERIFICATION-IMPLEMENTATION-PLAN.md` — §4.2.1 (אימות תובנות AI)
- `AGENT-SSE-IMPLEMENTATION-PLAN.md` — §4.2.4 (זרימת שלבי-סוכן)
- `QUICK-ADD-PALETTE-IMPLEMENTATION-PLAN.md` — §4.6.1 + §4.6.4 (יצירה מהירה + פקודות Cmd+K)

**שני תיקונים לרואדמאפ שעלו מעיגון בקוד (חשוב לפני מימוש):**
1. §4.1.3 מסומן `[backend ready]`, אך אין טבלת `Notifications` ואין read-API —
   `notification-service.ts` הוא רק stub ל-WhatsApp. צריך migration 058 + גנרטור שמתמיד שורות.
2. §4.2.4 טוען ש"כל 5 הסוכנים חושפים /stream" — לא מדויק. קיים רק endpoint גנרי לטוקנים
   (`/api/ai/stream`). המימוש המומלץ: לפלוט אירועי-שלב לטבלת `AgentExecutionEvents`
   (mig 053, קיימת) ולהזרים אותם ב-SSE per-execution.
   הערה נוספת — §4.2.1: `findInsights` מחזיר שורה אחת לכל מסמך, לכן MVP הוא אימות ברמת-רשומה;
   אימות per-field דורש שינוי סכמה (נדחה).

### What to do next
- כל תוכנית כוללת: קבצים לשינוי, reuse, סיכונים, ואימות.

## תיבת התראות (§4.1.3) — מומשה (2026-05-31)

מומש הפריט הראשון מתוך תוכניות Phase-0 — אינבוקס התראות מלא (backend → UI):

**Backend:**
- `migrations/058_notifications.sql` — טבלת `Notifications` (additive, `dedup_key` UNIQUE לאידמפוטנטיות).
- `packages/database/src/queries/notifications.ts` — `NotificationsRepository`
  (`upsert` עם `ON CONFLICT DO NOTHING`, `listRecent`, `unreadCount`, `markRead`, `markAllRead`)
  + ייצוא ב-`index.ts`. בדיקות: `notifications.test.ts` (5 עוברות).
- `Repos` (`db.ts`) + בנייה ב-`start.ts`.
- `packages/api/src/routes/notifications.ts` — `GET /api/notifications`, `POST /:id/read`,
  `POST /read-all`; רשום ב-`app.ts`. עוקב אחר תבנית local-first (ללא requireAuth, כמו queue/tasks).
- גנרטורים מתמידים שורות ליד הקריאות הקיימות (WhatsApp/log נשמרו כמו שהם):
  `deadline-tracker-scheduler.ts` (task_due + statute_deadline, נשמר גם ללא טלפון) ו-
  `insolvency-nudge-scheduler.ts` (form5_gap).

**Frontend:**
- `apps/dashboard/src/api/hooks.ts` — `useNotifications` (polling 60s), `useMarkNotificationRead`,
  `useMarkAllNotificationsRead` + `QUERY_KEYS.notifications`.
- `components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx` — פעמון עם באדג'
  unread, popover עם deep-links, סמן-כנקרא / סמן-הכל. נטען ב-`AppShell` (top bar חדש).

**אימות:** database (30 בדיקות), api app.test (14), dashboard typecheck + production build — כולם ירוקים.

## ביקורת Phase-0 + Quick-Add/פקודות (§4.6.1+§4.6.4) — מומש (2026-05-31)

**ממצא ביקורת חשוב:** בעת המעבר לפריטים הבאים התגלה שהקוד מקדים את הרואדמאפ —
שני פריטי Phase-0 כבר ממומשים בליבתם, בניגוד למה שהרואדמאפ והתוכניות הניחו:
- **§4.2.1 (אימות תובנות):** כבר קיים ב-`DocumentDetail.tsx` — `useDocumentInsights` +
  `useVerifyInsight`, תצוגת שדות, פס-ביטחון, תג `verification_state`, וכפתורי אשר/דחה.
  נותר (נדחה): עריכה inline לפני אישור, אימות per-field (דורש שינוי סכמה), "אשר הכל מעל 85%".
- **§4.2.4 (SSE סוכנים):** כבר קיים — `agentsStreamRouter` עם 5 endpoints `/stream` +
  `useAgentStream` (EventSource). ה-progress גס (5%→20%→100%). נותר (נדחה): granularity של
  5 השלבים — דורש token-streaming מ-Ollama וקשה לאמת ללא Ollama רץ.
- הבאנרים עודכנו בראש שני מסמכי-התוכנית בהתאם.

**מומש §4.6.1+§4.6.4 (Quick-Add + פקודות בלוח-הפקודות):**
- `apps/dashboard/src/commands/command-registry.ts` — `COMMANDS` (צור תיק/לקוח/משימה) +
  `matchCommands` (תמיכה בקידומת `>`, התאמה לפי תווית/keywords). **7 בדיקות יחידה.**
- `SpotlightSearch.tsx` — מקטע "פקודות" משולב בניווט-המקלדת (selectables מאוחד: פקודות→תוצאות),
  dispatcher `activate`, `CommandRow`. הפקודות מנווטות עם `?new=1`.
- `useSpotlight.ts` — קיצור גלובלי **"n" / "+"** ל-Quick-Add (מושתק בתוך שדות קלט).
- `CasesPage` / `ClientsPage` / `TasksPage` — קוראים `?new=1` ופותחים את **הטופס הקיים**
  (reuse מלא, ללא טפסים חדשים וללא העברת state גלובלי).
- time-entry הושמט בכוונה עד §4.1.5 (חיוב). dashboard typecheck + build ירוקים.

## שדרוג ניווט/IA (§4.7.6) — מומש (2026-06-01)

הסרגל הצדי שודרג מ-6 פריטים שטוחים + תפריט הגדרות ל-**אקורדיון 8 קבוצות** שחושף את כל
~25 ה-routes. אומת ש-CI ירוק על PR #44 לפני תחילת העבודה.

- `components/layout/nav-config.tsx` (חדש) — `NAV_GROUPS` (8 קבוצות, כל פריט route קיים),
  `DEFAULT_EXPANDED`, `ALL_NAV_ITEMS`, `groupIdForPath` (longest-prefix). כל 33 אייקוני
  Phosphor אומתו מול node_modules לפני הכתיבה.
- `store/index.ts` — נוספו `expandedGroups` + `toggleNavGroup`/`setNavGroupOpen` ו-middleware
  `persist` (`partialize` → `{sidebarCollapsed, expandedGroups}`, `merge` מזריע דיפולטים
  לקבוצות חדשות; שם store `factum-il-ui`).
- `Sidebar.tsx` (נכתב מחדש) — אקורדיון במצב מורחב, מסילת-אייקונים שטוחה עם מפרידים במצב מכווץ,
  הרחבה-אוטומטית של הקבוצה הפעילה (`useLocation`), "דווח על באג" הועבר לקבוצת מערכת.
  נשמרו: סמל המותג, כרטיס Ollama, כפתור הכיווץ. ה-router לא שונה.
- בדיקות: `__tests__/Sidebar.test.tsx` (5). dashboard: 23 בדיקות, typecheck + build ירוקים.

## שיפורים נדחים של Phase 0 — טופלו (2026-06-01)

לאחר אימות CI ירוק על `6b1669e`, טופלו השיפורים הנדחים:
- **§4.2.1 עריכה inline** — `PATCH /api/documents/insights/:id` + `updateInsightFields`
  (6 בדיקות) + מצב עריכה ב-`DocumentDetail`. (per-field confidence + bulk-approve הושארו
  נדחים בכוונה: המודל פולט confidence יחיד → UI per-field יזייף מספרים; bulk צריך את מסך
  הסקירה §4.2.2 ב-Phase 1.)
- **התראות auto-resolve + העדפות** — migration 059 (`resolved_at`), reconcile בסקדיולרים
  (משימה checked/cancelled, תיק לא-open, filing שעזב Pre_Filing), והשתקת סוגים client-side
  בפאנל. (notifications: 7 בדיקות.)
- **§4.2.4 התקדמות שלבי-ריצה** — `onProgress` ב-`runAgent` (gathering→context→analyzing→
  validating) דרך 5 ה-wrappers וה-`/stream`. (agent-progress: 3 בדיקות.) ה-rail של 5 שלבי-
  ההנמקה לא נבנה בכוונה — המודל מחזיר JSON בלבד (אין סמני-שלב לפרסר), ושינוי זה מסכן את
  הפלט המכויל ודורש Ollama חי לאימות.

## Phase 1 — לוח שנה / דוקטינג (§4.1.1) — מומש (2026-06-01)

הפריט הראשון והבכיר ב-Phase 1 (מונע סיכון malpractice). אומת ש-CI ירוק על `f49a7f7` לפני.

- `packages/database/src/queries/calendar.ts` — `CalendarRepository.eventsInRange(from,to)`
  מאחד שלושה מקורות: `court_hearings`, מועדי התיישנות (`Cases.statute_deadline`, status=open),
  ומשימות פעילות (`Tasks.due_date`, pending/in_progress). מנרמל ל-`CalendarEvent`. 5 בדיקות.
- `Repos` + `start.ts` + `GET /api/calendar/events?from=&to=` (`routes/calendar.ts`, ולידציית תאריך).
- `useCalendarEvents` hook; עמוד `features/calendar/CalendarPage.tsx` — רשת חודשית RTL,
  תצוגת אג׳נדה, ריל "מועדים קרובים (30 יום)", צ׳יפים צבועים לפי סוג (דיון/התיישנות/משימה),
  קליק→ניווט לתיק. route `/calendar` + פריט ניווט "יומן" בקבוצת "עבודה שוטפת".

## Phase 1 — קורא/מציג מסמכים (§4.1.2) — MVP מומש (2026-06-01)

המשתמשים יכולים סוף-סוף *לקרוא* מסמך בתוך האפליקציה (היה "partial backend" — לא היה endpoint
להגשת קובץ). אומת CI ירוק על `e117c55` לפני.

- `GET /api/documents/:id/file` — מגיש את הקובץ המקומי (mime מ-`mime_type`/סיומת,
  `inline` + `nosniff`, ולידציית קיום קובץ). מקומי בלבד.
- `features/documents/DocumentReader.tsx` + route `/documents/:id/read`:
  PDF → `<iframe>` (PDF נייטיב של WebView2, בלי pdfjs כבד); תמונה → `<img>` עם זום;
  אחר → הודעה + הורדה. טוגל "טקסט OCR" (2 עמודות), הורדה, קישור לתובנות AI.
- כפתור "קרא מסמך" נוסף ל-`DocumentDetail`.

## Legal Workspace Directive — Step 0 + M1 + M2 (2026-06-01)

עבודה לפי תוכנית `act-as-a-senior-steady-stardust` (אופרציונליזציה של "Legal Workspace UX
Directive"). כל שלב נדחף אחרי אימות CI ירוק של קודמו.

- **Step 0 — מוניטור מועדים/SLA (§4.4.3)** [commit 09f9440] — `deadlinesAtRisk` (calendar.ts,
  9 בדיקות), `GET /api/calendar/deadlines`, `DeadlineMonitorPage`, route `/deadlines`, נאב
  "ראדאר מועדים". (תיקון ה-lint שחסם: הוסר import לא בשימוש.)
- **M1 — Risk Dashboard לכל תיק** [commit bb1dc0c] — `utils/risk-summary.ts` (טהור, 6 בדיקות):
  בנדים פרוצדורלי/ראיות/מועדים + מונים (ראיות חסרות, תובנות לא-מאומתות, אסמכתאות פתוחות).
  `GET /api/cases/:id/risk` (reuse litigation-intelligence + deadlinesAtRisk + counts).
  `useCaseRisk` + `CaseRiskPanel` מוטמע ב-`CaseDetail` מעל הטאבים. ללא AI חדש.
- **M2 — "הצג מקור" לתובנות (Principle 2)** [commit 8c7fca9] — `highlight.ts` (splitHighlight,
  7 בדיקות); `DocumentReader` קורא `?page=&highlight=` (PDF `#page=N` נייטיב, פתיחת OCR אוטומטית
  + `<mark>` + גלילה למקור); `InsightValue` ב-`DocumentDetail` עם קישור "מקור" לכל שדה.

### M3 — Interactive Timeline ✅ [commit 69c9563]
`CalendarRepository.caseTimeline(caseId)` (kind 'document' נוסף; 11 בדיקות calendar),
`GET /api/cases/:id/timeline`, `useCaseTimeline`, `CaseTimeline` (קיבוץ לפי שנה, אירוע→
מסמך/דיון/משימה), טאב "ציר זמן" ב-CaseDetail. דטרמיניסטי, ללא AI.

### M4 — Citation Intelligence ✅ [commit 26bc77f]
`CitationsRepository.caseCitationIntelligence` (תדירות + firm-usage + locations; 4 בדיקות),
`GET /api/cases/:id/citations`, `useCaseCitations`, `CaseCitations` (כרטיסי אסמכתא + "מקור
במסמך"), טאב "אסמכתאות". reuse `citation_registry`.

### M5 — Hearing Preparation Workspace ✅ [commit 7c0968e]
`HearingPrepPage` ב-`/cases/:id/hearing-prep` — באנר דיון-הבא (נגזר מ-caseTimeline) + פריסת
3 עמודות שמרכיבה את הפאנלים הקיימים: CaseRiskPanel (M1) + מועדים פתוחים (deadlinesAtRisk
מסונן לתיק), CaseTimeline (M3), CaseCitations (M4). כפתור הדפסה. כפתור "הכנה לדיון" ב-CaseDetail.
הרכבה טהורה, ללא backend חדש — ההתכנסות הראשונה ל-Legal Workbench.

### M6 — Entity-Centric Navigation ✅ (גרסה בטוחה, ללא שינוי pipeline)
מימוש on-read: שמות שופטים/בתי-משפט נגזרים מהטקסט-החופשי הקיים (`court_hearings.judge_name`,
`DocumentInsights.judge_name`/`court_name`) ומנורמלים עם `normalizeJudge`/`normalizeCourt`
מ-legal-ontology — בלי לגעת ב-pipeline.
- `EntitiesRepository` (judgeReferences/courtReferences; 2 בדיקות) + `entity-grouping.ts`
  טהור (summarizeEntities/entityDetail; 5 בדיקות) ב-API.
- `routes/entities.ts`: `/api/entities/judges|courts` + `/:name`. נוסף `@factum-il/legal-ontology`
  ל-deps של api.
- `EntitiesPage` (`/entities`, טאבים שופטים/בתי-משפט) + `EntityDetailPage`
  (`/entities/:type/:name`, הפניות→תיק/קורא-מסמך) + פריט ניווט "ישויות" בקבוצה המשפטית.
- **נדחה (follow-up):** אכלוס טבלאות `Entities`/`EntityRelations` (mig 042) בעת חילוץ —
  היסוד לגרף-ידע מתמשך; דורש שינוי pipeline.

### M7 — Smart Collections ✅ (P2)
אוספים דינמיים מעל מסמכים, מוגדרים בשאילתה (לא תיקייה), תמיד מעודכנים.
- `SmartCollectionsRepository` (unverified / recent / ocr_pending / hearing; overview עם
  מונים; 5 בדיקות). `GET /api/collections` + `/:key`.
- `SmartCollectionsPage` (`/collections`) — כרטיסי אוסף עם מונה + רשימת מסמכים → קורא;
  פריט ניווט "אוספים חכמים" בקבוצת מסמכים.

### כל ה-Milestones של הדירקטיבה הושלמו (M1–M7 + Step 0)
נותרו follow-ups בלבד:
- אכלוס `Entities`/`EntityRelations` ב-pipeline (יסוד גרף-ידע מתמשך; blast-radius — סבב ייעודי).
- highlight ברמת-פיקסל ב-Reader (דורש hOCR מ-OCR pipeline).
- Annotations API (טבלה קיימת, אין routes) לשכבת-הערות אינטראקטיבית.
- §4.7.1 Rules-engine surface — לאמת קודם קיום `CREATE TABLE Rules_Engine`.
- **Legal Workbench מלא**: HearingPrep (M5) הוא ההתכנסות הראשונה; אפשר להרחיב למסך 3-פאנלים
  ייעודי (Timeline | Viewer | Insights) שמרכיב את הפאנלים הקיימים.
- **M6 Entity-Centric Navigation** (P1, יסודי): אכלוס `Entities`/`EntityRelations` (mig 042, לא
  בשימוש) דרך legal-ontology + `/api/entities` + שמות שופט/ביהמ"ש לחיצים.
- **M7 Smart Collections** (P2) → ואז התכנסות ל-**Legal Workbench** (3 פאנלים).
- נדחים: highlight ברמת-פיקסל (דורש hOCR), Annotations API (טבלה קיימת ללא routes),
  §4.1.2 הרחבות (pdfjs), §4.7.1 (טבלת Rules_Engine — אין CREATE TABLE; לאמת לפני בנייה).

## Annotations API — מומש (2026-06-02)

המשך לפי תוכנית העבודה — מימוש ה-follow-up "Annotations API". הטבלה `Annotations`
(migration 047) ו-`AnnotationRepository` כבר היו קיימים ומיוצאים, אך לא היו routes כלל.
תוספת אדיטיבית בלבד, local-first, ללא שינוי pipeline.

**Backend:**
- `packages/api/src/routes/annotations.ts` — `GET /api/annotations?documentId=N[&page=P]`,
  `POST /` (ולידציית documentId + annotationType מתוך 4 הסוגים), `PATCH /:id`
  (content/color/x/y/width/height; 404 אם לא קיים), `DELETE /:id` (404 אם לא קיים).
  בניית ה-input תחת `exactOptionalPropertyTypes` (ללא הצמדת `undefined` לשדות אופציונליים).
- חיווט `AnnotationRepository` ל-`Repos` (`db.ts` + `start.ts`) ורישום ב-`app.ts`.
- בדיקות: 7 בדיקות route חדשות ב-`app.test.ts` (טבלת `Annotations` נוספה ל-harness) →
  API: 92 בדיקות עוברות.

**Frontend:**
- `apps/dashboard/src/api/hooks.ts` — `useDocumentAnnotations`, `useCreateAnnotation`,
  `useUpdateAnnotation`, `useDeleteAnnotation` + `QUERY_KEYS.documentAnnotations`.
- `features/documents/DocumentAnnotations.tsx` — פאנל "הערות וסימניות" (הוספת הערה לעמוד,
  סימון עמוד נוכחי, מחיקה). מוטמע ב-`DocumentReader` עם טוגל "הערות" + פריסת flex צדדית.

**נדחה (follow-up):** highlight ברמת-פיקסל עם קואורדינטות — דורש hOCR מ-OCR pipeline.
ה-API כבר מקבל x/y/width/height, אך ה-UI מייצר כרגע רק הערות/סימניות ברמת-עמוד.

**אימות:** workspace typecheck (exit 0), API 92 בדיקות, dashboard 30 בדיקות + production build — ירוקים.

## אכלוס גרף-הידע (Entities/EntityRelations) — מומש (2026-06-02)

המשך לפי תוכנית העבודה — ה-follow-up "יסוד גרף-ידע מתמשך". טבלאות `Entities`/`EntityRelations`
(mig 042) היו קיימות אך **לא אוכלסו** ע"י קוד production (רק M6 גזר ישויות on-read). כעת הן
מאוכלסות בעת ההעשרה. אדיטיבי, מקומי, ללא AI/רשת חדשים, ועם degradation חיננית.

**legal-ontology:**
- `graph.ts` — `upsertRelation(fromId, toId, relation, db)` (idempotent, `INSERT OR IGNORE`,
  מדלג על self/0). ייצוא ב-`index.ts`. (`upsertEntity` הקיים נעשה שימוש חוזר.)

**API:**
- `utils/entity-graph.ts` — `populateEntityGraph(db, {documentId, caseId, caseNumber,
  courtName, judgeName})`: upsert ישויות Judge/Court/Case (נורמליזציה דרך legal-ontology,
  דילוג על שמות ריקים/תארי-כבוד בלבד) + יחסים `presides_over` / `hears` / `sits_in`.
  אידמפוטנטי (UNIQUE). `backfillEntityGraph(db)` מאכלס מ-DocumentInsights קיימים;
  `entityGraphStats(db)` לתצפיתיות. בדיקות: `entity-graph.test.ts` (5).
- `utils/rag-worker.ts` — קריאה ל-`populateEntityGraph` **אחרי** ש-transaction של
  `applyExtraction` נסגר, עטוף ב-try/catch שלא יפיל/יחסום את ההעשרה (CLAUDE.md §4).
- `routes/entities.ts` — `GET /api/entities/graph/stats` + `POST /api/entities/backfill`
  (additive על ה-router הקיים; רשום כבר ב-app.ts). בדיקות route ב-app.test.ts (טבלאות
  Entities/EntityRelations/DocumentInsights ל-harness).

**אימות:** workspace typecheck (exit 0), API 92, entity-graph 5, legal-ontology 18, lint נקי.
ה-graph נבנה לאחר commit של ההעשרה ולעולם לא מסכן אותה.

**נדחה (follow-up):** קישור ישויות↔מסמך מרובה (כיום `document_id` יחיד ב-COALESCE); מיזוג
aliases מצטבר (כיום נכתב מחדש); תצוגת-גרף ב-UI (כרגע M6 derived + stats endpoint).

## Rules_Engine — מנוע כללי סדרי דין (§4.7.1) — מומש (2026-06-02)

המשך לפי תוכנית העבודה. ביקורת §4.7.1 גילתה שטבלת `Rules_Engine` **מעולם לא נוצרה**, אך
`litigation-intelligence/completeness.ts` (`seedProceduralChecklist`) כבר מבצעת עליה SELECT,
ול-migration 046 יש FK תלוי אליה (`ProceduralChecklist.rule_id`). באג סמוי (הפונקציה לא נקראת
עדיין), אך ה-CLAUDE.md מצהיר "20 כללים ישראליים מוזרעים בטבלת Rules_Engine". תוקן — אדיטיבי,
local-first, ללא שינוי pipeline.

**Schema + seed:**
- `migrations/060_rules_engine.sql` — `CREATE TABLE Rules_Engine` (rule_name, procedure_type,
  description, deadline_days, deadline_basis, source_reference, sort_order, is_active;
  `UNIQUE(procedure_type, rule_name)`). מזריע **20 כללי סדרי דין** על פני 9 סוגי הליך (אזרחי,
  ערעור אזרחי, פלילי, משפחה, עבודה, מינהלי, חוקתי, חדלות פירעון, תעבורה). כל כלל עם מקור חקיקתי
  מצוטט; מועדים לא-ודאיים נשמרים NULL עם הנחיה בתיאור.
- ⚠️ **דרושה בדיקת עו"ד**: המועדים הם טיוטה ראשונית. הם נשמרים כנתונים במסד (לא מקודדים) כדי
  שניתן לתקנם ללא שינוי קוד — בהתאם לכלל "אל תקודד לוגיקת מועדים — תמיד קרא מהמסד".

**Backend:**
- `packages/database/src/queries/rules-engine.ts` — `RulesEngineRepository`
  (`listAll(procedureType?)`, `findById`, `procedureTypes()`, `count()`; קריאה בלבד). ייצוא
  ב-`index.ts`. בדיקות: `rules-engine.test.ts` (5).
- `packages/api/src/routes/rules.ts` — `GET /api/rules[?procedureType=]`, `GET /api/rules/types`,
  `GET /api/rules/:id`. חיווט `rules` ל-`Repos` (`db.ts` + `start.ts`) ורישום ב-`app.ts`.
  בדיקות route ב-`app.test.ts` (טבלת Rules_Engine + seed ל-harness) → API: 97 בדיקות.

**Frontend:**
- `apps/dashboard/src/api/hooks.ts` — `useRules(procedureType?)` + טיפוס `Rule`.
- `features/legal/RulesEnginePage.tsx` — כללים מקובצים לפי סוג הליך, צ׳יפ מועד, מקור חקיקתי,
  באנר "דרושה בדיקת עו"ד". route `/rules` + פריט ניווט "כללי סדרי דין" בקבוצת "מנוע משפטי".

**אימות:** הבאג הסמוי תוקן (הצרכן `seedProceduralChecklist` כבר לא פונה לטבלה חסרה, וה-FK של
mig 046 נפתר). smoke-test של ה-migration: 20 כללים, עברית תקינה, FK עובד. workspace typecheck
(exit 0), API 97, DB rules-engine 5, litigation-intelligence 9, dashboard 30 + build — ירוקים.

**נדחה (follow-up):** חיווט `seedProceduralChecklist` לזרימת יצירת תיק (כשנרצה לאכלס
`ProceduralChecklist` אוטומטית לפי `procedure_type` של התיק); CRUD לעריכת כללים מה-UI (כרגע
קריאה בלבד; עריכה דרך migration/DB).

---

## תיקוני First-Run Install וסגירת Loop בדיקה (2026-05-30 → 2026-06-03)

### מה הושלם

**PR #38 — העתקת api/src/generated/ ל-dist/ (מוזג)**
- שגיאה: `Cannot find module '.../api/dist/generated/...'` בהפעלה ראשונה
- גורם: תיקיית `src/generated/` לא נכללה בפלט `tsc` ולא הועתקה ל-staging
- תיקון: `publish.ps1` שלב 9 מעתיק את `api/src/generated/` ל-`api/dist/generated/`

**PR #39 — UTF-8 BOM ל-publish.ps1 (מוזג)**
- שגיאה: `ParseException` ב-PowerShell 5.1 על Windows עברי (codepage Windows-1255)
- תיקון: `0xEF 0xBB 0xBF` (UTF-8 BOM) לראש הקובץ דרך סקריפט Python

**PR #40 — שלושה תיקוני migration runner (מוזג)**
1. `PRAGMA journal_mode = WAL` הופרד מה-transaction ורץ לפניו
2. `BEGIN/COMMIT TRANSACTION` מקונן — סינון אוטומטי (bare `BEGIN` של טריגרים נשמר)
3. `table Metrics already exists` — `DROP TABLE IF EXISTS` ב-040 + עדכון עמודות ב-`hardening.ts`

**PR #41 — sqlite-vec extension (מוזג)**
- `connection.ts`: `db.loadExtension(SQLITE_VEC_PATH)` עם fallback JS
- migration 052: `SKIP_ON_ERROR` — מדלג אם vec0 לא קיים

**PR #42 — Bundle sqlite-vec + OLLAMA_BASE_URL (מוזג)**
- `publish.ps1` שלב 9.3: הורדת `sqlite-vec.dll` מ-GitHub Releases v0.1.7
- `installer.iss`: registry entries ל-`SQLITE_VEC_PATH` + `OLLAMA_BASE_URL`
- `ApiHostService.cs`: שני מפתחות נוספים ברשימת env vars המועברים ל-Node

**PR #43 — FACTUM_IL_VERSION + ביקורת תיקון לאחר התקנה (מוזג)**
- `routes/updates.ts:16`: `process.env['FACTUM_IL_VERSION'] ?? '1.0.0'` (במקום hardcoded)
- `installer.iss`: registry entry `FACTUM_IL_VERSION = {#AppVersion}`
- `ApiHostService.cs`: `FACTUM_IL_VERSION` נוסף לרשימת העברת env vars
- ביקורת מקיפה: 20 רכיבים נבדקו — ראה `docs/PROJECT-EVOLUTION-LOG.md`

**ניתוח api.log מהשטח (31/05/2026)**
- קריסות 025, 029: `BEGIN TRANSACTION` מקונן — תוקן ב-PR #40 ✅
- קריסה 040: `table Metrics already exists` — תוקן ב-PR #40 ✅
- אזהרה חוזרת 052: `no such module: vec0` — נפתר בבנייה מחדש עם sqlite-vec (PR #42)
- הפעלות 6–9: המערכת עולה תקין, כל 57 migrations עוברים ✅

### מה לעשות עכשיו

1. בנה installer חדש מ-main: `pnpm install && .\publish.ps1 && ISCC.exe installer.iss`
2. הסר התקנה ישנה, התקן מחדש — צפה בלוג ל-`sqlite-vec loaded from ...tools\sqlite-vec.dll`
3. בדוק: `GET /api/updates/check` → `currentVersion: "1.0.0"` (מ-registry, לא hardcoded)

---

## 🗓️ Session handoff — סגירת פערים מלאה + בניית Installer (2026-06-10)

### הושלם הפעם

- ✅ **Gap #3 — CT2 post-update health check** — `runPostUpdateHealthCheck()` חדש
  ב-`packages/update-core/src/PostUpdateHealthCheck.ts`: בדיקת `PRAGMA integrity_check`
  + טבלאות חיוניות בהפעלת API לאחר עדכון; rollback אוטומטי דרך `restoreFromRollback()`
  אם הבדיקה נכשלת; `process.exit(1)` מאפשר לסופרוויזר להפעיל מחדש. 5/5 בדיקות.
  הבעיה הטכנית: Vitest 3.x עוקב אחרי `vi.fn()` rejections גם כשנתפסות — נפתרה על ידי
  שימוש במשתנה-closure רגיל (לא vi.fn) עבור ה-"throws" test case.

- ✅ **Gap #6 — code-splitting** — כל 40+ דפי-routes הוסבו ל-`React.lazy()` ב-
  `apps/dashboard/src/router/index.tsx`; `<Suspense>` נוסף ל-AppShell סביב `<Outlet>`
  ולמסלול SetupWizard. Vite ייצור chunk נפרד לכל route. helper `lz()` קטן ממיר
  named exports לפורמט `{ default }` הנדרש על ידי lazy.

- ✅ **Gap #8 — פריטי legacy BN4/BN5/BN6/NK4:**
  - **BN4**: MigrationRunner מוסיף אזהרת-לוג אם migration runs take > 5s
  - **BN5**: `getPort` עטוף ב-`Promise.race` עם fallback לפורט-המבוקש אחרי 5s
  - **BN6**: `journalEvent()` מטמן prepared statement ב-WeakMap לפי db handle
  - **NK4**: `createApp()` מקבל `healingService?` אופציונלי (DI לטסטים)
  - `'startup'` נוסף ל-`LogCategory` (היה חסר; שימש בפועל ב-start.ts ו-PostUpdateHealthCheck)
  - פריטים שנמצאו כבר-מתוקנים: BN2, BN3, NK1, NK2 ✅
  - NK3 (consistency של comments) — נותר כ-accepted policy gap, לא תוקן בקוד

- **בדיקות:** 349/349 api, 71/71 update-core, typecheck + lint עוברים נקי

### מה לעשות עכשיו

1. **ממזג PR לענף הנוכחי** (`claude/factum-il-audit-remediation-o1RiM`) → main
2. **בנה Windows Installer** מ-main: `pnpm install && .\publish.ps1 && ISCC.exe installer.iss`
3. **בדוק post-update health check בפועל:** עדכן ל-version חדשה, ודא שהבדיקה רצה בהפעלה
4. **שאר הפערים הפתוחים:**
   - GH2 — Zod validation ל-31 קבצי routes שנותרו (ראה רשימה בדוח)
   - NK3 — קביעת מדיניות comments (Hebrew vs English)

## Migration Slots (עדכני — כולל כל PRs)
001–039: core schema
040: Metrics | 041: EventStore | 042: Entities | 043: CaseMemory
044: DocumentChunks | 045: AgentResults | 046: ProceduralChecklist
047: DocumentVersions | 048: DocumentSignatures | 049: WorkflowStates
050: PipelineLogs | 051: VacuumSessions | 052: vec_chunks (SKIP_ON_ERROR)
053: AgentExecutionEvents | 054: SystemEvents | 055: WorkflowIdempotencyTTL
056: CaseAssignments | 057: SystemSettings | 058: Notifications
059: resolved_at (notifications) | 060: Rules_Engine (+ 20 כללים ישראליים)
061: legal_corpus | 062: rules_engine_verify_flags
063: communications | 064: comm_templates | 065: comm_evidence | 066: call_logs

> מיזוג main ↔ ענף-התקשורת (2026-06-03): מיגרציות התקשורת (C0–C6) מוספרו מחדש מ-060–063
> ל-063–066 כדי להימנע מהתנגשות-סלוט עם 060–062 של main (rules_engine / legal_corpus /
> verify_flags). התוכן/checksums לא השתנו; הרצת-רצף מלאה על DB נקי עוברת (65/66, 052 מדולג).

067: VerdictCorpus + VerdictCorpusEmbeddings + FTS5 (PR #52 — ממתין למיזוג)

Next available: **068**

---

## סשן 2026-06-05 — Repo Sync, CI Fixes, Security Hardening

### מה הושלם

**מיזוג PRs (Gate 3):**
- ✅ PR #60 — `feat(legal-corpus)` — מוזג ל-main
- ✅ PR #45 — `feat(calendar)` — מוזג ל-main (הוסר draft לפני מיזוג)
- ✅ PR #59 — `docs(ux-roadmap)` — מוזג ל-main (9 commits ישנים של build-fix דולגו ב-rebase)

**PR #55 — vacuum-protocol robustness (ממתין לCodeQL ירוק):**
- תוקן: `catch (e)` → `catch {}` (lint: @typescript-eslint/no-unused-vars)
- תוקן: `EffortController.throttle()` — rate-limiting של CPU sampling (250ms חכה לכל קובץ גרם לtimeout ב-stress test של 500 קבצים → 125s; תוקן ל-sampling לפחות אחת ל-250ms wall-clock)
- תוקן: 6 התראות CodeQL CWE-22 (path traversal) — הוסף `containsPath(child, root)` + אימות נתיב לפני כל פעולת filesystem ב-`isPdfSafe`, `isImageSafe`, `scanDir`
- **CI הנוכחי:** Typecheck+Test+Lint ✅ | Eval Regression ✅ | CodeQL ממתין לrun חדש

**Gate 5 — סגירת PRs משוחרים:**
- ✅ PR #50 — סגור עם הסבר (superseded by #60)
- ✅ PR #13 — סגור עם הסבר (superseded by publish.ps1 rewrite in PR #59)
- ✅ PR #11 — סגור עם הסבר (superseded by UTF-8-BOM fix in PR #59)

**עבודה נדחית (ממשיכה):**
- PR #58 (`feat/retrieval-integration`) — ממתין (pnpm-lock.yaml conflict, `@factum-il/retrieval` dep חדש)
- PR #52 (`feat/verdict-corpus`) — ממתין (migration 067, VerdictCorpus)

### Gate 4 — מחיקת 22 ענפים Section-B — חסום

`git push origin --delete` נחסם ב-403 דרך ה-local git proxy של הסביבה.
אין `delete_branch` tool ב-GitHub MCP, ואין `GITHUB_TOKEN` ב-environment.

**נדרשת מחיקה ידנית ב-GitHub UI** (או דרך `gh repo delete` מ-Windows):

```
chore/tasks-update          chore/tasks-update-2
claude/annotations-api      claude/entity-graph
claude/factum-il-architecture-audit-xHPyA
claude/legal-os-phase-1-init-0EkMh
claude/legal-workbench-taskE
claude/rules-engine         claude/rules-verify-flags
feat/bundle-sqlite-vec      feat/production-polish
fix/apihost-double-semicolon    fix/backend-staging-rewrite
fix/diagnostics-accessibility   fix/migration-runner-and-metrics
fix/psscriptroot-and-output-path fix/publish-ps1-utf8-bom
fix/publish-utf8-bom-2      fix/sqlite-vec-and-ollama-docs
fix/startup-validator-accessibility fix/strictmode-scripts-build
fix/workspace-copy-retry
```

> ⚠️ `fix/publish-psscriptroot` (PR #13's branch) — **אל תמחק**: cherry analysis מצא commit אחד שלא ב-main.

### הצעד הבא (עודכן 2026-06-06)

1. **בדוק CodeQL** של PR #55 — push נשלח עם תיקון CWE-22. אם ירוק → מזג את #55.
2. **מחק 22 ענפים** ב-GitHub UI (כרשימה לעיל).
3. **PR #58 + #52** — נשארו נדחים לפי הנחיית המשתמש.

---

## סשן 2026-06-06 — תיקון CodeQL נוסף (CWE-22 flows שנותרו)

### מה הושלם

**CodeQL Code Scanning — ניתוח:**
- ה-"CodeQL" status check שנכשל (job 79848543828, 2 שניות) הוא בדיקת Code Scanning שרצה *לפני* שה-Analyze jobs סיימו
- כל CI runs על commit `f979af5` עברו: Typecheck+Test+Lint ✅ | Eval Regression ✅ | CodeQL Advanced ✅
- הסיבה שה-check נשאר "failure": ה-Analyze job הציג תוצאות SARIF חדשות לאחר שה-status check כבר הסתיים — GitHub לא יצר status check חדש

**flows CWE-22 שנותרו לאחר commit `f979af5`:**
בסריקה הבאה CodeQL עדיין יכול לסמן:
- `stat(expectedPath)` / `mkdir(dirname(expectedPath))` / `rename(..., expectedPath)` — `expectedPath = join(absOrg, ...)` — נתיב שמקורו ב-`orgDir` ללא guard מפורש
- `isFileLocked(filePath)` → `fsOpen(filePath)` — `filePath` ממקור `targetDir`, ניתוח inter-procedural של CodeQL לא מזהה שה-`containsPath` ב-`scanDir` מספיק

**תיקון (commit `ca52fd6`):**
- `isFileLocked`: הוסף פרמטר `root` + `containsPath(resolved, root)` לפני `fsOpen`
- תחילת לולאה: `if (!containsPath(resolve(filePath), absTarget)) continue;` — guard מפורש לפני כל פעולת filesystem על `filePath`
- לאחר חישוב `expectedPath`: `if (!containsPath(resolve(expectedPath), absOrg))` — guard לפני stat/mkdir/rename

**סטטוס PR #55:**
- Commit `ca52fd6` נשלח ל-`improve/vacuum-protocol-robustness`
- ממתין לסריקת CodeQL על commit החדש

### הצעד הבא

1. **המתן ל-CodeQL** על commit `ca52fd6` — אם ירוק → מזג PR #55
2. **מחק 22 ענפים** ב-GitHub UI (ראה Gate 4 לעיל)
3. **PR #58 + #52** — נשארו נדחים
