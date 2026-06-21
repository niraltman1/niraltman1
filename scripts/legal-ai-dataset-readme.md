# 🧠 דאטא סט מוח משפטי AI — Factum-IL

## מה יש כאן?

קובץ זה מכיל עותק מאורגן של כל רכיבי המוח המשפטי של מערכת Factum-IL,
לצורך יצירת דאטא סט ותיעוד.

**המערכת המקורית לא שונתה כלל — כל קבצי הריליס הם עותקים.**

---

## תוכן הארכיון

### רכיבי ליבה

#### `מנוע-AI-ישראלי.zip`
קוד ה-OllamaClient המחובר ל-BrainboxAI/law-il-E2B.
כולל שרשרת חשיבה בת 5 שלבים: הקשר → סיווג → סמכויות → ניגודים/סיכונים → מסקנה.

#### `מסנני-בטיחות-AI.zip`
מסנני קלט/פלט של ה-AI:
- זיהוי PII (שמות, ת.ז., מספרי תיק)
- מניעת הזיות: verifier ציטוטים + confidence gate
- בידוד הזרקות prompt
- מגן חיסיון עו"ד–לקוח

#### `ניתוב-מודלים.zip`
שכבת ניהול מודלים: בחירת מודל, בדיקות תקינות, circuit breaker.

#### `אונטולוגיה-משפטית-ישראלית.zip`
מיפוי שלם של המערכת המשפטית הישראלית:
- היררכיית בתי המשפט (שלום → מחוזי → עליון, עבודה, משפחה, מינהלי)
- טקסונומיה של הליכים משפטיים
- נרמול מונחים משפטיים + מילון נרדפים

#### `מנוע-אחזור-וחיפוש-וקטורי.zip`
מנוע חיפוש סמנטי:
- חיפוש KNN באמצעות sqlite-vec
- חיפוש היברידי FTS5 + וקטור
- חיתוך מסמכים לפי הקשר
- הטמעות סמנטיות (Ollama nomic-embed-text)

#### `מנוע-אסמכתאות-ישראלי.zip`
פרסר ציטוטים ישראלי דטרמיניסטי (Nevo 2021):
- בג"ץ, ע"א, רע"א, ע"פ, עב, תמש, עת"מ, בש"א ועוד
- קנוניזציה, אימות, תיקון, פורמטינג

#### `מערכת-הערכת-AI.zip`
harness הערכה ורגרסיה:
- datasets של שאלות משפטיות ישראליות
- מדדי דיוק וזכירה
- regression fixtures לבדיקת איכות המודל

#### `ליבת-סוכני-AI.zip`
תשתית סוכני AI:
- ממשק בסיס לכל הסוכנים
- מרשם כלים (tool registry)
- CaseExecutionContext — הקשר ביצוע לפי תיק
- RBAC (admin/attorney/assistant/reviewer/read_only)
- יומן ביצוע + הגנות concurrency

#### `מתאם-סוכני-AI.zip`
תזמור רב-סוכני:
- תזמור משימות בין סוכנים
- רצף שלבים
- מנוע עקביות

#### `זיכרון-שיחה-לתיק.zip`
זיכרון שיחה SQLite לכל תיק:
- שמירת שיחות AI לפי תיק משפטי
- assembler הקשר
- הגנת פרטיות ובידוד תיקים

#### `עיבוד-קורפוס-משפטי-וכנסת.zip`
כלי קליטת הקורפוס המשפטי:
- כנסת OData (1,077+ חוקים)
- WikiSource (מקורות עבריים)
- case-law-israel (HuggingFace — פסקי דין)
- קורפוס בית המשפט העליון (LevMuchnik)

#### `ניתוח-סיכוני-ליטיגציה.zip`
analytics ניתוח ליטיגציה:
- ניקוד סיכון מועדים
- גלאי סתירות
- ניתוח פערי ראיות
- גרף תלויות

---

### API ומסד נתונים

#### `נתיבי-API-ומודולי-מוח-משפטי.zip`
כל קבצי ה-Express הקשורים למוח המשפטי:
- נתיבים: `/api/legal-brain`, `/api/legal-corpus`, `/api/legal-knowledge`, `/api/verdict-corpus` ועוד
- מודולי שירות פנימיים
- כלי עזר: RAG worker, Ollama legal client, loaders
- שירותים: LegalKnowledgeService, LegalSourceLoader

#### `שאילתות-מסד-נתונים-משפטי.zip`
שאילתות TypeScript ל-SQLite:
- קורפוס משפטי, מסמכים משפטיים, הטמעות, ציטוטים
- VerdictCorpus, PrecedentLibrary, LegalBrainSessions
- RegistrySource, IngestionProgress

#### `מיגרציות-סכמת-מוח-משפטי.zip`
קבצי SQL של מיגרציות (לפי סדר):
- **069** `verdict_corpus` — VerdictCorpus, SupremeCourtVerdicts
- **070** `precedent_library` — PrecedentLibrary
- **071** `legal_drafts` — LegalDrafts
- **073** `legal_brain_sessions` — LegalBrainSessions
- **074** `legal_brain_messages` — LegalBrainMessages
- **075** `supreme_court_verdicts` — SupremeCourtVerdicts
- **076** `precedent_chunks` — PrecedentChunks
- **077** `vec_precedent_verdicts` — וקטורים sqlite-vec
- **082** `legal_knowledge_foundation` — LegalDocuments, LegalSourceRegistry
- **083** `verdict_citations` — VerdictCitations, LegalJudges, LegalCourts
- **084** `legal_document_embeddings` — LegalDocumentEmbeddings
- **085** `vec_legal_documents` — vec0 וקטורים

#### `סכמת-בסיס-הנתונים-המלאה.zip`
קובץ `database.schema.sql` — סכמה מלאה של כל 85+ טבלאות המערכת.

---

## הערות

- **מודל AI:** `BrainboxAI/law-il-E2B:Q4_K_M` — אומן על משפט ישראלי בלבד
- **שפה:** עברית, RTL, UTF-8
- **בסיס נתונים:** SQLite עם FTS5 + sqlite-vec
- **הרצה:** Ollama מקומי בלבד — אין שליחת נתונים לענן

*Factum-IL — מערכת ניהול תיקים משפטיים ישראלית*
