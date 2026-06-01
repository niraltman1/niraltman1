# Implementation Plan — Notifications / Alert Inbox

> **Scope:** A unified in-app notification inbox. Implements **§4.1.3** of
> [`UX-MODERNIZATION-ROADMAP.md`](./UX-MODERNIZATION-ROADMAP.md) — the #4 highest-impact gap,
> Phase 0.
> **Constraint posture:** strictly local-first. Notifications are generated and stored on the
> machine; no external push, no new AI calls. Privilege-safe: notification bodies must not be
> shipped anywhere external (they already aren't — this only adds a local store + read UI).

---

## 1. Context & problem

Liability-prevention signals are **generated server-side but evaporate**. They are written to
the rotating log and (when a phone exists) sent as a WhatsApp stub — there is no place a user
opens to see "what needs me today."

**Grounded current state (verified in code):**

| Source | File | What it produces today | Persisted? |
|--------|------|------------------------|------------|
| Task due ≤ N days | `packages/api/src/utils/deadline-tracker-scheduler.ts` (`runCycle`) | `logger.info` + WhatsApp stub | ❌ |
| Statute deadline ≤ N days | same, `runCycle` cases loop | `logger.warn` + WhatsApp stub | ❌ |
| Form-5 / insolvency field gaps | `packages/api/src/utils/insolvency-nudge-scheduler.ts` (`runNudgeCycle`) | `logger.info` + WhatsApp stub | ❌ |
| Poison / stuck queue items | `packages/api/src/routes/queue.ts` | surfaced as stats only | ❌ |

`packages/api/src/utils/notification-service.ts` is a **WhatsApp outbound stub**
(`ConsoleNotificationService.send`) — it is *not* an inbox and stores nothing.

> ⚠️ **Roadmap correction.** §4.1.3 is tagged `[backend ready]`, but "ready" means the *alert
> sources* exist — **there is no `Notifications` table and no read API.** This plan therefore
> includes a small backend (table + generator + route), not UI-only.

**Top-bar anchor:** `apps/dashboard/src/components/layout/AppShell.tsx` already renders a header
row (`flex items-center gap-3 px-5 shrink-0`, line ~26) with a gold `mr-auto` span (line ~52).
The bell goes in that header.

---

## 2. Target

```
┌─ התראות ───────────────────── 🔔 4 חדשות ─┐   bell badge in top bar
├───────────────────────────────────────────┤
│ ⚠ התיישנות תנועה — תיק 8/5/26  לפני 3 ימים │
│    [פתח תיק]                          ▢ נקרא│
│ ● טופס 5 חסר 6 שדות — לקוח לוי         ▢   │
│ ● 3 משימות באיחור                      ▢   │
│ ⚙ פריט תקוע בתור — דורש טיפול          ▢   │
├───────────────────────────────────────────┤
│ [סמן הכל כנקרא]            [הגדרות התראות] │
└───────────────────────────────────────────┘
```

- One bell in the top bar, unread badge count.
- Dropdown panel: severity icon, Hebrew title, relative time (RTL), unread dot, deep-link
  button to the source route, per-row "mark read", "mark all read".
- Click-through navigates to `/cases/:id`, `/clients/:id`, `/queue`, etc.

---

## 3. Files to change

### 3.1 NEW — `migrations/058_notifications.sql`
Strictly additive table. Dedup key prevents the schedulers (which run on an interval) from
inserting the same alert every cycle.

```sql
CREATE TABLE IF NOT EXISTS Notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT    NOT NULL,            -- statute_deadline | task_due | form5_gap | queue_stuck | overdue_tasks
  severity     TEXT    NOT NULL DEFAULT 'info',  -- info | warning | critical
  title_he     TEXT    NOT NULL,
  body_he      TEXT,
  link_type    TEXT,                         -- case | client | document | route
  link_id      TEXT,                         -- e.g. case id, or a route path for 'route'
  dedup_key    TEXT    NOT NULL,             -- e.g. 'statute_deadline:case:42:2026-05-08'
  read_at      TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedup ON Notifications(dedup_key);
CREATE INDEX        IF NOT EXISTS idx_notif_read  ON Notifications(read_at);
CREATE INDEX        IF NOT EXISTS idx_notif_created ON Notifications(created_at);
```

### 3.2 NEW — `packages/database/src/queries/notifications.ts`
`NotificationsRepo` with explicit return types (per CLAUDE.md DB rules):
- `upsert(n): void` — `INSERT … ON CONFLICT(dedup_key) DO NOTHING` (idempotent across cycles).
- `listRecent(limit = 50): NotificationRow[]`
- `unreadCount(): number`
- `markRead(id): void` / `markAllRead(): void`

Export `NotificationRow` type (PascalCase) and wire into `Repos` in `packages/api/src/db.ts`.

### 3.3 MODIFY — the three generators (persist, don't replace)
In `deadline-tracker-scheduler.ts` and `insolvency-nudge-scheduler.ts`, **after** the existing
`logger`/WhatsApp lines, also call `repos.notifications.upsert(...)` with a deterministic
`dedup_key`. Keep WhatsApp + logging exactly as-is — this is additive. Add a small
`queue-stuck` check to the existing queue route or the deadline cycle for poison items.

> Reuse, don't reinvent: the SELECTs that find due tasks / statute deadlines / Form-5 gaps
> already exist in those files. We only add a persistence call per row.

### 3.4 NEW — `packages/api/src/routes/notifications.ts`
- `GET  /api/notifications?limit=50` → `{ items, unread }`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

Guard with `requireAuth(repos)` like the other routers; register in `app.ts`.

### 3.5 NEW — `apps/dashboard/src/api/useNotifications.ts`
React Query hook: poll `GET /api/notifications` on a 60 s `refetchInterval` (local, cheap).
Mutations for mark-read / mark-all-read with optimistic update + `invalidateQueries`.

### 3.6 NEW — `apps/dashboard/src/components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx`
Bell button with unread badge; click toggles a popover panel (reuse existing popover/menu
pattern from the Sidebar settings dropdown). RTL relative-time formatting. Deep-link button
uses `useNavigate`; mapping `link_type`→href mirrors `SpotlightSearch.resultHref`.

### 3.7 MODIFY — `apps/dashboard/src/components/layout/AppShell.tsx`
Mount `<NotificationBell />` inside the existing header row (next to the gold `mr-auto` span).
No layout restructure.

---

## 4. Reuse (don't reinvent)
- Alert-source SELECTs already written in the two schedulers.
- `requireAuth`, `asyncHandler`, `ok()` route helpers.
- `resultHref` deep-link mapping pattern from `SpotlightSearch.tsx`.
- Existing popover/menu styling from the Sidebar settings dropdown.

## 5. Risks / edge cases
- **Duplicate spam across cycles** → solved by `dedup_key` unique index + `ON CONFLICT DO NOTHING`.
- **Stale notifications** (deadline passed / task closed) → MVP leaves them; a follow-up can
  auto-resolve by re-keying. Out of scope here.
- **Privilege:** `title_he`/`body_he` may contain case numbers/client names — that's fine
  *locally*; ensure nothing logs them externally (they already only hit local SQLite + console).
- **No phone present:** today no alert is recorded at all; after this change the inbox captures
  it regardless of phone — strictly better.

## 6. Verification
- Migration applies cleanly; `dedup_key` uniqueness blocks repeat inserts (unit test on repo).
- Seed a case with `statute_deadline` 3 days out → run one deadline cycle → exactly one row,
  unread; second cycle adds none.
- API: list returns it, `unread=1`; mark-read flips `read_at`, `unread=0`.
- UI: bell shows badge "1"; panel row deep-links to the case; "mark all read" clears badge.
- Typecheck + vitest green; Hebrew/RTL renders correctly.

## 7. Out of scope (tracked elsewhere)
- Notification **preferences** screen (mute kinds, thresholds) — §4.7 + §4.1.3 build note.
- Calendar-driven deadline alerts — depends on §4.1.1 Calendar (Phase 1).
- Desktop OS toasts / WebView2 native notifications — Phase 3 polish.
