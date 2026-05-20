# CLAUDE.md — Factum-IL Project Guide

> Read this file at the start of every session. It contains everything you need to know about this project.

---

## Project Identity

- **Product name:** Factum-IL
- **Canonical spelling:** `Factum-IL` (display), `factum-il` (npm packages), `FactumIL` (C# namespaces)
- **Never use:** Legal-OS, LegalOS, legal-os (these are the old names — reject any PR that uses them)

---

## Repository Structure

This project has **two GitHub repos**:

| Repo | Status | Purpose |
|------|--------|---------|
| `niraltman1/niraltman1` | ✅ ACTIVE — primary monorepo | TypeScript/React/C#/C++ — the real product |
| `niraltman1/Management-of-legal-documents-and-cases-` | 🗄️ LEGACY — PowerShell only | Old Legal-OS v3.0 PowerShell pipeline — do not merge into monorepo |

**Always work in the monorepo unless explicitly told otherwise.**

---

## Monorepo Package Map

```
apps/
  desktop/        ← Electron + WebView2 (Windows only)
  web/            ← React web interface

packages/
  ai/             ← Ollama integration, Law-IL E2B model calls
                     depends on: @factum-il/database
  api/            ← Backend API routes
                     depends on: @factum-il/database, @factum-il/ai
  database/       ← SQLite via better-sqlite3, all DB types and queries
  pipeline/       ← Document processing pipeline (OCR, parsing, enrichment)
                     depends on: @factum-il/database, @factum-il/ai
  ui/             ← Shared React components
```

**Dependency rule:** `database` has NO internal dependencies. Everything else can depend on `database`. Never create circular dependencies.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| UI | React + TypeScript + Tailwind |
| Desktop shell | Electron + WebView2 (Windows) |
| Backend | Node.js API |
| Database | SQLite (better-sqlite3) |
| AI | Ollama local — BrainboxAI/law-il-E2B model |
| Legacy pipeline | PowerShell 5.1 (separate repo, do not touch) |
| Auth | Local only — no external auth service |
| Language | Hebrew-first, RTL, UTF-8 everywhere |

---

## Critical Rules

### Never break these:
1. **No data leaves the machine.** All AI runs via Ollama locally. No external API calls with user data.
2. **Hebrew/RTL must work.** All UI components must support `dir="rtl"`. Test with Hebrew text.
3. **Windows only for desktop.** WebView2 is Windows-specific. Do not add macOS/Linux desktop code.
4. **AI steps must fail gracefully.** If Ollama is not running, the app must continue without crashing and show a clear warning.
5. **Attorney-client privilege.** Never log document content, client names, or case details anywhere external.

### TypeScript rules:
- Strict mode is ON. No `any` types without explicit justification in a comment.
- All database query functions must have explicit return types.
- `DatabaseConnection.prepare()` takes 0 type parameters — use `.all() as Type[]` for typing.
- Always add `@factum-il/database` to `package.json` before importing from it.

### Naming conventions:
- Hebrew legal identifiers in code: use English variable names (`caseNumber`, `clientId`)
- Database tables: PascalCase (`Files`, `ParsedIdentifiers`, `Case_Brief`)
- TypeScript types: PascalCase (`CaseRow`, `TaskRow`, `ClientRecord`)
- npm packages: `@factum-il/package-name` (kebab-case)
- C# namespaces: `FactumIL.PackageName` (no hyphen)

---

## Israeli Legal Domain Knowledge

The system handles these Israeli legal identifiers:

| Type | Pattern | Example |
|------|---------|---------|
| ID number (ת.ז.) | 9 digits with check digit | `123456782` |
| Civil — Magistrate | `תא-YYYY-NNN` | `תא-2024-042` |
| Criminal | `ת"פ-YYYY-NNN` | `ת"פ-2023-005` |
| Supreme Court | `בג"ץ NNNN/YY` | `בג"ץ 6821/93` |
| Civil Appeal | `ע"א NNNN/YY` | `ע"א 5678/22` |
| Labor | `עב-YYYY-NNN` | `עב-2024-001` |
| Family | `תמש-YYYY-NNN` | `תמש-2024-010` |
| Administrative | `עת"מ-YYYY-NNN` | `עת"מ-2023-088` |

**Procedural rules:** 20 Israeli rules seeded in `Rules_Engine` table. Do not hardcode deadline logic — always read from the database.

---

## AI Integration (Ollama)

### ⚠️ CRITICAL — One model only

This project uses **one model and one model only:**

```
BrainboxAI/law-il-E2B:Q4_K_M
```

**Never suggest, switch to, or test any other model.** Do not use claude, gpt, llama, mistral, or any general-purpose model for any AI feature in this project. If a user asks to try another model, decline and explain why Law-IL E2B is required.

### Why this model is non-negotiable

- Trained specifically on Israeli law, court verdicts, and legal Hebrew
- Understands Israeli court structure (שלום, מחוזי, עליון, עבודה, משפחה)
- Knows Israeli procedural rules and deadline logic
- Produces output in correct formal Israeli legal register
- Any other model will produce wrong, untested, and potentially harmful legal output

### Integration rules

- Ollama URL: `http://localhost:11434` (configured in `packages/api`)
- Model string: `BrainboxAI/law-il-E2B:Q4_K_M` — hardcoded, never read from user input
- **Always health-check Ollama before calling it:** `GET http://localhost:11434/api/tags`
- If Ollama is down: skip AI step, log a warning, continue pipeline — never crash
- 5-step reasoning chain: Context → Classification → Authorities → Conflict/Risk → Conclusion

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `prepare() is not generic` | Using `db.prepare<[], Type>()` | Use `db.prepare().all() as Type[]` |
| `Cannot find module @factum-il/database` | Missing from package.json | Add to dependencies in package.json |
| `transaction()` call error | Calling result of transaction as function | `db.transaction(fn)` returns T, not a callable |
| Hebrew text garbled | Wrong encoding | Ensure UTF-8 everywhere, never use Windows-1255 |
| WebView2 not found | Not installed on user machine | Show installer prompt, link to Microsoft installer |

---

## Session Handoff

At the END of every session, update `TASKS.md` with:
1. What was completed this session
2. What is currently in progress (if session ended mid-task)
3. What to do next

**Always read `TASKS.md` at the START of every session before doing anything else.**
