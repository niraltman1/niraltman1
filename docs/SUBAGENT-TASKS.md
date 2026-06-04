# Factum-IL — Sub-Agent Task Breakdown

> Generated: 2026-06-04 | Branch sync playbook Step 4  
> Each task is scoped for one independent sub-agent session.  
> Dependency chain: T1 → T7 can proceed in parallel unless marked **Requires**.

---

## T1 — Legal-Corpus Reader UI (`/library`, F-B)

**Scope:** Build the verbatim corpus browser for statutes already loaded in `LegalSections` (migration `061`).

**Files to create/modify:**
- `apps/dashboard/src/features/legal/LegalLibraryPage.tsx` — source-list sidebar + section reader
- `apps/dashboard/src/api/hooks.ts` — add `useLegalSources`, `useLegalSearch`, `useLegalSections`
- `apps/dashboard/src/router/index.tsx` — add route `/library`
- `apps/dashboard/src/components/layout/nav-config.tsx` — add "ספרייה משפטית" to legal group

**Backend (read-only — already exists):**
- `GET /api/legal-corpus/sources` — list all sources
- `GET /api/legal-corpus/sources/:key` — get source + sections
- `GET /api/legal-corpus/search?q=` — FTS5 search

**Acceptance criteria:**
- [ ] User can browse the 76+ law sources by domain group
- [ ] FTS5 search returns highlighted snippets, linked to source law
- [ ] Clicking a law shows its verbatim sections with RTL Hebrew rendering
- [ ] Empty state shown when corpus not yet populated (no crash)
- [ ] `pnpm -r typecheck` clean; dashboard build green

