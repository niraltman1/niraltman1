# תוכנית עבודה — Frontend / UX  *(מעודכן לאחר audit קוד — יוני 2026)*

> ✅ **סטטוס 2026-06-10: כל הפאזות F-A…F-G הושלמו ומוזגו ל-main** (PRs #68, #70, #73, #74, #76).
>
> ✅ **סטטוס 2026-06-13 — Audit UX Round (PRs #94–#97, 11/20 פריטים):**
> - #94: ניווט (חיפוש + קורפוס), כפתור שולחן עבודה, חלץ אסמכתאות, תוצאות AI שמורות
> - #95: גרסאות מסמך, batch review תובנות AI, דף אסמכתאות
> - #96: גרף ישויות (SVG), חוויית סוכנים מאוחדת (URL params)
> - #97: ייצוא PDF + Word (`jspdf` + `docx`, `ExportMenu`)
>
> **נותרים 9 פריטים מה-audit** — ראה `AUDIT-UX-PRODUCT-2026-06.md` §"The 20 Highest-Value Improvements" לסטטוס מלא.
> עבודה עתידית: #4 (Ledger), #14 (Journal), #18 (onboarding), #9 (Insolvency), #3 (Drafting workspace).

> **מטרת-על:** ממשק שנבנה **לעורך דין**, לא למתכנת. כל מסך נמדד: *"האם עו"ד תחת לחץ מועדים מבין בשנייה מה לעשות כאן?"*
>
> משלים את `WORKPLAN_BACKEND.md` ו-`WORKPLAN_COMMUNICATIONS.md`. תלויות מסומנות `⟵ B#`.
>
> ⚠️ **גרסה זו עודכנה אחרי audit מבוסס-קוד של ענף `lucid-johnson` (M1–M7).** רוב התוכנית המקורית כבר מומשה
> (ראה טבלת הרקונסיליאציה). הפאזות החדשות (F-A…F-G) הן **רק העבודה שנותרה**.

---

## ✅ רקונסיליאציה מול הקוד הקיים (מה כבר נעשה ב-M1–M7)

| יכולת (מהתוכנית המקורית) | מצב | קובץ / הוכחה |
|---|---|---|
| ניווט/IA מקובץ בקטגוריות משפטיות | ✅ הושלם | `components/layout/nav-config.tsx` — 8 קבוצות עבריות |
| לוח שנה (`/calendar`) | ✅ הושלם | `features/calendar/CalendarPage.tsx` (חודש+agenda) |
| ראדאר מועדים (`/deadlines`) | ✅ הושלם | `features/calendar/DeadlineMonitorPage.tsx` (4 רמות דחיפות צבעוניות) |
| אוספים חכמים (`/collections`) | ✅ הושלם (M7) | `features/documents/SmartCollectionsPage.tsx` |
| ספריית Stens/טפסים (`/stens`) | ✅ הושלם | `features/stens/StensLibraryPage.tsx` (+AI fill) |
| פרטי תיק (`/cases/:id`) | ✅ הושלם | `features/cases/CaseDetail.tsx` (טאבים: מסמכים/ציר/קשרים/תובנות/אסמכתאות/פעילות) |
| הכנה לדיון (`hearing-prep`) | ✅ הושלם (M5) | `features/cases/HearingPrepPage.tsx` |
| פרטי לקוח | ✅ הושלם | `features/clients/ClientCard.tsx` (תיקים/מסמכים/ציר/ledger) |
| ציר-זמן תיק אינטראקטיבי | ✅ הושלם (M3) | `features/cases/CaseTimeline.tsx` |
| Citation Intelligence | ✅ הושלם (M4) | `features/cases/CaseCitations.tsx` |
| ניווט מבוסס-ישויות (שופטים/ערכאות) | ✅ הושלם (M6) | `features/entities/EntitiesPage.tsx` + `EntityDetailPage.tsx` |
| Risk Dashboard | ✅ הושלם | `features/cases/CaseRiskPanel.tsx` |
| "הצג מקור" (provenance) | ✅ הושלם | `DocumentReader.tsx` + `CaseCitations.tsx` (`?highlight=`) |
| צופה מסמך in-app | ✅ הושלם | `features/documents/DocumentReader.tsx` (zoom, OCR, highlight) |
| Admin (journal/recovery/RBAC/backup) | ✅ הושלם | `features/admin/*` תחת `/admin/*` |
| **חיפוש גלובלי (`/search`)** | ✅ הושלם (F-A) | `features/search/SearchPage.tsx` + `shared.tsx` — תוצאות FTS5 מקובצות/מודגשות/נווטות; `SpotlightSearch` תוקן לאותו contract; חוזה ננעל ב-`engine.test.ts` |
| **מאגר חקיקה/פסיקה (קריאה מילולית)** | ✅ הושלם (F-B, PR #76) | `/library` — `LegalLibraryPage` (טאבים חקיקה/פסיקה) + `LegalCorpusPage` + `JudgmentLibraryPage` |
| **מילון מונחים מרכזי** (`legal-terms.ts`) | ✅ הושלם (F-C, PR #68) | `apps/dashboard/src/lib/legal-terms.ts` |
| **רכיבים משותפים מחולצים** | ✅ הושלם (F-C, PR #68) | `SharedComponents.tsx` + `AiApprovalBar` (PR #73) |
| **דף בית מבוסס-מטלה ("היום שלי")** | ✅ הושלם (F-D, PR #70) | `features/dashboard/DashboardPage.tsx` — שולחן-עבודה יומי dashboard-first |
| **שולחן עבודה 3-פאנלים** | ✅ הושלם (F-E) | `MatterWorkbench` (route `cases/:id/workbench`) |

**מסקנה:** ✅ כל ששת הפערים נסגרו (F-A…F-G הושלמו).

---

## עקרונות מנחים (חלים על כל שלב — ללא שינוי)
1. **שפה משפטית, לא הנדסית.** 2. **מבוסס-מטלה, לא מבוסס-טבלה.** 3. **מועד הוא המלך.**
4. **מקור תמיד גלוי.** 5. **עברית-first, RTL מלא, רושמה פורמלית.** 6. **כשל בחן וברור.**
7. **מצבי-ריק מנחים.** 8. **דיסקרטיות וחיסיון** (אין תוכן/שם-לקוח בלוגים/טוסטים).

### מילון תרגום מונחים (Engineering → עו"ד) — *מקור-אמת עתידי ל-`legal-terms.ts` (F-C)*
| במערכת | יוצג לעו"ד | | במערכת | יוצג לעו"ד |
|---|---|---|---|---|
| Queue | "מסמכים בעיבוד" | | Confidence 0.78 | "ודאות: גבוהה/בינונית/נמוכה" + צבע |
| Poisoned/requeue | "קבצים שנכשלו — נסה שוב" | | Agent/run/token | "ניתוח AI" / "מכין סיכום…" |
| OCR/CLASSIFIED/ENRICHED | "נסרק/מסווג/נותח" | | Embedding/vector | "חיפוש חכם" |
| Circuit breaker / Ollama down | "העוזר החכם אינו זמין כרגע" | | | |

---

# הפאזות שנותרו (העבודה האמיתית)

## Phase F-A — חיווט תוצאות החיפוש הגלובלי ✅ **הושלם**
**מה שהיה:** ה-API (FTS5) החזיר תוצאות אך `SearchPage` היה stub, ו-`SpotlightSearch` קרא contract מיושן
(`hit.type/nameHe/filename/ocrText`) שלא תאם את הצורה האמיתית — ולכן תייג שורות לפי id וניווט ל-`/dashboard`.
- [x] `useSearch()` מוטפס ל-contract הקנוני `SearchHit {entityType,id,rank,snippet,title}`.
- [x] `features/search/shared.tsx` — מקור-אמת אחד: entity-meta, hrefs, grouping, הדגשת-מונח (`<Highlight>`).
- [x] `SearchPage` נבנה מחדש: תוצאות מקובצות/מודגשות/נווטות + filter-pills + sync ל-`?q=` + מצבי טעינה/ריק/אין-תוצאות/שגיאה.
- [x] `SpotlightSearch` תוקן לאותו contract דרך ה-helpers המשותפים.
- [x] בדיקת-חוזה `packages/database/src/search/engine.test.ts` נועלת את הצורה (case/client/document).
- **אומת:** typecheck + lint + build נקיים; 5 בדיקות-חוזה ירוקות; בדיקות API/DB קיימות עוברות.

## Phase F-B — מסך מאגר חקיקה ופסיקה (קריאה מילולית) ✅ **הושלם** (PR #76, 2026-06-10)
- [x] **מסך "מאגר משפטי"** — route `/library` (`features/legal/LegalLibraryPage.tsx`) — שני טאבים: *חקיקה* | *פסיקה*.
      טאב חקיקה = `LegalCorpusPage` (סינון-תחום, חיפוש FTS5, טקסט מילולי, שלח-לטיוטה/מדף);
      טאב פסיקה = `JudgmentLibraryPage` (סיידבר מקוטלג, צופה טקסט-מלא, תפריט-ציטוט על בחירת-טקסט).
- [x] חיפוש FTS5 + סינון לפי תחום (אזרחי/פלילי/משפחה/עבודה/מנהלי/תעבורה/מסחרי).
- [x] **תצוגת טקסט מילולי** — `verbatim_text_he` בקריאה נוחה RTL, ניווט-סעיפים.
- [x] **ציטוט** — תפריט-הקשר "העתק עם מראי מקום" בצופה הפסיקה.
- [x] **שילוב בטיוטה** — "שלח למדף" / "טיוטה חדשה" מכל סעיף-חקיקה (חיבור ל-`/drafting`).
- **אומת:** 4 בדיקות `LegalLibraryPage`; typecheck+lint+CI ירוקים; ערך בסיידבר "ספריית חקיקה ופסיקה".

## Phase F-C — מילון מונחים מרכזי + חילוץ רכיבים משותפים ✅ **הושלם** (PR #68)
- [x] **`apps/dashboard/src/lib/legal-terms.ts`** — מקור-אמת אחד למיפויי-תוויות.
- [x] **רכיבים משותפים** — `SharedComponents.tsx` (`DeadlineChip`, `SourceLink`, `ConfidenceBadge`, `EmptyState`).
- **אומת:** מוזג ב-PR #68 (unified drafting workspace) יחד עם רכיבי-העריכה.

## Phase F-D — דף בית "היום שלי" (מבוסס-מטלה) ✅ **הושלם** (PR #70 + main)
- [x] `DashboardPage` חדש (`features/dashboard/`) — שולחן-עבודה יומי: סדר-יום היום + מועדים-בסיכון,
      "דורש תשומת-לב" (3 רמות), תיקים פעילים, מרכז תקשורת, מרכז מסמכים, AI workbench, חיפוש, KPI strip.
- [x] ניווט dashboard-first: 8 קבוצות-דומיין עסקיות (home/cases/clients/documents/research/ai/office/system).
- **אומת:** מוזג ב-PR #70 (prestige-tech redesign) + refactor המשך ב-main (2026-06-10).

## Phase F-E — הכרעת שולחן-עבודה (3-פאנלים) ✅ **הושלם**
- [x] `MatterWorkbench` (`features/cases/MatterWorkbench.tsx`, route `cases/:id/workbench`) — תצוגת-עבודה
      מאוחדת פר-תיק עם `WorkbenchInsights`. ההכרעה: הרחבת CaseDetail במקום canvas נפרד.

## Phase F-F — אחידות נתיב-אישור-AI + מקור בכל מקום ✅ **הושלם** (PR #73)
- [x] **`AiApprovalBar`** משותף (אשר/דחה/עריכה) — בשימוש ב-`WorkbenchInsights`, `DocumentDetail`, `AgentOutputPanel`.
- [x] תובנות עם רמת-ודאות + מקור.

## Phase F-G — ליטוש: נגישות, הדפסה, מצבי-מצב, ביצועים ✅ **הושלם** (PR #74)
- [x] **Print stylesheet** — `@media print` ב-`globals.css`: הסתרת sidebar/header/footer/controls,
      רקע לבן, RTL נשמר (הדפסת case brief / כתבי-טענות מהדפדפן).
- [x] **נגישות** — skip-link ל-`#main-content` ב-AppShell, `aria-label` על Spotlight, `data-no-print`.
- [x] **ביצועים** — route-level lazy-loading מלא דרך `lz()` helper בכל ה-routes + `Suspense` ב-AppShell.
- **אומת:** lint+typecheck+62 בדיקות dashboard ירוקים.

---

## הערת-גישור למודול התקשורת (C-plan)
בסיידבר כבר קיימת קבוצת **"תקשורת"** (מחולל מייל + חיבור Gmail). מודול התקשורת האומני-ערוצי
(`WORKPLAN_COMMUNICATIONS.md`) **ירחיב** קבוצה זו — טלגרם/וואטסאפ/ציר-זמן-אחיד — ויטמיע פאנל-תקשורת
ב-`CaseDetail` וב-`ClientCard` הקיימים (Phase C3). אין צורך בקבוצת-ניווט חדשה.

## תלות ב-Backend
| Frontend שנותר | תלוי ב- |
|---|---|
| F-A חיפוש | קיים (FTS5 API) — חיווט בלבד |
| F-B מאגר חקיקה/פסיקה | B0 (אכלוס #50/#52) + B1 (חיפוש) |
| F-F תובנות-AI אמיתיות | B1 (חיווט RAG ל-prompt-builder) |

## מדדי הצלחה (Definition of Done)
- חיפוש גלובלי מציג תוצאות; מאגר חקיקה/פסיקה נקרא ומצוטט מתוך המערכת.
- מילון-מונחים מרכזי + רכיבים משותפים בשימוש; אפס מונח הנדסי גלוי.
- "היום שלי" ממוקד-משימות; כל פלט-AI עם מקור+ודאות+אישור.
- RTL/עברית, a11y, הדפסה — עוברים ביקורת.
