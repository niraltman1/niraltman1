import type { CitationSource } from '../schemas/types.js';
import { formatCase }                     from './case.js';
import { formatLaw, formatRegulation }    from './law.js';
import { formatBook, formatArticle }      from './book.js';

// Deterministic dispatcher — the only layer allowed to produce final citation strings.
// Same input always produces identical output.
export function formatCitation(c: CitationSource): string {
  switch (c.type) {
    case 'case':       return formatCase(c);
    case 'law':        return formatLaw(c);
    case 'regulation': return formatRegulation(c);
    case 'book':       return formatBook(c);
    case 'article':    return formatArticle(c);
  }
}
