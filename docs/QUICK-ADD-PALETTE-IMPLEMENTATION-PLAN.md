# Implementation Plan — Global Quick-Add + Command-Palette Actions

> **Scope:** A universal "create from anywhere" affordance and turning the existing Spotlight
> palette from *navigate-only* into *run-commands*. Implements **§4.6.1** (Quick-Add) and
> **§4.6.4** (palette → actions) of [`UX-MODERNIZATION-ROADMAP.md`](./UX-MODERNIZATION-ROADMAP.md)
> — Phase 0 batch.
> **Constraint posture:** strictly local-first. Reuses existing create mutations; no new
> network/AI calls. RTL/Hebrew throughout.

> ## ✅ STATUS (2026-05-31): implemented
> Shipped: `apps/dashboard/src/commands/command-registry.ts` (create-case / create-client /
> create-task, with `matchCommands` + 7 unit tests), a **Commands** section integrated into
> `SpotlightSearch` (keyboard-navigable alongside results, `>` prefix supported), a global
> **"n" / "+"** Quick-Add shortcut in `useSpotlight` (suppressed while typing in a field), and
> `?new=1` deep-link handling on the Cases / Clients / Tasks pages that opens each page's
> **existing** create form (no new forms, no global modal-state refactor). Time-entry create is
> intentionally omitted until §4.1.5 Billing exists. Dashboard typecheck + build green.

---

## 1. Context & problem

`Cmd+K` Spotlight **searches and navigates** but cannot *create* anything, and there is no
universal create affordance — the most frequent actions (new task / case / client / time-entry)
require hunting for the right page first. Linear's "C to create" and command-palette actions are
the gold standard.

**Grounded current state (verified in code):**

- `apps/dashboard/src/components/common/SpotlightSearch.tsx` — palette UI: entity filter tabs
  (`all|clients|cases|documents`), `useSearch`, `resultHref()` → **navigation only** via
  `useNavigate`.
- `apps/dashboard/src/hooks/useSpotlight.ts` — binds **only** `⌘K / Ctrl+K` to
  `openSpotlight()`. No `n` / `c` / `+` shortcut.
- Open/close state lives in `useUIStore` (`apps/dashboard/src/store/index.ts`).
- Create flows already exist on their pages (e.g. Cases / Tasks / Clients pages have create
  modals + React Query mutations) — **reuse these**, don't build new forms.

---

## 2. Target

**§4.6.4 — palette runs commands.** Spotlight lists *actions* alongside navigation/search
results: "צור משימה", "צור תיק", "צור לקוח", "התחל טיימר", "סכם תיק". Selecting an action runs
it (opens the relevant create modal or fires a mutation) instead of navigating.

**§4.6.1 — global Quick-Add.** A dedicated key (`n` or `+`, with `c` as Linear-style alias)
opens Quick-Add directly to the create menu — same command registry, faster entry point.

```
⌘K  ┌─ חיפוש / פקודה ──────────────────────────┐      n / +  → opens here ↓
    │ > צור…                                    │     ┌─ יצירה מהירה ─────────┐
    ├───────────────────────────────────────────┤     │ + משימה              │
    │ ⚡ פקודות                                  │     │ + תיק                │
    │   + צור משימה            (C ואז T)         │     │ + לקוח               │
    │   + צור תיק                                │     │ ⏱ התחל טיימר          │
    │ 🔎 תוצאות                                  │     └───────────────────────┘
    │   …search hits as today…                   │
    └───────────────────────────────────────────┘
```

---

## 3. Files to change

### 3.1 NEW — `apps/dashboard/src/commands/command-registry.ts`
Single source of truth for actions:
```ts
export interface Command {
  id: string;
  labelHe: string;
  group: 'create' | 'agent' | 'timer' | 'nav';
  keywords?: string[];       // for fuzzy matching in the palette
  run: (ctx: CommandContext) => void;   // navigate, open modal, or fire mutation
}
```
`CommandContext` carries `navigate`, store actions (e.g. `openCreateTask`), and React Query
helpers. Seed commands: create task / case / client (time-entry stub until §4.1.5 billing),
"סכם תיק" (navigates to agents with case preselected). Keep it data-driven so new commands are
one entry.

### 3.2 MODIFY — `apps/dashboard/src/store/index.ts`
Add UI state for create modals if not already global (e.g. `createTaskOpen`, `openCreateTask()`)
so commands can trigger them from anywhere. Prefer lifting the **existing** page modals to
store-controlled visibility over building new ones.

### 3.3 MODIFY — `apps/dashboard/src/components/common/SpotlightSearch.tsx`
- When the query is empty or starts with `>`, show a **Commands** section (filtered by
  `keywords`/`labelHe`) above the search results.
- Selecting a command calls `command.run(ctx)` and closes the palette (instead of `navigate`).
- Keep all existing search/navigation behavior intact below the commands section.
- Keyboard arrows must traverse commands + results as one list (extend existing selection
  index logic).

### 3.4 MODIFY — `apps/dashboard/src/hooks/useSpotlight.ts`
Add a global `n` / `+` (and `c`) shortcut → `openSpotlight({ mode: 'create' })`, **guarded** so
it does not fire while typing in an input/textarea/contenteditable (check `e.target`). Existing
`⌘K` opens the full palette (`mode: 'search'`).

### 3.5 NEW (optional) — `apps/dashboard/src/components/common/QuickAddMenu.tsx`
If we want the compact create-only menu (right wireframe) as a distinct surface, render the
`group === 'create'` commands. **MVP can skip this** and have `mode:'create'` simply pre-filter
the existing Spotlight to the Commands section — less code, same outcome.

---

## 4. Reuse (don't reinvent)
- Existing create modals + React Query mutations on the Cases/Tasks/Clients pages — commands
  *invoke* them; no new forms.
- `useUIStore` open/close pattern already used for Spotlight.
- Spotlight's existing keyboard-navigation, grouping, and RTL styling.

## 5. Risks / edge cases
- **Shortcut while typing:** `n`/`+`/`c` must be ignored when focus is in a field (guard on
  `e.target` tag / `isContentEditable`) — otherwise it hijacks normal typing. Critical.
- **Modal lift refactor:** moving page-local modal state to the store can ripple; keep each page
  working standalone (store flag defaults closed; page still owns the form).
- **Command needing context** (e.g. "סכם תיק" needs a case): if none selected, command navigates
  to a picker rather than failing.
- **i18n/RTL:** action labels Hebrew; the `>` command prefix works the same in RTL input.

## 6. Verification
- Press `n` outside any field → palette opens in create mode showing create commands; typing in
  a text field and pressing `n` inserts "n" (shortcut suppressed).
- `⌘K`, type ">צור משימה", Enter → task create modal opens; cancel → palette/modal closed.
- Run "צור לקוח" / "צור תיק" → respective modals open; submitting creates the record (existing
  mutation) and invalidates lists.
- Arrow-key navigation flows across the Commands and Results sections.
- Typecheck + vitest green; RTL correct.

## 7. Out of scope (tracked elsewhere)
- "התחל טיימר" / time-entry create — needs **§4.1.5 Billing/Time** (Phase 1); ship as a
  disabled/"בקרוב" command or omit until then.
- Full keyboard-shortcut cheatsheet (`?`) — **§4.6.2** (P2).
- Inline click-to-edit cells / optimistic table edits — **§4.6.3** (P2).
