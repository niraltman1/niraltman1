export interface Chunk {
  documentId: number;
  chunkIndex: number;
  text:       string;
  charStart:  number;
  charEnd:    number;
}

/**
 * Document profile drives chunk granularity. Legislation sections are short and
 * atomic (one section = one chunk), whereas court verdicts run for dozens of
 * pages and need larger structural windows so a holding is not split across
 * chunks. The default 'document' profile preserves the historical OCR-chunking
 * behaviour exactly so existing callers (indexer.ts) are unaffected.
 */
export type DocType = 'document' | 'statute' | 'verdict';

interface ChunkProfile {
  maxChars: number;
  overlap:  number;
}

const PROFILES: Record<DocType, ChunkProfile> = {
  document: { maxChars: 1400, overlap: 100 },
  statute:  { maxChars: 1400, overlap: 0 },   // atomic: prefer whole-section splits, no overlap
  verdict:  { maxChars: 2800, overlap: 200 }, // hierarchical: keep holdings intact
};

// Hebrew section markers: "1. ", "1) ", "סעיף 1", "א. "
const SECTION_RE = /\n\s*(?:\d+[.)]\s|[א-ת][.)]\s|סעיף\s+\d+)/;

// Verdict structural markers: רקע / טענות / דיון / הכרעה / סוף דבר, optionally numbered.
const VERDICT_STRUCT_RE =
  /\n\s*(?:\d+[.)]\s*)?(?:רקע|העובדות|הרקע העובדתי|טענות|טענות הצדדים|דיון|דיון והכרעה|הכרעה|המסגרת הנורמטיבית|סוף דבר|אחרית דבר|סיכום)\b/;

/**
 * Split a document into overlapping chunks at natural boundaries.
 *
 * @param text       Raw document text.
 * @param documentId Owning document id (echoed onto each chunk).
 * @param docType    Chunking profile. Defaults to 'document' (legacy behaviour).
 */
export function chunkDocument(
  text:       string,
  documentId: number,
  docType:    DocType = 'document',
): Chunk[] {
  const profile = PROFILES[docType] ?? PROFILES.document;
  const maxChars = profile.maxChars;
  const overlap  = profile.overlap;

  // Statute profile: cut atomically on section boundaries so a section is never
  // split mid-text. Only fall back to size-capping when a single section exceeds
  // the cap (rare).
  if (docType === 'statute') {
    return chunkBySection(text, documentId, maxChars);
  }

  const boundaryRe = docType === 'verdict' ? VERDICT_STRUCT_RE : SECTION_RE;
  const chunks: Chunk[] = [];
  let pos = 0;
  let chunkIndex = 0;

  // Boundary-search window scales with chunk size (legacy 'document' keeps 400).
  const searchBack = Math.min(Math.round(maxChars * 0.3), maxChars - 1);

  while (pos < text.length) {
    const end = Math.min(pos + maxChars, text.length);
    let splitAt = end;

    if (end < text.length) {
      // Prefer splitting at a structural boundary within the trailing window.
      const windowStart = pos + maxChars - searchBack;
      const searchWindow = text.slice(windowStart, end);
      const structMatch = [...searchWindow.matchAll(new RegExp(boundaryRe.source, 'g'))].pop();
      if (structMatch?.index !== undefined) {
        splitAt = windowStart + structMatch.index;
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

    // The final chunk reached the end of the text; stop. (Otherwise `splitAt -
    // overlap` lands before the end and we'd emit redundant 1-char-stepped tail
    // chunks.)
    if (splitAt >= text.length) break;
    pos = Math.max(splitAt - overlap, pos + 1);
  }

  return chunks;
}

/**
 * Atomic section chunking for legislation: each detected section becomes one
 * chunk. A section longer than `maxChars` is size-capped on paragraph/sentence
 * boundaries so a pathological section never produces an unbounded chunk.
 */
function chunkBySection(text: string, documentId: number, maxChars: number): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  // Collect section start offsets from the global marker matches.
  const markerRe = new RegExp(SECTION_RE.source, 'g');
  const starts: number[] = [];
  for (const m of text.matchAll(markerRe)) {
    if (m.index !== undefined) {
      // SECTION_RE begins with \n; the section text starts after the newline.
      starts.push(m.index + 1);
    }
  }

  // Build [start, end) section spans; include any preamble before the first marker.
  const spans: Array<[number, number]> = [];
  let prev = 0;
  for (const s of starts) {
    if (s > prev) spans.push([prev, s]);
    prev = s;
  }
  spans.push([prev, text.length]);

  for (const [start, end] of spans) {
    const sectionText = text.slice(start, end).trim();
    if (sectionText.length <= 20) continue;

    if (sectionText.length <= maxChars) {
      chunks.push({ documentId, chunkIndex, text: sectionText, charStart: start, charEnd: end });
      chunkIndex++;
      continue;
    }

    // Oversized section: cap on paragraph/sentence boundaries without overlap.
    let pos = start;
    while (pos < end) {
      const hardEnd = Math.min(pos + maxChars, end);
      let splitAt = hardEnd;
      if (hardEnd < end) {
        const paraIdx = text.lastIndexOf('\n\n', hardEnd);
        if (paraIdx > pos + 200) splitAt = paraIdx;
        else {
          const sentIdx = Math.max(
            text.lastIndexOf('. ', hardEnd),
            text.lastIndexOf('? ', hardEnd),
            text.lastIndexOf('! ', hardEnd),
          );
          if (sentIdx > pos + 200) splitAt = sentIdx + 1;
        }
      }
      const part = text.slice(pos, splitAt).trim();
      if (part.length > 20) {
        chunks.push({ documentId, chunkIndex, text: part, charStart: pos, charEnd: splitAt });
        chunkIndex++;
      }
      pos = Math.max(splitAt, pos + 1);
    }
  }

  return chunks;
}
