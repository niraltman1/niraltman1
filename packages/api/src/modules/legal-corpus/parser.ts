import type { LegalSectionInput } from '@factum-il/database';

/**
 * Parses fetched law HTML into verbatim, per-section slices.
 *
 * SAFETY CONTRACT:
 *  - Output text is always a verbatim slice of the input — never paraphrased, never
 *    authored. The concatenation of section texts is a subset of the source text.
 *  - If structured section-splitting fails, the ENTIRE law is stored as one 'full'
 *    section. We never drop text and never fabricate structure that isn't there.
 *  - Section labels are made unique per source (UNIQUE(source_id, section_label)) by
 *    suffixing collisions, so re-ingestion never violates the schema.
 *
 * NOTE: the section-splitting heuristic targets the Hebrew WikiSource / MediaWiki
 * rendering and SHOULD be validated against the first real fetched page before relying
 * on fine-grained section labels. The verbatim guarantee holds regardless.
 */

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

export function htmlToText(html: string): string {
  let s = html;
  // Drop non-content elements entirely.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<sup[\s\S]*?<\/sup>/gi, '');           // footnote markers
  // Block-level elements become line breaks so section markers land at line starts.
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Strip all remaining tags.
  s = s.replace(/<[^>]+>/g, '');
  // Decode the common entities + numeric refs.
  s = s.replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
  for (const [k, v] of Object.entries(HTML_ENTITIES)) s = s.split(k).join(v);
  // Normalise whitespace without touching the characters themselves.
  s = s.replace(/[ \t\u00A0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Extract the MediaWiki article body if present; otherwise the whole document. */
export function extractMainContent(html: string): string {
  const start = html.search(/<div[^>]*class="[^"]*mw-parser-output[^"]*"/i);
  if (start === -1) return html;
  return html.slice(start);
}

// A section marker at the start of a line: "סעיף 199.", "12.", "12א.", "(א)" headings.
const MARKER_RE = /(?:^|\n)[ \t]*(סעיף[ \t]+[^\n.]{1,40}|\d{1,4}[א-ת]{0,2}\.)/g;

function splitBySectionMarkers(text: string): LegalSectionInput[] {
  const marks: { index: number; label: string }[] = [];
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const label = m[1]!.trim().replace(/\.$/, '');
    const idx = m.index + m[0].indexOf(m[1]!);
    marks.push({ index: idx, label });
  }
  if (marks.length < 2) return [];

  const out: LegalSectionInput[] = [];
  // Preamble before the first marker (title, definitions header) is kept verbatim.
  if (marks[0]!.index > 0) {
    const pre = text.slice(0, marks[0]!.index).trim();
    if (pre) out.push({ sectionLabel: 'מבוא', verbatimText: pre, orderIndex: 0 });
  }
  for (let i = 0; i < marks.length; i++) {
    const startIdx = marks[i]!.index;
    const endIdx = i + 1 < marks.length ? marks[i + 1]!.index : text.length;
    const chunk = text.slice(startIdx, endIdx).trim();
    if (chunk) out.push({ sectionLabel: marks[i]!.label, verbatimText: chunk, orderIndex: out.length });
  }
  return dedupeLabels(out);
}

function dedupeLabels(sections: LegalSectionInput[]): LegalSectionInput[] {
  const seen = new Map<string, number>();
  return sections.map((s, i) => {
    const n = (seen.get(s.sectionLabel) ?? 0) + 1;
    seen.set(s.sectionLabel, n);
    return { ...s, orderIndex: i, sectionLabel: n === 1 ? s.sectionLabel : `${s.sectionLabel} · ${n}` };
  });
}

export function parseLawHtml(html: string): LegalSectionInput[] {
  const text = htmlToText(extractMainContent(html));
  if (!text) return [];
  const sections = splitBySectionMarkers(text);
  if (sections.length >= 2) return sections;
  // Fallback: the entire law as one verbatim section. Safe and lossless.
  return [{ sectionLabel: 'full', verbatimText: text, orderIndex: 0 }];
}
