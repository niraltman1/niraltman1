import { describe, it, expect } from 'vitest';
import { rerank, rerankWithCrossEncoder, type RerankCandidate, type AuthoritySignal } from './reranker.js';

const authority = (score: number, overruled = false): AuthoritySignal => ({ authorityScore: score, overruled });

describe('rerank — legal weighting', () => {
  it('ranks a frequently-followed Supreme Court precedent above an isolated magistrate one of equal base score', () => {
    const candidates: RerankCandidate[] = [
      { id: 'leading',  score: 0.8, court: 'עליון' },
      { id: 'isolated', score: 0.8, court: 'שלום' },
    ];
    const authorityById = new Map([['leading', authority(5)]]);
    const out = rerank(candidates, { authorityById });
    expect(out[0]!.id).toBe('leading');
  });

  it('demotes an overruled precedent below a weaker but live one', () => {
    const candidates: RerankCandidate[] = [
      { id: 'overruled', score: 0.95, court: 'עליון' },
      { id: 'live',      score: 0.5,  court: 'מחוזי' },
    ];
    const authorityById = new Map([
      ['overruled', authority(4, true)],
      ['live',      authority(1)],
    ]);
    const out = rerank(candidates, { authorityById });
    expect(out[0]!.id).toBe('live');
    expect(out.find((r) => r.id === 'overruled')!.factors.overruledPenalty).toBeLessThan(0);
  });

  it('boosts candidates whose text contains an exact statutory reference from the query', () => {
    const candidates: RerankCandidate[] = [
      { id: 'a', score: 0.5, text: 'הוראת סעיף 12 לחוק החוזים חלה בענייננו' },
      { id: 'b', score: 0.5, text: 'טקסט שאינו מזכיר את הסעיף' },
    ];
    const out = rerank(candidates, { statutoryRefs: ['סעיף 12'] });
    expect(out[0]!.id).toBe('a');
    expect(out[0]!.factors.statutory).toBeGreaterThan(0);
  });

  it('applies recency and procedure-domain boosts', () => {
    const candidates: RerankCandidate[] = [
      { id: 'recent', score: 0.5, year: new Date().getFullYear(), procedureDomain: 'civil' },
      { id: 'old',    score: 0.5, year: 1990, procedureDomain: 'criminal' },
    ];
    const out = rerank(candidates, { currentYear: new Date().getFullYear(), preferredProcedureDomain: 'civil' });
    expect(out[0]!.id).toBe('recent');
    expect(out[0]!.factors.recency).toBeGreaterThan(0);
    expect(out[0]!.factors.procedure).toBeGreaterThan(0);
  });

  it('boosts a panel containing the preferred judge', () => {
    const candidates: RerankCandidate[] = [
      { id: 'withJudge',    score: 0.5, judges: ['א. ברק', 'ד. ביניש'] },
      { id: 'withoutJudge', score: 0.5, judges: ['ש. לוין'] },
    ];
    const out = rerank(candidates, { preferredJudge: 'ברק' });
    expect(out[0]!.id).toBe('withJudge');
  });

  it('is a pure function — does not mutate the input array', () => {
    const candidates: RerankCandidate[] = [
      { id: 'a', score: 0.1 },
      { id: 'b', score: 0.9 },
    ];
    const snapshot = JSON.stringify(candidates);
    rerank(candidates);
    expect(JSON.stringify(candidates)).toBe(snapshot);
  });
});

describe('rerankWithCrossEncoder', () => {
  it('falls back to deterministic rerank when no scorer is provided', async () => {
    const candidates: RerankCandidate[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.1 },
    ];
    const out = await rerankWithCrossEncoder('q', candidates);
    expect(out[0]!.id).toBe('a');
  });

  it('blends a cross-encoder score into ranking', async () => {
    const candidates: RerankCandidate[] = [
      { id: 'low-base',  score: 0.2, text: 'highly relevant passage' },
      { id: 'high-base', score: 0.5, text: 'unrelated passage' },
    ];
    const ce = async (_q: string, text: string) => (text.includes('relevant') ? 1 : 0);
    const out = await rerankWithCrossEncoder('q', candidates, {}, ce);
    expect(out[0]!.id).toBe('low-base'); // 0.2 + 1.0 > 0.5
  });

  it('degrades gracefully when the cross-encoder throws (Ollama down)', async () => {
    const candidates: RerankCandidate[] = [
      { id: 'a', score: 0.9, text: 'x' },
      { id: 'b', score: 0.1, text: 'y' },
    ];
    const ce = async () => { throw new Error('ollama unavailable'); };
    const out = await rerankWithCrossEncoder('q', candidates, {}, ce);
    expect(out[0]!.id).toBe('a'); // unchanged base ordering, no crash
  });
});
