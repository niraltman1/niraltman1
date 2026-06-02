import { describe, it, expect } from 'vitest';
import { inferSourceType, shortName, structureLaw } from '../structure.js';
import type { ValidLaw } from '../odata-registry.js';
import type { WikiResolution } from '../wiki-resolve.js';

const law: ValidLaw = {
  israelLawId: 2000479,
  name: 'חוק העונשין, התשל"ז–1977',
  isBasicLaw: false,
  publicationDate: '1977-08-04T00:00:00',
  validityStartDate: '1977-08-04T00:00:00',
  lastUpdated: '2026-01-01T00:00:00',
  year: 1977,
};

describe('inferSourceType', () => {
  it('maps Hebrew name prefixes to the source_type CHECK values', () => {
    expect(inferSourceType('פקודת הראיות [נוסח חדש]')).toBe('ordinance');
    expect(inferSourceType('תקנות סדר הדין האזרחי')).toBe('regulation');
    expect(inferSourceType('כללי לשכת עורכי הדין')).toBe('rules');
    expect(inferSourceType('חוק העונשין')).toBe('statute');
  });
});

describe('shortName', () => {
  it('takes the name up to the first comma', () => {
    expect(shortName('חוק העונשין, התשל"ז–1977')).toBe('חוק העונשין');
    expect(shortName('פקודת התעבורה')).toBe('פקודת התעבורה');
  });
});

describe('structureLaw', () => {
  it('produces an ingested record with sections when WikiSource HTML is present', () => {
    const resolved: WikiResolution = {
      matched: true, magarId: 2000479, pageTitle: 'חוק העונשין',
      pageUrl: 'https://he.wikisource.org/wiki/חוק_העונשין',
      html: '<div class="mw-parser-output"><p>1. הוראה ראשונה.</p><p>2. הוראה שנייה.</p></div>',
    };
    const rec = structureLaw(law, resolved);
    expect(rec.status).toBe('ingested');
    expect(rec.sourceKey).toBe('il_law_2000479');
    expect(rec.sourceType).toBe('statute');
    expect(rec.year).toBe(1977);
    expect(rec.sections.length).toBeGreaterThanOrEqual(2);
    expect(rec.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.embeddings).toEqual([]);
  });

  it('produces a metadata-only record (no fabricated text) when unmatched', () => {
    const rec = structureLaw(law, { matched: false, reason: 'no page' });
    expect(rec.status).toBe('metadata_only');
    expect(rec.sections).toEqual([]);
    expect(rec.contentHash).toBeNull();
    expect(rec.sourceUrl).toBeNull();
    expect(rec.titleHe).toBe('חוק העונשין, התשל"ז–1977');
  });
});
