# Implementation Plan — Navigation / IA Overhaul

> **Scope:** Front-end information-architecture restructure of the Factum-IL dashboard
> sidebar. Implements **§4.7.6** of [`UX-MODERNIZATION-ROADMAP.md`](./UX-MODERNIZATION-ROADMAP.md)
> ("Navigation/IA overhaul — un-orphan ~25 routes"), the highest-ROI Phase-0 item.
> **Constraint posture:** strictly local-first; no new network/AI calls.

> ## ✅ STATUS (2026-06-01): implemented
> Shipped exactly as planned: `components/layout/nav-config.tsx` (8 groups, every item an
> existing route, `groupIdForPath` longest-prefix matcher), `store/index.ts` extended with
> `expandedGroups` + `toggleNavGroup`/`setNavGroupOpen` and `persist` middleware
> (`partialize` → `{sidebarCollapsed, expandedGroups}`, `merge` re-seeds defaults for new
> groups), and a rewritten `Sidebar.tsx` (accordion when expanded, flat icon-rail with
> dividers when collapsed, active-group auto-expand, bug-report moved into the מערכת group).
> Router unchanged. Tests: `__tests__/Sidebar.test.tsx` (5). Dashboard typecheck + build green.

---

## 1. Context & problem

The sidebar (`apps/dashboard/src/components/layout/Sidebar.tsx`) exposes a **flat list of
6 items** plus a 3-link settings dropdown. The router (`apps/dashboard/src/router/index.tsx`)
defines **25 navigable top-level routes**. The result: ~19 fully-built features are
reachable only by deep link and are effectively invisible to users:

> `cases`, `documents`, `tasks`, `contacts`, `traffic`, `media`, `evidence`, `templates`,
> `stens`, `precedents`, `action-plan`, `action-queue`, `queue`, `agents`, `mail`, `gmail`,
> `studies`, and admin's `mission-control` / `journal` / `rbac`.

**Goal:** a logical, collapsible **8-group hierarchy** that surfaces every screen and makes
the product feel coherent and flowing — without touching the router or any page component.

**Decisions locked with the owner:**
- **8 groups** (structure below).
- **Collapsible accordion**, expand/collapse state **persisted to localStorage**.
- **Admin/"מערכת" group shown to all** for now (role-gating deferred to RBAC v2, Phase 1).

---

## 2. Approved navigation hierarchy (single source of truth)

Each group has a Hebrew label + Phosphor icon; each item maps to an **existing** route.
Default state: `[פתוח]` (expanded) / `[מקופל]` (collapsed). Global search stays on **Cmd+K**
(not a nav item); `/canvas/:id` and all `:id` detail routes are reached from their lists,
not the nav.

```
עבודה שוטפת            [פתוח]   (SquaresFour)
  · לוח בקרה            /dashboard          GaugeIcon
  · משימות              /tasks              CheckSquareIcon
  · פעילות              /activity           PulseIcon

תיקים ולקוחות          [פתוח]   (Briefcase)
  · תיקים               /cases              FolderIcon
  · לקוחות              /clients            UsersIcon
  · אנשי קשר            /contacts           AddressBookIcon
  · תיקי תנועה          /traffic            CarIcon

מסמכים וראיות          [פתוח]   (Files)
  · כל המסמכים          /documents          FileTextIcon
  · תור קליטה           /queue              TrayIcon
  · תור אישורים         /action-queue       CheckCircleIcon
  · תוכנית פעולה        /action-plan        BroomIcon
  · מדיה וסריקות        /media              ImageIcon
  · כספת ראיות          /evidence           VaultIcon

מנוע משפטי             [מקופל]  (Scales)
  · תבניות הליך         /templates          StackIcon
  · טפסים (Stens)       /stens              NoteIcon
  · תקדימים             /precedents         GavelIcon

בינה וסוכנים           [מקופל]  (Robot)
  · סוכני AI            /agents             RobotIcon

תקשורת                 [מקופל]  (Envelope)
  · מחולל מייל          /mail               EnvelopeIcon
  · חיבור Gmail         /gmail              EnvelopeSimpleIcon

לימודים                [מקופל]  (GraduationCap)
  · מרכז אקדמי          /studies            GraduationCapIcon

מערכת (מנהל)           [מקופל]  (Gear)
  · אבחון מערכת         /admin                     HardDriveIcon
  · מרכז בקרה           /admin/mission-control     ChartLineIcon
  · יומן ביקורת         /admin/journal             NotebookIcon
  · הרשאות              /admin/rbac                LockKeyIcon
  · הגדרות גיבוי        /admin/backup-settings     CloudArrowUpIcon
  · מצב שחזור           /admin/recovery            ShieldWarningIcon
  + דווח על באג         (action → BugReportModal)  BugIcon
```

**Alignment with roadmap §4.7.6:** maps to its Workspace / Matters / Documents /
Legal-Research / Studies / Admin groups, plus dedicated AI and Communication groups for
routes that already exist. **Finance is intentionally omitted** here — billing UI is
Phase 2 (§4.1.5); a Finance group is added when `LedgerPage` (currently a `clientId`-prop
component, unrouted) is promoted to a real screen.

---

## 3. Files to change

