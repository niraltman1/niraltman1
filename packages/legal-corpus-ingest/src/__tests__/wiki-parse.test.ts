import { describe, it, expect } from 'vitest';
import { parseLawHtml, htmlToText } from '../wiki-parse.js';

describe('wiki-parse', () => {
  it('strips tags and decodes entities verbatim', () => {
    const t = htmlToText('<p>שלום&nbsp;עולם</p><p>שורה&#32;שניה</p>');
    expect(t).toContain('שלום עולם');
    expect(t).toContain('שורה שניה');
    expect(t).not.toContain('<p>');
  });

  it('splits on Hebrew section markers and is verbatim (output ⊆ input)', () => {
    const html = `<div class="mw-parser-output">
      <p>חוק לדוגמה — מבוא של החוק.</p>
      <p>1. ההוראה הראשונה של החוק.</p>
      <p>2. ההוראה השנייה של החוק.</p>
    </div>`;
    const sections = parseLawHtml(html);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    // Every section's text is a substring of the plain-text source (never authored).
    const sourceText = htmlToText(html);
    for (const s of sections) {
      const needle = s.verbatimText.replace(/\s+/g, ' ').trim();
      expect(sourceText.replace(/\s+/g, ' ')).toContain(needle.slice(0, 20));
    }
    expect(sections.map((s) => s.sectionLabel)).toContain('1');
  });

  it('falls back to a single full section when fewer than 2 markers are found', () => {
    const html = '<div class="mw-parser-output"><p>טקסט חופשי ללא סימני סעיף כלשהם.</p></div>';
    const sections = parseLawHtml(html);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.sectionLabel).toBe('full');
    expect(sections[0]!.verbatimText).toContain('טקסט חופשי');
  });

  it('keeps the preamble before the first marker as מבוא', () => {
    const html = `<div class="mw-parser-output">
      <p>פתיח לפני הסעיפים.</p>
      <p>1. סעיף ראשון.</p>
      <p>2. סעיף שני.</p>
    </div>`;
    const sections = parseLawHtml(html);
    expect(sections[0]!.sectionLabel).toBe('מבוא');
    expect(sections[0]!.verbatimText).toContain('פתיח');
  });

  it('de-collides duplicate section labels for the UNIQUE(source_id, section_label) constraint', () => {
    const html = `<div class="mw-parser-output">
      <p>1. ראשון.</p>
      <p>1. כפול.</p>
      <p>2. שני.</p>
    </div>`;
    const labels = parseLawHtml(html).map((s) => s.sectionLabel);
    expect(new Set(labels).size).toBe(labels.length); // all unique
  });
});
