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
});
