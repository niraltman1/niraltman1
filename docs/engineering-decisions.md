# Engineering Decisions Log — Factum-IL v1.0.0

This document records **why** significant technical decisions were made.
Each entry explains the problem, the alternatives considered, and the chosen solution.

---

## Architectural Decisions

### SQLite over PostgreSQL

**Problem:** The system needs a reliable, zero-infrastructure database for a law firm desktop app that must work fully offline.

**Alternatives considered:** PostgreSQL (requires a running server process, complex installation), LevelDB (no SQL, no FTS5), SQLite WAL mode.

**Chosen solution:** SQLite with WAL mode and better-sqlite3. SQLite is a single file, requires no separate server process, ships with the installer, and supports everything needed: transactions, FTS5, foreign keys, and (via sqlite-vec extension) vector search.

**Tradeoff:** SQLite is single-writer. This is acceptable because the application is single-machine. WAL mode mitigates read/write contention.

---

### WAL Mode + busy_timeout

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';
PRAGMA cache_size = -32000;
```

**Why WAL:** Allows concurrent readers while a writer is active. Critical because the file watcher, queue worker, RAG worker, and HTTP API all share the same database.

**Why busy_timeout:** Under concurrent load, a write may briefly block a read. A 5-second timeout prevents immediate SQLITE_BUSY errors — the caller retries for up to 5 seconds before failing.

**Why NORMAL synchronous:** Safe with WAL — protects against corruption on OS crash. FULL is unnecessarily slow for this workload.

---

### Two-Database Architecture (primary + data_store)

**Problem:** Storing embeddings (float arrays, potentially hundreds of bytes each) in the primary database alongside document metadata inflates the primary file and slows VACUUM operations.

**Chosen solution:** A second SQLite file (`_data.db`) attached as the `data_store` schema holds `vec_chunks` and related embedding rows. The primary `factum-il.db` remains lean.

**Attachment:** `ATTACH DATABASE '_data.db' AS data_store;` is issued on every connection open.

---

### FTS5 with Hebrew Prefix Normalisation

**Why FTS5 over FTS3/4:** FTS5 supports the `content` table optimisation (zero-copy, index-only storage), BM25 ranking, and `MATCH` phrase queries needed for Hebrew search.

**Why prefix normalisation:** Hebrew is a morphologically rich language — prepositional prefixes (ב, ל, מ, כ, ש, ו) attach to words. Searching `לחוזה` must find `חוזה`. The normaliser strips prefixes before FTS matching and also expands legal synonyms (חוזה → הסכם, עסקה).

**FTS5 tokenizer:** `unicode61` only. The `tokenchars` option was removed because `better-sqlite3@9.x` bundles SQLite 3.45.x, which does not support `tokenchars` (added in SQLite 3.46). Hyphenated legal identifiers are handled via phrase matching instead.

---

### sqlite-vec for KNN Vector Search

**Why not pgvector:** We are not using PostgreSQL. sqlite-vec is a native SQLite extension that loads via `loadExtension()` and supports KNN cosine similarity search with no external dependencies.

**Why bundled in the installer:** The extension (`sqlite-vec.dll`) must match the SQLite version bundled by better-sqlite3. Pre-built binaries are copied to `{app}\tools\` by the installer. `SQLITE_VEC_PATH` registry entry tells the API where to load it from.

**Fallback:** If the extension is absent, the system continues with FTS5 keyword search only. A warning is logged; no crash occurs.

---

### Local Ollama over Cloud AI

**Why local-only AI:** Attorney-client privilege requires that no document content, client names, or case details leave the machine. Cloud AI APIs (OpenAI, Anthropic, Azure) are architecturally incompatible with this requirement.

**Why Ollama:** Zero-configuration local inference server with a simple HTTP API. Supports model management (`ollama pull`), health check endpoint, and streaming.

**Single model policy:** `BrainboxAI/law-il-E2B:Q4_K_M` is the only permitted model. It is trained specifically on Israeli law and produces output in correct formal legal Hebrew. Any general-purpose model (llama, mistral, etc.) produces untested output and must never be used.

---

### Forward-Only Migrations with SHA-256 Checksums

**Why forward-only:** Rollback migrations are difficult to write correctly for destructive operations (DROP COLUMN, etc.) and create a false sense of safety. The system uses `ActionLog` and `ManifestSnapshots` for data-level recovery instead.

**Why SHA-256 checksums:** The `_migrations` table records the SHA-256 of each migration file at the time it was applied. If a migration file is changed after being applied (e.g., accidentally edited), the runner detects the hash mismatch and aborts. This prevents silent schema drift.

**60 migrations (001–060):** Each runs exactly once, in order, in a transaction. PRAGMA statements (WAL, foreign_keys) are separated from the transaction body because SQLite prohibits changing `journal_mode` inside a transaction.

---

### RBAC with 5 Roles (packages/policy-engine)

**Why not ACL per resource:** Per-resource ACLs are complex to manage and audit. Five roles cover the actual access patterns of a boutique law firm:
- `admin` — IT/office manager
- `attorney` — senior lawyers with signing authority
- `assistant` — paralegals and secretaries
- `reviewer` — external reviewers (read + approve)
- `read_only` — clients or external auditors

**CaseAssignments table:** Attorneys are assigned to specific cases. An attorney cannot see cases not assigned to them, even if they have the `attorney` role. This is RBAC v2 — role + case-level isolation.

---

### Safe Mode Design (FACTUM_IL_SAFE_MODE=1)

**Problem:** During repair or forensic investigation, background workers must not run and modify data while an admin is working.

**Chosen solution:** `FACTUM_IL_SAFE_MODE=1` (registry or env var) disables all 6 background workers at startup. The API server and UI remain functional — only automated background processing stops. This enables:
- Running `POST /api/admin/repair/*` endpoints without race conditions
- Using `POST /api/recovery/*` endpoints safely
- Inspecting the database while no workers are writing

Disabling safe mode requires setting the registry value to `0` and restarting the server.

---

### Single Model Policy (law-il-E2B)

**Why enforce this at code level:** The model name is read from `OLLAMA_MODEL` env var but is validated against the expected value on startup. If the env var is set to anything other than `BrainboxAI/law-il-E2B:Q4_K_M`, a warning is logged (not a crash, to allow development overrides).

**Why this model is non-negotiable in production:** Israeli legal documents use specialised terminology, court hierarchies (שלום, מחוזי, עליון, עבודה, משפחה), and procedural rules that general-purpose models consistently mishandle. The 20 procedural rules seeded in `Rules_Engine` are calibrated against this model's output format.

---

### Data Firewall (Zero-Root Rule)

**Problem:** The law firm's office also has an associated nursing/medical practice. Medical files from the nursing practice must never enter the legal pipeline — they are subject to different regulatory and privilege rules.

**Chosen solution:** A hardcoded `EXCLUDED_PATTERNS` list blocks any file or directory matching medical/nursing keywords from being ingested. This is a compile-time invariant, not a configuration option.

```
Blocked: /סיעוד/ /רפואה/ /חן/ /Nursing/ /Medical/ /Healthcare/
         *.סיעוד.pdf *nursing* *medical_report*
         node_modules .git __MACOSX System32 Windows\
```

**Academic bypass:** `ACADEMIC_ROOT` env var allows nursing/medical terms only in designated academic study paths (Academic Hub). The bypass is path-scoped — it cannot be exploited to sneak medical client documents into the legal pipeline.

---

### Inno Setup 6 for the Installer

**Why Inno Setup over MSIX / WiX / Electron Builder:**
- MSIX requires code signing certificates and Microsoft Store or Intune deployment
- WiX is XML-heavy and requires Visual Studio integration
- Electron Builder is for Electron apps (which this is not)
- Inno Setup 6 is a proven, scriptable Windows installer that handles Hebrew paths, registry writes, custom install steps, and silent mode

**Why 12-step staging via publish.ps1:** The install process requires conditional steps (download model only if internet is available, copy DLL to tools, rebuild better-sqlite3 native module). Inno Setup Pascal script cannot express all of this logic; PowerShell can.

---

### better-sqlite3 Synchronous Driver

**Why not async SQLite (node-sqlite3):** SQLite is single-writer synchronous. An async wrapper adds Promise overhead without providing actual concurrency — SQLite serialises writes regardless. The synchronous model simplifies route handlers (no `await` needed for DB calls) and makes transaction logic straightforward.

**TypeScript typing workaround:**
```typescript
prepare(sql: string): Statement<unknown[]> {
  return this.db.prepare(sql) as Statement<unknown[]>;
}
```
`DatabaseConnection.prepare()` takes 0 type parameters. Use `.all() as Type[]` for typed results.

---

## TypeScript Strict-Mode Patterns

### `noUncheckedIndexedAccess` and ReactNode conditionals

Use `!!obj['field']` to produce `boolean`, then `{!!obj['field'] && <span>{obj['field'] as string}</span>}`. This satisfies strict mode without silent `undefined` passthrough.

### `exactOptionalPropertyTypes` and optional props

Use spread pattern `{...(condition ? { prop: value } : {})}` to omit keys entirely when condition is false.

### Router type annotation portability

Add `@remix-run/router` as an explicit devDependency and annotate:
```typescript
import type { Router as RemixRouter } from '@remix-run/router';
export const router: RemixRouter = createBrowserRouter([...]);
```

---

## API Design Decisions

### Unified response envelope

All endpoints return `{ success: true, data: T }` or `{ success: false, error: { code, message } }`. Status codes remain meaningful (404, 409, 422, 500).

### asyncHandler wrapper

Express 4 does not catch Promise rejections automatically. `asyncHandler` wraps route handlers to forward rejections to the central `errorHandler` middleware.

### Helmet with CSP disabled

`contentSecurityPolicy: false` prevents WebView2's DevTools and accessibility scripts from being blocked by Helmet's CSP defaults. All other Helmet protections remain active.

### UNIQUE constraint → 409 detection

`better-sqlite3` throws a plain `Error` with `code: 'SQLITE_CONSTRAINT_UNIQUE'`. The central error middleware detects this and returns 409, keeping route handlers clean.

---

## Desktop Shell Decision

### C# WPF + WebView2 (not Electron)

**Why not Electron:** Bundles Chromium (100–200 MB), requires separate build pipeline, does not integrate with Windows WebView2.

**Chosen approach:** C# WPF + `Microsoft.Web.WebView2` (uses the system Edge runtime, installed on Windows 10 1903+). The WPF app starts the Node.js API as a child process and navigates WebView2 to `http://localhost:3001`.

### DB path: environment variable, not hardcoded

`FACTUM_IL_DB_PATH` and `FACTUM_IL_ROOT` are set by the installer in the registry and passed to the Node.js process by `ApiHostService.cs`. This allows the database to live at the user-chosen install path, not a hardcoded location.

---

## Audio Pipeline Decision

### ffmpeg + whisper-fast.exe for WhatsApp Voice Notes

WhatsApp saves voice notes as `.opus` files. Tesseract cannot process audio. The pipeline routes audio files through:
1. ffmpeg converts `.opus` / `.m4a` / `.ogg` to 16kHz mono WAV
2. `whisper-fast.exe` transcribes the WAV to Hebrew text
3. The transcript is stored in `Document.ocr_text` and processed as a regular text document

If `WHISPER_EXE` or `FFMPEG_EXE` is not set, audio files are registered with an empty transcript (graceful degradation — no crash).

---

## Windows Path Constraints

- All PowerShell scripts use `-LiteralPath` exclusively — no glob expansion
- `spawn()` calls use `shell: false` with arguments as separate argv elements
- `ConvertTo-Json -Compress` handles Unicode and backslash escaping in HTTP bodies
- `publish.ps1` converts `$env:TEMP` to full path via `(Get-Item -LiteralPath $env:TEMP).FullName` to handle Hebrew short (8.3) usernames
- BOM (`0xEF 0xBB 0xBF`) is prepended to all `.ps1`/`.psm1`/`.psd1` files in the distribution — PowerShell 5.1 on Windows reads BOM-less UTF-8 as Windows-1252
