import { describe, it, expect } from 'vitest';
import { parseLawHtml, htmlToText } from './parser.js';

// NOTE: fixtures use synthetic placeholder text — NOT real statutory text — so the
// test validates parsing logic without authoring any legal content.

describe('htmlToText', () => {
  it('strips tags and decodes entities while preserving the characters', () => {
    const out = htmlToText('<p>שלום&nbsp;עולם</p><script>x()</script><div>שורה</div>');
    expect(out).toBe('שלום עולם\nשורה');
  });
});

describe('parseLawHtml', () => {
  it('splits by "סעיף N" markers, preserving verbatim text and order', () => {
    const html = `<div class="mw-parser-output">
      <p>סעיף 1. הגדרה ראשונה כאן.</p>
      <p>סעיף 2. הוראה שנייה כאן.</p>
      <p>סעיף 3. הוראה שלישית כאן.</p>
    </div>`;
    const sections = parseLawHtml(html);
    expect(sections.map((s) => s.sectionLabel)).toEqual(['סעיף 1', 'סעיף 2', 'סעיף 3']);
    expect(sections[0]!.verbatimText).toContain('הגדרה ראשונה');
    expect(sections.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
  });

  it('keeps text before the first marker as a verbatim preamble', () => {
    const html = `<div class="mw-parser-output"><p>כותרת החוק</p><p>סעיף 1. ראשון</p><p>סעיף 2. שני</p></div>`;
    const sections = parseLawHtml(html);
    expect(sections[0]!.sectionLabel).toBe('מבוא');
    expect(sections[0]!.verbatimText).toContain('כותרת החוק');
  });

  it('falls back to one "full" verbatim section when no markers are found', () => {
    const html = `<div class="mw-parser-output"><p>טקסט חופשי ללא סימוני סעיפים כלל.</p></div>`;
    const sections = parseLawHtml(html);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.sectionLabel).toBe('full');
    expect(sections[0]!.verbatimText).toContain('טקסט חופשי');
  });

  it('makes duplicate section labels unique (UNIQUE constraint safety)', () => {
    const html = `<div class="mw-parser-output"><p>סעיף 1. א</p><p>סעיף 1. ב</p><p>סעיף 2. ג</p></div>`;
    const labels = parseLawHtml(html).map((s) => s.sectionLabel);
    expect(new Set(labels).size).toBe(labels.length); // all unique
    expect(labels).toContain('סעיף 1');
  });

  it('returns nothing for empty input (never fabricates)', () => {
    expect(parseLawHtml('')).toEqual([]);
    expect(parseLawHtml('<div></div>')).toEqual([]);
  });
});
