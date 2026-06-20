# בניית קובץ ההתקנה והפעלת Factum-IL

> ⚠️ **חשוב:** כל תהליך הבנייה הוא **Windows בלבד** (WPF + WebView2 + .NET 8 + Inno Setup).
> אי אפשר לבנות את קובץ ההתקנה על Linux או macOS.

מסמך זה הוא ה**רפרנס הטכני** ליצירת `Factum-IL-Setup.exe`. למשתמש לא-טכני יש מדריך
צעד-אחר-צעד מפושט ב-[`README.md`](./README.md) (סעיף "בניית קובץ ההתקנה בעצמך").

---

## דרישות מקדימות (מכונת הבנייה — Windows 10/11 x64)

| כלי | תפקיד |
|-----|-------|
| **Node.js 22 LTS** | בניית ה-API וה-dashboard |
| **pnpm 9.4+** | מנהל החבילות של המונורפו (`corepack prepare pnpm@9.4.0 --activate`) |
| **.NET 8 SDK** | בניית מעטפת ה-WPF (`net8.0-windows`, `win-x64`) |
| **VS 2022 Build Tools (C++ workload)** | קומפילציית `better-sqlite3` בזמן `pnpm install` |
| **Inno Setup 6** | קומפילציית קובץ ההתקנה (`ISCC.exe`) |
| **Git** | שכפול המאגר |
| **GitHub token (`$env:GH_TOKEN`)** | **חובה** — הורדת ה-assets מ-Releases פרטיים (ראה למטה) |
| **חיבור אינטרנט** | הורדת ה-assets מ-3 ה-Releases של המאגר |

### ה-Releases שמהם `publish.ps1` מוריד (פרטיים — דורשים token)

| Release tag | תוכן |
|-------------|------|
| `v-model-latest` | מודל ה-AI `gemma-4-E2B-it.BF16-mmproj.gguf` (~941 MB) |
| `v-assets-latest` | WebView2 bootstrapper |
| `v-corpus-latest` | **כל הקורפוסים:** חקיקה (`batch-*.jsonl.gz` + `corpus-domain-index.json`), פסיקה כללית (`case-law-il.jsonl.gz`), ובית המשפט העליון (`supreme-court-il.jsonl.gz`) + קובצי metadata |

> Ollama (`OllamaSetup.exe`) ו-node.exe הפורטבילי נמשכים מהמקורות הציבוריים שלהם (ללא token).

---

## הפקודות לביצוע (PowerShell)

### 1. התקנת כלים (פעם אחת, כמנהל)

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Microsoft.DotNet.SDK.8 -e
winget install --id JRSoftware.InnoSetup -e
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
corepack enable
corepack prepare pnpm@9.4.0 --activate
```

➡️ **סגור ופתח מחדש את PowerShell** אחרי ההתקנות כדי לרענן את ה-`PATH`.

### 2. שפת עברית ל-Inno Setup (חובה!)

קובץ `installer.iss` משתמש ב-`Languages\Hebrew.isl`. ללא הצעד הזה הקומפילציה תיכשל עם
`Could not find Languages\Hebrew.isl`.

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/Hebrew.isl" -OutFile "${env:ProgramFiles(x86)}\Inno Setup 6\Languages\Hebrew.isl"
```

### 3. אסימון GitHub (חובה — אחרת הורדת המודל/קורפוסים נכשלת ב-404)

צור token עם הרשאת `repo` ב-https://github.com/settings/tokens, ואז באותו חלון PowerShell:

```powershell
$env:GH_TOKEN = "ghp_..."   # הישאר באותו חלון עד סוף הבנייה
```

### 4. שכפול המאגר

```powershell
git clone https://github.com/niraltman1/niraltman1.git
cd niraltman1
git checkout main
```

### 5. בניית ה-Staging (יצירת `FactumIL_Dist\`)

```powershell
.\publish.ps1
```

תהליך זה (**13 שלבים**, מספר דקות; הורדת ה-GGUF ~941MB דומיננטית) מבצע:

