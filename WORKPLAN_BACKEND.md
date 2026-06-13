# תוכנית עבודה — Backend / נתונים / מערכת

> **מטרת-על:** דבר ראשון — **לאכלס את כל המידע הרלוונטי**. אחר כך — לסגור פערים, לסיים כל
> פיצ'ר חצי-מוכן, ולמצב את המערכת (יציבות, אבטחה, ביצועים, חיסיון) לרמת ייצור עבור משרד עו"ד.
>
> משלים את `WORKPLAN_FRONTEND.md` ו-`WORKPLAN_COMMUNICATIONS.md`. אספקת הנתונים וה-API כאן היא התנאי
> לחוויית ה-UI שם. הערה: מודול התקשורת (טלגרם/וואטסאפ) מהווה **חריג מאושר** לעקרון "שום מידע לא יוצא" —
> ראה הגנות החיסיון ב-`WORKPLAN_COMMUNICATIONS.md §0.1`.

---

## עקרונות-על (אדומים — לא לחצות)
1. **שום מידע לא יוצא מהמכונה.** כל ה-AI דרך Ollama מקומי. אין קריאות חוץ עם נתוני לקוח.
2. **חיסיון עו"ד-לקוח.** אין לוג/שליחה חיצונית של תוכן מסמך/שם לקוח/פרטי תיק.
3. **מודל אחד בלבד ל-AI משפטי:** `BrainboxAI/law-il-E2B:Q4_K_M`. (embeddings: `nomic-embed-text` מקומי — מותר.)
4. **verbatim בלבד בקורפוסים** — להעתיק טקסט משפטי מהמקור, לעולם לא לנסח/להמציא.
5. **כשל בחן.** Ollama למטה → לדלג/להמשיך ידני, לעולם לא לקרוס.
6. **לוגיקת מועדים מהמסד** (Rules_Engine), לא מקודדת.

---

## Phase B0 — אכלוס נתונים ✅ **הושלם** (2026-06-13)
- [x] **קורפוס חקיקה** — `LegalSources` / `LegalSections` / `fts_legal_sections` מאוכלסים (migrations 061+).
      `legal-corpus-loader.ts` טוען JSONL offline אידמפוטנטית בהפעלה ראשונה.
- [x] **קורפוס פסיקה** — `VerdictCorpus` / `SupremeCourtVerdicts` / `PrecedentChunks` מאוכלסים (migrations 069, 075, 076).
      `ingest-verdict-corpus.ts` תומך ב-`--from-dir` offline + Ollama embeddings אופציונלי.
- [x] **Embeddings backfill** — `LegalSectionEmbeddings` / `VerdictCorpusEmbeddings` + sqlite-vec (migration 077, SKIP_ON_ERROR).
- [x] **חיפוש FTS5** — `/api/legal-corpus/search` + hybrid search ב-`@factum-il/retrieval` עם בידוד פר-חוק.
- **אומת:** המשתמש אישר שהקורפוסים נוצרו; schemas + API ב-CI ירוק.

## Phase B1 — חיווט הקורפוס לאינטליגנציה ✅ **הושלם** (PR #58, 2026-06-10)
- [x] **שילוב ב-hybrid-search** — `LegalSectionEmbeddings` מחווט ל-hybrid search (`@factum-il/retrieval`)
      עם בידוד פר-חוק.
- [x] **חיווט ל-research agent** — הסוכן מצטט מקורות אמיתיים מהמאגר.
- [x] **API חיפוש** — `/api/legal-corpus/search` (FTS5 verbatim) + hybrid search לסוכנים.
- [x] **בדיקות** — eval regression ב-CI ירוק.
- **אומת:** מוזג ב-PR #58 (wire LegalSectionEmbeddings into hybrid search + research agent).

## Phase B2 — סיום פיצ'רים חצי-מוכנים ✅ **הושלם** (PR #101, 2026-06-13)
- [x] **חישוב מועדים** — `seedProceduralChecklist` מחווט ל-`POST /api/cases` (אם `procedureType` מסופק).
      `ProceduralChecklist` + `Rules_Engine` (30+ כללים ישראליים) — migration 046 + 060.
- [x] **מנוע אוספים חכמים** — `SavedFilters` (migration 079): שמירת פילטר מסמכים ע"י משתמש.
      API: `GET/POST /api/collections/saved`, `DELETE /api/collections/saved/:id`, `GET /api/collections/saved/:id/items`.
      UI: בורר docType/processingState, pills עם מחיקה ב-`SmartCollectionsPage`.