**Dependencies:** None (backend ready via PR #53 / main)

---

## T2 — Shared Components + `legal-terms.ts` + i18n (F-C)

**Scope:** Extract repeated UI patterns into shared components; add a single Hebrew legal-term glossary; wire i18n stubs.

**Files to create/modify:**
- `packages/ui/src/forms/FormSection.tsx` — shared labeled fieldset wrapper
- `packages/ui/src/forms/FieldGroup.tsx` — shared inline field row
- `apps/dashboard/src/lib/legal-terms.ts` — canonical map: `{ caseTypeLabel, courtLabel, statusLabel, procedureTypeLabel }` (Hebrew ↔ enum)
- `apps/dashboard/src/lib/i18n.ts` — `t(key: string): string` stub (Hebrew-only for now, JSON-backed)
- Replace inline label strings in `CaseDetail`, `ClientCard`, `TasksPage`, `CalendarPage` with `legal-terms.ts` lookups
- Update `packages/ui/package.json` to export new components

**Acceptance criteria:**
- [ ] `legal-terms.ts` covers all procedure types from `Rules_Engine` (20 rules × 9 types)
- [ ] At least 3 high-traffic pages consume the shared form components
- [ ] No new hardcoded Hebrew strings in migrated components (all via `legal-terms.ts` or `i18n.ts`)
- [ ] `pnpm -r typecheck` clean

**Dependencies:** None

---

## T3 — "My Day" Task-Driven Home Dashboard (F-D)

**Scope:** Replace the current KPI dashboard with a task-driven "today" view. The home page (`/`) should show: overdue tasks, upcoming deadlines (7 days), pending AI reviews, and recent activity.

**Files to create/modify:**
- `apps/dashboard/src/features/home/MyDayPage.tsx` — new home page
- `apps/dashboard/src/router/index.tsx` — swap `/` route from old dashboard to `MyDayPage`
- `apps/dashboard/src/api/hooks.ts` — add `useMyDay` (aggregates tasks + deadlines + unverified insights)
- `packages/api/src/routes/my-day.ts` — `GET /api/my-day` (single endpoint: overdue tasks, next-7-day deadlines, unverified-insight count, top-3 recent events)
- Register route in `packages/api/src/app.ts`

**Backend data sources (all existing):**
- `TaskRepository.listByStatus('pending')` filtered `due_date < today`
- `CalendarRepository.deadlinesAtRisk()` (existing)
- `DocumentRepository.countUnverifiedInsights()` or similar
- `ActivityLog` recent entries

**Acceptance criteria:**
- [ ] Home page shows overdue tasks sorted by urgency
- [ ] 7-day deadline rail with court-type icons
- [ ] "Requires review" count links to `/documents` filtered
- [ ] No AI calls; pure DB aggregation
- [ ] RTL layout, Tailwind responsive

**Dependencies:** None (all backend repos exist)

---

## T4 — AI-Approval Uniformity Audit (F-F)

**Scope:** Ensure every AI-generated field that can be wrong has a verify/approve control visible to the attorney. Audit all 5 agent outputs + document insights for consistent `verification_state` exposure.

**Files to audit and update:**
- `apps/dashboard/src/features/documents/DocumentDetail.tsx` — already has verify (reference implementation)
- `apps/dashboard/src/features/agents/AgentOutputPanel.tsx` — add per-result approve/flag buttons
- `apps/dashboard/src/features/cases/CaseDetail.tsx` — audit AI sections
- `packages/api/src/routes/agents.ts` — ensure `verification_state` persisted in `AgentResults`
- `packages/database/src/queries/agent-results.ts` — add `markResultReviewed(id, approved: boolean)` if missing

**Acceptance criteria:**
- [ ] Every agent output (summarize, timeline, discovery, contract-review, research) shows "אשר" / "דחה" controls
- [ ] State persists in `AgentResults` table
- [ ] Attorney cannot mark reviewed without RBAC role ≥ attorney
- [ ] `pnpm -r typecheck` clean; API test suite green

**Dependencies:** None

---

## T5 — Accessibility / Print / Responsive (F-G)

**Scope:** Fix the three outstanding a11y/polish gaps identified in the frontend audit.

**Sub-tasks:**

### T5a — Modal focus-trap + ARIA
- All modals in `AppShell`, `CallLogModal`, signing flow: add `role="dialog"`, `aria-modal="true"`, focus-trap on open, Escape to close
- Files: `CallLogModal.tsx`, `DocumentAnnotations.tsx`, any `<dialog>`-less modal overlay

### T5b — Print stylesheet
- `apps/dashboard/src/styles/print.css` — hide sidebar/nav/topbar in `@media print`, preserve content
- Wire into `apps/dashboard/index.html`
- `HearingPrepPage.tsx` print button should trigger `window.print()`

### T5c — Responsive breakpoints
- `AppShell.tsx` — sidebar auto-collapses at `md:` breakpoint
- `CaseDetail.tsx` tab overflow scroll on mobile
- `CalendarPage.tsx` agenda view as default on small screens

**Acceptance criteria:**
- [ ] Lighthouse accessibility score ≥ 90 on `CasesPage`
- [ ] Print preview of `HearingPrepPage` shows only relevant content
- [ ] No horizontal overflow at 375px viewport width on main pages
- [ ] `pnpm -r typecheck` clean

**Dependencies:** None

---

## T6 — Billing/Trust Ledger UI Surface

**Scope:** The `LedgerPage` component exists but is not routed. Wire it and add basic time-entry and billing views.

**Files to create/modify:**
- `apps/dashboard/src/router/index.tsx` — add `/billing` route pointing to `LedgerPage`
- `apps/dashboard/src/components/layout/nav-config.tsx` — add "חיוב ונאמנות" to "ניהול" group
- `LedgerPage.tsx` — if stub, implement: time entries list, trust account balance, invoice list
- `packages/api/src/routes/ledger.ts` — verify endpoints exist for time entries + trust; add if missing

**Backend check:**
- `GET /api/ledger` already exists in `app.ts`; verify it handles time entries + trust fund balance

**Acceptance criteria:**
- [ ] `/billing` route navigates cleanly
- [ ] Ledger shows current balance and recent transactions
- [ ] Attorney can add a time entry (hours × rate → invoice line)
- [ ] Trust account balance shown separately from operating
- [ ] `pnpm -r typecheck` clean

**Dependencies:** None (backend route exists)

---

## T7 — VerdictCorpus + Statute Search UI Surface

**Scope:** Expose the verdict corpus (`VerdictCorpus`, migration `067`) and the statute search (`searchLegalSections`) in the UI. Depends on PRs #52 and #58 being merged first.

**Files to create/modify:**
- `apps/dashboard/src/features/legal/VerdictSearchPage.tsx` — FTS5 + semantic search over verdict corpus
- `apps/dashboard/src/features/agents/ResearchAgentPanel.tsx` — wire `statute_search` results into research agent output (already in backend via PR #58)
- `apps/dashboard/src/api/hooks.ts` — add `useVerdictSearch`, `useVerdictDetail`
- `apps/dashboard/src/router/index.tsx` — add `/verdicts` route
- `apps/dashboard/src/components/layout/nav-config.tsx` — add "פסיקה" to legal group

**Backend (will exist after PR #52 merge):**
- `GET /api/verdict-corpus/verdicts` — paginated list
- `GET /api/verdict-corpus/verdicts/:docKey` — full verdict
- `GET /api/verdict-corpus/search?q=` — FTS5 search

**Acceptance criteria:**
- [ ] FTS5 search returns Hebrew verdict snippets with case metadata (court, judges, date)
- [ ] Research agent `toolResults` display the `statute_search` tool block when law sections matched
- [ ] Graceful empty state when corpus not yet populated
- [ ] `pnpm -r typecheck` clean

**Requires:** PR #52 (`feat(verdict-corpus)`) and PR #58 (`feat(retrieval): statute search`) merged to main

---

## T8 — Corpus Population (Network-Allowlist Task)

**Scope:** Run the actual data ingestion to populate the legal corpora. This requires egress network access and a running Ollama instance (for embeddings). **Not a code task — operational/infrastructure.**

**Steps:**
1. Add `data.knesset.gov.il`, `he.wikisource.org`, `huggingface.co`, `datasets-server.huggingface.co` to the environment's network allowlist
2. Populate statute corpus: `pnpm ingest-knesset-odata -- --embed` (in `packages/legal-corpus-ingest`)
3. Populate verdict corpus: `tsx scripts/ingest-verdict-corpus.ts --from-dir <path> --embed` (offline HF JSONL) or with network: `tsx scripts/ingest-verdict-corpus.ts --embed`
4. Upload artifacts to GitHub Release `v-deps-1.0.0` as `legal-corpus.jsonl.gz` and `verdict-corpus.jsonl.gz`
5. Update `publish.ps1` to download and bundle both artifacts into the installer

**Acceptance criteria:**
- [ ] `LegalSections` table: ≥ 1,000 sections from ≥ 76 valid laws
- [ ] `VerdictCorpus` table: ≥ 10,000 verdicts from LevMuchnik dataset
- [ ] `GET /api/legal-corpus/search?q=חוק+העונשין` returns verbatim sections
- [ ] `GET /api/verdict-corpus/search?q=הסכמה` returns verdict snippets
- [ ] Installer bundles both artifacts; offline-first loader on startup

**Requires:** PRs #52, #53, #58 merged; network allowlist configured; Ollama running with `nomic-embed-text`

---

## Branch-to-Task Mapping

| Task | Depends on PR | Status |
|------|--------------|--------|
| T1 Legal-corpus reader | PR #53 (main ✅) | Ready |
| T2 Shared components | — | Ready |
| T3 My Day home | — | Ready |
| T4 AI-approval uniformity | — | Ready |
| T5 a11y/print/responsive | — | Ready |
| T6 Billing/trust UI | — | Ready |
| T7 VerdictCorpus + statute UI | PR #52, PR #58 | **Needs merge** |
| T8 Corpus population | PR #52, #53, #58 | **Needs merge + network** |

---

## Migration Slots Reference (post-merge)

```
001–066: existing (see TASKS.md)
067: VerdictCorpus + VerdictCorpusEmbeddings (PR #52)
Next available: 068
```
