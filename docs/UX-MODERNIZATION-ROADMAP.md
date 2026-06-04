# Factum-IL — UX Modernization Roadmap

> **Audience:** Product / firm leadership and engineering.
> **Purpose:** A senior-level UX audit of the entire Factum-IL interface, benchmarked
> against Clio, MyCase, Litify, Relativity, Microsoft 365, Notion, and Linear, with a
> prioritized, wireframed plan to close the gaps.
> **Constraint posture:** **Strict local-first.** Every proposal keeps all data on the
> machine, runs AI only via local Ollama (`BrainboxAI/law-il-E2B`), and preserves
> attorney-client privilege. No cloud portal, SaaS multi-tenant, or external collaboration
> is proposed.

---

## 0. Status reconciliation (June 2026)

> **Read this first.** This audit was written *before* the M1–M7 dashboard work, the
> C-communications module, and the notifications / IA / quick-add implementations landed.
> Several gaps below are marked "missing / P0" but are **already built and routed**. The
> sections are kept intact for their analysis and wireframes, but **the table below is the
> current truth**, and **`WORKPLAN_FRONTEND.md` is the living execution plan** for the work
> that genuinely remains (phases F-B…F-G).

**Now built since this audit (verified in code):**

| Audit section | Status | Evidence (route / file) |
|---|---|---|
| §4.1.1 Calendar & Docketing | ✅ Shipped | `/calendar` · `features/calendar/CalendarPage.tsx` |
| §4.1.2 Document Reader/Viewer | ✅ Shipped | `/documents/:id/read` · `features/documents/DocumentReader.tsx` |
| §4.1.3 Notifications / Alert inbox | ✅ Shipped | `NotificationBell` mounted in `components/layout/AppShell.tsx` |
| §4.4.3 Deadline / SLA monitor | ✅ Shipped | `/deadlines` · `features/calendar/DeadlineMonitorPage.tsx` |
| §4.7.1 Rules-engine surface | ✅ Shipped | `/rules` · `features/legal/RulesEnginePage.tsx` |
| 3-panel matter workbench (WORKPLAN F-E) | ✅ Shipped | `/cases/:id/workbench` · `features/cases/MatterWorkbench.tsx` |
| §4.7.6 Navigation/IA overhaul | ✅ Shipped | 8-group accordion · `components/layout/nav-config.tsx` + `Sidebar.tsx` |
| Global search wiring (F-A) | ✅ Shipped | `/search` · `features/search/SearchPage.tsx` |

**Genuinely remaining (confirmed absent in code):**
- **Legal-corpus reader** `/library` (statute/case-law full-text read) — no route. *Largest
  functional gap;* WORKPLAN phase **F-B**.
- **Central `lib/legal-terms.ts` dictionary + extracted shared components** (`AsyncBoundary`,
  `DeadlineChip`, `SourceLink`, `EmptyState`, `HebrewDate`, `CaseNumber`) — phase **F-C**.
- **"My Day" task-home** — `DashboardPage` is still KPI-only (phase **F-D**).
- **Billing / time / trust** — `features/ledger/LedgerPage.tsx` exists but is **not** wired
  into `router/index.tsx` (orphaned).
- Reporting/analytics, Insolvency Form 5 UI, Import wizard, Settings/Preferences, Saved
  views/Kanban, GDPR/erasure UI — all still UI-less.
- **Cross-cutting UI debt** (phases F-C/F-G): no i18n (strings hardcoded across ~87 `.tsx`),
  no shared form component, modal focus-trap/contrast a11y gaps, no responsive breakpoints.

---

## 1. Executive summary

Factum-IL is **not** an early prototype — it is a mature local-first legal platform:

- **~11,000 lines** of React 19 dashboard across **23 feature areas / 31+ routes**.
- Real depth, not stubs (`CasesPage` 489 LOC, `DiagnosticsPage` 857 LOC, `RBACManagePage`
  394 LOC, `SetupWizard` 433 LOC).
- Already ships: a **Cmd+K command palette**, a prestige dark theme with gold accent,
  Zustand + React Query, RBAC v1 (5 roles), an audit Journal, Mission Control, an evidence
  locker, traffic / insolvency / academic domain logic, 5 AI agents on local Ollama, an
  OCR + audio (Whisper) pipeline, and encrypted backup/recovery.

Therefore this roadmap is about **closing real gaps, finishing surfaced-but-incomplete
workflows, and raising the information-architecture and interaction bar to
Linear/Notion/M365 standards** — not "build the app."

A recurring theme: **substantial backend capability already exists with no UI to expose
it.** Those items are flagged **`[backend ready]`** and represent the fastest, highest-
leverage wins.

### The five highest-impact gaps *(status updated — see §0)*
| # | Gap | Why it's #1-tier | Phase | Status |
|---|-----|------------------|-------|--------|
| 1 | **Calendar & Docketing** | Deadline-driven practice with no calendar = malpractice risk; the core of Clio/MyCase | 1 | ✅ Shipped |
| 2 | **Document Reader/Viewer** | Users cannot *read* documents in-app today → they leave the product | 1 | ✅ Shipped |
| 3 | **Billing / Time / Invoicing / Trust** | The economic core of practice-management software; only a thin AR ledger exists | 2 | ⛔ Remaining |
| 4 | **Notifications / Alert inbox** | Liability-prevention alerts are generated server-side but never surfaced | 0 | ✅ Shipped |
| 5 | **Navigation/IA overhaul** | The sidebar exposes only 6 of 31+ routes — built features are orphaned | 0 | ✅ Shipped |

