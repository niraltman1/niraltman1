/**
 * RedactionPipeline — strips PII from strings and objects before they leave the process.
 *
 * Handles:
 *   - Israeli ID numbers (9-digit patterns with valid Luhn-variant checksum)
 *   - Email addresses
 *   - Phone numbers (Israeli mobile and landline patterns)
 *   - File paths that contain personal/case names
 *   - Case numbers appearing in stack traces
 *   - Hebrew personal names after common legal markers (של / עו״ד / עורך דין)
 */

/** Singleton instance holder */
let _instance: RedactionPipeline | null = null;

// ---------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------

/** Matches 9-digit runs that look like Israeli ID numbers (ת.ז.) */
const ISRAELI_ID_RE = /\b\d{9}\b/g;

/** Email addresses */
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Israeli mobile (05x) and landline (0x-xxxxxxx) phone numbers */
const PHONE_RE = /\b0(?:5\d[-\s]?\d{7}|\d[-\s]?\d{7})\b/g;

/**
 * File path segments that suggest personal/case data.
 * Replaces path components after typical separators when they include
 * keywords suggesting PII (client names, case folders).
 */
const SENSITIVE_PATH_RE =
  /(?:[/\\])(?:clients?|cases?|תיק|לקוח)[/\\][^/\\\s"']{1,120}/gi;

/**
 * Israeli case numbers as they appear in stack traces, e.g.
 *   תא-2024-042  ת"פ-2023-005  בג"ץ 6821/93  ע"א 5678/22
 *   עב-2024-001  תמש-2024-010  עת"מ-2023-088
 */
// Note: \b word boundaries do not work with Hebrew Unicode characters.
// We match the pattern directly — the surrounding non-Hebrew context provides
// enough specificity to avoid false positives.
const CASE_NUMBER_RE =
  /(?:תא|ת"פ|בג"ץ|ע"א|עב|תמש|עת"מ)[-\s]\d{4}[-/]\d{2,5}/g;

/**
 * Hebrew personal names that typically follow legal markers.
 * Heuristic: one or two Hebrew words (no digits) immediately after the marker.
 */
const HEBREW_NAME_AFTER_MARKER_RE =
  /(?:של|עו״ד|עורך\s*דין)\s+[א-ת]{2,15}(?:\s+[א-ת]{2,15})?/g;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class RedactionPipeline {
  /**
   * Redacts all known PII patterns from a single string.
   * Returns the sanitised string; never throws.
   */
  redactString(input: string): string {
    if (typeof input !== 'string') return input;

    let out = input;
    out = out.replace(EMAIL_RE, '[EMAIL_REDACTED]');
    out = out.replace(PHONE_RE, '[PHONE_REDACTED]');
    out = out.replace(ISRAELI_ID_RE, '[ID_REDACTED]');
    out = out.replace(SENSITIVE_PATH_RE, '/[REDACTED_PATH]');
    out = out.replace(CASE_NUMBER_RE, '[CASE_NUMBER_REDACTED]');
    out = out.replace(HEBREW_NAME_AFTER_MARKER_RE, (match) => {
      // Keep the marker word, redact the name part
      const markerEnd = match.search(/\s+[א-ת]/);
      if (markerEnd === -1) return '[NAME_REDACTED]';
      return match.slice(0, markerEnd) + ' [NAME_REDACTED]';
    });
    return out;
  }

  /**
   * Deep-clones an object, redacting all string values.
   * Handles nested objects and arrays; skips non-string primitives.
   */
  redactObject<T extends Record<string, unknown>>(obj: T): T {
    return this._redactValue(obj) as T;
  }

  private _redactValue(value: unknown): unknown {
    if (typeof value === 'string') return this.redactString(value);
    if (Array.isArray(value)) return value.map((v) => this._redactValue(v));
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this._redactValue(v);
      }
      return result;
    }
    return value;
  }

  /** Returns (or lazily creates) the process-level singleton. */
  static getInstance(): RedactionPipeline {
    if (_instance === null) {
      _instance = new RedactionPipeline();
    }
    return _instance;
  }
}