| שלב | פעולה |
|-----|-------|
| 1 | בדיקת כלים (`pnpm`, `dotnet`, `node`) |
| 2 | ניקוי תיקיית הפלט הקודמת |
| 3 | `pnpm install --frozen-lockfile` — תלויות כל החבילות |
| 4 | typecheck — `pnpm -r typecheck` |
| 5 | בדיקות — `pnpm -r test` (דילוג עם `-SkipTests`) |
| 6 | בניית כל חבילות ה-TypeScript |
| 7 | פרסום מעטפת WPF — `dotnet publish --runtime win-x64` (no-self-contained) |
| 8 | אריזת ה-backend (Express API + node_modules פרודקשן שטוח) |
| 9 | dashboard + קובצי מיגרציה + **קורפוסים מ-`v-corpus-latest`** (חקיקה + פסיקה + עליון) |
| 10 | אריזת node.exe פורטבילי |
| 11 | הורדת Ollama, WebView2, ומודל ה-AI GGUF |
| 12 | הזרקת BOM ל-UTF-8 בסקריפטי PowerShell |
| 13 | אימות ה-artifacts שנארזו |

**אפשרויות:**

```powershell
.\publish.ps1 -SkipTests              # דילוג על בדיקות (בנייה מהירה)
.\publish.ps1 -SkipGGUF               # ללא צירוף המודל (יירשם בהפעלה ראשונה)
.\publish.ps1 -NodeVersion "22.13.1"  # גרסת Node מותאמת
.\publish.ps1 -OutDir "C:\Build\FactumIL_Dist"
```

> אם asset חובה (GGUF) נכשל בהורדה — הסקריפט **עוצר עם שגיאה** (לא ממשיך בשקט). קורפוס חסר
> אינו עוצר את הבנייה (האפליקציה תעלה בלעדיו). ניתן גם להניח קבצים ידנית ב-`models\` /
> `verdict-corpus\` והסקריפט יזהה ויחסוך את ההורדה.

### 6. קומפילציית קובץ ההתקנה

```powershell
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer.iss
```

**התוצאה:** `Factum-IL-Setup.exe` בשורש המאגר (~1GB ומעלה — הגודל מעיד שהמודל וכל הקורפוסים בפנים).

### 7. הרצת ההתקנה

```powershell
.\Factum-IL-Setup.exe
```

---

## רצף מלא להעתקה אחת

לאחר שהכלים מותקנים (שלבים 1–3) ו-`$env:GH_TOKEN` מוגדר:

```powershell
git clone https://github.com/niraltman1/niraltman1.git
cd niraltman1
git checkout main
.\publish.ps1
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" installer.iss
.\Factum-IL-Setup.exe
```

---

## מה קורה בהתקנה ובהפעלה הראשונה (מחשב הלקוח)

המתקין **רזה ומהיר** — הוא אינו מבצע אתחול כבד (אין `ollama create` בזמן ההתקנה). כל
האתחול הכבד עבר ל**הפעלה הראשונה** של מעטפת ה-WPF, באופן resumable.

**בהתקנה:**
1. המתקין דורש הרשאות מנהל ובודק אם **`.NET 8 Desktop Runtime`** מותקן — אם לא, יפתח את
   דף ההורדה החינמי של Microsoft.
2. אשף ההתקנה (בעברית) מבקש לבחור תיקיית מסמכים משפטיים.
3. מתקין בשקט, אם חסרים: **WebView2 Runtime** ו-**Ollama**.
4. כותב משתני סביבה ב-registry (HKLM): `FACTUM_IL_ROOT`, `OLLAMA_MODEL`, `OLLAMA_BASE_URL`,
   `SQLITE_VEC_PATH`, `AI_TIER`, `WHISPER_EXE`, `FFMPEG_EXE`, `FACTUM_IL_VERSION`.
5. מצרף את המודל (`models\*.gguf`) ואת הקורפוסים אך **אינו רושם** את המודל ל-Ollama —
   זו אחריות ההפעלה הראשונה. בסיום: קיצורי דרך בשולחן העבודה ובתפריט התחל.
6. ההתקנה מסתיימת תוך שניות.

**בהפעלה ראשונה** מעטפת ה-WPF מריצה אתחול (`BootstrapManager`) עם מסך התקדמות:
- מריצה את שרת ה-API (Node פורטבילי מצורף — אין צורך ב-Node מותקן),
- טוענת את `sqlite-vec.dll`, מיישמת את כל ה-migrations ויוצרת את
  `%LOCALAPPDATA%\FactumIL\factum-il.db`,
- **רושמת את מודל ה-AI** `BrainboxAI/law-il-E2B:Q4_K_M` ל-Ollama מה-GGUF המצורף,
- **טוענת את כל הקורפוסים ל-DB** (חקיקה + פסיקה כללית + בית המשפט העליון),
- פותחת את ממשק ה-React.

האתחול **resumable**: אם נקטע באמצע (כיבוי/קריסה), בהפעלה הבאה הוא ממשיך מהשלב האחרון ולא
מתחיל מחדש. אם רכיב AI אינו זמין — האפליקציה נכנסת ל-Safe Mode (ניהול תיקים/מסמכים עובד,
תכונות AI מושבתות) במקום לקרוס; כשל קריטי בלבד מציג `RecoveryWindow`.

> 🔒 **פרטיות:** כל העיבוד מקומי. שום נתון לא יוצא מהמכונה. ה-AI רץ כולו דרך Ollama מקומי.

---

## פריסת `FactumIL_Dist\` (פלט הביניים של `publish.ps1`)

```
FactumIL_Dist\
  shell\          מעטפת WPF (FactumIL.Desktop.exe) + DLLs של .NET ו-WebView2
  backend\        שרת Express API + node_modules פרודקשן שטוח
  dashboard\      ממשק React מקומפל
  migrations\     קובצי SQL (001–085, 067 מדולג; מורצים בהפעלה ראשונה)
  legal-corpus\   קורפוס חקיקה (batches\*.jsonl.gz, נטען ל-SQLite בהפעלה ראשונה)
  verdict-corpus\ פסיקה: case-law-il.jsonl.gz + supreme-court-il.jsonl.gz (+ metadata)
  runtime\        node.exe פורטבילי
  tools\          OllamaSetup.exe + WebView2 bootstrapper + sqlite-vec.dll + register-ollama-model.ps1
  models\         gemma-4-E2B-it.BF16-mmproj.gguf (מודל ה-AI, ~941 MB)
  powershell\     Legal Registry + סקריפטי עזר
