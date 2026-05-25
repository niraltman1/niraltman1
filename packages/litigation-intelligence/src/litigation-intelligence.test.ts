import { describe, it, expect } from 'vitest';
import { getCaseCompleteness, seedProceduralChecklist } from './completeness.js';
import { scoreCase } from './risk-scorer.js';

// Minimal in-memory DB mock using arrays
function makeDb(
  checklistRows: Record<string, unknown>[] = [],
  ruleRows: Record<string, unknown>[] = [],
  hearingRows: Record<string, unknown>[] = [],
): { prepare: (sql: string) => { get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[]; run: (...a: unknown[]) => { lastInsertRowid: number; changes: number } } } {
  return {
    prepare: (sql: string) => ({
      get: (..._args: unknown[]) => undefined,
      all: (...args: unknown[]) => {
        if (sql.includes('ProceduralChecklist')) return checklistRows;
        if (sql.includes('Rules_Engine') || sql.includes('rule')) return ruleRows;
        if (sql.includes('court_hearings')) return hearingRows;
        return [];
      },
      run: (..._args: unknown[]) => ({ lastInsertRowid: 1, changes: 1 }),
    }),
  };
}

describe('getCaseCompleteness', () => {
  it('returns score 0 and empty lists when no checklist rows', () => {
    const db = makeDb([]);
    const report = getCaseCompleteness(1, db);

    expect(report.totalSteps).toBe(0);
    expect(report.completeSteps).toBe(0);
    expect(report.score).toBe(0);
    expect(report.missingSteps).toHaveLength(0);
    expect(report.overdueSteps).toHaveLength(0);
  });

  it('returns score 1.0 when all steps are complete', () => {
    const rows = [
      { step_name: 'תביעה', status: 'complete', due_date: null, completed_at: '2024-01-01', notes: null, rule_id: 1 },
      { step_name: 'כתב הגנה', status: 'complete', due_date: null, completed_at: '2024-01-10', notes: null, rule_id: 2 },
    ];
    const db = makeDb(rows);
    const report = getCaseCompleteness(1, db);

    expect(report.totalSteps).toBe(2);
    expect(report.completeSteps).toBe(2);
    expect(report.score).toBe(1.0);
    expect(report.missingSteps).toHaveLength(0);
  });

  it('returns correct partial score with missing steps', () => {
    const rows = [
      { step_name: 'תביעה', status: 'complete', due_date: null, completed_at: '2024-01-01', notes: null, rule_id: 1 },
      { step_name: 'כתב הגנה', status: 'missing', due_date: null, completed_at: null, notes: null, rule_id: 2 },
      { step_name: 'תגובה', status: 'missing', due_date: null, completed_at: null, notes: null, rule_id: 3 },
      { step_name: 'דיון', status: 'pending', due_date: null, completed_at: null, notes: null, rule_id: 4 },
      { step_name: 'פסיקה', status: 'complete', due_date: null, completed_at: '2024-03-01', notes: null, rule_id: 5 },
    ];
    const db = makeDb(rows);
    const report = getCaseCompleteness(1, db);

    expect(report.totalSteps).toBe(5);
    expect(report.completeSteps).toBe(2);
    expect(report.score).toBeCloseTo(0.4);
    expect(report.missingSteps).toHaveLength(2);
  });

  it('identifies overdue steps', () => {
    const rows = [
      { step_name: 'הגשת ראיות', status: 'overdue', due_date: '2024-01-01T00:00:00.000Z', completed_at: null, notes: null, rule_id: 1 },
      { step_name: 'תביעה', status: 'complete', due_date: null, completed_at: '2024-02-01', notes: null, rule_id: 2 },
    ];
    const db = makeDb(rows);
    const report = getCaseCompleteness(1, db);

    expect(report.overdueSteps).toHaveLength(1);
    expect(report.overdueSteps[0]?.stepName).toBe('הגשת ראיות');
  });

  it('includes caseId in report', () => {
    const db = makeDb([]);
    const report = getCaseCompleteness(42, db);
    expect(report.caseId).toBe(42);
  });
});

describe('scoreCase', () => {
  it('returns a RiskScore with required fields', () => {
    const db = makeDb([], [], []);
    const score = scoreCase(1, db);

    expect(score).toHaveProperty('caseId', 1);
    expect(score).toHaveProperty('score');
    expect(score).toHaveProperty('factors');
    expect(score).toHaveProperty('agentName');
    expect(score).toHaveProperty('traceId');
    expect(typeof score.score).toBe('number');
    expect(Array.isArray(score.factors)).toBe(true);
  });

  it('returns low risk when all steps complete and no hearings', () => {
    const rows = [
      { step_name: 'תביעה', status: 'complete', due_date: null, completed_at: '2024-01-01', notes: null, rule_id: 1 },
    ];
    const db = makeDb(rows, [], []);
    const score = scoreCase(1, db);

    expect(score.score).toBeLessThan(0.5);
  });

  it('returns higher risk when many steps missing', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      step_name: `שלב ${i}`,
      status: 'missing',
      due_date: null,
      completed_at: null,
      notes: null,
      rule_id: i + 1,
    }));
    const db = makeDb(rows, [], []);
    const fullScore = scoreCase(1, db);

    const completeRows = rows.map(r => ({ ...r, status: 'complete', completed_at: '2024-01-01' }));
    const dbComplete = makeDb(completeRows, [], []);
    const lowScore = scoreCase(1, dbComplete);

    expect(fullScore.score).toBeGreaterThan(lowScore.score);
  });

  it('accepts custom agentName and traceId via opts', () => {
    const db = makeDb([], [], []);
    const score = scoreCase(1, db, { agentName: 'test-agent', traceId: 'trace-abc' });

    expect(score.agentName).toBe('test-agent');
    expect(score.traceId).toBe('trace-abc');
  });
});
