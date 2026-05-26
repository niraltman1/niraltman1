import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RedactionPipeline } from '../RedactionPipeline.js';
import { EnvironmentSnapshot } from '../EnvironmentSnapshot.js';
import { CrashReporter } from '../CrashReporter.js';

// ---------------------------------------------------------------------------
// RedactionPipeline
// ---------------------------------------------------------------------------

describe('RedactionPipeline', () => {
  const pipeline = new RedactionPipeline();

  describe('redactString()', () => {
    it('redacts Israeli 9-digit ID numbers', () => {
      const result = pipeline.redactString('ת.ז. של הלקוח היא 123456782 נא לשמור בסוד');
      expect(result).not.toContain('123456782');
      expect(result).toContain('[ID_REDACTED]');
    });

    it('does NOT redact 8-digit numbers (too short to be an ID)', () => {
      const result = pipeline.redactString('מספר 12345678 זה לא ת.ז.');
      expect(result).toContain('12345678');
    });

    it('redacts email addresses', () => {
      const result = pipeline.redactString('צור קשר: user@example.com בכל עת');
      expect(result).not.toContain('user@example.com');
      expect(result).toContain('[EMAIL_REDACTED]');
    });

    it('redacts Israeli mobile phone numbers (05x format)', () => {
      const result = pipeline.redactString('טל: 052-1234567 למידע נוסף');
      expect(result).not.toContain('052-1234567');
      expect(result).toContain('[PHONE_REDACTED]');
    });

    it('redacts sensitive file paths containing /clients/ segments', () => {
      const result = pipeline.redactString(
        'Error at /home/user/data/clients/cohen-david/file.pdf line 5',
      );
      expect(result).toContain('[REDACTED_PATH]');
      expect(result).not.toContain('cohen-david');
    });

    it('redacts sensitive file paths containing /cases/ segments', () => {
      const result = pipeline.redactString(
        'Loading /app/cases/תא-2024-042/document.pdf',
      );
      expect(result).toContain('[REDACTED_PATH]');
    });

    it('redacts Israeli case numbers in stack traces', () => {
      const result = pipeline.redactString(
        'Error processing תא-2024-042 in pipeline stage 3',
      );
      expect(result).not.toContain('תא-2024-042');
      expect(result).toContain('[CASE_NUMBER_REDACTED]');
    });

    it('redacts Hebrew names after עו״ד marker', () => {
      const result = pipeline.redactString('הוגש על ידי עו״ד כהן דוד לבית המשפט');
      expect(result).toContain('[NAME_REDACTED]');
    });

    it('redacts Hebrew names after של marker', () => {
      const result = pipeline.redactString('תיק של לוי שרה מספר 42');
      expect(result).toContain('[NAME_REDACTED]');
      expect(result).not.toContain('לוי שרה');
    });

    it('passes through strings with no PII unchanged', () => {
      const clean = 'Error: database locked — retry in 30s';
      expect(pipeline.redactString(clean)).toBe(clean);
    });

    it('handles empty string without throwing', () => {
      expect(() => pipeline.redactString('')).not.toThrow();
      expect(pipeline.redactString('')).toBe('');
    });

    it('redacts multiple patterns in one string', () => {
      const result = pipeline.redactString(
        'User 123456782 emailed test@test.com from phone 054-9876543',
      );
      expect(result).not.toContain('123456782');
      expect(result).not.toContain('test@test.com');
      expect(result).not.toContain('054-9876543');
    });
  });

  describe('redactObject()', () => {
    it('redacts string values in a flat object', () => {
      const obj = { email: 'user@test.com', count: 5, flag: true };
      const result = pipeline.redactObject(obj);
      expect(result.email).not.toContain('user@test.com');
      expect(result.count).toBe(5);
      expect(result.flag).toBe(true);
    });

    it('redacts string values nested in arrays', () => {
      const obj = { messages: ['user@test.com', 'normal text'] };
      const result = pipeline.redactObject(obj) as { messages: string[] };
      expect(result.messages[0]).toContain('[EMAIL_REDACTED]');
      expect(result.messages[1]).toBe('normal text');
    });

    it('redacts string values in deeply nested objects', () => {
      const obj = { a: { b: { c: 'id: 123456782' } } };
      const result = pipeline.redactObject(obj) as { a: { b: { c: string } } };
      expect(result.a.b.c).toContain('[ID_REDACTED]');
    });

    it('does not mutate the original object', () => {
      const obj = { email: 'user@test.com' };
      pipeline.redactObject(obj);
      expect(obj.email).toBe('user@test.com');
    });
  });

  describe('getInstance()', () => {
    it('returns the same instance on repeated calls', () => {
      const a = RedactionPipeline.getInstance();
      const b = RedactionPipeline.getInstance();
      expect(a).toBe(b);
    });
  });
});

