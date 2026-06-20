# Factum-IL

מערכת ניהול תיקים ומסמכים משפטיים עם בינה מלאכותית מקומית לעורכי דין ישראלים.

**כל עיבוד ה-AI מתבצע מקומית בלבד — אין שליחת נתונים לאינטרנט.**

## התקנה מהירה (Windows)

יש לך כבר את הקובץ `Factum-IL-Setup.exe`? הרץ אותו כמנהל מערכת ופעל לפי אשף ההתקנה (בעברית).
**אין לך את הקובץ?** אפשר לבנות אותו בעצמך על מחשב Windows — ראה
[בניית קובץ ההתקנה בעצמך](#בניית-קובץ-ההתקנה-בעצמך--מדריך-מלא-גם-ללא-ידע-טכני) למטה.

קובץ ההתקנה מכיל בתוכו את **כל המערכת והנתונים** — אין צורך באינטרנט בזמן ההתקנה:
- אפליקציית ה-desktop המלאה (WPF + WebView2), שרת ה-API, וממשק המשתמש
- WebView2 Runtime + Ollama (מנוע ה-AI)
- מודל ה-AI `BrainboxAI/law-il-E2B:Q4_K_M` (כ-941MB, מצורף ונרשם בהפעלה הראשונה)
- sqlite-vec.dll (הרחבת חיפוש וקטורי) + מיגרציות DB (001–085, 067 מדולג; נטענות בהפעלה ראשונה)
- **כל הקורפוסים המשפטיים, כולל אלה שנוספו לאחרונה:**
  - קורפוס החקיקה (batch files)
  - קורפוס פסיקה — guychuk/case-law-israel (כל ערכאות בתי המשפט)
  - **קורפוס בית המשפט העליון — LevMuchnik/SupremeCourtOfIsrael**
- מגדיר משתני סביבה ב-registry ויוצר קיצורי דרך בשולחן העבודה ובתפריט התחל

> **הפעלה ראשונה:** ההתקנה עצמה מסתיימת תוך שניות. בהפעלה הראשונה של האפליקציה יופיע מסך
> אתחול קצר (Bootstrap) שרושם את מודל ה-AI וטוען את הקורפוסים ל-DB. אם הוא נקטע באמצע —
> הוא ימשיך מהנקודה האחרונה בפעם הבאה, לא מתחיל מחדש.

לפרטים טכניים נוספים על הבנייה ראה גם [`BUILD.md`](./BUILD.md).

## בניית קובץ ההתקנה בעצמך — מדריך מלא (גם ללא ידע טכני)

מדריך זה מסביר **צעד אחר צעד** איך להפיק את הקובץ `Factum-IL-Setup.exe` במחשב שלך,
גם אם מעולם לא בנית תוכנה. בסוף התהליך יהיה לך קובץ התקנה אחד שמכיל את כל המערכת ואת
**כל הקורפוסים** (כולל קורפוס בית המשפט העליון שנוסף לאחרונה).

> ⚠️ חייבים **Windows 10 או 11 (64-bit)**. לא ניתן לבנות על Mac/Linux (האפליקציה מבוססת
> WebView2 והמתקין מבוסס Inno Setup — שניהם של Windows בלבד).

### שלב 1 — התקנת הכלים (פעם אחת)

פתח את **PowerShell כמנהל מערכת** (לחצן ימני על תפריט התחל → "Terminal (Admin)" /
"Windows PowerShell (Admin)") והדבק את השורות הבאות אחת-אחת:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Microsoft.DotNet.SDK.8 -e
winget install --id JRSoftware.InnoSetup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
corepack enable
corepack prepare pnpm@9.4.0 --activate
```

> כלי ה-C++ ‏(VS Build Tools) חיוני — בלעדיו שלב התקנת התלויות ייכשל (רכיב `better-sqlite3`
> מתקמפל בזמן ההתקנה).

**סגור את חלון ה-PowerShell ופתח אותו מחדש** (רגיל, לא חובה כמנהל) כדי שהכלים החדשים יזוהו.
בדיקה שהכול הותקן:

```powershell
git --version; node --version; dotnet --version; pnpm --version
```

### שלב 2 — חבילת השפה העברית ל-Inno Setup

המתקין בעברית, ולכן צריך את קובץ השפה (לא מגיע כברירת מחדל):

```powershell
$dest = "${env:ProgramFiles(x86)}\Inno Setup 6\Languages\Hebrew.isl"
Invoke-WebRequest "https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/Hebrew.isl" -OutFile $dest
```

### שלב 3 — אסימון גישה ל-GitHub (להורדת המודל והקורפוסים)

המודל והקורפוסים שמורים ב-Releases הפרטיים של המאגר, ולכן סקריפט הבנייה צריך אסימון (token)
כדי להוריד אותם. **בלי האסימון ההורדה תיכשל עם שגיאת 404.**

1. היכנס ל-**https://github.com/settings/tokens** → *Generate new token* → *classic*.
2. סמן את ההרשאה **`repo`** וצור את האסימון. העתק אותו (מתחיל ב-`ghp_...`).
3. בחלון ה-PowerShell שבו תבנה (אותו חלון של השלבים הבאים) הדבק:

```powershell
$env:GH_TOKEN = "ghp_כאן_מדביקים_את_האסימון"
```

### שלב 4 — הורדת קוד המקור

```powershell
cd $HOME
git clone https://github.com/niraltman1/niraltman1.git
cd niraltman1
git checkout main
```

### שלב 5 — בניית הקובץ (שתי פקודות)

```powershell
# א. בונה את כל המערכת + מוריד את המודל וכל הקורפוסים + מסדר את הקבצים
.\publish.ps1

# ב. אורז הכול לקובץ התקנה יחיד
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer.iss
```

ההרצה הראשונה אורכת זמן (הורדת מודל ה-AI בגודל ~941MB + הקורפוסים). מתועד הכול בקובץ
`Deployment-Log.txt`. במהלך `publish.ps1` ודא שמופיעות שורות הצלחה ירוקות עבור **כל**
הקורפוסים:

- `✓ Legal corpus: N batch(es)` — קורפוס החקיקה
- `✓ Verdict corpus: case-law-il.jsonl.gz` — פסיקה כללית
- `✓ Supreme Court corpus: supreme-court-il.jsonl.gz` — בית המשפט העליון

### שלב 6 — התוצאה

הקובץ נוצר בתיקיית הפרויקט:

```
niraltman1\Factum-IL-Setup.exe   (כ-1GB ומעלה — הגודל מעיד שהמודל וכל הקורפוסים בפנים)
```

הרץ אותו (לחיצה כפולה) והתקן כרגיל. ההתקנה מסתיימת מהר; בהפעלה הראשונה של האפליקציה יופיע
מסך אתחול קצר שרושם את המודל וטוען את הקורפוסים (ראה ההערה ב"התקנה מהירה" למעלה).

### פתרון תקלות נפוצות

| תקלה | פתרון |
|------|-------|
| `pnpm: command not found` | סגור ופתח מחדש את PowerShell אחרי שלב 1 (או הרץ שוב `corepack prepare pnpm@9.4.0 --activate`) |
| שגיאת קומפילציה של `better-sqlite3` / node-gyp בזמן `publish.ps1` | לא הותקנו כלי ה-C++ — הרץ שוב את שורת `VisualStudio.2022.BuildTools` משלב 1 |
| `404` / `asset not found` בהורדה | `$env:GH_TOKEN` לא הוגדר בחלון הזה, או שלאסימון אין הרשאת `repo` — חזור על שלב 3 |
| `ISCC.exe not found` | מצא את הנתיב: `Get-ChildItem "C:\Program Files*\Inno Setup 6\ISCC.exe"` והשתמש בו |
| רוצה בנייה מהירה בלי הרצת הבדיקות | `.\publish.ps1 -SkipTests` |
| רוצה קובץ קטן יותר בלי המודל המצורף | `.\publish.ps1 -SkipGGUF` (המודל יירשם בהפעלה הראשונה במקום להיות מצורף) |

### חלופה: בנייה דרך Self-Hosted GitHub Runner (חינמי, ללא דקות בתשלום)

במקום להריץ ידנית, אפשר להריץ את הבנייה כ-GitHub Action על **runner עצמי** במחשב ה-Windows
שלך — חינמי לחלוטין (לא צורך דקות מתשלום) ועוקף את חסימת החיוב. ה-token (`GITHUB_TOKEN`)
מסופק אוטומטית, כך שהורדת המודל והקורפוסים מאומתת ללא הגדרה ידנית.

1. **רישום ה-runner:** במאגר → **Settings → Actions → Runners → New self-hosted runner →
   Windows / x64**, והרץ את פקודות ההורדה ו-`config.cmd --url … --token …` שמוצגות, ואז
   `run.cmd` (או התקן כשירות). התוויות הנדרשות: `self-hosted, Windows, X64`.
2. **כלים חד-פעמיים על המכונה:** Chocolatey (או Inno Setup 6 מותקן מראש) ו-**VS 2022 C++
   Build Tools** (workload של C++, נדרש ל-`better-sqlite3`). Node/.NET/pnpm מסופקים
   אוטומטית ע"י ה-workflow.
3. **הרצה:** טאב **Actions → "Build Windows Installer (self-hosted)" → Run workflow →**
   ענף `main`. (סמן `run_smoke_test` רק אם תרצה שההתקנה תיבדק על המכונה הזו — דורש runner
   מורם הרשאות.)
4. **התוצאה:** הורד את ה-artifact ‏`Factum-IL-Setup.exe`, או מצא אותו בתיקיית העבודה של
   ה-runner.

## הפעלה למפתחים

```bash
# התקנת תלויות
pnpm install

# בנייה של כל החבילות (25 packages)
pnpm -r build

# הפעלת שרתי הפיתוח
pnpm --filter @factum-il/api dev        # API on :3001
pnpm --filter @factum-il/dashboard dev  # UI  on :5173
```

להרצה מקבילה (API + UI יחד):

```bash
pnpm dev
```

## דרישות מקדימות

| כלי | גרסה מינימלית | הערה |
|-----|--------------|------|
| Node.js | 22 LTS+ | חובה |
| pnpm | 9.4+ | `npm install -g pnpm` |
| Ollama | עדכני | [ollama.ai](https://ollama.ai) |
| Windows 10/11 x64 | — | לאפליקציית desktop בלבד |
| WebView2 Runtime | — | [הורדה מ-Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — לאפליקציית desktop בלבד |
| .NET 8 Desktop Runtime | — | לאפליקציית desktop בלבד |

```powershell
# משיכת מודל ה-AI (חובה לפני הפעלת API)
ollama pull hf.co/BrainboxAI/law-il-E2B:Q4_K_M
```

## תיעוד

| קובץ | תוכן |
|------|------|
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Reference מלא לסשני Claude Code: כל החבילות, כל המיגרציות, כל API routes, env vars, קונבנציות קוד |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | ארכיטקטורה טכנית: מבנה monorepo, data flow, schema, מודל אבטחה, RBAC, safe mode |
| [`BUILD.md`](./BUILD.md) | בניית `Factum-IL-Setup.exe` מ-`publish.ps1` + Inno Setup 6 (12 שלבים) |
| [`CLAUDE.md`](./CLAUDE.md) | הנחיות קריטיות לסשן Claude Code — חובה לקרוא בתחילת כל סשן |
| [`TASKS.md`](./TASKS.md) | מעקב משימות לפי שלבים — מעודכן בסוף כל סשן |
| [`CHANGELOG.md`](./CHANGELOG.md) | היסטוריית שינויים בפורמט Keep a Changelog |

## CI

![CI](https://github.com/niraltman1/niraltman1/actions/workflows/ci.yml/badge.svg)
