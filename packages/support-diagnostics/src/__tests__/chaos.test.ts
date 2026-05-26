/**
 * Chaos tests for support-diagnostics — failure and degraded-state scenarios.
 *
 * Validates that the diagnostics stack is non-throwing and degrades gracefully
 * when faced with: malformed files, missing directories, network errors, and
 * corrupted data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CrashReporter }         from '../CrashReporter.js';
import { RedactionPipeline }     from '../RedactionPipeline.js';
import { EnvironmentSnapshot }   from '../EnvironmentSnapshot.js';
import { DiagnosticsCollector }  from '../DiagnosticsCollector.js';

// ─── CrashReporter resilience ─────────────────────────────────────────────────

describe('Chaos: CrashReporter resilience', () => {
  const redaction = RedactionPipeline.getInstance();

  it('skips malformed JSON crash files and returns valid ones', async () => {
    const dir      = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const crashDir = join(dir, 'reports', 'crashes');
    await mkdir(crashDir, { recursive: true });

    // Write a non-JSON file
    await writeFile(join(crashDir, 'crash-2026-01-01T00-00-00-000Z-bad.json'), 'NOT JSON!!!', 'utf8');

    // Write a valid crash report
    const validReport = {
      id: 'abc123', occurredAt: new Date().toISOString(), traceId: 'tr1',
      source: 'api', errorType: 'Error', message: 'boom', context: {}, recovered: false,
    };
    await writeFile(
      join(crashDir, 'crash-2026-01-02T00-00-00-000Z-abc123.json'),
      JSON.stringify(validReport),
      'utf8',
    );

    const reporter = new CrashReporter(dir, redaction);
    const crashes  = await reporter.getRecentCrashes(999);

    expect(crashes).toHaveLength(1);
    expect(crashes[0]?.id).toBe('abc123');
  });

  it('returns empty array when crashes directory does not exist', async () => {
    const dir      = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const reporter = new CrashReporter(dir, redaction);

    const crashes = await reporter.getRecentCrashes();

    expect(crashes).toEqual([]);
  });

  it('returns empty array for crash files older than maxAgeHours', async () => {
    const dir      = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const crashDir = join(dir, 'reports', 'crashes');
    await mkdir(crashDir, { recursive: true });

    const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1_000).toISOString(); // 100 hours ago
    const oldReport = {
      id: 'old1', occurredAt: oldDate, traceId: 'tr0',
      source: 'api', errorType: 'Error', message: 'old', context: {}, recovered: false,
    };
    await writeFile(
      join(crashDir, `crash-${oldDate.replace(/[:.]/g, '-')}-old1.json`),
      JSON.stringify(oldReport),
      'utf8',
    );

    const reporter = new CrashReporter(dir, redaction);
    const crashes  = await reporter.getRecentCrashes(72); // 72-hour window

    expect(crashes).toEqual([]);
  });

  it('recordCrash returns the report object even when the crash directory path conflicts with a file', async () => {
    // Block mkdir by placing a plain file where the 'reports' subdirectory should be.
    // mkdir({dataPath}/reports/crashes, {recursive:true}) will fail with ENOTDIR.
    const dir = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    // Create a FILE named "reports" — mkdir tries to enter it as a directory and fails
    await writeFile(join(dir, 'reports'), 'blocker', 'utf8');

    const reporter = new CrashReporter(dir, redaction);

    // Must not throw despite the I/O failure
    const result = await reporter.recordCrash({
      source: 'api', errorType: 'Error', message: 'write will fail',
      context: {}, recovered: false,
    });

    expect(result.message).toBe('write will fail');
    expect(result.id).toBeTruthy();
    expect(result.source).toBe('api');
  });
});

// ─── EnvironmentSnapshot edge cases ──────────────────────────────────────────

describe('Chaos: EnvironmentSnapshot edge cases', () => {
  let savedFactumRoot: string | undefined;

  beforeEach(() => {
    savedFactumRoot = process.env['FACTUM_IL_ROOT'];
  });

  afterEach(() => {
    if (savedFactumRoot !== undefined) {
      process.env['FACTUM_IL_ROOT'] = savedFactumRoot;
    } else {
      delete process.env['FACTUM_IL_ROOT'];
    }
  });

  it('collectModelInfo returns present:false when FACTUM_IL_ROOT is not set', () => {
    delete process.env['FACTUM_IL_ROOT'];
    const snap  = new EnvironmentSnapshot();
    const model = snap.collectModelInfo();
    expect(model.present).toBe(false);
  });

  it('collectModelInfo returns present:false when GGUF file does not exist at expected path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'factum-chaos-env-'));
    process.env['FACTUM_IL_ROOT'] = dir;

    const snap  = new EnvironmentSnapshot();
    const model = snap.collectModelInfo();
    expect(model.present).toBe(false);
  });

  it('collect() returns a valid SystemSnapshot with all required fields', () => {
    const snap   = new EnvironmentSnapshot();
    const result = snap.collect('trace-chaos-1');
    expect(result.traceId).toBe('trace-chaos-1');
    expect(typeof result.nodeVersion).toBe('string');
    expect(typeof result.platform).toBe('string');
    expect(typeof result.totalMemoryMB).toBe('number');
    expect(result.totalMemoryMB).toBeGreaterThan(0);
  });

  it('collectSafeEnvVars excludes keys containing SECRET, TOKEN, KEY, PASSWORD', () => {
    process.env['TEST_SECRET_CHAOS'] = 'should-be-excluded';
    const snap = new EnvironmentSnapshot();
    const env  = snap.collectSafeEnvVars();
    // Safe env vars should not include secrets
    expect(Object.keys(env).every((k) => !/SECRET|TOKEN|KEY|PASSWORD/i.test(k))).toBe(true);
    delete process.env['TEST_SECRET_CHAOS'];
  });
});

// ─── DiagnosticsCollector network failures ───────────────────────────────────

describe('Chaos: DiagnosticsCollector network failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collectBundle() returns a valid bundle when fetch throws (API unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const dir       = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const collector = new DiagnosticsCollector({ apiBaseUrl: 'http://localhost:9', dataPath: dir });
    const bundle    = await collector.collectBundle();

    expect(bundle.bundleId).toBeTruthy();
    expect(bundle.generatedAt).toBeTruthy();
    expect(bundle.health.overall).toBe('unknown');
    expect(bundle.recentCrashes).toEqual([]);
  });

  it('collectBundle() returns a valid bundle when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   false,
      json: async () => ({}),
    }));

    const dir       = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const collector = new DiagnosticsCollector({ apiBaseUrl: 'http://localhost:9', dataPath: dir });
    const bundle    = await collector.collectBundle();

    expect(bundle.health.overall).toBe('unknown');
  });

  it('collectBundle() returns a valid bundle when fetch returns invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    }));

    const dir       = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const collector = new DiagnosticsCollector({ apiBaseUrl: 'http://localhost:9', dataPath: dir });
    const bundle    = await collector.collectBundle();

    expect(bundle.bundleId).toBeTruthy();
    expect(bundle.health.overall).toBe('unknown');
  });

  it('collectBundle() produces valid structure with zero crash files', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const dir       = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const collector = new DiagnosticsCollector({ apiBaseUrl: 'http://localhost:9', dataPath: dir });
    const bundle    = await collector.collectBundle();

    expect(Array.isArray(bundle.recentCrashes)).toBe(true);
    expect(bundle.recentCrashes).toHaveLength(0);
    expect(Array.isArray(bundle.recentWarnings)).toBe(true);
    expect(bundle.health.checks).toHaveLength(1);
    expect(bundle.health.checks[0]?.status).toBe('unknown');
  });

  it('runChecks() is non-throwing and returns structured results', async () => {
    const dir       = await mkdtemp(join(tmpdir(), 'factum-chaos-'));
    const collector = new DiagnosticsCollector({ dataPath: dir });
    const checks    = await collector.runChecks();

    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(['ok', 'warn', 'critical', 'unknown']).toContain(check.status);
      expect(typeof check.name).toBe('string');
      expect(typeof check.message).toBe('string');
    }
  });
});

// ─── RedactionPipeline idempotency ───────────────────────────────────────────

describe('Chaos: RedactionPipeline idempotency', () => {
  const redaction = RedactionPipeline.getInstance();

  it('redacting an already-redacted string produces no further changes', () => {
    const original = 'שגיאה ב-123456782 ו-test@example.com';
    const once     = redaction.redactString(original);
    const twice    = redaction.redactString(once);
    expect(twice).toBe(once);
  });

  it('redacting an empty string returns empty string', () => {
    expect(redaction.redactString('')).toBe('');
  });

  it('redactObject is idempotent on already-redacted objects', () => {
    const obj    = { id: '123456782', email: 'a@b.com', nested: { id2: '987654321' } };
    const once   = redaction.redactObject(obj) as typeof obj;
    const twice  = redaction.redactObject(once);
    expect(twice).toEqual(once);
  });

  it('handles null and undefined inputs without throwing', () => {
    expect(() => redaction.redactString('')).not.toThrow();
    expect(() => redaction.redactObject(null as unknown as Record<string, unknown>)).not.toThrow();
    expect(() => redaction.redactObject(undefined as unknown as Record<string, unknown>)).not.toThrow();
  });
});
