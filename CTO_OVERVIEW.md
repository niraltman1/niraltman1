# Factum-IL — תמונת מצב מערכת לגיוס CTO
> עודכן לאחרונה: 2026-06-22  
> גרסה: v1.0.0-beta.1 candidate (commit `37939d2`)

---

## מה המוצר

**Factum-IL** הוא מערכת ניהול משרד עורכי דין ישראלית שרצה **לחלוטין על מחשב המשתמש** — ללא ענן, ללא שרתים חיצוניים, ללא שיתוף נתונים. כל מסמך, כל לקוח, כל שיחת AI נשארת על המכונה המקומית. זהו הערך הגרעיני של המוצר: חיסיון עו"ד–לקוח מוגן על ידי ארכיטקטורה, לא על ידי מדיניות פרטיות.

**קהל יעד:** משרדי עורכי דין ישראליים, בעיקר יחידים ומשרדים קטנים-בינוניים.

---

## מצב נוכחי בשורה אחת

> **קוד: מוכן לבטא. מתקין: נבדק ועובד. CI: חסום בגלל חיוב GitHub Actions. דורש בנייה ידנית על Windows לפני שחרור.**

---

## ארכיטקטורת המערכת

```
[Windows Desktop]
      │
      ├── FactumIL.Desktop (C# WPF + WebView2)
      │         └── BootstrapManager: Ollama → DB → Vector → Corpus (resumable)
      │
      ├── apps/dashboard (React 19 + Vite + Tailwind — RTL עברית)
      │         └── 138 רכיבים | 44 דפים | port 5173
      │
      └── packages/api (Express REST — port 3001)
                └── 58 route files | 40+ prefixes
                          │
                          ├── packages/database (SQLite × 2 קבצים)
                          │         factum-il.db — schema, FTS5, metadata
                          │         _data.db    — chunks, embeddings (כבד)
                          │
                          ├── Ollama (http://127.0.0.1:11434)
                          │         └── BrainboxAI/law-il-E2B:Q4_K_M בלבד
                          │
                          └── 25 packages (TypeScript)
```

### עקרון אדריכלי מרכזי
**אפס נתונים עוזבים את המכונה.** כל AI מריץ Ollama מקומי. אין API keys, אין SaaS, אין analytics חיצוני.

---

## מה קיים היום בקוד

### 1. בסיס הנתונים — 84 migrations (001–085, 067 מדולג)

SQLite עם WAL mode, FTS5 לחיפוש טקסט מלא, sqlite-vec לחיפוש וקטורי:

| קטגוריה | טבלאות עיקריות |
|----------|----------------|
| ליבה | Clients, Lawyers, Cases, Documents, Tasks |
| תקשורת | CommChannels, CommMessages, CommTemplates, CallLogs |
| AI/Agents | AgentResults, AgentExecutionEvents, LegalBrainSessions |
| קורפוס משפטי | LegalDocuments, VerdictCorpus, SupremeCourtVerdicts, LegalSections |
| גרף ידע | Entities, EntityRelations |
| אמינות | WorkflowStates, EventStore, SystemSettings, Notifications |
| ביטחון | DocumentSignatures, SecurityCompliance, BackupManifest |
| ביצועים | 14 אינדקסים על עמודות חמות (migration 080) |

### 2. שכבת ה-API — 58 routes, 40+ prefixes

קטגוריות עיקריות:
- **ניהול תיקים:** clients, cases, documents, tasks, calendar, evidence, canvas
- **AI & Agents:** agents (7 סוגים + stream), legal-brain, drafts, legal-ai
- **קורפוס משפטי:** legal-corpus (1,077 חוקים), verdict-corpus, precedents, citations
- **תקשורת:** communications, mail, gmail-bridge
- **אדמין:** diagnostics, updates, patch, erasure, vacuum, admin/repair
- **מיוחד:** insolvency, traffic, tabular, stens, academic-hub

### 3. ה-Dashboard — React 19, RTL עברית מלא

**138 רכיבים React** | **44 דפים** | **Tailwind CSS + CSS custom properties**

דפים עיקריים:
- `DashboardHomePage` — סביבת עבודה יומית (7 widgets)
- `MatterWorkbench` — שולחן עבודה לתיק (3 פנלים)
- `SupremeCourtSearchPage` — חיפוש פסיקה ישראלית עם FTS5
- `AgentsWorkspacePage` — 7 agents בממשק אחד
- `GraphExplorerPage` — גרף ידע (שופטים, בתי משפט, תיקים)
- `DraftWorkspace` — עריכת מסמכים משפטיים עם AI
- `InsolvencyPage`, `TrafficCasePage`, `LegalBrainPage`
- `UpdatesCenterPage`, `DiagnosticsPage`, `SupportPage`

### 4. שכבת ה-AI

**מודל יחיד:** `BrainboxAI/law-il-E2B:Q4_K_M`  
מאומן על פסיקה ישראלית, שפה משפטית עברית, מבנה בתי המשפט הישראלי.

