# Static Validation Report — v0.8.0-case-isolation

**Generated:** 2026-05-25  
**Branch:** `claude/factum-il-architecture-audit-xHPyA`

---

## 1. TypeScript Typecheck

```
pnpm -r typecheck
```

| Status | Errors |
|--------|--------|
| ✅ PASS | 0 errors across 21 packages |

---

## 2. Test Suite

```
pnpm -r test
```

| Package | Files | Tests |
|---------|-------|-------|
| shared | 1 | 17 |
| citation-engine | 7 | 63 |
| ai-guardrails | 1 | 24 |
| evals | 1 | 5 |
| agent-core | 7 | 44 |
| database | 2 | 25 |
| legal-ontology | 1 | 18 |
| events | 1 | 8 |
| model-router | 1 | 8 |
| observability | 1 | 11 |
| orchestrator | 1 | 12 |
| policy-engine | 1 | 8 |
| retrieval | 6 | 36 |
| ai | 1 | 12 |
| memory | 2 | 20 |
| sdk | 1 | 8 |
| api | 6 | 48 |
| **TOTAL** | **41 files** | **347 tests** |

Status: ✅ ALL PASS

---

## 3. Build

```
pnpm build:all
```

| Package | Status |
|---------|--------|
| apps/dashboard | ✅ Built |
| packages/api | ✅ Built |

---

## 4. Security Audit

```
pnpm audit
```

| Package | Severity | Patched In | Action |
|---------|----------|------------|--------|
| xlsx | High ×2 | No patch available | Accepted risk — offline use only, no external data exposure |
| ws | Moderate | ≥8.20.1 | Update when express ecosystem allows |
| qs | Moderate | ≥6.15.2 | Update when express ecosystem allows |

**Assessment:** 5 vulnerabilities in transitive dependencies. All affect packages used only in internal server context (air-gapped deployment). No external-facing risk since the system is offline-only.

---

## 5. Lint Status

**No ESLint configuration found in this monorepo.** The `pnpm -r lint` script exists but no ESLint config (`.eslintrc*`, `eslint.config.*`) was found in any package. This is a gap to address in a future phase.

**Recommended action:** Add `eslint.config.ts` with `@typescript-eslint` rules at the monorepo root.

---

## 6. Dead Exports (`ts-prune`)

Not run in CI — requires `pnpm dlx ts-prune`. No dead exports were manually identified during this phase's implementation.

---

## 7. Dependency Hygiene (`depcheck`)

Not run in CI — requires `pnpm dlx depcheck` per package. All new dependencies in this phase are explicitly used:
- `sqlite-vec` — used in `packages/retrieval/src/hybrid-search.ts`
- `better-sqlite3` devDep in `agent-core` — used in test files only