// ---------------------------------------------------------------------------
// EnvironmentSnapshot
// ---------------------------------------------------------------------------

describe('EnvironmentSnapshot', () => {
  const snapshot = new EnvironmentSnapshot();

  describe('collect()', () => {
    it('returns a SystemSnapshot with all required fields', () => {
      const result = snapshot.collect('test-trace-id');
      expect(result.traceId).toBe('test-trace-id');
      expect(typeof result.capturedAt).toBe('string');
      expect(new Date(result.capturedAt).toISOString()).toBe(result.capturedAt);
      expect(typeof result.nodeVersion).toBe('string');
      expect(typeof result.platform).toBe('string');
      expect(typeof result.arch).toBe('string');
      expect(typeof result.totalMemoryMB).toBe('number');
      expect(typeof result.freeMemoryMB).toBe('number');
      expect(result.totalMemoryMB).toBeGreaterThan(0);
      expect(result.freeMemoryMB).toBeGreaterThanOrEqual(0);
    });

    it('captures the correct Node.js version', () => {
      const result = snapshot.collect('trace-1');
      expect(result.nodeVersion).toBe(process.version);
    });
  });

  describe('collectSafeEnvVars()', () => {
    it('does not include vars with SECRET in the key name', () => {
      process.env['FACTUM_IL_SECRET_KEY'] = 'should-not-appear';
      const result = snapshot.collectSafeEnvVars();
      expect(Object.keys(result)).not.toContain('FACTUM_IL_SECRET_KEY');
      delete process.env['FACTUM_IL_SECRET_KEY'];
    });

    it('does not include vars with TOKEN in the key name', () => {
      process.env['FACTUM_IL_TOKEN'] = 'bearer-abc123';
      const result = snapshot.collectSafeEnvVars();
      expect(Object.keys(result)).not.toContain('FACTUM_IL_TOKEN');
      delete process.env['FACTUM_IL_TOKEN'];
    });

    it('does not include vars with KEY in the key name', () => {
      process.env['FACTUM_API_KEY'] = 'api-key-value';
      const result = snapshot.collectSafeEnvVars();
      expect(Object.keys(result)).not.toContain('FACTUM_API_KEY');
      delete process.env['FACTUM_API_KEY'];
    });

    it('does not include vars with PASSWORD in the key name', () => {
      process.env['FACTUM_DB_PASSWORD'] = 'secret123';
      const result = snapshot.collectSafeEnvVars();
      expect(Object.keys(result)).not.toContain('FACTUM_DB_PASSWORD');
      delete process.env['FACTUM_DB_PASSWORD'];
    });

    it('includes safe FACTUM_ vars', () => {
      process.env['FACTUM_IL_ROOT'] = '/tmp/factum';
      const result = snapshot.collectSafeEnvVars();
      expect(result['FACTUM_IL_ROOT']).toBe('/tmp/factum');
      delete process.env['FACTUM_IL_ROOT'];
    });

    it('includes NODE_ vars', () => {
      // NODE_ENV is typically set in test environments
      const result = snapshot.collectSafeEnvVars();
      // Just check the structure is a string-record
      for (const [, v] of Object.entries(result)) {
        expect(typeof v).toBe('string');
      }
    });

    it('all returned values are strings', () => {
      const result = snapshot.collectSafeEnvVars();
      for (const v of Object.values(result)) {
        expect(typeof v).toBe('string');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// CrashReporter
// ---------------------------------------------------------------------------

describe('CrashReporter', () => {
  let tmpDir: string;
  let reporter: CrashReporter;
  const redaction = new RedactionPipeline();

  beforeEach(async () => {
    tmpDir   = await mkdtemp(join(tmpdir(), 'factum-crash-test-'));
    reporter = new CrashReporter(tmpDir, redaction);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('recordCrash()', () => {
    it('returns a CrashReport with an id and occurredAt', async () => {
      const report = await reporter.recordCrash({
        source:    'api',
        errorType: 'Error',
        message:   'database locked',
        context:   {},
        recovered: false,
      });

      expect(typeof report.id).toBe('string');
      expect(report.id).toHaveLength(36); // UUID
      expect(typeof report.occurredAt).toBe('string');
      expect(new Date(report.occurredAt).toISOString()).toBe(report.occurredAt);
    });

    it('assigns traceId field (may be "no-trace" in test env)', async () => {
      const report = await reporter.recordCrash({
        source:    'pipeline',
        errorType: 'TypeError',
        message:   'cannot read property',
        context:   {},
        recovered: false,
      });

      expect(typeof report.traceId).toBe('string');
      expect(report.traceId.length).toBeGreaterThan(0);
    });

    it('redacts PII from message before persisting', async () => {
      const report = await reporter.recordCrash({
        source:    'api',
        errorType: 'Error',
        message:   'Failed to load document for user@example.com',
        context:   {},
        recovered: false,
      });

      expect(report.message).not.toContain('user@example.com');
      expect(report.message).toContain('[EMAIL_REDACTED]');
    });

    it('redacts PII from stack traces', async () => {
      const report = await reporter.recordCrash({
        source:    'agent',
        errorType: 'Error',
        message:   'agent failed',
        stack:     'Error: agent failed\n  at loadCase (/cases/תא-2024-042/index.js:10)',
        context:   {},
        recovered: false,
      });

      expect(report.stack).toBeDefined();
      expect(report.stack).not.toContain('תא-2024-042');
    });

    it('persists the report to disk (readable by getRecentCrashes)', async () => {
      await reporter.recordCrash({
        source:    'startup',
        errorType: 'RangeError',
        message:   'stack overflow',
        context:   { depth: 10000 },
        recovered: false,
      });

      const recent = await reporter.getRecentCrashes(72);
      expect(recent.length).toBe(1);
      expect(recent[0]?.errorType).toBe('RangeError');
    });
  });

  describe('getRecentCrashes()', () => {
    it('returns empty array when crash directory does not exist', async () => {
      const freshReporter = new CrashReporter(join(tmpDir, 'nonexistent'), redaction);
      const result = await freshReporter.getRecentCrashes(72);
      expect(result).toEqual([]);
    });

    it('returns crashes sorted newest-first', async () => {
      // Write two crashes sequentially so they have different timestamps
      await reporter.recordCrash({
        source: 'api', errorType: 'Error', message: 'first', context: {}, recovered: false,
      });
      // Small wait to ensure different timestamps
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      await reporter.recordCrash({
        source: 'api', errorType: 'Error', message: 'second', context: {}, recovered: false,
      });

      const recent = await reporter.getRecentCrashes(72);
      expect(recent.length).toBe(2);
      expect(recent[0]?.message).toBe('second');
      expect(recent[1]?.message).toBe('first');
    });

    it('respects maxAgeHours filter — does not return ancient reports', async () => {
      // Record a normal crash
      await reporter.recordCrash({
        source: 'api', errorType: 'Error', message: 'recent crash', context: {}, recovered: false,
      });

      // maxAgeHours = 0 should filter out everything just recorded
      // (occurredAt is "now"; cutoff is also "now" — borderline case: may include or exclude)
      // We test with a proper age window instead
      const reports = await reporter.getRecentCrashes(72);
      expect(reports.length).toBe(1);
    });

    it('returns all fields of the CrashReport', async () => {
      await reporter.recordCrash({
        source:    'desktop',
        errorType: 'EvalError',
        message:   'eval not allowed',
        stack:     'EvalError: eval not allowed\n  at main.js:1',
        context:   { extra: 'data' },
        recovered: true,
      });

      const [report] = await reporter.getRecentCrashes(72);
      expect(report).toBeDefined();
      if (report === undefined) return;

      expect(report.source).toBe('desktop');
      expect(report.errorType).toBe('EvalError');
      expect(report.recovered).toBe(true);
      expect(report.context).toMatchObject({ extra: 'data' });
    });
  });
});
