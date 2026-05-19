export type {
  CitationSource,
  CaseCitation,
  LawCitation,
  RegulationCitation,
  BookCitation,
  ArticleCitation,
  ValidationError,
  ValidationResult,
  CitationConfidence,
  CitationTrustLevel,
} from './schemas/types.js';

export {
  PROCEDURE_MAP,
  KNOWN_PROCEDURES,
  PUBLICATION_MAP,
  KNOWN_PUBLICATIONS,
} from './abbreviations/procedures.js';

export {
  normalizeWhitespace,
  normalizeHebrew,
  normalizeCaseNumber,
  normalizePartiesSeparator,
  formatDateNevo,
} from './hebrew/typography.js';

export {
  canonicalizeProcedure,
  canonicalizeCitation,
} from './canonicalizers/index.js';

export { repairCitation }   from './repair/index.js';
export type { ExtractedCitation } from './parsers/index.js';
export { parseCitation, extractCitations } from './parsers/index.js';
export { validateCitation } from './validators/index.js';
export { formatCitation }   from './formatters/index.js';
export { scoreCitation }    from './confidence/index.js';
