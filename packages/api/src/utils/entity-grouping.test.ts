import { describe, it, expect } from 'vitest';
import type { EntityReference } from '@factum-il/database';
import { summarizeEntities, entityDetail } from './entity-grouping.js';

// Stub normalizer: strip a "השופט " honorific so "השופט כהן" and "כהן" group together.
const stripHonorific = (s: string) => s.replace(/^השופט\s+/, '').trim();

const refs: EntityReference[] = [
  { name: 'השופט כהן', kind: 'hearing',  caseId: 1, caseNumber: 'תא-1', refId: 10, date: '2026-01-01', title: 'דיון' },
  { name: 'כהן',        kind: 'document', caseId: 1, caseNumber: null,   refId: 20, date: '2026-01-02', title: 'כתב טענות' },
  { name: 'כהן',        kind: 'document', caseId: 2, caseNumber: null,   refId: 21, date: '2026-01-03', title: 'תצהיר' },
  { name: 'לוי',        kind: 'hearing',  caseId: 3, caseNumber: 'תא-3', refId: 11, date: '2026-01-04', title: 'דיון' },
];

describe('entity-grouping (M6)', () => {
  it('groups honorific variants under one canonical with correct counts', () => {
    const out = summarizeEntities(refs, stripHonorific);
    const cohen = out.find((e) => e.canonical === 'כהן')!;
    expect(cohen.hearingCount).toBe(1);
    expect(cohen.documentCount).toBe(2);
    expect(cohen.caseCount).toBe(2); // cases 1 and 2 (distinct)
  });

  it('sorts by total references descending', () => {
    expect(summarizeEntities(refs, stripHonorific)[0]!.canonical).toBe('כהן'); // 3 refs > לוי 1
  });

  it('falls back to the raw name when normalize yields empty', () => {
    const out = summarizeEntities([{ ...refs[0]!, name: 'פלוני' }], () => '   ');
    expect(out[0]!.canonical).toBe('פלוני');
  });

  it('entityDetail returns only the matching references', () => {
    const d = entityDetail(refs, 'כהן', stripHonorific);
    expect(d.references).toHaveLength(3);
    expect(d.references.every((r) => stripHonorific(r.name) === 'כהן')).toBe(true);
    expect(d.caseCount).toBe(2);
  });

  it('handles an unknown canonical gracefully', () => {
    const d = entityDetail(refs, 'מי-שאינו-קיים', stripHonorific);
    expect(d.references).toEqual([]);
    expect(d.hearingCount).toBe(0);
  });
});
