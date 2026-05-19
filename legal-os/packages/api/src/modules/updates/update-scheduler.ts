import type { Repos } from '../../db.js';
import { fetchContentBundle, applyContentBundle } from './content-updater.js';

const INTERVAL_MS = Number(process.env['CONTENT_UPDATE_INTERVAL_MS'] ?? 30 * 24 * 60 * 60_000);
const STARTUP_DELAY_MS = 5 * 60_000;

let _timer: ReturnType<typeof setInterval> | null = null;

async function runContentUpdate(repos: Repos): Promise<void> {
  const url = process.env['CONTENT_UPDATE_URL'];
  if (!url) return;

  try {
    const bundle = await fetchContentBundle(url);
    if (bundle) {
      const result = await applyContentBundle(repos, bundle);
      console.log(`[Updates] Content bundle applied: +${result.stensApplied} templates, skipped ${result.skipped}`);
    }
  } catch (e) {
    console.warn('[Updates] Content update error:', e);
    repos.db.prepare(
      `INSERT INTO UpdateLog (channel, status, error) VALUES ('content', 'failed', ?)`,
    ).run(String(e));
  }
}

export function startContentUpdateScheduler(repos: Repos): void {
  if (_timer) return;
  if (!process.env['CONTENT_UPDATE_URL']) return;

  console.log(`[Updates] Content scheduler started — every ${Math.round(INTERVAL_MS / 86400000)}d`);

  const startup = setTimeout(() => void runContentUpdate(repos), STARTUP_DELAY_MS);
  if (startup.unref) startup.unref();

  _timer = setInterval(() => void runContentUpdate(repos), INTERVAL_MS);
  if (_timer.unref) _timer.unref();
}

export function stopContentUpdateScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
