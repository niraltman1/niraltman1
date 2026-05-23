export interface Chunk {
  documentId: number;
  chunkIndex: number;
  text:       string;
  charStart:  number;
  charEnd:    number;
}

const MAX_CHUNK_CHARS = 1400;
const OVERLAP_CHARS   = 100;

// Hebrew section markers: "1. ", "1) ", "סעיף 1", "א. "
const SECTION_RE = /\n\s*(?:\d+[.)]\s|[א-ת][.)]\s|סעיף\s+\d+)/;

export function chunkDocument(text: string, documentId: number): Chunk[] {
  const chunks: Chunk[] = [];
  let pos = 0;
  let chunkIndex = 0;

  while (pos < text.length) {
    const end = Math.min(pos + MAX_CHUNK_CHARS, text.length);
    let splitAt = end;

    if (end < text.length) {
      // Prefer splitting at a section boundary within the last 400 chars
      const searchWindow = text.slice(pos + MAX_CHUNK_CHARS - 400, end);
      const sectionMatch = [...searchWindow.matchAll(new RegExp(SECTION_RE.source, 'g'))].pop();
      if (sectionMatch?.index !== undefined) {
        splitAt = pos + MAX_CHUNK_CHARS - 400 + sectionMatch.index;
      } else {
        // Fall back to paragraph break
        const paraIdx = text.lastIndexOf('\n\n', end);
        if (paraIdx > pos + 200) splitAt = paraIdx;
        else {
          // Fall back to sentence boundary (period/question/exclamation)
          const sentIdx = Math.max(
            text.lastIndexOf('. ', end),
            text.lastIndexOf('? ', end),
            text.lastIndexOf('! ', end),
          );
          if (sentIdx > pos + 200) splitAt = sentIdx + 1;
        }
      }
    }

    const chunkText = text.slice(pos, splitAt).trim();
    if (chunkText.length > 20) {
      chunks.push({ documentId, chunkIndex, text: chunkText, charStart: pos, charEnd: splitAt });
      chunkIndex++;
    }

    pos = Math.max(splitAt - OVERLAP_CHARS, pos + 1);
  }

  return chunks;
}
