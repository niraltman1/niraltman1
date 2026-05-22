import { logger, clamp, roundConfidence } from '@factum-il/shared';

const AGENT = 'AIStrategist';

/** Fields that must never be populated by AI alone – regex takes precedence. */
const REGEX_AUTHORITY_FIELDS = new Set([
  'id_number',
  'case_number',
  'bar_number',
  'document_date',
]);

/** Patterns that indicate hallucinated content. */
const HALLUCINATION_PATTERNS: Array<{ field: string; pattern: RegExp }> = [
  { field: 'suggested_case_number', pattern: /^\d{4,}-\d{2}-\d{2}$/ }, // looks like a date, not a case
  { field: 'document_date',         pattern: /0000|9999/             }, // impossible years
];

export interface ValidationResult {
  readonly valid:              boolean;
  readonly hallucinationFlags: string[];
  readonly regexOverrides:     string[];
  readonly sanitised:          Record<string, unknown>;
  readonly adjustedConfidence: number;
}

/**
 * Validates and sanitises AI enrichment responses.
 *
 * Rules:
 *   1. Regex-authoritative fields are never overwritten by AI
 *   2. Hallucination patterns are detected and flagged
 *   3. Confidence is penalised for each flag detected
 *   4. Null is preferred over invented values
 */
export class AIValidator {
  /**
   * Validates a parsed AI response against regex-extracted ground truth.
   * @param aiResponse      Parsed JSON from the AI
   * @param regexGroundTruth Fields already validated by regex (may be partial)
   * @param rawConfidence   Confidence declared by the AI
   */
  validate(
    aiResponse: Record<string, unknown>,
    regexGroundTruth: Record<string, unknown>,
    rawConfidence: number,
  ): ValidationResult {
    const hallucinationFlags: string[] = [];
    const regexOverrides: string[] = [];
    const sanitised = { ...aiResponse };

    // 1. Regex supremacy: AI cannot override regex-authoritative fields
    for (const field of REGEX_AUTHORITY_FIELDS) {
      if (regexGroundTruth[field] !== undefined && regexGroundTruth[field] !== null) {
        if (aiResponse[field] !== undefined && aiResponse[field] !== regexGroundTruth[field]) {
          sanitised[field] = regexGroundTruth[field];
          regexOverrides.push(field);
          logger.debug(`AIValidator: regex overrides AI for field=${field}`, {
            category: 'ai', agentSource: AGENT,
          });
        }
      }
    }

    // 2. Hallucination pattern detection
    for (const { field, pattern } of HALLUCINATION_PATTERNS) {
      const val = sanitised[field];
      if (typeof val === 'string' && pattern.test(val)) {
        sanitised[field] = null;
        hallucinationFlags.push(`${field}:pattern_match`);
        logger.warn(`AIValidator: hallucination detected field=${field} value="${val}"`, {
          category: 'ai', agentSource: AGENT,
        });
      }
    }

    // 3. Null invented values that are suspiciously short (< 3 chars) or digits-only
    for (const field of ['suggested_client_name', 'suggested_case_number']) {
      const val = sanitised[field];
      if (typeof val === 'string') {
        if (val.trim().length < 3 || /^\d+$/.test(val.trim())) {
          sanitised[field] = null;
          hallucinationFlags.push(`${field}:implausible_value`);
        }
      }
    }

    // 4. Penalise confidence for each flag
    const penalty        = hallucinationFlags.length * 0.1 + regexOverrides.length * 0.05;
    const adjustedConf   = roundConfidence(clamp(rawConfidence - penalty, 0, 1));

    return {
      valid:              hallucinationFlags.length === 0,
      hallucinationFlags,
      regexOverrides,
      sanitised,
      adjustedConfidence: adjustedConf,
    };
  }

  /**
   * Extracts regex-authoritative fields from OCR text and filename.
   * These values take precedence over anything the AI returns.
   */
  extractRegexGroundTruth(filename: string, ocrText: string): Record<string, unknown> {
    const ground: Record<string, unknown> = {};
    const combined = `${filename}\n${ocrText.slice(0, 3000)}`;

    // Israeli case number: e.g. 1234/23, 12345-01-23
    const caseMatch = combined.match(/\b(\d{4,6}[\/\-]\d{2,4}(?:[\/\-]\d{2,4})?)\b/);
    if (caseMatch) ground['case_number'] = caseMatch[1];

    // Israeli national ID (9 digits)
    const idMatch = combined.match(/\b([0-9]{9})\b/);
    if (idMatch) ground['id_number'] = idMatch[1];

    // Document date: dd/mm/yyyy or dd.mm.yyyy
    const dateMatch = combined.match(/\b(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})\b/);
    if (dateMatch) {
      const parts = dateMatch[1]!.split(/[.\/]/);
      if (parts.length === 3) {
        ground['document_date'] = `${parts[2]!}-${parts[1]!.padStart(2,'0')}-${parts[0]!.padStart(2,'0')}`;
      }
    }

    return ground;
  }
}