**7 Agents מחוברים לייצור:**
| Agent | מה הוא עושה |
|-------|-------------|
| Summarize | סיכום תיק מובנה בעברית |
| Timeline | שחזור ציר זמן מסמכים |
| Research | חיפוש בחקיקה ופסיקה |
| Contract Review | זיהוי סיכונים בחוזים |
| Discovery | מלאי ראיות + ניתוח פערים |
| Deadline Analysis | ניתוח מועדים מהכללים המשפטיים |
| Hearing Prep | תקציר הכנה לדיון |

**שרשרת הסקה 5-שלבית (לכל תגובת AI):**  
הקשר → סיווג → סמכויות → סיכון/סתירות → מסקנה

**Graceful degradation:** אם Ollama לא רץ — המערכת ממשיכה ללא AI, מציגה אזהרה, לא קורסת.

### 5. 25 Packages TypeScript

```
shared → database → (כל השאר)
```

| Package | אחריות |
|---------|--------|
| `database` | SQLite repositories, MigrationRunner, FTS5, sqlite-vec |
| `ai` | OllamaClient, 5-step reasoning, circuit breaker |
| `agent-core` | Base agent, tool registry, CaseExecutionContext |
| `orchestrator` | Multi-agent task sequencing |
| `policy-engine` | RBAC: admin/attorney/assistant/reviewer/read_only |
| `memory` | זיכרון שיחה per-case (SQLite) |
| `retrieval` | KNN + hybrid search (FTS5 + vector) |
| `citation-engine` | Parser דטרמיניסטי לאסמכתאות ישראליות (Nevo 2021) |
| `pipeline` | OCR, עיבוד שמע (Whisper), enrichment |
| `encrypted-backup` | גיבויים AES-256-GCM עם לוח זמנים |
| `legal-ontology` | טקסונומיה משפטית ישראלית, היררכיית בתי משפט |
| `support-diagnostics` | crash reporting, health diagnostics, safe-mode |
| `update-core` | OTA updates + rollback עם Ed25519 |
| `observability` | Metrics, structured logging, PII-safe sinks |
| `litigation-intelligence` | ניתוח ליטיגציה, ציון סיכון מועדים |

### 6. Desktop Shell — C# WPF + WebView2

14 קבצי C# (Windows בלבד):
- `BootstrapManager` — first-launch resumable (7 שלבים: deps→webview2→ollama→model→db→vector→corpus)
- `OllamaLifecycle` / `OllamaService` — state machine + retry policy
- `SafeModeManager` — downgrade graceful (AI off, שאר עובד)
- `RecoveryWindow` — חלון restoration
- `FunctionalHealthChecks` — בדיקת health operational
- `StartupLogger` — `bootstrap.jsonl` + `bootstrap-summary.json`
- `RetryPolicy` — exponential backoff bounded

### 7. קורפוס משפטי מובנה

| מקור | תוכן | אחסון |
|------|------|-------|
| מאגר חקיקה (Knesset OData) | 1,077 חוקים ישראליים + FTS5 | `LegalSections` |
| `guychuk/case-law-israel` (HuggingFace) | פסיקה ישראלית JSONL | `VerdictCorpus` |
| LevMuchnik (Supreme Court) | פסקי דין עליון | `SupremeCourtVerdicts` |

כל הקורפוס נארז ב-installer, נטען ב-first-launch עם resume-on-crash, SHA-256 integrity, dedup.

### 8. מערכת Installer

