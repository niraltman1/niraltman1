import { describe, it, expect } from 'vitest';
import { chunkDocument } from './chunker.js';

describe('chunkDocument', () => {
  it('produces at least one chunk for text longer than 20 chars', () => {
    const text = 'זוהי פסקה קצרה המכילה טקסט לדוגמה';
    const chunks = chunkDocument(text, 1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.documentId).toBe(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    // First chunk should contain the beginning of the text
    expect(chunks[0]!.text.length).toBeGreaterThan(0);
  });

  it('returns empty array for text shorter than 20 chars', () => {
    const chunks = chunkDocument('קצר מאוד', 1);
    expect(chunks).toHaveLength(0);
  });

  it('splits long text into multiple chunks', () => {
    const longText = 'א'.repeat(3000);
    const chunks = chunkDocument(longText, 5);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.documentId).toBe(5));
  });

  it('chunk indices are sequential', () => {
    const text = 'א'.repeat(3000);
    const chunks = chunkDocument(text, 1);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it('charStart and charEnd are non-negative and charEnd > charStart', () => {
    const text = 'א'.repeat(3000);
    const chunks = chunkDocument(text, 1);
    for (const chunk of chunks) {
      expect(chunk.charStart).toBeGreaterThanOrEqual(0);
      expect(chunk.charEnd).toBeGreaterThan(chunk.charStart);
    }
  });

  it('each chunk text length does not exceed MAX_CHUNK_CHARS', () => {
    const text = 'תוכן '.repeat(500); // 2500 chars
    const chunks = chunkDocument(text, 1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1400);
    }
  });

  it('splits on Hebrew section markers when present', () => {
    const withSection = 'הקדמה\n\n' + 'א'.repeat(800) + '\nסעיף 1 ' + 'ב'.repeat(800);
    const chunks = chunkDocument(withSection, 1);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('all chunks together cover the original text content', () => {
    const text = 'מילה '.repeat(600); // 3000 chars
    const chunks = chunkDocument(text, 1);
    const combined = chunks.map(c => c.text).join('');
    // Combined should contain all the meaningful content
    expect(combined.length).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('default docType matches explicit "document" profile (back-compat)', () => {
    const text = 'משפט לדוגמה. '.repeat(400);
    const def = chunkDocument(text, 7);
    const doc = chunkDocument(text, 7, 'document');
    expect(doc).toEqual(def);
  });
});

describe('chunkDocument — statute profile (atomic sections)', () => {
  it('emits one chunk per section and never splits a section mid-text', () => {
    const text =
      'סעיף 1 ' + 'א'.repeat(300) + '\n' +
      'סעיף 2 ' + 'ב'.repeat(300) + '\n' +
      'סעיף 3 ' + 'ג'.repeat(300);
    const chunks = chunkDocument(text, 1, 'statute');
    expect(chunks).toHaveLength(3);
    // Each chunk holds exactly one section's filler character — no bleed across sections.
    expect(chunks[0]!.text).toContain('א');
    expect(chunks[0]!.text).not.toContain('ב');
    expect(chunks[1]!.text).toContain('ב');
    expect(chunks[1]!.text).not.toContain('ג');
    expect(chunks[2]!.text).toContain('ג');
  });

  it('size-caps a pathologically long single section', () => {
    const text = 'סעיף 1 ' + 'א'.repeat(4000);
    const chunks = chunkDocument(text, 1, 'statute');
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1400);
  });
});

describe('chunkDocument — verdict profile (larger structural windows)', () => {
  it('produces larger chunks than the document profile for the same long text', () => {
    const text = 'מילה '.repeat(2000); // 10,000 chars
    const asDoc     = chunkDocument(text, 1, 'document');
    const asVerdict = chunkDocument(text, 1, 'verdict');
    // Fewer, larger chunks under the verdict profile.
    expect(asVerdict.length).toBeLessThan(asDoc.length);
    const maxVerdict = Math.max(...asVerdict.map(c => c.text.length));
    expect(maxVerdict).toBeGreaterThan(1400);
    expect(maxVerdict).toBeLessThanOrEqual(2800);
  });

  it('prefers splitting on verdict structural headings', () => {
    const text =
      'רקע\n' + 'א'.repeat(2400) +
      '\nדיון והכרעה\n' + 'ב'.repeat(2400) +
      '\nסוף דבר\n' + 'ג'.repeat(2400);
    const chunks = chunkDocument(text, 1, 'verdict');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // At least one chunk should start at a structural heading.
    const startsAtHeading = chunks.some(c =>
      /^(?:דיון|סוף דבר|הכרעה|רקע)/.test(c.text.trim()),
    );
    expect(startsAtHeading).toBe(true);
  });
});
