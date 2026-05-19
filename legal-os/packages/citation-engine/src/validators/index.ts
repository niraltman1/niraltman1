import type { CitationSource, ValidationError, ValidationResult } from '../schemas/types.js';
import { KNOWN_PROCEDURES, KNOWN_PUBLICATIONS } from '../abbreviations/procedures.js';

const CASE_NUMBER_RE = /^\d{1,5}\/\d{2,4}$/;
const DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
const DUPLICATE_PUNCT_RE = /["']{2,}/;

export function validateCitation(c: CitationSource): ValidationResult {
  const errors:   ValidationError[] = [];
  const warnings: ValidationError[] = [];

  switch (c.type) {
    case 'case': {
      if (!KNOWN_PROCEDURES.has(c.procedure)) {
        errors.push({ code: 'INVALID_PROCEDURE', message: `סוג הליך לא מוכר: ${c.procedure}`, field: 'procedure' });
      }
      if (!CASE_NUMBER_RE.test(c.number)) {
        errors.push({ code: 'INVALID_CASE_NUMBER', message: `מספר תיק לא תקין: ${c.number}`, field: 'number' });
      }
      if (c.parties.length === 0) {
        warnings.push({ code: 'MISSING_PARTIES', message: 'שמות הצדדים חסרים', field: 'parties' });
      }
      if (c.publication !== undefined && !KNOWN_PUBLICATIONS.has(c.publication)) {
        warnings.push({ code: 'UNKNOWN_PUBLICATION', message: `מקור פרסום לא מוכר: ${c.publication}`, field: 'publication' });
      }
      if (c.date !== undefined && !DATE_RE.test(c.date)) {
        errors.push({ code: 'INVALID_DATE', message: `פורמט תאריך לא תקין: ${c.date}`, field: 'date' });
      }
      if (DUPLICATE_PUNCT_RE.test(c.procedure)) {
        errors.push({ code: 'DUPLICATE_PUNCTUATION', message: 'ניקוד כפול בסוג ההליך', field: 'procedure' });
      }
      break;
    }
    case 'law': {
      if (c.year <= 1900) {
        errors.push({ code: 'MISSING_YEAR', message: `שנת חוק לא תקינה: ${c.year}`, field: 'year' });
      }
      if (!c.name.trim()) {
        errors.push({ code: 'MISSING_NAME', message: 'שם החוק חסר', field: 'name' });
      }
      break;
    }
    case 'regulation': {
      if (c.year <= 1900) {
        errors.push({ code: 'MISSING_YEAR', message: `שנת תקנות לא תקינה: ${c.year}`, field: 'year' });
      }
      break;
    }
    case 'book': {
      if (c.authors.length === 0) {
        warnings.push({ code: 'MISSING_AUTHORS', message: 'שמות המחברים חסרים', field: 'authors' });
      }
      if (!c.title.trim()) {
        errors.push({ code: 'MISSING_TITLE', message: 'כותרת הספר חסרה', field: 'title' });
      }
      break;
    }
    case 'article': {
      if (c.authors.length === 0) {
        warnings.push({ code: 'MISSING_AUTHORS', message: 'שמות המחברים חסרים', field: 'authors' });
      }
      if (!c.title.trim()) {
        errors.push({ code: 'MISSING_TITLE', message: 'כותרת המאמר חסרה', field: 'title' });
      }
      if (!c.journal.trim()) {
        errors.push({ code: 'MISSING_JOURNAL', message: 'שם כתב העת חסר', field: 'journal' });
      }
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
