# תוכנית עבודה — מודול תקשורת אומני-ערוצי (Omnichannel Communication)

> **חזון (לפי הנחיית הבעלים):** מרכז תקשורת מוטמע בתוך תיק הלקוח/התיק המשפטי, המאחד
> **Telegram · WhatsApp · Email · שיחות טלפון** לציר-זמן אחיד, עם תמלול Whisper, תבניות חכמות,
> תיוג AI יזום, וניתוב לידים. נגיש מ-**הסיידבר הראשי**, **מתוך כל כרטיס לקוח**, ו**מתוך כל תיק**.
>
> משלים את `WORKPLAN_FRONTEND.md` ו-`WORKPLAN_BACKEND.md`.

---

## 0. החלטות ארכיטקטורה (נעולות)
| נושא | הכרעה |
|---|---|
| **ערוץ ראשי** | **Telegram** — Bot API רשמי. יציב, מאובטח, אפס סיכון-חסימה, קבצים גדולים. |
| **ערוץ גיבוי** | **WhatsApp** — ספרייה self-hosted (whatsapp-web.js) המקושרת למספר של המשרד. **שליחה ידנית בלבד** (ההודעה מוכנה ב-UI, המשתמש לוחץ "שלח") כדי להקטין סיכון-חסימה. |
| **שליחת מסמכים לחתימה** | **קישור מקומי מאובטח** — רק הקישור + טקסט מינימלי עוברים בערוץ; המסמך עצמו נשאר במכונה ומוגש מעמוד-חתימה מקומי. |
| **הגנות ברירת-מחדל** | **הסכמה + audit** — opt-in מתועד פר-לקוח לפני כל הודעה; כל יציאה נרשמת ל-audit מקומי; תוכן מינימלי. |
| **תמלול אודיו** | **Whisper מקומי** (whisper.cpp / מקומי) — האודיו לעולם לא יוצא מהמכונה. |
| **AI לתיוג/ניתוח** | **`law-il-E2B` מקומי בלבד** (עקרון "מודל אחד" של CLAUDE.md). אין LLM חיצוני. |
| **הקלטת שיחות** | **אסורה** — אין הקלטת שיחה חיה; רק הכתבה (dictation) אחרי השיחה. |
| **מודל חשבונות** | **חשבון מרכזי אחד למשרד** — בוט-טלגרם רשמי אחד + מספר-וואטסאפ אחד. **לא** בוט-פר-עו"ד. מותג המשרד אחיד כלפי הלקוח. |
| **Smart Routing** | הודעות נקלטות מהחשבון המרכזי ומנותבות אוטומטית ל**תיק הנכון** ול**עו"ד/משתמש המשויך** לאותו תיק. הניתוב הוא במודל-הנתונים הפנימי בלבד (assignment), שקוף ללקוח. |

## 0.1 חיסיון ועמידה ברגולציה (קריטי)
- Telegram/WhatsApp מנתבים תוכן דרך שרתים חיצוניים → **חריג מודע ומאושר ע"י הבעלים** לעקרון
  "שום מידע לא יוצא מהמכונה", מצומצם לערוצי-התקשורת בלבד.
- **חובה:** הסכמת-לקוח מתועדת לפני כל ערוץ; audit מלא; מזעור-תוכן (אין פרטי תיק רגישים בגוף ההודעה —
  מעדיפים "יש עדכון בתיק" + קישור מקומי).