```

---

## פתרון תקלות נפוצות

| תקלה | סיבה | פתרון |
|------|------|-------|
| `404` / `asset not found` בהורדה | `$env:GH_TOKEN` לא מוגדר בחלון, או חסרה הרשאת `repo` | בצע שוב את שלב 3 |
| `Could not find Languages\Hebrew.isl` | חסר קובץ שפת עברית | בצע את שלב 2 |
| שגיאת `better-sqlite3` / node-gyp ב-`pnpm install` | חסרים כלי C++ | התקן VS 2022 Build Tools (workload C++) — שלב 1 |
| `Required tool not found: pnpm/dotnet/node` | כלי לא ב-PATH | התקן והפעל מחדש את PowerShell |
| הורדת GGUF נכשלה | אין רשת / token | הבנייה עוצרת בכוונה; תקן רשת/token והרץ שוב, או הנח ידנית ב-`models\` |
| המתקין דורש .NET 8 | Desktop Runtime חסר במחשב הלקוח | התקן מ-Microsoft והרץ שוב |
| `ISCC.exe not found` | נתיב שונה | `Get-ChildItem "C:\Program Files*\Inno Setup 6\ISCC.exe"` |

---

## בדיקת התקנה — Verify-Install

```powershell
# אחרי התקנה אמיתית:
powershell -File powershell\scripts\Verify-Install.ps1 -InstallDir "C:\Program Files\FactumIL"

# מצב פיתוח (ללא התקנה אמיתית):
powershell -File powershell\scripts\Verify-Install.ps1 -DevMode
```
