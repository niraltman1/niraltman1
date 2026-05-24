# Factum-IL

מערכת ניהול תיקים ומסמכים משפטיים עם בינה מלאכותית מקומית לעורכי דין ישראלים.

**כל עיבוד ה-AI מתבצע מקומית בלבד — אין שליחת נתונים לאינטרנט.**

## התקנה מהירה (Windows)

```powershell
# הרץ כמנהל מערכת
.\START-HERE.ps1
```

הסקריפט מתקין את כל התלויות, מריץ מיגרציות DB, ויוצר קיצור דרך על שולחן העבודה.

## הפעלה למפתחים

```bash
pnpm install
pnpm -r build
pnpm --filter @factum-il/api dev      # API on :3001
pnpm --filter @factum-il/dashboard dev # UI  on :5173
```

## דרישות מקדימות

- Node.js 22+, pnpm 9.4+
- [Ollama](https://ollama.ai) עם מודל `BrainboxAI/law-il-E2B:Q4_K_M`
- Windows 10+ עם WebView2 (לאפליקציית desktop)

## תיעוד

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — ארכיטקטורה, קונבנציות קוד, API routes
- [`CLAUDE.md`](./CLAUDE.md) — הנחיות לסשן Claude Code
- [`TASKS.md`](./TASKS.md) — מעקב משימות לפי שלבים

## CI

![CI](https://github.com/niraltman1/niraltman1/actions/workflows/ci.yml/badge.svg)
