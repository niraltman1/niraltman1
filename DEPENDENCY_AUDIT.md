# Dependency Audit — Factum-IL Monorepo

Generated: 2026-06-15

This document lists the internal (`@factum-il/*`) dependency graph for every package in the monorepo.
External (npm) dependencies are omitted; see individual `package.json` files for the full list.

## Internal Dependency Graph

| Package | Internal Dependencies |
|---------|----------------------|
| `@factum-il/shared` | _(none — foundation layer)_ |
| `@factum-il/database` | `shared` |
| `@factum-il/events` | `shared` |
| `@factum-il/observability` | `shared` |
| `@factum-il/legal-ontology` | `shared` |
| `@factum-il/model-router` | `shared` |
| `@factum-il/ai-guardrails` | `shared` |
| `@factum-il/citation-engine` | _(none — standalone parser)_ |
| `@factum-il/evals` | `shared` |
| `@factum-il/enterprise-hooks` | `shared`, `database` |
| `@factum-il/encrypted-backup` | `shared` |
| `@factum-il/retrieval` | `shared` |
| `@factum-il/sdk` | `shared`, `events` |
| `@factum-il/policy-engine` | `shared` |
| `@factum-il/memory` | `shared`, `policy-engine` |
| `@factum-il/pipeline` | `shared`, `database` |
| `@factum-il/ai` | `shared`, `database`, `model-router` |
| `@factum-il/update-core` | `shared`, `observability` |
| `@factum-il/litigation-intelligence` | `shared`, `legal-ontology` |
| `@factum-il/support-diagnostics` | `shared`, `database`, `observability` |
| `@factum-il/agent-core` | `shared` |
| `@factum-il/orchestrator` | `shared` |
| `@factum-il/database-intelligence` | _(see package.json)_ |
| `@factum-il/api` | All packages above |

## Dependency Rules

The following architectural constraints govern internal dependencies:

1. **`@factum-il/shared` has NO internal dependencies** — it is the foundation layer.
2. **`@factum-il/database` depends only on `shared`** — never on AI, API, or UI packages.
3. **No circular dependencies** — the dependency graph is a DAG.
4. **`apps/dashboard` must not be imported from any `packages/*` source file** — enforced by `check:arch`.

## Layered Architecture

```
┌──────────────────────────────────────────────────────┐
│  apps/dashboard (React 19 + Vite)  │  FactumIL.Desktop │
└──────────────────────┬───────────────────────────────┘
                       │ HTTP (port 3001)
┌──────────────────────▼───────────────────────────────┐
│  @factum-il/api  (Express, 40+ routes)               │
│  ← depends on all packages below                     │
└──┬───────┬───────┬───────┬───────┬───────┬───────────┘
   │       │       │       │       │       │
  ai   pipeline  memory  retrieval  ...  sdk / events
   │       │       │
   └───────┴───────┴──→ @factum-il/database
                                 │
                         @factum-il/shared
```

## Known Exceptions / Notes

- `@factum-il/citation-engine` has no internal dependencies by design — it is a self-contained
  deterministic parser (Nevo 2021 citation format) with no DB or AI dependencies.
- `@factum-il/evals` depends only on `shared` — it runs in isolation against fixtures.
- `@factum-il/agent-core` and `@factum-il/orchestrator` currently declare minimal internal deps;
  runtime injection is used for AI/DB/policy, keeping the packages loosely coupled.
- `@factum-il/database-intelligence` is a late-stage package; see its `package.json` for current deps.

## Enforcement

Architecture violations are automatically detected by `pnpm check:arch` (see `scripts/check-architecture.ts`).
The CI `check:` job runs the architecture guard after `Lint` and before unit tests.