> **Top gaps that now actually lead** (still unbuilt, per §0): **Legal-corpus reader**
> (`/library`, F-B), **Billing/Trust** (#3 above), **"My Day" home** (F-D), and the
> **shared-components / i18n** cleanup (F-C).

---

## 2. What already exists (grounding for the audit)

| Area | Status |
|------|--------|
| Cases / Clients / Contacts / Tasks CRUD | ✅ Mature UI |
| Documents list + detail (metadata/status) | ✅ Exists (no viewer — see §4.1.2) |
| Global FTS search + Cmd+K spotlight | ✅ Exists |
| AI agents (summarize/timeline/research/contract/discovery) | ✅ Backend + basic UI (no streaming UI) |
| Queue monitor, Action Plan, Media registry | ✅ Exists |
| Evidence locker, Stens forms, Studies/academic | ✅ Exists |
| Traffic case panel + alerts widget | ✅ Exists |
| Admin: Diagnostics, Mission Control, Backup, Recovery, Journal, RBAC v1 | ✅ Exists |
| Setup wizard, encrypted backup | ✅ Exists |

### Verified gaps driving this audit *(several resolved since — see §0)*
- ~~**No Calendar / court-hearings / docketing screen**~~ → ✅ **Resolved:** `/calendar`
  (`CalendarPage.tsx`) + `/deadlines` (`DeadlineMonitorPage.tsx`).
- ~~**No document reader**~~ → ✅ **Resolved:** `/documents/:id/read`
  (`DocumentReader.tsx`) with zoom, OCR overlay, and highlight.
- ~~**No unified notification/alert inbox**~~ → ✅ **Resolved:** `NotificationBell` +
  `NotificationPanel`, mounted in `AppShell.tsx`.
- **`LedgerPage` exists** (payment schedules, ILS, paid/overdue) but is a thin
  accounts-receivable ledger — **not** time-tracking / invoicing / trust accounting — and
  it is **not wired into the router** (orphaned).
- **No UI** for: Insolvency Form 5 checklist, citations registry, case-law 3-step
  relevance test, import wizards (Excel/iCal/Net-HaMishpat/archive-mine), document-insight
  verification, agent SSE streaming progress, or GDPR/erasure (`/api/erasure` exists).
- **No end-user Settings/Preferences** screen (settings == admin pages only).
- **Minimal responsive design** (8 files use breakpoints); dark-only; no charting library.
- ~~IA: the sidebar surfaces only 6 primary items; 25+ real routes are reachable only by
  deep link.~~ → ✅ **Resolved:** 8-group accordion nav (`nav-config.tsx` + `Sidebar.tsx`).

---

## 3. How to read the gap analysis

For every gap: **Why it matters · Business impact · Wireframe · Priority.**

- **Priority:** **P0** critical · **P1** high · **P2** medium · **P3** polish.
- **Effort:** **S** ≤3d · **M** 1–2wk · **L** 3wk+.
- **`[backend ready]`** = backend/data already exists; this is mostly a UI build.

Wireframes are RTL (Hebrew, right-aligned) to match the product.

---

## 4. Gap analysis

### 4.1 Missing SCREENS

#### 4.1.1 Calendar & Docketing (court hearings + deadlines) — **P0 · M · [backend ready]**
> ✅ **SHIPPED** — `/calendar` (`features/calendar/CalendarPage.tsx`) + `/deadlines`
> (`features/calendar/DeadlineMonitorPage.tsx`). Wireframe kept for reference.

**Why it matters.** Every benchmark practice-management product (Clio/MyCase) is built
around a calendar. Legal work is deadline-driven; a missed statute or hearing date is
malpractice. The data already exists (`court_hearings`, traffic statute deadlines,
milestone due-dates from `CaseProcedures`, task due-dates) — but there is nowhere to see
it on a calendar.
**Business impact.** Directly prevents missed-deadline liability — the #1 reason firms buy
practice software. Converts scattered dates into one defensible agenda. Major retention
driver.
```
┌────────────────────────────────────────── יומן · Calendar ──────────────────────────────┐
│ [חודש][שבוע][יום][אג'נדה]      ‹ מאי 2026 ›        מסננים: ▢דיונים ▢מועדי התיישנות ▢משימות │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐  ┌──────────┐
│   א׳     │   ב׳     │   ג׳     │   ד׳     │   ה׳     │   ו׳     │   ש׳     │  │ מועדים   │
│          │ 1        │ 2        │ 3 ● דיון │ 4        │ 5 ⚠התיישן│ 6        │  │ קרובים   │
│          │          │ ●● משימה │ מחוזי ת״א│          │ ות תנועה │          │  ├──────────┤
│ 7        │ 8 ●דיון  │ 9        │ 10       │ 11 ●●●   │ 12       │ 13       │  │⚠ 5/5 תנוע│
│          │ עליון    │          │          │          │          │          │  │● 3/5 דיון│
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘  │● 9/5 טפס5│
  לחיצה על אירוע → צד נפתח: תיק, שופט, אולם, מסמכים קשורים, [פתח תיק][תזכורת]      └──────────┘
```
*Build notes.* RTL month grid; colored chips by domain accent (criminal/civil/traffic/
academic); right rail = upcoming-deadlines list reusing `useTrafficAlerts`; "Agenda" view =
printable list. Feed from a new `useCalendarEvents` hook unioning hearings + deadlines +
milestones + tasks.

#### 4.1.2 Document Reader / Viewer (PDF + image + OCR overlay + annotate) — **P0 · L · [partial backend]**
> ✅ **SHIPPED** — `/documents/:id/read` (`features/documents/DocumentReader.tsx`): zoom,
> OCR overlay, highlight. Wireframe kept for reference.

**Why it matters.** A document system whose users cannot *read* the document in-app forces
them back to Windows Explorer, breaking the workflow loop. Relativity/Notion/M365 all
center on a strong reading/annotation surface. Annotation types (highlight/note/redline/
bookmark) and e-signature already exist in the DB/API with no viewer to host them.
**Business impact.** Keeps users in-product (stickiness), unlocks the already-built
annotation and signing features, and is the natural home for AI insight verification
(§4.2.1).
```
┌──────── חוזה שכירות.pdf · עמ׳ 3/12 ────────┬─── תובנות AI ───────────┐
│  [−][100%][+]  ⤓הורד  ✎הדגש  ▭הערה  ⊘חתום  │ סוג: חוזה  ✔ אומת        │
│ ┌────────────────────────────────────────┐ │ ביהמ״ש: מחוזי ת״א  ✎     │
│ │                                        │ │ תיק: ת״א-2024-042  ✔     │
│ │   [ render עמוד PDF / תמונה ]          │ │ שופט: כהן  ? לא ודאי     │
│ │   ▒▒▒ הדגשה צהובה ▒▒▒                   │ │ ───────────────────────  │
│ │   ¹ הערה בשוליים ◄────────────────────┼─┼─ "סעיף 4 חסר תאריך"      │
│ │                                        │ │ [✔ אשר הכל][✎ תקן שדה]   │
│ └────────────────────────────────────────┘ │ ───────────────────────  │
│  ◀ עמ׳ קודם   ●●●○○○○○○○○○   עמ׳ הבא ▶      │ קשור ל: תיק · לקוח · 2 משי│
└────────────────────────────────────────────┴──────────────────────────┘
```
*Build notes.* PDF.js / native image render inside WebView2 (stays local). OCR text-layer
toggle for search-highlight. Right rail merges `DocumentSigningPanel` + insight-verify
(`POST /documents/insights/:id/verify`). Replaces the text-only `DocumentDetail`.

#### 4.1.3 Notifications / Alert Inbox — **P0 · S · [backend ready]**
> ✅ **SHIPPED** — `NotificationBell` + `NotificationPanel`
> (`components/notifications/*`), mounted in `components/layout/AppShell.tsx`. Wireframe
> kept for reference.

**Why it matters.** Alerts are generated server-side (statute lapses, Form-5 gaps, due
tasks, poison-queue items) but evaporate — there is no single place a user checks "what
needs me today." Linear/M365 set the bar: one inbox, unread state, deep links.
**Business impact.** Turns latent liability-prevention data into daily action. Low effort,
high perceived value; anchors the "nothing falls through the cracks" promise.
```
┌─ התראות ───────────────────── 🔔 4 חדשות ─┐   bell badge in top bar →
├───────────────────────────────────────────┤   ┌────────────┐
│ ⚠ התיישנות תנועה — תיק 8/5/26  לפני 3 ימים │   │ 🔔 4       │
│    [פתח תיק]                          ▢ נקרא│   └────────────┘
│ ● טופס 5 חסר 6 שדות — לקוח לוי         ▢   │
│ ● 3 משימות באיחור                      ▢   │
│ ⚙ פריט תקוע בתור — דורש טיפול          ▢   │
├───────────────────────────────────────────┤
│ [סמן הכל כנקרא]            [הגדרות התראות] │
└───────────────────────────────────────────┘
```
*Build notes.* New `Notifications` table + `useNotifications` polling hook; bell in
`AppShell` top bar; click-through to source route. Generators wired from existing alert
endpoints.

#### 4.1.4 Reporting & Analytics — **P1 · M**
**Why it matters.** A boutique-firm owner needs to see the firm at a glance: open vs closed
matters, deadlines this week, AR aging, intake volume, AI-processing throughput. Litify/Clio
sell heavily on dashboards. Today's `DashboardPage` shows raw KPI counts only — no trends,
no charts, no financial view.
**Business impact.** Decision-making + the artifact an owner shows to justify the software.
Surfaces firm health; supports planning and pricing.
```
┌──────────────────────── דוחות וניתוח ────────────────────────┐
│ טווח: [30 ימים ▾]   [ייצא PDF]                                │
├───────────────┬───────────────┬───────────────┬─────────────┤
│ תיקים פעילים  │ נסגרו החודש   │ הכנסה שנגבתה  │ חוב פתוח     │
│   42  ▲6      │   8           │  ₪128,000     │ ₪34,500 ⚠    │
├───────────────┴───────────────┴───────────────┴─────────────┤
│  תיקים לפי סוג            │  גיול חוב (AR)                    │
│  פלילי ████████ 18        │  0-30 ███ 60-90 █ 90+ ██⚠        │
│  אזרחי ██████ 12          │                                  │
│  תנועה ████ 9             │  מסמכים שעובדו / שבוע            │
│  משפחה ██ 3               │  ▁▂▅▇▆▃▂  (sparkline)            │
└───────────────────────────┴──────────────────────────────────┘
```
*Build notes.* Add a charting lib (recharts/visx) — the first in the repo. Feeds from
existing `/admin/stats`, `/cases`, ledger, and pipeline metrics. Printable/PDF export for
offline firm review.

#### 4.1.5 Billing / Time-tracking / Invoicing / Trust (נאמנות) — **P1 · L**
**Why it matters.** This is the economic core of Clio/MyCase. Factum-IL has only a basic AR
`LedgerPage` (and it is unrouted). No timekeeping, no invoice generation, no trust/escrow
ledger — which in Israel (כספי נאמנות / פיקדונות לקוח) carries Bar-compliance obligations.
**Business impact.** The largest commercial-value gap; turns a document tool into a
practice-management suite. Trust accounting is a compliance must-have for many practices.
```
┌──── חיוב · תיק ת״א-2024-042 ────────────────────────────────┐
│ [⏱ טיימר: 00:42:15  ⏸] משימה: ניסוח כתב הגנה                 │
│ ┌─ רישומי זמן ──────────────────────────────────────────┐  │
│ │ 28/5  ניסוח       1.5ש  ₪450/ש  ₪675   [✎]            │  │
│ │ 27/5  פגישת לקוח  1.0ש  ₪450/ש  ₪450   [✎]            │  │
│ └────────────────────────────────────────── סה״כ ₪1,125 ┘  │
│ [צור חשבונית]  [רישום הוצאה]                                 │
│ ┌─ נאמנות (פיקדון לקוח) ─────────────────────────────────┐  │
│ │ יתרה: ₪10,000   הופקד 1/5  ₪10,000   [משיכה][דוח]     │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```
*Build notes.* Promote/replace `LedgerPage`. New tables: `TimeEntries`, `Invoices`,
`TrustLedger`. Timer integrates with Tasks. All local; an invoice is a PDF generated
on-disk.

#### 4.1.6 Insolvency Form 5 Checklist — **P1 · M · [backend ready, zero UI]**
**Why it matters.** A full backend exists (5 sections A–E, status tracking, a phase-gate
requiring 100% completion, WhatsApp gap reminders) with **no screen at all** — a built
feature delivering zero user value.
**Business impact.** Unlocks an entire practice vertical already paid for in engineering.
Direct client-facing workflow (debt/insolvency intake).
```
┌─ חדלות פירעון · טופס 5 · לקוח לוי ──────  התקדמות ███████░░ 72% ─┐
│ שלב: טרום-הגשה          [→ מעבר להליך שיפוטי  (נדרש 100%)]        │
├──────────────────────────────────────────────────────────────────┤
│ ▾ א. פרטים אישיים        ✔✔✔✔ הושלם                              │
│ ▾ ב. נכסים               ✔✔◐✗  2 חסרים                          │
│     • רכב            [◐ חלקי ]  ערך: ___________                 │
│     • נדל״ן          [✗ חסר  ]  [הוסף ערך]                       │
│ ▸ ג. הכנסות              ◐ 1 חסר                                 │
│ ▸ ד. התחייבויות          ✔ הושלם                                │
│ ▸ ה. נושים               ✗ 3 חסרים                              │
├──────────────────────────────────────────────────────────────────┤
│ [📲 שלח תזכורת ללקוח על שדות חסרים]                              │
└──────────────────────────────────────────────────────────────────┘
```
*Build notes.* Pure UI over the existing `/api/insolvency/*`. Accordion per section, status
chips, a phase-gate button disabled until 100%, and a gap-reminder button → existing
`form5-notify`.

#### 4.1.7 Import / Onboarding Wizard — **P1 · M · [backend ready]**
**Why it matters.** Backends exist for Excel (fuzzy AI column mapping), iCal (hearings),
Net-HaMishpat CSV, and recursive archive-mine — but each is an unguided endpoint. New firms
onboard by dumping years of files; there is no guided path.
**Business impact.** Onboarding is where firms churn or commit. A wizard turns a daunting
migration into a 4-step flow; directly drives activation.
```
┌──── ייבוא נתונים ─────────────────────────────────────────────┐
│  ①מקור ──── ②מיפוי ──── ③תצוגה מקדימה ──── ④ייבוא            │
├────────────────────────────────────────────────────────────────┤
│  בחר מקור:                                                       │
│   ◉ סריקת תיקיית ארכיון (Vacuum)   ○ Excel   ○ iCal דיונים     │
│   ○ נטה משפט (CSV)                                              │
│                                                                  │
│  [בחר תיקייה…]  C:\אלטמן\ארכיון 2019-2024                       │
│  נמצאו 1,284 קבצים · 312 כפילויות יסוננו                        │
│                                          [המשך → מיפוי]          │
└────────────────────────────────────────────────────────────────┘
```
*Build notes.* Stepper reusing `/api/importer/*`. Step ② shows the AI column-map for Excel;
③ shows dedup/preview counts; ④ runs with progress (reuse pipeline SSE, §4.2.4).

#### 4.1.8 Citations & Case-Law Workbench (relevance test) — **P2 · M · [backend ready]**
**Why it matters.** `citation_registry`, `global_case_law`, and a 3-step relevance test
(analogy / fact-pattern / procedural fit) are fully built with no UI beyond a
`PrecedentsPage`. This is the legal-research differentiator vs general tools.
**Business impact.** Surfaces unique Israeli-law AI value; supports brief-writing and
argument construction — the highest-value attorney task.
```
┌─ פסיקה · בג״ץ 6821/93 ────────────────┬─ מבחן רלוונטיות לתיק ───┐
│ כותרת: בנק המזרחי נ׳ מגדל            │ תיק: ת״א-2024-042       │
│ ערכאה: עליון · 09/11/1995            │ ① אנלוגיה משפטית   ✔    │
│ תקציר: ...                            │ ② התאמת תשתית עובדתית ✗ │
│ ───────────────────────────────────  │ ③ התאמה דיונית     ✔    │
│ ציטוטים שנקצרו ממסמכים: 3            │ ───────────────────────  │
│ [קשר לתיק]  [נתח לעומק AI]            │ ניקוד: 2/3              │
│                                       │ [הרץ מבחן][טען טיעון]   │
└───────────────────────────────────────┴─────────────────────────┘
```
*Build notes.* Over `/api/case-law/:id/test`, `/api/citations/harvest`, and
`/api/precedents/:id/verify` (24h-cached deep analysis).

#### 4.1.9 End-user Settings / Preferences — **P2 · S**
**Why it matters.** "Settings" today means admin/ops pages. There is no place for a user to
set theme/density, language, default views, notification prefs, signature, or hourly rate.
Every benchmark has a personal settings hub.
**Business impact.** Personalization + reduced support load; a prerequisite for light-mode/
density (§4.7) and notification prefs (§4.1.3).
```
┌─ הגדרות ─────────────────────────────────────────────────┐
│ [פרופיל][תצוגה][התראות][חתימה][מקלדת]                     │
├──────────────────────────────────────────────────────────┤
│ תצוגה:  ערכת נושא  ◉ כהה  ○ בהירה                        │
│         צפיפות     ◉ רגיל ○ קומפקטי                       │
│         שפה        ◉ עברית ○ English                      │
│ ברירת מחדל למסך פתיחה: [לוח בקרה ▾]                       │
└──────────────────────────────────────────────────────────┘
```

#### 4.1.10 GDPR / Right-to-Erasure & Retention — **P2 · S · [backend ready]**
**Why it matters.** `/api/erasure` exists with no UI. Privacy/retention is a legal-data
obligation.
**Business impact.** Compliance posture; safe, audited deletion of client data on request.
*Wireframe:* a guarded admin panel — select client → preview impacted records → typed
confirmation → audited erase. Lives under admin.

---

### 4.2 Missing WORKFLOWS

#### 4.2.1 Document-Insight Verification (human-in-the-loop) — **P0 · S · [backend ready]**
**Why it matters.** AI extracts case#/court/judge with a confidence score; `POST
/documents/insights/:id/verify` exists, but there is no approve/reject UI — so AI output is
never confirmed.
**Business impact.** Trust & safety. Verified data is defensible; unverified AI in a legal
product is a liability. Hosted in the new Document Reader (§4.1.2 right rail).
```
תובנת AI            ערך             ביטחון   פעולה
ביהמ״ש              מחוזי ת״א        92% ✔   [✔][✎][✗]
מס׳ תיק             ת״א-2024-042     88% ✔   [✔][✎][✗]
שופט                כהן              54% ?   [✔][✎][✗] ← מודגש לבדיקה
[✔ אשר הכל מעל 85%]
```

#### 4.2.2 Review Queue + Correction-Learning loop — **P1 · M · [backend ready]**
**Why it matters.** `/queue/review-pending` + `/queue/correct` (corrections feed
field-discovery learning) exist; `QueueMonitor` shows stats but not a review workspace.
**Business impact.** Closes the AI improvement loop; faster, more accurate ingestion over
time.

#### 4.2.3 Matter Intake / Conflict Check — **P1 · M**
**Why it matters.** There is no structured new-client intake and **no conflict-of-interest
check** — an ethical/Bar requirement before taking a matter. Clio/Litify center on intake
pipelines.
**Business impact.** Compliance + prevents disqualifying conflicts; standardizes onboarding.
```
┌─ קליטת תיק חדש ──── ①לקוח ②סוג תיק ③בדיקת ניגוד ④פתיחה ──┐
│ בדיקת ניגוד עניינים:  סורק לקוחות/צד שכנגד קיימים…        │
│  ⚠ התאמה אפשרית: "כהן" מופיע כצד שכנגד בתיק ת״פ-2023-005  │
│  [סקור][התעלם — תיעוד נימוק]                              │
└───────────────────────────────────────────────────────────┘
```
*Build notes.* Conflict scan = FTS over Clients + Contacts (opposing parties). Local, fast.

#### 4.2.4 Agent Streaming Progress (SSE) — **P2 · S · [backend ready]**
**Why it matters.** All 5 agents expose `/stream` SSE endpoints; the UI calls the
non-streaming variants, so long AI runs feel frozen.
**Business impact.** Perceived performance; transparency into the 5-step reasoning chain.
```
מסכם תיק…  ▓▓▓▓▓▓░░░░ 60%
✔ שלב 1 הקשר   ✔ שלב 2 סיווג   ⏳ שלב 3 אסמכתאות   ○ סיכון   ○ מסקנה
```

---

### 4.3 Missing MANAGEMENT tools

#### 4.3.1 Saved Views, Filters & Bulk Actions — **P1 · M**
**Why it matters.** Lists (cases/docs/tasks) have basic search + filter pills but no
saved/named views, no multi-column sort, no multi-select bulk operations. Linear/Notion make
views/filters the core management primitive.
**Business impact.** Daily-driver efficiency for power users; scales as case volume grows.
```
תיקים   [+ תצוגה: "התיק שלי השבוע" ▾]   מסנן: סוג=פלילי × סטטוס=פעיל ×  [שמור תצוגה]
▢ הכל │ מס׳ תיק      │ כותרת        │ סטטוס  │ מועד קרוב
▣ ת״א-2024-042 …                              ← נבחרו 3:  [שייך עו״ד][סגור][תייג]
```

#### 4.3.2 Board / Kanban view for Cases & Tasks — **P2 · M**
**Why it matters.** Matters move through stages (intake→active→filing→appeal→closed); a
board makes the pipeline visible. The backend has case status + procedure stages already.
**Business impact.** Pipeline visibility and workload balancing across the 1–5 attorneys.
```
טרום-הגשה │ פעיל      │ ערעור    │ נסגר
─────────┼───────────┼──────────┼──────
[תיק A]  │ [תיק C]   │ [תיק E]  │ [תיק G]
[תיק B]  │ [תיק D]   │          │
   ↕ גרור כרטיס לשינוי שלב
```

#### 4.3.3 Tag / Label management — **P2 · S**
**Why it matters.** Documents have `tags`; there is no UI to manage a controlled tag
taxonomy or filter by it.
**Business impact.** Findability and consistent organization at scale.

---

### 4.4 Missing MONITORING

- **4.4.1 Mission Control — historical trends — P2 · S.** `MissionControlPage` shows a live
  snapshot only; no time-series (queue depth, failures, agent latency). Events are already
  journaled. *Spot degradation early; capacity planning.*
- **4.4.2 Agent Run Observability — P2 · S · [backend ready].** `AgentExecutionEvents`
  (started/completed/failed/stale) is journaled; `JournalPage` is generic. No per-run
  drill-down (inputs, confidence, duration, stale). *Debug AI behavior; audit AI-assisted
  work.*
- **4.4.3 Deadline/SLA monitor — P1 · S.** ✅ **SHIPPED** — `/deadlines`
  (`features/calendar/DeadlineMonitorPage.tsx`), 4 color-coded severity levels. Pairs with the
  Notification inbox (§4.1.3, also shipped). *Liability radar.*

---

### 4.5 Missing ADMINISTRATIVE

- **4.5.1 RBAC v2 — per-attorney Case Assignments — P1 · M · [hook exists].**
  `RBACManagePage` covers roles; the backend hook for `CaseAssignments` is stubbed in
  `case-isolation-domain.ts`. No UI to assign attorneys to specific matters (need-to-know).
  *Confidentiality boundaries inside the firm.*
- **4.5.2 Firm Settings — P2 · S.** Org name, letterhead, default rates, court list, and
  deadline-rule config live in seed/env, not an admin screen. *Self-service configuration.*
- **4.5.3 Integration Manager — P2 · S · [backend ready].** `GmailBridgePage` exists but
  there is no central place to see/manage all connectors and their sync health.
  *Operational clarity for local-only integrations.*

---

### 4.6 Missing PRODUCTIVITY

- **4.6.1 Global Quick-Add ("n" / "+") — P1 · S.** Cmd+K searches/navigates but there is no
  universal *create* (task/case/client/time-entry) from anywhere. Linear's "C to create" is
  the gold standard. *Removes friction from the most frequent actions.*
- **4.6.2 Keyboard shortcuts + cheatsheet (?) — P2 · S.** Only Cmd+K is bound. *Speed for
  daily drivers; signals product maturity.*
- **4.6.3 Inline editing & optimistic updates — P2 · M.** Most edits open modals; no
  click-to-edit cells. React Query is already in place to do optimistic updates cleanly.
  *Fewer clicks, snappier feel.*
- **4.6.4 Command palette → actions — P2 · S.** Extend the existing Spotlight to *run*
  commands ("create task", "start timer", "summarize case"), not only navigate. *Reuses a
  built primitive for big leverage.*

---

### 4.7 Missing LEGAL-WORKFLOW & UX polish

- **4.7.1 Deadline-rules engine UI — P1 · M.** ✅ **SHIPPED** — `/rules`
  (`features/legal/RulesEnginePage.tsx`) surfaces the `Rules_Engine` (20 Israeli rules).
  *Defensibility + trust in auto-dates.*
- **4.7.2 Document Assembly / generation — P1 · M · [partial: Stens].** `Stens` auto-fill
  exists; extend to one-click generate → preview → e-sign → file for common pleadings.
  *Time savings on routine drafting.*
- **4.7.3 Client communication log — P2 · S.** A unified per-client/per-case timeline of
  emails (Gmail bridge), WhatsApp summaries, and generated letters. `clients/:id/timeline` +
  `summary/text` exist with no rich view. *Single source of truth per client.*
- **4.7.4 Responsive / tablet layout — P3 · M.** ⛔ **Still open** (code-verified): no
  `sm:/md:/lg:` breakpoints in components; the sidebar is a fixed 240px and list tables
  (e.g. `grid-cols-[2fr_1fr_1fr_auto_1fr]`) don't reflow. Attorneys use the desktop in court
  on smaller screens. *Accessibility of the tool in-session.*
- **4.7.5 Light mode + density + print styles — P3 · M.** ⛔ **Still open.** Dark-only;
  legal docs/reports are often printed. Also fold in **i18n**: UI strings are hardcoded
  across ~87 `.tsx` files (no i18n library), which blocks a clean light/density/locale switch.
  *Court-room readability + printable artifacts.*
- **4.7.6 Navigation/IA overhaul — P1 · S.** ✅ **SHIPPED** — 8-group collapsible accordion
  (`components/layout/nav-config.tsx` + `Sidebar.tsx`), state persisted via Zustand. Built
  features are no longer orphaned. *Was the highest ROI per hour in this document.*
- **4.7.7 Empty/loading/error states, shared components & onboarding tour — P3 · S.**
  Systematic skeletons, empty-state CTAs, and a first-run tour. Code-verified UI debt to
  resolve here (≈ WORKPLAN **F-C/F-G**): **no shared form component** (each modal —
  `BugReportModal`/`StensFormModal`/`NewCaseWizard` — reinvents inputs); **a11y gaps**
  (modals lack focus-trap/focus-return; some inputs use placeholder-as-label; secondary text
  `--fg-3` ≈4:1 and placeholders ≈2:1 fail/borderline WCAG). Extract `<AsyncBoundary>`,
  `<EmptyState>`, `<DeadlineChip>`, `<SourceLink>` into `components/common/`. *Polish +
  activation.*

---

## 5. Prioritized roadmap (phased)

### Phase 0 — Quick high-leverage wins (≈2–3 weeks)
Mostly UI over ready backends + IA cleanup. *(Most of this phase is now done — see §0.)*
1. ✅ Navigation/IA overhaul (§4.7.6) — unorphaned 25+ routes.
2. ✅ Notifications inbox (§4.1.3).
3. Document-insight verification (§4.2.1). *(remaining)*
4. Agent SSE streaming (§4.2.4). *(remaining)*
5. ✅ Global Quick-Add + palette actions (§4.6.1, §4.6.4) — see
   `docs/QUICK-ADD-PALETTE-IMPLEMENTATION-PLAN.md`.

### Phase 1 — Core legal-product parity (≈6–8 weeks)
6. ✅ Calendar & Docketing (§4.1.1) + ✅ Deadline/SLA monitor (§4.4.3) + ✅ rules-engine
   surface (§4.7.1).
7. ✅ Document Reader/Viewer + annotation host (§4.1.2).
8. Insolvency Form 5 (§4.1.6). *(remaining)*
9. Import/Onboarding wizard (§4.1.7) + Review-correction loop (§4.2.2). *(remaining)*
10. Matter intake + conflict check (§4.2.3). *(remaining)*
11. RBAC v2 case assignments (§4.5.1). *(remaining)*

> **Net:** Phase 0 is ~80% done and Phase 1's calendar/reader/deadline/rules cluster is
> shipped. The live front of work is **`WORKPLAN_FRONTEND.md` F-B…F-G** (legal-corpus reader,
> shared components/i18n, "My Day", AI-approval uniformity, a11y/print) plus the still-unbuilt
> Phase 1/2 items above (Form 5, import wizard, intake/conflict, RBAC v2, billing/trust).

### Phase 2 — Practice-management & insight depth (≈6–8 weeks)
12. Billing/Time/Invoicing/Trust (§4.1.5).
13. Reporting & analytics (§4.1.4).
14. Saved views/filters/bulk + Kanban (§4.3.1, §4.3.2).
15. Citations/Case-law workbench (§4.1.8).
16. Document assembly (§4.7.2) + client comms log (§4.7.3).
17. Settings/Preferences + Firm settings + Integration manager (§4.1.9, §4.5.2, §4.5.3).

### Phase 3 — Polish & reach (ongoing)
18. Responsive/tablet (§4.7.4), light mode/density/print (§4.7.5), keyboard shortcuts
    (§4.6.2), inline editing (§4.6.3), monitoring trends (§4.4.1, §4.4.2), erasure/retention
    UI (§4.1.10), empty/loading/onboarding (§4.7.7), tag management (§4.3.3).

---

## 6. At-a-glance priority table

*Status reflects code as of June 2026 (see §0). ✅ Shipped · 🟡 Partial · ⛔ Remaining.*

| Gap | Category | Priority | Effort | Backend ready? | Phase | Status |
|-----|----------|:--------:|:------:|:--------------:|:-----:|:------:|
| Navigation/IA overhaul | Legal/UX | P1 | S | n/a | 0 | ✅ |
| Notifications inbox | Screen | P0 | S | ✅ | 0 | ✅ |
| Insight verification | Workflow | P0 | S | ✅ | 0 | ⛔ |
| Agent SSE streaming | Workflow | P2 | S | ✅ | 0 | ⛔ |
| Global quick-add / palette actions | Productivity | P1/P2 | S | n/a | 0 | ✅ |
| Calendar & docketing | Screen | P0 | M | ✅ | 1 | ✅ |
| Document reader/viewer | Screen | P0 | L | partial | 1 | ✅ |
| Deadline/SLA monitor | Monitoring | P1 | S | ✅ | 1 | ✅ |
| Rules-engine surface | Legal | P1 | M | ✅ | 1 | ✅ |
| Insolvency Form 5 | Screen | P1 | M | ✅ | 1 | ⛔ |
| Import/onboarding wizard | Screen | P1 | M | ✅ | 1 | ⛔ |
| Review-correction loop | Workflow | P1 | M | ✅ | 1 | ⛔ |
| Matter intake + conflict check | Workflow | P1 | M | partial | 1 | ⛔ |
| RBAC v2 case assignments | Admin | P1 | M | hook | 1 | ⛔ |
| Billing/time/invoicing/trust | Screen | P1 | L | partial | 2 | ⛔ |
| Reporting & analytics | Screen | P1 | M | partial | 2 | ⛔ |
| Saved views/filters/bulk | Management | P1 | M | n/a | 2 | ⛔ |
| Kanban board | Management | P2 | M | ✅ | 2 | ⛔ |
| Citations/case-law workbench | Screen | P2 | M | ✅ | 2 | 🟡 |
| Legal-corpus reader (`/library`, F-B) | Screen | P1 | M | ✅ | 2 | ⛔ |
| Document assembly | Legal | P1 | M | partial | 2 | ⛔ |
| Client comms log | Legal | P2 | S | ✅ | 2 | ✅ |
| Settings/preferences | Screen | P2 | S | n/a | 2 | ⛔ |
| Firm settings | Admin | P2 | S | partial | 2 | ⛔ |
| Integration manager | Admin | P2 | S | ✅ | 2 | ⛔ |
| GDPR/erasure UI | Screen | P2 | S | ✅ | 3 | ⛔ |
| Monitoring trends + agent observability | Monitoring | P2 | S | ✅ | 3 | ⛔ |
| Tag management | Management | P2 | S | partial | 3 | ⛔ |
| Keyboard shortcuts | Productivity | P2 | S | n/a | 3 | ⛔ |
| Inline editing | Productivity | P2 | M | n/a | 3 | ⛔ |
| Shared components + i18n (F-C) | UX | P2 | M | n/a | 3 | ⛔ |
| Responsive/tablet | UX | P3 | M | n/a | 3 | ⛔ |
| Light mode/density/print | UX | P3 | M | n/a | 3 | ⛔ |
| Empty/loading/onboarding | UX | P3 | S | n/a | 3 | ⛔ |

---

## 7. Business-impact summary

- **Already banked (since this audit):** Navigation/IA, Notifications, Calendar, Document
  Reader, Deadline monitor, Rules-engine, and global Quick-Add — the bulk of Phase 0 and the
  Phase 1 calendar/reader cluster. See §0.
- **Best ROI right now:** the **Legal-corpus reader** (`/library`, F-B) — populated statute
  (#50) and case-law (#52) data is invisible with no screen to read it — and the
  **shared-components / i18n** cleanup (F-C) that de-duplicates label maps across ~87 files.
- **Largest commercial-parity gap vs Clio/MyCase still open:** the **Billing suite**
  (§4.1.5) — `LedgerPage` exists but is unrouted.
- **Compliance / liability cluster:** conflict check (§4.2.3), RBAC v2 (§4.5.1), rules-engine
  surface (§4.7.1), trust accounting (§4.1.5), and erasure (§4.1.10).

All proposals remain **strictly local-first**: rendering (PDF.js/native), charts, timers,
invoices, and conflict scans run on-machine; AI stays on local Ollama; no client data leaves
the device.
