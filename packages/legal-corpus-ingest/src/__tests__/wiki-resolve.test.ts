import { describe, it, expect, vi, afterEach } from 'vitest';
import { candidateTitle, resolveLaw } from '../wiki-resolve.js';

describe('candidateTitle', () => {
  it('drops the year clause after the first comma', () => {
    expect(candidateTitle('חוק העונשין, התשל"ז–1977')).toBe('חוק העונשין');
  });
  it('keeps bracketed qualifiers before the comma', () => {
    expect(candidateTitle('פקודת הראיות [נוסח חדש], התשל"א–1971')).toBe('פקודת הראיות [נוסח חדש]');
  });
  it('normalises gershayim/quotes and collapses whitespace', () => {
    expect(candidateTitle('חוק  יסוד:  הכנסת')).toBe('חוק יסוד: הכנסת');
  });
});

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => handler(url),
    text: async () => '',
  })));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('resolveLaw — deterministic match by {{ח:מאגר|N}}', () => {
  it('accepts the candidate page only when its מאגר id equals the IsraelLawID', async () => {
    mockFetch((url) => {
      if (url.includes('action=parse')) {
        return { parse: { title: 'חוק העונשין', wikitext: '{{ח:כותרת|חוק העונשין}} {{ח:מאגר|2000479}} ...', text: '<div class="mw-parser-output"><p>1. הוראה.</p></div>' } };
      }
      return { query: { prefixsearch: [] } };
    });
    const r = await resolveLaw(2000479, 'חוק העונשין, התשל"ז–1977');
    expect(r.matched).toBe(true);
    expect(r.magarId).toBe(2000479);
    expect(r.pageTitle).toBe('חוק העונשין');
    expect(r.html).toContain('mw-parser-output');
    expect(r.pageUrl).toContain('he.wikisource.org/wiki/');
  });

  it('rejects a page whose מאגר id does not match, and reports unmatched when no alternative verifies', async () => {
    mockFetch((url) => {
      if (url.includes('action=parse')) {
        return { parse: { title: 'חוק אחר', wikitext: '{{ח:מאגר|9999999}}', text: '<div>...</div>' } };
      }
      return { query: { prefixsearch: [] } };
    });
    const r = await resolveLaw(2000479, 'חוק העונשין, התשל"ז–1977');
    expect(r.matched).toBe(false);
    expect(r.reason).toContain('2000479');
  });

  it('falls back to prefixsearch and accepts an ID-verified alternative', async () => {
    mockFetch((url) => {
      if (url.includes('list=prefixsearch')) {
        return { query: { prefixsearch: [{ title: 'חוק העונשין (תיקון)' }] } };
      }
      if (url.includes('action=parse')) {
        // Direct candidate has the wrong id; the prefixsearch alternative has the right one.
        // (URLSearchParams encodes spaces as '+', so match on the distinctive decoded word.)
        const isAlt = decodeURIComponent(url).includes('תיקון');
        return { parse: { title: isAlt ? 'חוק העונשין (תיקון)' : 'חוק העונשין',
          wikitext: isAlt ? '{{ח:מאגר|2000479}}' : '{{ח:מאגר|111}}',
          text: '<div class="mw-parser-output"><p>1. הוראה.</p></div>' } };
      }
      return {};
    });
    const r = await resolveLaw(2000479, 'חוק העונשין, התשל"ז–1977');
    expect(r.matched).toBe(true);
    expect(r.pageTitle).toBe('חוק העונשין (תיקון)');
  });
});

describe('resolveLaw — transient vs definitive miss (no false metadata-only)', () => {
  it('flags transient (retryable) on repeated 5xx — never a silent metadata-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 503, headers: { get: () => null }, json: async () => ({}), text: async () => '',
    })));
    const r = await resolveLaw(2000479, 'חוק העונשין, התשל"ז–1977', { retryBaseMs: 0 });
    expect(r.matched).toBe(false);
    expect(r.transient).toBe(true);
  });

  it('reports a definitive (non-transient) miss when the page is genuinely absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => (url.includes('list=prefixsearch')
        ? { query: { prefixsearch: [] } }
        : { error: { code: 'missingtitle' } }), // HTTP 200 + missingtitle = definitively absent
      text: async () => '',
    })));
    const r = await resolveLaw(2000479, 'חוק שלא קיים בכלל', { retryBaseMs: 0 });
    expect(r.matched).toBe(false);
    expect(r.transient).toBeFalsy();
  });
});
