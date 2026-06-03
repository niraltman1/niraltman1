# Factum-IL

מערכת ניהול תיקים ומסמכים משפטיים עם בינה מלאכותית מקומית לעורכי דין ישראלים.

**כל עיבוד ה-AI מתבצע מקומית בלבד — אין שליחת נתונים לאינטרנט.**

## התקנה מהירה (Windows)

הורד את `Factum-IL-Setup.exe` מדף ה-Releases, הרץ כמנהל מערכת ופעל לפי אשף ההתקנה.

אשף ההתקנה (בעברית) מתקין אוטומטית:
- WebView2 Runtime
- Ollama + מודל `BrainboxAI/law-il-E2B:Q4_K_M`
- sqlite-vec.dll (הרחבת חיפוש וקטורי)
- מריץ 60 מיגרציות DB
- מגדיר 8 משתני סביבה ב-registry
- יוצר קיצורי דרך בשולחן העבודה ובתפריט התחל

לבניית קובץ ההתקנה מהמקור — ראה [`BUILD.md`](./BUILD.md).

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
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Reference מלא לסשני Claude Code: כל 25 חבילות, כל 60 מיגרציות, כל API routes, כל 25 env vars, קונבנציות קוד |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | ארכיטקטורה טכנית: מבנה monorepo, data flow, schema, מודל אבטחה, RBAC, safe mode |
| [`BUILD.md`](./BUILD.md) | בניית `Factum-IL-Setup.exe` מ-`publish.ps1` + Inno Setup 6 (12 שלבים) |
| [`CLAUDE.md`](./CLAUDE.md) | הנחיות קריטיות לסשן Claude Code — חובה לקרוא בתחילת כל סשן |
| [`TASKS.md`](./TASKS.md) | מעקב משימות לפי שלבים — מעודכן בסוף כל סשן |
| [`CHANGELOG.md`](./CHANGELOG.md) | היסטוריית שינויים בפורמט Keep a Changelog |

## CI

![CI](https://github.com/niraltman1/niraltman1/actions/workflows/ci.yml/badge.svg)