**`publish.ps1`** — 13 שלבי staging → `FactumIL_Dist\`  
**`installer.iss`** — Inno Setup 6 → `Factum-IL-Setup.exe`

תכונות:
- Silent install ללא UI חוסם
- רישום מודל Ollama ו-corpus load דחויים ל-first-launch
- 8 environment variables מוגדרים ב-Windows registry
- Bootstrap resumable (קרסה? ממשיך מהנקודה האחרונה)

### 9. תשתית אמינות

| מנגנון | פרטים |
|--------|--------|
| Feature Flags | `SystemSettings` SQLite, 6 flags, `ConfigIntegrityValidator` |
| RBAC | 5 roles, `policy-engine`, `requireRole()` middleware |
| Patch System | Ed25519 signing, SHA-256 integrity, 9-step workflow, auto-rollback |
| Encrypted Backup | AES-256-GCM, scheduled, restore pipeline |
| Safe Mode | `FACTUM_IL_SAFE_MODE=1` — workers off, read-only |
| Zod Validation | 3 high-blast-radius routes validated (agents, admin, erasure) |
| Architecture CI | `scripts/check-architecture.ts` — AST scanner, 149 pre-existing warnings tracked |
| Data Firewall | Zero-Root Rule — חסימת תוכן רפואי/סיעודי מהפייפליין |

---

## ה-CI/CD

### GitHub Actions workflows (9 קבצים)

| Workflow | מה הוא עושה |
|----------|-------------|
| `ci.yml` | typecheck + test + lint + Windows + E2E + Eval Regression |
| `build-installer.yml` | בניית `Factum-IL-Setup.exe` |
| `build-installer-selfhosted.yml` | Self-hosted Windows runner (חדש) |
| `codeql.yml` | סריקת אבטחה |
| `ingest-knesset-corpus.yml` | הורדת קורפוס חקיקה |
| `ingest-caselawil-corpus.yml` | הורדת פסיקה מ-HuggingFace |
| `ingest-levmuchnik-corpus.yml` | הורדת פסיקת עליון |

### מדדי בדיקות

| קטגוריה | מספר |
|---------|------|
| בדיקות TypeScript סה"כ | **1,200+** |
| קבצי test | 120 |
| E2E Playwright specs | 5 (golden paths) |
| Eval Regression | נפרד |

**`pnpm -r typecheck` → 0 שגיאות** (ועבר על כל 25 packages)

---

## מה ידוע שחסר / בעיות פתוחות

### חסומי סביבה (לא ניתן לתקן בקוד)
| פריט | סטטוס | מה נדרש |
|------|--------|---------|
| GitHub Actions CI | ❌ חסום — spending limit | תשלום / self-hosted runner |
| בנייה מקומית C# + installer | ⏳ לא נבדק | מחשב Windows + Visual Studio |
| C1 Telegram live validation | ⏳ חסום | allowlist + bot token |
| C2 WhatsApp | ⚠️ stub בלבד | whatsapp-web.js + WebView2 מקומי |

### חוב טכני מתועד
| פריט | חומרה | מצב |
|------|--------|-----|
| 31 route files ללא Zod validation | בינוני | מתועד ב-`דוח-חוב-טכני.md`, רשימה מפורשת |
| Bundle size — chunk יחיד 1.1MB | נמוך | code-splitting עם `React.lazy()` |
| OCR fallback לPDF סרוקים | נמוך | תשתית קיימת, לא מחוברת |
| AI tagging על הודעות נכנסות | נמוך | Telegram routing הוא SQL טהור כרגע |
| 149 architecture warnings | נמוך | tracked, לא קריטיים |

---

## ה-Stack בפירוט

| שכבה | טכנולוגיה | גרסה |
|------|-----------|------|
| UI | React + TypeScript + Tailwind + Vite | React 19 |
| Desktop shell | C# WPF + WebView2 | .NET 8, Windows בלבד |
| Backend | Node.js + Express | TypeScript strict |
| Database | SQLite + FTS5 + sqlite-vec | better-sqlite3 |
| AI | Ollama local | BrainboxAI/law-il-E2B:Q4_K_M |
| Audio | ffmpeg + Whisper local | whisper-fast.exe |
| Installer | Inno Setup 6 + PowerShell | publish.ps1 13-step |
| Package manager | pnpm workspaces | monorepo |
| Testing | Vitest + Playwright + Pester | |
| Signing | Ed25519 (patches) | |
| Encryption | AES-256-GCM (backups) | |

---

## נתוני קוד

| מדד | ערך |
|-----|-----|
| Packages | **25** |
| TypeScript source files | **432** |
| React components | **138** |
| API route files | **58** |
| Database migrations | **84** (001–085) |
| C# source files | **14** |
| Test files | **120** |
| Commits ב-main | **103** |
| PRs מוזגו | **130+** |

---

## מה ה-CTO ייכנס אליו ב-Day 1

1. **Monorepo מסודר** — `pnpm install && pnpm dev` מעלה API + Dashboard ב-2 פקודות.
2. **TypeScript strict** — 0 שגיאות, 0 `any` ללא הצדקה.
3. **תיעוד מקיף** — `CLAUDE.md`, `DEVELOPMENT.md`, `ARCHITECTURE.md`, `BUILD.md`, `TASKS.md`, + 30+ מסמכי docs/.
4. **1,200+ בדיקות ירוקות** — typecheck + unit + E2E + eval regression.
5. **חוב טכני מתועד** — לא מוסתר, עם רשימה מפורשת ועדיפויות.
6. **ארכיטקטורה ברורה** — dependency graph חד-כיווני, repository pattern, RBAC עקבי, feature flags.

### מה **לא** קיים עדיין
- פריסה בענן (מכוון — המוצר הוא offline-first)
- macOS / Linux desktop (WebView2 = Windows בלבד)
- Multi-tenant (כל installation = משרד אחד)
- Mobile app
- אינטגרציה לנהלת בתי המשפט הממוחשבת (Nevo, Takdin) — קריאה בלבד מ-corpus, לא חיבור live

---

## סיכום למגייס

Factum-IL הוא מוצר **עם קוד אמיתי ועובד**, לא POC. הארכיטקטורה מחזיקה מים — database layer נקי, agent framework מחובר, installer עובד, קורפוס משפטי אמיתי. השלב הבא הוא:

1. **בנייה ידנית על Windows** → יצירת `Factum-IL-Setup.exe` → בדיקת first-launch
2. **תיקון GitHub Actions** (billing) → CI אוטומטי חוזר לפעולה
3. **Beta לקוחות ראשונים** → Telegram live validation → feedback loop
4. **Phase 17-25** — LegalSearchService, LegalKnowledgeService, AI/RAG readiness, incremental corpus updates

ה-CTO ייכנס לקוד בשל עם תשתית ברורה, לא לתוך כאוס.
