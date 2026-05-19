# Engineering Decisions Log

This document records **why** significant technical decisions were made.
Each entry explains the problem, the alternatives considered, and the chosen solution.

---

## TypeScript Strict-Mode Patterns

### `noUncheckedIndexedAccess` and `ReactNode` conditionals

**Problem:** Components that store API data as `Record<string, unknown>` use bracket access like
`obj['nameHe']`. With `noUncheckedIndexedAccess: true`, the compiler adds `| undefined` to every
bracket access, producing `unknown | undefined`. Passing that into a JSX conditional like
`{obj['nameHe'] && <span>{obj['nameHe']}</span>}` is rejected because `unknown` is not assignable
to `ReactNode`.

**Why not cast everywhere?** `obj['nameHe'] as string` would suppress the error but silently pass
`undefined` to JSX when the field is absent.

**Chosen solution:** Double-bang conversion `!!obj['nameHe']` produces `boolean`. Then
`{!!obj['nameHe'] && <span>{...}</span>}` yields `false | JSX.Element`, which IS a valid
`ReactNode`. The check is explicit and the inner expression uses a normal cast (`as string`)
only where the field is actually rendered.

---

### `exactOptionalPropertyTypes` and optional props

**Problem:** When `exactOptionalPropertyTypes: true` is set, TypeScript distinguishes between
"property is absent" and "property is present with value `undefined`". Assigning
`trend={condition ? value : undefined}` is rejected because the prop is declared as `trend?: string`
(meaning "absent or string"), not `trend: string | undefined` (meaning "present but possibly undefined").

**Chosen solution:** Spread pattern:
```typescript
{...(condition ? { trend: value } : {})}
```
This omits the key entirely when the condition is false, satisfying `exactOptionalPropertyTypes`.

---

### `better-sqlite3` Statement generic parameter

**Problem:** `ReturnType<BetterSQLite3Database['prepare']>` evaluates to
`Statement<[unknown[] | {}]>` — a statement that requires exactly one argument of type `unknown[] | {}`.
Every `.run()` / `.get()` / `.all()` call that passes a plain array is then rejected.

**Root cause:** The `better-sqlite3` type declarations use a conditional type on the `prepare`
return based on the `BindParameters = unknown[] | {}` default. TypeScript resolves this to a
single-element tuple wrapping the union, not to the intended `Statement<unknown[]>`.

**Chosen solution:**
```typescript
prepare(sql: string): Statement<unknown[]> {
  return this.db.prepare(sql) as Statement<unknown[]>;
}
```
The explicit return type bypasses the conditional type resolution. The cast is safe because all
callers pass arrays. This is a known limitation of `better-sqlite3`'s type definitions.

---

### Router type annotation portability

**Problem:** `export const router = createBrowserRouter([...])` causes TypeScript to infer
`RemixRouter` as the type, but the declaration file is inside the pnpm content-addressable store at
`.pnpm/@remix-run+router@1.23.2/node_modules/@remix-run/router`. TypeScript then refuses to emit
the declaration file because "the inferred type cannot be named without a reference to" that deep
path — which is not portable across machines or pnpm versions.

**Alternative tried:** `import type { Router } from 'react-router-dom'` — fails because `Router`
in `react-router-dom` is a React component (value), not the router object type.

**Alternative tried:** `import type { RemixRouter } from 'react-router-dom'` — `RemixRouter` is
imported internally by react-router-dom but not re-exported.

**Chosen solution:** Add `@remix-run/router` as an explicit devDependency (it was already a
transitive dependency in the lockfile), then:
```typescript
import type { Router as RemixRouter } from '@remix-run/router';
export const router: RemixRouter = createBrowserRouter([...]);
```
This makes the type annotation use a first-class dependency path, not a deep store path.

---

## API Design Decisions

### Unified response envelope

All endpoints return `{ success: true, data: T }` or `{ success: false, error: { code, message } }`.

**Why:** A discriminated union is easier to unwrap in typed TypeScript than HTTP status codes alone.
Status codes are still meaningful (404, 422, 409, 500) but the envelope lets callers check
`body.success` without inspecting `response.status`.

**Tradeoff:** Slightly more verbose than returning data directly, but eliminates ambiguity about
what a 200 response contains when partial errors are possible.

---

### `asyncHandler` wrapper

