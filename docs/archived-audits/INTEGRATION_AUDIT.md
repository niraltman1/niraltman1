# Factum-IL — Integration Audit (Telegram · Whisper · WhatsApp)

> Date: 2026-06-07
> Scope: current implementation/health-check status of the three external-channel
> integrations referenced in `WORKPLAN_COMMUNICATIONS.md` and `TASKS.md`, plus a trace
> of the inbound-message → routing/storage flow and where AI-tagging fits (or doesn't, yet).

---

## 1. Telegram — fully wired, has a startup/connect-time health check

**Code:** `packages/api/src/modules/telegram/telegram-client.ts` (Bot API HTTP wrapper),
`telegram-inbound.ts` (update→routing mapping + encrypted token retrieval),
`telegram-outbound.ts` (best-effort send), wired into `routes/communications.ts`.

**Health check:** `telegram-client.ts:55-58` — `getMe(): Promise<TelegramUser>` calls the
Bot API's `getMe` endpoint, documented in-code as "Health check / identity — used when
connecting a bot token." It runs at **connect time**: `routes/communications.ts:380`
(`POST /telegram/connect`, admin-only) does `me = await new TelegramClient(token).getMe()`
to verify the token is live *before* it is encrypted and stored. This is the right place
for it — there is no long-lived "is Telegram up" concern the way there is for a local
binary, since the bot is either configured-and-working or not-configured.

**Gating:** No env var / feature flag — gated purely by whether a `CommChannels` row
(`channel='telegram'`) exists with an encrypted credential
(`telegram-inbound.ts:71-77`, `getTelegramToken`). Inbound webhook is additionally
secret-gated via `COMM_TELEGRAM_WEBHOOK_SECRET`, checked against the
`x-telegram-bot-api-secret-token` header (`routes/communications.ts:397-399`).

**Production routes:** `POST /telegram/connect` (verify + store), `POST /telegram/webhook`
(public, secret-verified inbound), `POST /telegram/set-webhook` (admin). Inbound updates
flow through `handleTelegramUpdate` → `repos.communications.routeInbound`.

**Tests:** `packages/api/src/modules/telegram/__tests__/telegram.test.ts` — 9 cases
covering `getMe`, `sendMessage`, error envelopes, token-in-URL handling, and
`handleTelegramUpdate → routeInbound` for unknown senders, known senders (case + attorney
match), and photo-media mapping.

**Verdict:** ✅ Production-ready, has the right health check at the right point in its
lifecycle (connect-time token verification). ⚠️ Per `TASKS.md` (2026-06-04 entry), live
delivery against `api.telegram.org` has not been verified *in this environment* because
that domain isn't on the network allowlist here — the code is ready, but live-delivery
verification needs to happen on a machine with that network access.

---

## 2. Whisper (local speech-to-text) — two integrations; one lacked a startup probe (now fixed)

There are **two independent Whisper code paths** in the codebase, each gated by its own
env var and serving a different feature:

### 2a. `packages/api/src/utils/audio-pipeline.ts` (WhatsApp/voice-note pipeline)
Gated by `WHISPER_EXE` / `WHISPER_MODEL` / `FFMPEG_EXE` (`audio-pipeline.ts:31-33`).
**Already has a startup-style probe**: `isExecutable()` (`:37-39`, wraps `fs.access`)
is checked before use (`:112`, `const whisperAvailable = await isExecutable(WHISPER_EXE)`),
producing a graceful `'no_whisper'` status when the binary is absent. No change needed here.

### 2b. `packages/api/src/modules/transcription/whisper.ts` (comm-message + dictation transcription)
Gated by `WHISPER_CMD` (a full shell command string, e.g.
`"whisper-cli -l he -otxt -f"`). Used by `routes/communications.ts:206`
(`POST /messages/:id/transcribe`) and `:360` (`POST /transcribe-audio`, the
call-documentation "dictate" button).

**Gap found and fixed in this audit:** unlike `audio-pipeline.ts` and
`RagHealingService.probeOllama()`, this path had **no startup health probe** — only a
lazy, call-time check (`if (!process.env['WHISPER_CMD']) reject(...)`) that only surfaces
the problem when a user actually tries to transcribe something, with no advance warning
in the logs.

**Fix applied** (`whisper.ts`): added `probeWhisper(timeoutMs = 5_000)`, mirroring the
shape of `RagHealingService.probeOllama()` — async, try/catch-wrapped, timeout-bounded
(`AbortSignal`-style via `setTimeout` + `proc.kill()`), spawns the configured binary with
`--help` and resolves `true`/`false` based on whether it exits cleanly or errors
(ENOENT)/times out — **never touches real audio**. A thin wrapper,
`logWhisperHealthAtStartup()`, runs the probe once and logs a clear, actionable message:

- not configured → `logger.info('[startup] WHISPER_CMD not configured — local
  transcription disabled (audio messages will fail gracefully on demand)')`
- configured and reachable → `logger.info('[startup] Whisper transcription healthy —
  WHISPER_CMD="..."')`
- configured but unreachable → `logger.warn('[startup] WHISPER_CMD="..." did not respond
  to --help — transcription requests will fail until this is fixed')`

Wired into `app.ts` immediately after the existing `RagHealingService.runHealingCycle()`
non-blocking startup check (`void logWhisperHealthAtStartup();`) — **fire-and-forget,
never blocks server startup**, exactly per CLAUDE.md's "AI steps must fail gracefully"
rule (the app starts and serves traffic regardless of Whisper's availability; only the
transcription endpoints are affected, and they already fail cleanly with
`TranscriptionUnavailableError` → a clean error response).

**Tests:** extended `whisper.test.ts` with 3 new cases for `probeWhisper` — unconfigured
→ `false`, nonexistent binary → `false`, real binary (`node --version`) → `true` — plus
the 2 pre-existing `transcribeCommMessage` cases (5/5 passing).

**Verdict:** ✅ Gap closed. Both Whisper paths now have startup-time availability checks
that fail gracefully and log clearly.

---

## 3. WhatsApp — confirmed schema-only / not implemented

No client module, inbound handler, outbound handler, or webhook route exists for
WhatsApp. A repo-wide search for `whatsapp` turns up only:

- Type-level scaffolding: `CommChannel = 'telegram' | 'whatsapp' | 'email' | 'phone'`
  (`packages/database/src/queries/communications.ts:13`, mirrored in the dashboard's
  `apps/dashboard/src/api/hooks.ts:2589`)
- DB schema scaffolding: CHECK constraints allowing `'whatsapp'` as a channel value across
  `migrations/063_communications.sql` (6 occurrences) and `migrations/064_comm_templates.sql:12`
- UI scaffolding: a label/icon entry in `channel-meta.tsx:11`
- A notification-destination column, `Clients.whatsapp_phone` (used only as a place to
  store a number — never read by any sending code)
- A **stub** "notification service": `packages/api/src/utils/notification-service.ts` —
  `ConsoleNotificationService.send()` literally does `console.log('[WhatsApp stub] → ...')`
  (line 7), wired into `deadline-tracker-scheduler.ts`, `insolvency-nudge-scheduler.ts`,
  and `routes/insolvency.ts:289`. None of these actually deliver anything.

This matches the architecture decision already on record
(`TASKS.md`, 2026-06-03 entry): *"וואטסאפ (self-hosted, שליחה-ידנית) גיבוי"* — WhatsApp
was deliberately scoped as a **manual-send backup channel** via a self-hosted
Puppeteer+WebView2 client (`executablePath` pointed at the local Edge/WebView2 install,
not a Chromium download — keeping with the "no data leaves the machine" / Windows-only
constraints). That implementation has simply not started yet.

**Verdict:** As-documented stub. No code-level gap to fix here — this is a scoped,
not-yet-started feature, correctly tracked. No change made.

---

## 4. End-to-end flow trace: external message → routing/storage → (AI-tagging gap)

Using Telegram as the only currently-functional example:

1. **Ingest** — Telegram POSTs to `POST /telegram/webhook`
   (`routes/communications.ts:396`). The `x-telegram-bot-api-secret-token` header is
   checked against `COMM_TELEGRAM_WEBHOOK_SECRET` before anything else runs.
2. **Mapping** — `handleTelegramUpdate` (`telegram-inbound.ts:52`) normalizes the update
   (text body, or media — photo/voice — mapped to `mediaKind`/`mediaRef`).
3. **Routing & storage** — `repos.communications.routeInbound`
   (`packages/database/src/queries/communications.ts:244`) does **pure SQL-based Smart
   Routing**: resolves the sender via `CommContactIdentities`; known senders are matched
   to an open case via `CaseAssignments` and get a `CommConversations` row + a
   `CommMessages` row (status `triage`/`open`/`routed`); unknown senders land in
   `CommUnknownInbox` for manual triage. Every step is mirrored into `CommAudit`.
4. **(Optional) Transcription** — if the message carries audio, a user can trigger
   `POST /messages/:id/transcribe` → `transcribeCommMessage` (`whisper.ts:50`) → shells
   out via `WHISPER_CMD` → persists the transcript via `setTranscript`.

### Gap confirmed: there is no AI-tagging stage in this flow

`routeInbound` performs **only** deterministic SQL matching (case/attorney resolution by
identity + assignment lookup) — there is no `classifyMessage`, `autoTag`, or any
`law-il-E2B`/Ollama call anywhere in `modules/telegram/` or the inbound side of
`communications.ts`. The `tags` mentioned around `routes/communications.ts:301,316` are
manually-applied template metadata, not AI-derived classifications.

This is consistent with the architecture decision recorded in `TASKS.md` (2026-06-03):
*"תיוג-AI ב-law-il-E2B בלבד"* (AI tagging exclusively via law-il-E2B) — the decision to
do AI tagging was made, but **the wiring was never built**. Recorded as a new follow-up
item in `reports/דוח-חוב-טכני.md` (out of scope to build in this session — it would need
a `classifyInboundMessage` step inserted into `routeInbound`'s flow, gated behind an
Ollama health check exactly like `RagHealingService.probeOllama()`, with graceful
fall-through to the existing pure-SQL routing on failure, per CLAUDE.md's "AI steps must
fail gracefully").

---

## Summary table

| Integration | Status | Health check | Action this session |
|---|---|---|---|
| Telegram | ✅ Fully wired | `getMe()` at connect-time (`telegram-client.ts:55`) | None needed — verified existing |
| Whisper (`audio-pipeline.ts` / WhatsApp voice notes) | ✅ Wired, env-gated | `isExecutable()` binary probe (`audio-pipeline.ts:37`) | None needed — verified existing |
| Whisper (`whisper.ts` / comm transcription + dictation) | ✅ Wired, env-gated | **Was missing** → added `probeWhisper()` + `logWhisperHealthAtStartup()`, wired into `app.ts` startup | **Fixed** (+3 tests) |
| WhatsApp | 📋 Documented stub (by design — manual-send backup, not started) | N/A | None — correctly scoped, tracked |
| AI-tagging on inbound messages | ❌ Gap — decided but never wired | N/A | Recorded as new follow-up in `דוח-חוב-טכני.md` |