- [x] **נתוני Stens/תבניות** — migration 078 מאכלס 8 תבניות עבריות אמיתיות:
      תביעה קטנה, כתב תביעה, גירושין, מזונות, עבודה, ערר מנהלי, דוח תנועה, ערבות.
- [x] **legal-engine learning mode** — `POST /api/legal-engine/learn` עם Ollama fallback graceful.
      `regulation-parser.ts` מחזיר skeleton מסמך + מיילסטונים; fallback על parse error.
- [x] **packages דקיקים** — `orchestrator`, `sdk`, `encrypted-backup`, `enterprise-hooks` — **הושלם (PR #103, 2026-06-13)**:
      stage transitions ב-rag-worker, plugin routes, encrypted-backup admin routes, enterprise capabilities endpoint, 3 panels + 8 hooks ב-Dashboard.
- **קבלה:** כל פיצ'ר ב-IA הראשי עם backend אמיתי. packages דקיקים — **הושלמו**.

## Phase B3 — התראות וחיסיון ✅ **הושלם — מדיניות ננעלה** (PR #73, 2026-06-10)
- [x] **ההכרעה: התראות in-app בלבד** (אפשרות א') — Notifications inbox (migration 058) הוא ערוץ-ההתראות הרשמי.
- [x] `notification-service.ts` — stub ה-console.log הוחלף ב-no-op שקט (אין דליפת תוכן ללוג).
- [x] `insolvency.ts` form5-notify — תמיד שומר התראת in-app ב-`NotificationsRepository`;
      WhatsApp נשלח רק אם קיים `whatsapp_phone` (consent-gated, ערוץ-תקשורת ולא ערוץ-התראות).
- **אומת:** מוזג ב-PR #73; תואם עקרונות חיסיון.

## Phase B4 — מיצוב וחיזוק המערכת (שבועות 6–8)
- [ ] **אבטחה וחיסיון** — סריקת לוגים שאין דליפת PII/תוכן; הצפנת-מנוחה לנתונים רגישים; RBAC אכיפה
      מקצה-לקצה; ביקורת erasure/retention; אימות שאין קריאת-רשת עם נתוני לקוח.
- [ ] **ביצועים** — אינדקסים על שאילתות חמות, ביצועי vec-search על קורפוס גדול, pagination בכל list-API,
      בדיקות עומס (קורפוס מלא + אלפי מסמכים).
- [ ] **אמינות** — כשל-בחן של Ollama בכל נתיב (לא רק חלקם); idempotency; טיפול-שגיאות אחיד;
      ניקוי משאבים; שחזור מ-crash (כבר יש crash-capture — להרחיב כיסוי).
- [ ] **גיבוי/שחזור** — לאמת snapshot+restore כולל הקורפוסים הגדולים; auto-vacuum; שלמות-FTS5.
- [ ] **תצפיתיות** — מטריקות שימוש (בלי PII), בריאות Ollama, זמני-תגובה; דשבורד מערכת ל"אזור מערכת".
- [ ] **היגיינת מיגרציות** — לסגור את הפער במספור (045→046… ו-063 — לוודא אין דילוגים/התנגשויות),
      תיעוד סכמה מעודכן.
- [ ] **כיסוי בדיקות** — יעד כיסוי לנתיבים קריטיים (קורפוס, RAG, מועדים, חיסיון); הרחבת CI gates.
- **קבלה:** בדיקות-עומס עוברות, ביקורת-אבטחה/חיסיון נקייה, גיבוי+שחזור מאומתים, CI ירוק עם gates מחמירים.

---

## רצף תלות מומלץ
```
B0 אכלוס ──▶ B1 חיווט RAG ──▶ (F2 מאגר UI, F4 תובנות)
   │
   ├──▶ B2 סיום פיצ'רים ──▶ (F1 לוח-שנה/מועדים/אוספים/Stens)
   │
   ├──▶ B3 התראות (החלטת מדיניות) ──▶ (F4)
   │
   └──▶ B4 מיצוב וחיזוק (לאורך כל הדרך; נעילה לפני "ייצור")
```

## מדדי הצלחה (Definition of Done לתוכנית)
- שני הקורפוסים מאוכלסים, מאומתים verbatim, ומחווטים ל-RAG עם בידוד פר-חוק.
- אפס route עם נתוני-דמה; אפס פיצ'ר "חצי".
- התראות תואמות-חיסיון; אפס דליפת PII; כל עקרונות-העל האדומים נשמרים.
- ביצועים/עומס/גיבוי/אבטחה — עוברים ביקורת; CI עם gates מחמירים ירוק.