```typescript
export const asyncHandler = (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

**Why:** Express 4.x does not catch Promise rejections from route handlers automatically.
Without this wrapper, every route would need its own `try/catch`. The wrapper lets route handlers
throw `ApiError` subclasses (or any Error) and have them handled centrally by `errorHandler`.

**Note:** Express 5 adds native async support, but since we're on Express 4 for stability, this
wrapper is the correct pattern.

---

### `Object.setPrototypeOf(this, new.target.prototype)` in ApiError

**Why:** In ESM modules (`.mjs` or TypeScript compiled to ESM), subclassing built-in classes like
`Error` can break the prototype chain. `instanceof NotFoundError` might return `false` even on a
`NotFoundError` instance when the class is loaded from a different module instance (which can happen
with symlinked packages in a monorepo).

`Object.setPrototypeOf(this, new.target.prototype)` in the base `ApiError` constructor restores
the correct prototype chain for every subclass, making `instanceof` reliable.

---

### Helmet with CSP disabled

```typescript
app.use(helmet({ contentSecurityPolicy: false }));
```

**Why CSP is disabled:** In production, Express serves the pre-built Vite bundle as static files.
The Content Security Policy header generated by helmet's defaults blocks `inline scripts` and
`eval`, which Vite's production bundle does not use — but WebView2 (the embedded browser in the
desktop shell) may also inject its own scripts for DevTools or accessibility that would be blocked.
Disabling CSP avoids false positives while all other helmet protections (X-Frame-Options,
X-Content-Type-Options, HSTS, etc.) remain active.

---

### UNIQUE constraint → 409 automatic detection

```typescript
if (err.message?.includes('UNIQUE constraint failed')) {
  return res.status(409).json(fail('CONFLICT', 'Record already exists'));
}
```

**Why:** `better-sqlite3` throws a plain `Error` (with `code: 'SQLITE_CONSTRAINT_UNIQUE'`) rather
than a typed exception for constraint violations. Routes would need per-endpoint try/catch blocks
to catch and rethrow as `ConflictError`. Centralising the detection in the error middleware keeps
route handlers clean.

---

## Database Decisions

### WAL mode + foreign keys on every connection

```typescript
this.db.pragma('journal_mode = WAL');
this.db.pragma('foreign_keys = ON');
```

**WAL mode:** Allows concurrent readers while a writer is active. Critical because the file watcher,
queue worker, and HTTP API all open the same database.

**Foreign keys:** SQLite does not enforce FK constraints by default. Enabling per-connection ensures
referential integrity (e.g., `ActionPlan.document_id` cannot reference a deleted `Document`).

---

### `better-sqlite3` synchronous driver

**Why:** `better-sqlite3` uses synchronous I/O, which is correct for SQLite because SQLite itself
is single-writer synchronous. Using an async driver (like `node-sqlite3`) would only add Promise
overhead with no actual concurrency benefit (SQLite still serialises writes).

The synchronous model also simplifies route handlers — no `await` needed for DB calls, and
transaction logic is straightforward.

---

### FTS5 tokenizer: `unicode61` only (no `tokenchars`)

**Why `tokenchars` was removed:** `tokenchars ".-_"` is a FTS5 tokeniser option that keeps
characters like hyphens and dots as part of a word rather than splitting on them. This was added
for legal document numbers like `תיק-2024-001`. However, the `tokenchars` option was introduced
in SQLite 3.46, and `better-sqlite3@9.6.0` bundles SQLite 3.45.3, which throws a parse error.

**Impact:** Hyphenated tokens are now split at the hyphen. Searching for `תיק-2024-001` still
works via FTS5 phrase matching (`"תיק 2024 001"`), but exact hyphenated searches don't collapse.
This is acceptable for the current use case.

**Future:** When `better-sqlite3` upgrades its bundled SQLite to 3.46+, `tokenchars` can be
re-added to a new migration that rebuilds the FTS virtual tables.

---

## Desktop Shell Decisions

### Node.js child process instead of Electron

**Why not Electron:** Electron bundles Chromium (100–200 MB), requires a separate build pipeline,
and does not integrate with Windows WebView2. The requirement was Windows-native packaging.

**Chosen approach:** C# WPF + `Microsoft.Web.WebView2` (uses the system Edge/WebView2 runtime,
already installed on Windows 10 1903+). The WPF app starts the Node.js API as a child process
and navigates WebView2 to `http://localhost:3001`.

**Production packaging:** Node.js must be installed on the target machine (or bundled via
`pkg`/`nexe` in a future phase). The current install script ensures Node.js is present via winget.

---

### DB path: branded root literal

```csharp
const string dbPath = @"C:\אלטמן משרד עורכי דין - סדר 2026\_Data\legal-os.db";
```

**Why not `AppData`?** `Environment.GetFolderPath(SpecialFolder.ApplicationData)` gives
`C:\Users\<user>\AppData\Roaming\` — correct for user-scoped data but not aligned with the
office folder structure that the PowerShell installer creates. All other components (Config.ps1,
start.ts) use the branded root. Using `AppData` would split DB storage from document storage.

**Why not `CommonApplicationData`?** `C:\ProgramData\` requires admin rights to write. The
office root is under `C:\`, which on Windows 11 requires admin for creation (done once by
the installer) but allows subsequent writes by the current user after the ACL is set.

---

## Ollama Integration

### Environment variable for model name

```typescript
const LEGAL_MODEL = process.env['OLLAMA_MODEL'] ?? 'llama3.2';
```

**Why:** The original model name `law-il-e2b` was a placeholder that doesn't exist in the Ollama
registry. Rather than hardcoding a specific model, using an environment variable lets operators
swap the model without a code change — useful when a better Hebrew legal model becomes available
or when running on hardware that requires a smaller quantisation.

**Default `llama3.2`:** Available via `ollama pull llama3.2`, performs adequately for document
classification and metadata extraction. The installer pulls it automatically.

---

## Installation Pack

### ZIP at `/tmp/LegalOS-Install.zip` (not Desktop)

**Why:** The build environment is Linux (no Windows Desktop directory). The ZIP contains the full
source tree (minus `node_modules` and `dist`) + `INSTALL.md`. On Windows, the user extracts it,
runs `START-HERE.ps1`, and the installer builds everything locally, ensuring fresh dependencies.

**Why source, not pre-built binaries:** The API binary depends on the platform
(`better-sqlite3` native module). The Vite dashboard must be built with the correct `NODE_ENV`.
Distributing source + a build step is more reliable than cross-compiled binaries.