### 3.1 NEW — `apps/dashboard/src/components/layout/nav-config.tsx`
The declarative model that drives the sidebar (and is reusable later by the Cmd+K palette).
```ts
import type { Icon } from '@phosphor-icons/react';

export interface NavItem  { to: string; label: string; Icon: Icon; }
export interface NavGroup {
  id: string; label: string; Icon: Icon; defaultOpen: boolean; items: NavItem[];
}
export const NAV_GROUPS: NavGroup[] = [ /* the 8 groups from §2 */ ];
```
*Why a separate file:* keeps `Sidebar.tsx` presentational, gives one place to add future
items (Calendar, Notifications inbox), and lets `SpotlightSearch` import the same model.
The "דווח על באג" entry stays a **non-route action** handled in the Sidebar footer.

### 3.2 MODIFY — `apps/dashboard/src/store/index.ts`
- Add to `UIState`: `expandedGroups: Record<string, boolean>`.
- Add action `toggleNavGroup(id: string)`.
- Add **`persist`** middleware (`zustand/middleware`) wrapping the existing `devtools`,
  with `partialize` to persist only `{ sidebarCollapsed, expandedGroups }` (NOT spotlight
  or selection state). Keep store name `factum-il-ui`.
- Seed `expandedGroups` from each group's `defaultOpen`; persisted values override on
  rehydrate.

### 3.3 MODIFY — `apps/dashboard/src/components/layout/Sidebar.tsx`
- Replace the flat `NAV_ITEMS.map(...)` + `SettingsMenu` dropdown with a render over
  `NAV_GROUPS`:
  - **Expanded (`w-60`):** each group = a header button (group `Icon` + label + chevron)
    calling `toggleNavGroup(id)`; when open, render its `NavLink` items (reuse existing
    `sidebar-item` / `sidebar-item-active` classes — `styles/globals.css:207`).
  - **Collapsed (`w-16`):** ignore the accordion; render a **flat list of item icons**
    separated by thin `var(--hairline)` dividers, each with a `title` tooltip. Active item
    still highlighted.
- **Auto-expand active group:** `useEffect` on `useLocation().pathname` opens the group
  containing the active route (longest-prefix match, so `/cases/123` keeps "תיקים ולקוחות"
  open and `/admin/journal` highlights the journal item, not `/admin`).
- **Preserve** the brand mark, the Ollama status card, and the collapse-toggle footer
  verbatim. Move "דווח על באג" into the "מערכת" group footer (keep the `BugReportModal`
  import + state); remove the old `SettingsMenu` (its 3 admin links now live in "מערכת").
- Chevron rotates with open state; respect RTL (`borderInlineEnd`, chevron direction).

### 3.4 `apps/dashboard/src/router/index.tsx` — **no change**
All routes already exist; this overhaul only makes them discoverable.

---

## 4. Reuse (don't reinvent)
- CSS: `.sidebar-item`, `.sidebar-item-active`, `.glass`, `.glass-2` — `styles/globals.css`.
- Store: extend existing `useUIStore`; `sidebarCollapsed` / `toggleSidebar` stay as-is.
- `BugReportModal` — `components/admin/BugReportModal.tsx`.
- Icons: `@phosphor-icons/react` (project icon set; `weight="duotone"`).
- `NavLink` active-class pattern already used in the current `Sidebar.tsx`.

---

## 5. Risks / edge cases
- **persist + devtools ordering:** wrap as `devtools(persist(creator, {...}))`; verify
  hydration doesn't reset `expandedGroups` (defaults seeded in the creator; persisted
  values win on rehydrate).
- **Collapsed-mode density:** ~26 icons in `w-16` — dividers + tooltips keep it scannable;
  no flyout needed for v1.
- **Active-group match** must use longest-prefix matching.
- **localStorage migration:** additive shape change; any old `factum-il-ui` blob simply
  gains `expandedGroups` — no breaking change.

---

## 6. Verification
1. `pnpm -r typecheck` → 0 errors (strict mode; `nav-config.tsx` fully typed).
2. `pnpm --filter @factum-il/dashboard dev`, then in-app:
   - All **8 groups** render with correct Hebrew labels + icons, RTL correct.
   - Per-group expand/collapse toggles; reload → state **persists** (localStorage).
   - Deep route (e.g. `/admin/journal`, `/cases/:id`) **auto-expands** its group and
     highlights the right item.
   - All 25 routes reachable by clicking (no deep link needed).
   - Collapsed sidebar (`w-16`): icons + tooltips show; active item highlighted.
   - "דווח על באג" still opens `BugReportModal`.
3. If a `Sidebar` test exists it must pass; otherwise add a lightweight render test
   (all group labels present; deep route auto-expands its group) — matches the
   `features/setup/__tests__` precedent.

---

## 7. Out of scope (tracked elsewhere in the roadmap)
- Finance/Billing nav group → Phase 2 (§4.1.5).
- Role-based hiding of the Admin group → RBAC v2, Phase 1 (§4.5.1).
- Cmd+K palette → *actions* (not just nav) → §4.6.4 (will consume `NAV_GROUPS`).
- Calendar / Notifications inbox entries → added to `nav-config` when those screens land
  (§4.1.1 / §4.1.3).
