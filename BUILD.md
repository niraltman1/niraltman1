# בניית קובץ ההתקנה והפעלת Factum-IL

> ⚠️ **חשוב:** כל תהליך הבנייה הוא **Windows בלבד** (WPF + WebView2 + .NET 8 + Inno Setup).
> אי אפשר לבנות את קובץ ההתקנה על Linux או macOS.

מסמך זה מתאר את הצעדים המדויקים ליצירת `Factum-IL-Setup.exe` ולהפעלת המערכת.

---

## דרישות מקדימות (מכונת הבנייה — Windows 10/11 x64)

| כלי | תפקיד |
|-----|-------|
| **Node.js 22 LTS** | בניית ה-API וה-dashboard |
| **pnpm 9+** | מנהל החבילות של המונורפו |
| **.NET 8 SDK** | בניית מעטפת ה-WPF (`net8.0-windows`, `win-x64`) |
| **Inno Setup 6** | קומפילציית קובץ ההתקנה (`ISCC.exe`) |
| **Git** | שכפול המאגר |
| **חיבור אינטרנט** | הורדת תלויות מתג ה-Release `v-deps-1.0.0` (node.exe, Ollama, WebView2, מודל GGUF ~1.3GB) |

---

## הפקודות לביצוע (PowerShell כמנהל)

### 1. התקנת כלים (פעם אחת)

```powershell
winget install OpenJS.NodeJS.LTS
winget install Microsoft.DotNet.SDK.8
winget install JRSoftware.InnoSetup
winget install Git.Git
npm install -g pnpm
```

➡️ **סגור ופתח מחדש את PowerShell** אחרי ההתקנות כדי לרענן את ה-`PATH`.

### 2. שפת עברית ל-Inno Setup (חובה!)

קובץ `installer.iss` משתמש ב-`compiler:Languages\Hebrew.isl`, אך עברית **אינה שפה רשמית**
ב-Inno Setup. ללא הצעד הזה הקומפילציה תיכשל עם השגיאה `Could not find Languages\Hebrew.isl`.

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/Unofficial/Hebrew.isl" -OutFile "C:\Program Files (x86)\Inno Setup 6\Languages\Hebrew.isl"
```

### 3. שכפול המאגר

```powershell
git clone https://github.com/niraltman1/niraltman1.git
cd niraltman1
```

### 4. בניית ה-Staging (יצירת `FactumIL_Dist\`)

```powershell
.\publish.ps1
```

תהליך זה (12 שלבים, ~10–15 דקות) מבצע: בדיקת כלים → ניקוי → `pnpm install` → typecheck →
בדיקות → בניית כל החבילות → פרסום מעטפת WPF → אריזת ה-backend → dashboard + migrations →
הורדת node.exe, Ollama, WebView2 ומודל ה-GGUF → הזרקת BOM לסקריפטי PowerShell.

**אפשרויות:**

```powershell
.\publish.ps1 -SkipTests              # דילוג על בדיקות (רק לבנייה דחופה)
.\publish.ps1 -NodeVersion "22.13.1"  # גרסת Node מותאמת
.\publish.ps1 -OutDir "C:\Build\FactumIL_Dist"  # תיקיית פלט מותאמת
```

> אם הורדה כלשהי נכשלת, הסקריפט ממשיך ומציין מה חסר — ניתן להניח ידנית בתיקיות `tools\` / `models\`.

### 5. קומפילציית קובץ ההתקנה

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

**התוצאה:** הקובץ `Factum-IL-Setup.exe` נוצר בשורש המאגר.

### 6. הרצת ההתקנה

```powershell
.\Factum-IL-Setup.exe
```

---

## רצף מלא להעתקה אחת

לאחר שהכלים מותקנים (שלבים 1–2) ו-PowerShell אותחל מחדש:

```powershell
git clone https://github.com/niraltman1/niraltman1.git
cd niraltman1
.\publish.ps1
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
.\Factum-IL-Setup.exe
```

---

## מה קורה בהתקנה ובהפעלה הראשונה (מחשב הלקוח)

1. המתקין דורש הרשאות מנהל ובודק אוטומטית אם **`.NET 8 Desktop Runtime`** מותקן —
   אם לא, יפתח את דף ההורדה החינמי של Microsoft. התקן והרץ את המתקין שוב.
2. אשף ההתקנה (בעברית) מבקש לבחור **תיקיית מסמכים משפטיים** (ברירת מחדל: `C:\מסמכים משפטיים`).
3. המתקין מתקין בשקט, אם חסרים: **WebView2 Runtime** ו-**Ollama**.
4. בסיום — קיצורי דרך בשולחן העבודה ובתפריט התחל.

**בהפעלה ראשונה** מעטפת ה-WPF:
- מריצה את שרת ה-API (Node פורטבילי מצורף — אין צורך ב-Node מותקן),
- מיישמת את ה-migrations ויוצרת את `%LOCALAPPDATA%\FactumIL\factum-il.db`,
- טוענת את מודל ה-AI `BrainboxAI/law-il-E2B:Q4_K_M` ל-Ollama,
- פותחת את ממשק ה-React. מסך הפתיחה ממתין עד שה-API מוכן.

> 🔒 **פרטיות:** כל העיבוד מקומי. שום נתון לא יוצא מהמכונה. ה-AI רץ כולו דרך Ollama מקומי.

---

## פריסת `FactumIL_Dist\` (פלט הביניים של `publish.ps1`)

```
FactumIL_Dist\
  shell\        מעטפת WPF (FactumIL.Desktop.exe) + DLLs של .NET ו-WebView2
  backend\      שרת Express API + node_modules פרודקשן שטוח
  dashboard\    ממשק React מקומפל
  migrations\   קובצי SQL (מורצים בהפעלה ראשונה)
  runtime\      node.exe פורטבילי
  tools\        OllamaSetup.exe + WebView2 bootstrapper
  models\       law-il-E2B-Q4_K_M.gguf (מודל ה-AI)
  powershell\   Legal Registry + סקריפטי עזר
```

---

## פתרון תקלות נפוצות

| תקלה | סיבה | פתרון |
|------|------|-------|
| `Could not find Languages\Hebrew.isl` | חסר קובץ שפת עברית | בצע את שלב 2 |
| `Required tool not found: pnpm/dotnet/node` | כלי לא ב-PATH | התקן והפעל מחדש את PowerShell |
| הורדת GGUF/Ollama נכשלה | אין רשת / התג חסום | הנח ידנית ב-`models\` / `tools\`, או המודל יימשך מ-Ollama Hub בהפעלה ראשונה |
| המתקין דורש .NET 8 | ל-Desktop Runtime חסר במחשב הלקוח | התקן מ-Microsoft והרץ שוב |
| WebView2 not found | Runtime חסר | המתקין מתקין אותו אוטומטית; אחרת התקן ידנית |
