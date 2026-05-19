/**
 * Rejection Scanner — scans OCR text from Israeli police/prosecution PDFs
 * for keywords indicating a request to stand trial was rejected.
 *
 * Triggered automatically when media-pipeline ingests a document
 * associated with a TrafficCase at the 'police_ingestion' stage.
 */

export interface RejectionScanResult {
  detected:  boolean;
  keywords:  string[];
  excerpt:   string;    // up to 300 chars of surrounding context
}

// Hebrew keywords indicating rejection / invalid submission
// Ordered by severity (most definitive first)
const REJECTION_KEYWORDS = [
  'נדחה',
  'נדחית',
  'בקשה נדחתה',
  'לא תקין',
  'אינו תקין',
  'חוסר במסמכים',
  'מסמכים חסרים',
  'פסול',
  'אינו תקף',
  'לא תקף',
  'נפסל',
  'חוסר',
  'דחייה',
  'נדחה על הסף',
  'rejected',     // English fallback for bilingual forms
];

/**
 * Scan OCR text for rejection keywords.
 * Returns the first match's surrounding context as the excerpt.
 */
export function scanForRejection(ocrText: string): RejectionScanResult {
  if (!ocrText || ocrText.trim().length === 0) {
    return { detected: false, keywords: [], excerpt: '' };
  }

  const found: string[] = [];
  let firstMatchIndex = -1;

  for (const kw of REJECTION_KEYWORDS) {
    const idx = ocrText.indexOf(kw);
    if (idx !== -1) {
      found.push(kw);
      if (firstMatchIndex === -1 || idx < firstMatchIndex) {
        firstMatchIndex = idx;
      }
    }
  }

  if (found.length === 0) {
    return { detected: false, keywords: [], excerpt: '' };
  }

  // Extract context window around first match (±150 chars)
  const start   = Math.max(0, firstMatchIndex - 150);
  const end     = Math.min(ocrText.length, firstMatchIndex + 150);
  const excerpt = ocrText.slice(start, end).replace(/\s+/g, ' ').trim();

  return { detected: true, keywords: found, excerpt };
}