- אחסון מוצפן של tokens/sessions של הערוצים; אכיפת RBAC; תיעוד מדיניות שמירה/מחיקה (retention/erasure).
- תאימות חוק הגנת הפרטיות + כללי לשכת עורכי הדין (חיסיון עו"ד-לקוח).

---

## Phase C0 — תשתית ומודל-נתונים ✅ **הושלם**
> **שכבת נתונים:** migration `060_communications.sql` (7 טבלאות, 13 אינדקסים), `CommunicationsRepository`
> עם מנוע **Smart Routing** (זיהוי שולח → לקוח → תיק פעיל → עו"ד מ-CaseAssignments; ריבוי-תיקים/אלמוני →
> triage/UnknownInbox, ללא ניחוש), **שער-הסכמה** ל-outbound + **audit מלא** (send/send_blocked/consent/route/channel_config).
> **API + RBAC:** `/api/communications` בקו אחד עם דפוס-הקוד הקיים — **endpoints תפעוליים פתוחים** (כמו `/cases`,`/documents`)
> ל-app המקומי הנאמן; **סודות/governance** (channels, telegram connect/set-webhook) → `admin` בלבד (least-privilege).
> הבקרה המשפטית על שליחה היא **שער-ההסכמה (409) + audit + HITL** (לחיצת-אדם), לא RBAC.
> **הצפנת credentials:** סודות הערוצים מוצפנים ב-`field-cipher` (AES-256-GCM); `CommChannels` מחזיק רק `credential_ref`,
> לעולם לא את הסוד. `listChannels` חושף `hasCredential` בלבד.
> **נבדק:** 7 בדיקות repo + 7 בדיקות route (RBAC 401/403, consent 409→200, ולידציה 422) + ולידציית DDL.
> DB(72)+API(92) ירוקים; typecheck+lint נקיים.

- [ ] **סכמת DB (migrations חדשים, סלוט פנוי הבא):**
      `CommChannels` (telegram/whatsapp/email/phone + סטטוס חיבור),
      `Conversations` (שיוך ל-client_id/case_id, ערוץ, נושא),
      `CommMessages` (כיוון, ערוץ, תוכן-verbatim, מטא, סטטוס-טיפול handled/replied),
      `CommConsent` (opt-in פר-לקוח+ערוץ, חותמת-זמן, מקור-הסכמה),
      `CommAudit` (כל יציאה: מי/מה/מתי/ערוץ),
      `UnknownInbox` (הודעות ממספרים/משתמשים לא-מזוהים).
- [ ] **שכבת Repository** (read+write) ב-`@factum-il/database` עם בידוד פר-תיק/לקוח.
- [ ] **מנוע ניתוב (Smart Routing)** — מהחשבון המרכזי: זיהוי שולח (telegram-id/טלפון/מייל) →
      התאמה ל-`client_id` → מציאת התיק/ים הפעילים → ניתוב לעו"ד **המשויך** לתיק (`assigned_user_id`).
      אי-ודאות (כמה תיקים פעילים / שולח לא-מזוהה) → תור-טריאז' / `UnknownInbox` (C8), לא ניחוש.
- [ ] **שירות הסכמה + audit** — gate מרכזי: אין שליחה ללא consent רשום; כל שליחה → CommAudit.
- [ ] **הצפנת credentials** (Telegram bot token, WhatsApp session) ב-config מוצפן.
- **קבלה:** ניתן לרשום שיחה/הודעה/הסכמה; gate חוסם שליחה ללא הסכמה; audit נכתב.

## Phase C1 — Telegram (ערוץ ראשי) 🟡 **קוד הושלם — נדרש אימות חי (allowlist)**
- [x] אינטגרציית **Bot API רשמי**: `TelegramClient` (getMe/sendMessage/getFile/downloadFile/setWebhook,
      HTTP מוזרק לבדיקות ללא רשת), `modules/telegram/`.
- [x] **Inbound**: `handleTelegramUpdate` → `routeInbound` (זיהוי שולח לפי telegram-id, טקסט/caption +
      מדיה photo/document/voice → file_id ref). webhook עם אימות secret-token.
- [x] **Outbound**: `sendTelegramText` (best-effort) — שליחת ההודעה שנרשמה; ה-route מדווח delivery
      ומבצע audit (delivered/delivery_failed) בלי לחסום רישום (= כשל-בחן: לא קורס).
- [x] **חיבור/אימות**: `POST /telegram/connect` (admin) — אחסון token מוצפן + `getMe`; `set-webhook`.
- [ ] **נותר**: העברת-קבצים בפועל (download → pipeline) דורש רשת; Onboarding welcome-link אוטומטי.
- **אומת:** 8 בדיקות (client envelope/errors/URL; inbound unknown/known/photo/empty) + API(100) ירוק.
- ⚠️ **חסם-סביבה:** `api.telegram.org` אינו ב-allowlist הנוכחי → אי-אפשר לאמת מסירה חיה כאן.

## Phase C2 — WhatsApp (גיבוי, שליחה-ידנית) ⚠️ **מגבלת-beta מתועדת** (חסום-סביבה)
- [ ] **whatsapp-web.js self-hosted** המקושר למספר המשרד (חיבור QR מנוהל מה-UI, session מוצפן).
- [ ] **דגם שליחה-ידנית:** ה-UI מכין את ההודעה/הקישור; המשתמש מאשר ולוחץ "שלח" (הקטנת סיכון-חסימה).
- [ ] consent-gated; **Fallback Nudge:** אם הלקוח מתעקש על WhatsApp — מותר, עם הצעה תקופתית לעבור לטלגרם.
- 🏗️ **החלטת-ארכיטקטורה (בעלים):** **לא** להוריד Chromium נפרד. Factum-IL כבר משתמש ב-**WebView2** (מנוע Chromium).
      להגדיר Puppeteer דינמית עם `executablePath` שמצביע ל-Edge/WebView2 runtime המקומי
      (`puppeteer.launch({ executablePath: <edge/webview2 path> })`), לפי הסביבה.
- **קבלה:** הודעת WhatsApp נשלחת בלחיצה ידנית, consent נאכף, נרשמת בציר-הזמן ובאודיט.
- ⚠️ **חסם-סביבה:** whatsapp-web.js + דפדפן-חי + מכשיר-מקושר אינם זמינים/ניתנים-לאימות ב-sandbox הנוכחי.

## Phase C3 — ציר-זמן אחיד + נקודות-כניסה ✅ **הושלם**
- [x] **Unified Timeline** (`features/communications/CommunicationsPanel.tsx`): master/detail של שיחות + בועות הודעה
      (inbound/outbound), עם hooks (`useCommConversations/useCommConversation/useSendCommMessage/useGrantConsent`).
- [x] **אינדיקטור-ערוץ** בכל שיחה/בועה (טלגרם/וואטסאפ/מייל/טלפון — `channel-meta.tsx`).
- [x] **Action Bar** + **שער-הסכמה ב-UI:** שליחה חסומה (409) מציגה באנר "תעד הסכמה ושלח" (HITL).
- [x] **שלוש נקודות-כניסה (הדרישה המקורית):** פריט **"מרכז תקשורת"** בסיידבר (קבוצת "תקשורת" + route `/communications`),
      טאב **"תקשורת"** מוטמע ב-**CaseDetail** (פר-תיק) וב-**ClientCard** (פר-לקוח). דף-הבית כולל גם תיבת אלמונים (C8).
- **אומת:** dashboard typecheck + lint נקיים, build (4708 modules) עובר.

## Phase C4 — תבניות חכמות מודעות-הקשר ✅ **הושלם**
- [x] **טעינה דינמית:** `CommTemplates` מותאמות לפי `Case Type` × `Case Status` × `Channel` (NULL=wildcard),
      מסודרות לפי specificity (`matchTemplates`). migration 061 + 4 תבניות-זרע עבריות.
- [x] **הזרקת-משתנים:** `render()` טהור מחליף `{{client_name}}`,`{{case_number}}`,`{{court_name}}`,
      `{{next_hearing}}`,`{{today}}`,`{{firm_name}}` בערכים מה-DB; placeholders לא-מוכרים → '—' (אין דליפת `{{}}`).
- [x] **שליחה-לחתימה:** `CommSecureLinks` מנפיק **קישור מקומי מאובטח** מבוסס-token ל-`{{sign_link}}`/`{{upload_link}}`
      (ה-preview לא מנפיק; רק `render` בפועל). תשתית מוכנה לחיבור עמוד-החתימה/DocumentSignatures.
- [x] **UI:** בורר "תבניות חכמות" ב-action-bar → רינדור לטיוטה הניתנת לעריכה → אישור-אדם → שליחה consent-gated (HITL).
- **אומת:** 6 בדיקות repo + 2 route; DB(78)+API(101) ירוקים; dashboard build נקי; migration אידמפוטנטי.

## Phase C5 — חילוץ ראיות + תמלול Whisper ✅ **הושלם (קוד)**
- [x] **"שמור כראיה"** (hover על בועה) → `CommEvidence`: snapshot **נעול** (write-protected) עם **content-hash (sha256)**
      לשרשרת-ראיות, כבול לתיק; idempotent פר-הודעה; audited (`save_evidence`). באנר "מוצגים נעולים (N)" בפאנל פר-תיק.
- [x] **תמלול Whisper מקומי** (`modules/transcription/`): `Transcriber` מוזרק (testable); default מריץ פקודת Whisper
      מקומית דרך `WHISPER_CMD` (האודיו לא יוצא מהמכונה). כפתור "תמלל" להודעות-audio; התמלול מוצג מתחת לבועה.
      Whisper = כלי speech-to-text מקומי, **לא** מודל ה-AI המשפטי (law-il-E2B נשאר היחיד לתוכן משפטי).
- **אומת:** +3 repo, +2 transcription, +2 route; DB(81)+API(105) ירוקים; build נקי; migration 062 ולידציה.
- ⚠️ **חסם-סביבה:** תמלול חי דורש מודל Whisper מקומי (`WHISPER_CMD`) — הלוגיקה אומתה דרך injection.

## Phase C6 — תיעוד שיחות + הכתבה (שבוע 7)
- [ ] **כלל קשיח:** אין הקלטת שיחות חיות עם לקוחות.
- [ ] **טופס "תעד שיחה"** (side-panel): חותמת-זמן, נושא, משימות-המשך.
- [ ] **הכתבה אחרי השיחה (Whisper):** כפתור "הקלט" *אחרי* הניתוק → המשתמש מכתיב סיכום → Whisper מתמלל לשדה-הסיכום.
- [ ] **שילוב בציר-הזמן:** יומן-השיחה מופיע כבלוק רגיל בציר.
- **קבלה:** עו"ד מתעד שיחה + מכתיב סיכום מתומלל, ללא הקלטת השיחה עצמה.

## Phase C7 — AI יזום: תיוג סמנטי + מוניטור SLA 🟢 **Smart Triage הושלם** (PRs #72, #74)
- [x] **Smart Triage** — `classifyInboundMessage` מריץ `law-il-E2B` מקומי על כל הודעה נכנסת (fire-and-forget
      אחרי webhook), שומר `ai_urgency` (urgent/normal/low) + `ai_tags` ב-`CommMessages` (migration 068).
      Ollama-graceful — אם המודל לא זמין, מדלגים בלי לקרוס.
- [x] **תצוגה ב-UI** — תגית "דחוף" אדומה + pills של תגיות-AI על הודעות נכנסות ב-`MessageBubble` (PR #74).
- [ ] **ראדאר הודעות-יתומות (SLA):** job מתוזמן סורק הודעות שלא נענו תוך X שעות → התראת in-app
      "לקוחות ממתינים". *(נותר — פריט post-beta)*
- **קבלה (חלקית):** הודעה נכנסת מתויגת ומוצגת עם דחיפות; ראדאר SLA טרם מומש.

## Phase C8 — ניתוב אנשי-קשר לא-מזוהים (Lead→Client) 🟢 **מסלול-לקוח הושלם** (PR #74)
- [x] **Unknown Inbox** — `CommUnknownInbox` קולט שולחים לא-מזוהים מ-`routeInbound`; תיבה גלובלית
      ב-`CommunicationsInboxPage`.
- [x] **מסלול A — המרה ללקוח:** `POST /api/communications/unknown/:id/convert` — יצירת לקוח חדש
      (או קישור ללקוח קיים), `linkIdentity` של זהות-הערוץ, `markUnknownResolved`, audit.
      טופס inline ממולא-מראש (שם/טלפון) פר-שורה + hook `useConvertUnknownSender`. 5 בדיקות route.
- [ ] **מסלול B — איש-קשר מקצועי** עם קטגוריה חובה + קישור חוצה-תיקים. *(נותר — פריט post-beta)*
- **קבלה (חלקית):** הודעה מאלמוני הופכת ללקוח עם נתונים ממולאים והזהות מקושרת; מסלול איש-קשר טרם מומש.

---

## תלויות
| מודול תקשורת | תלוי ב- |
|---|---|
| C3 ציר-זמן + נקודות-כניסה | F0 (רכיבים), F3 (כרטיס לקוח/תיק) |
| C4 תבניות | B2 (templates data), DocumentSignatures הקיים |
| C7 תיוג AI | `law-il-E2B` מקומי (B1 prompt-builder) |
| C5/C6 Whisper | התקנת Whisper מקומי (תלות-מערכת חדשה) |

## מדדי הצלחה (Definition of Done)
- נגישות מ-3 נקודות: סיידבר ראשי + כל כרטיס לקוח + כל תיק.
- טלגרם (ראשי) + וואטסאפ (גיבוי, ידני) עובדים, consent-gated, עם audit מלא.
- שליחה-לחתימה דרך קישור-מקומי (מסמך לא יוצא מהמכונה).
- Whisper מקומי לתמלול; תיוג-AI ב-law-il-E2B מקומי; אפס LLM חיצוני; אפס הקלטת-שיחה.
- ניתוב אלמונים, תבניות חכמות, וראדאר-SLA פעילים.
