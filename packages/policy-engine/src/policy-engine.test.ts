import { describe, it, expect } from 'vitest';
import { evaluateMemoryWrite } from './memory-policy.js';
import { evaluateAgentRun } from './agent-policy.js';

describe('evaluateMemoryWrite', () => {
  it('allows FACT writes at any confidence', () => {
    expect(evaluateMemoryWrite({ kind: 'FACT', confidence: 0, content: 'x' }, 0.7).decision).toBe('allow');
    expect(evaluateMemoryWrite({ kind: 'FACT', confidence: 1, content: 'x' }, 0.7).decision).toBe('allow');
  });

  it('allows AI_SUMMARY when confidence meets threshold', () => {
    const r = evaluateMemoryWrite({ kind: 'AI_SUMMARY', confidence: 0.8, content: 'x' }, 0.7);
    expect(r.decision).toBe('allow');
  });

  it('denies AI_SUMMARY when confidence is exactly at threshold', () => {
    const r = evaluateMemoryWrite({ kind: 'AI_SUMMARY', confidence: 0.7, content: 'x' }, 0.7);
    expect(r.decision).toBe('allow');
  });

  it('denies AI_SUMMARY when confidence is below threshold', () => {
    const r = evaluateMemoryWrite({ kind: 'AI_SUMMARY', confidence: 0.6, content: 'x' }, 0.7);
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('threshold');
  });

  it('always denies AI_HYPOTHESIS regardless of confidence', () => {
    const hi = evaluateMemoryWrite({ kind: 'AI_HYPOTHESIS', confidence: 0.99, content: 'x' }, 0.7);
    const lo = evaluateMemoryWrite({ kind: 'AI_HYPOTHESIS', confidence: 0.0,  content: 'x' }, 0.7);
    expect(hi.decision).toBe('deny');
    expect(lo.decision).toBe('deny');
    expect(hi.reason).toContain('never');
  });
});

describe('evaluateAgentRun', () => {
  const makeDb = (count: number) => ({
    prepare: (_sql: string) => ({
      get: (..._args: unknown[]) => ({ count }),
    }),
  });

  it('allows when no agent is running for this case', () => {
    const r = evaluateAgentRun({ agentType: 'case-summarizer', caseId: 1, documentId: null }, makeDb(0));
    expect(r.decision).toBe('allow');
  });

  it('denies when an agent is already running for this case', () => {
    const r = evaluateAgentRun({ agentType: 'case-summarizer', caseId: 1, documentId: null }, makeDb(1));
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('already running');
  });

  it('handles null caseId', () => {
    const r = evaluateAgentRun({ agentType: 'global-agent', caseId: null, documentId: 5 }, makeDb(0));
    expect(r.decision).toBe('allow');
  });
});
