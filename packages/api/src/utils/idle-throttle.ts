import os from 'node:os';
import { getCurrentMode } from './resource-controller.js';

const CPU_LOAD_LIMIT = Number(process.env['IDLE_CPU_LIMIT'] ?? 2.0);
const POLL_INTERVAL_MS = 5_000;

export function isSystemIdle(): boolean {
  const mode = getCurrentMode();
  if (mode === 'day') return false;
  return os.loadavg()[0]! <= CPU_LOAD_LIMIT;
}

export async function waitForIdle(): Promise<void> {
  while (!isSystemIdle()) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
