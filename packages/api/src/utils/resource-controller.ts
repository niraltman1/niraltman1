/**
 * Adaptive Resource Controller — Day/Night/Turbo mode.
 *
 * Day Mode  (07:00–22:00, user active):   throttle background tasks, 1 concurrent OCR worker
 * Night Mode (22:00–07:00, user absent):  allow higher concurrency for archive sweeps
 * Turbo Mode: manually triggered or auto-triggered after 15min idle
 *
 * The controller doesn't actually change OS CPU limits — it exposes a mode flag
 * that pipeline workers read to decide their concurrency level.
 */

export type ResourceMode = 'day' | 'night' | 'turbo';

interface ResourceState {
  mode:         ResourceMode;
  turboManual:  boolean;   // true = user explicitly enabled turbo
  lastActivity: number;    // Date.now() of last user API call
  idleThresholdMs: number; // default 15 minutes
}

const state: ResourceState = {
  mode:            'day',
  turboManual:     false,
  lastActivity:    Date.now(),
  idleThresholdMs: 15 * 60 * 1000,
};

/** Called by API middleware on every request to track activity. */
export function recordActivity(): void {
  state.lastActivity = Date.now();
  // If we're in auto-turbo due to idle, revert to scheduled mode
  if (!state.turboManual) {
    state.mode = computeScheduledMode();
  }
}

function computeScheduledMode(): ResourceMode {
  const hour = new Date().getHours();
  return (hour >= 22 || hour < 7) ? 'night' : 'day';
}

function computeMode(): ResourceMode {
  if (state.turboManual) return 'turbo';

  const idleMs = Date.now() - state.lastActivity;
  if (idleMs > state.idleThresholdMs) return 'turbo';

  return computeScheduledMode();
}

/** Get current effective mode (called by workers before each task). */
export function getCurrentMode(): ResourceMode {
  state.mode = computeMode();
  return state.mode;
}

/** Concurrency recommendation for background workers. */
export function getWorkerConcurrency(): number {
  const mode = getCurrentMode();
  return mode === 'day' ? 1 : mode === 'night' ? 3 : 5;
}

/** Manually enable or disable Turbo Mode from the UI. */
export function setTurboMode(enabled: boolean): void {
  state.turboManual = enabled;
  state.mode        = computeMode();
}

export function getStatus() {
  const mode        = getCurrentMode();
  const idleMs      = Date.now() - state.lastActivity;
  const idleMinutes = Math.floor(idleMs / 60_000);
  return {
    mode,
    turboManual:  state.turboManual,
    idleMinutes,
    concurrency:  getWorkerConcurrency(),
    nightHours:   '22:00–07:00',
    nextModeChange: getNextModeChange(),
  };
}

function getNextModeChange(): string {
  const now  = new Date();
  const hour = now.getHours();
  let   nextHour: number;
  if (hour >= 22 || hour < 7) {
    // currently night — next change at 07:00
    nextHour = 7;
  } else {
    // currently day — next change at 22:00
    nextHour = 22;
  }
  const next = new Date(now);
  next.setHours(nextHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}
