import type { ExtractionPayload, GuardrailContext, GuardrailResult } from './types.js';

// Israeli legal citation patterns from CLAUDE.md
// Order matters — more specific patterns first (e.g. ת"פ before תא)
const CITATION_PATTERNS: RegExp[] = [
  // Civil — Magistrate: תא-YYYY-NNN
  /^תא-\d{4}-\d+$/,
  // Criminal: ת"פ-YYYY-NNN
  /^ת"פ-\d{4}-\d+$/,
  // Supreme Court (HCJ): בג"ץ NNNN/YY
  /^בג"ץ \d+\/\d{2}$/,
  // Civil Appeal: ע"א NNNN/YY
  /^ע"א \d+\/\d{2}$/,
  // Labor: עב-YYYY-NNN
  /^עב-\d{4}-\d+$/,
  // Family: תמש-YYYY-NNN
  /^תמש-\d{4}-\d+$/,
  // Administrative: עת"מ-YYYY-NNN
  /^עת"מ-\d{4}-\d+$/,
];

function matchesKnownPattern(caseNumber: string): boolean {
  return CITATION_PATTERNS.some((re) => re.test(caseNumber));
}

/**
 * Verifies that extracted caseNumber matches a known Israeli legal citation pattern
 * and is actually present in the ocrText.
 *
 * - 'pass' if caseNumber is null (nothing to verify) OR matches pattern AND found in text
 * - 'warn' if caseNumber matches pattern but NOT found in ocrText
 * - 'fail' if caseNumber is non-null but matches no known pattern
 */
export function verifyCitation(
  payload: ExtractionPayload,
  ctx: GuardrailContext,
): GuardrailResult {
  const { caseNumber } = payload;

  if (caseNumber === null) {
    return {
      status: 'pass',
      guardrail: 'citation-verifier',
      message: 'No case number to verify',
    };
  }

  if (!matchesKnownPattern(caseNumber)) {
    return {
      status: 'fail',
      guardrail: 'citation-verifier',
      message: `Case number "${caseNumber}" does not match any known Israeli citation pattern`,
      details: { caseNumber },
    };
  }

  // Pattern matched — now check it exists in the source text
  if (!ctx.ocrText.includes(caseNumber)) {
    return {
      status: 'warn',
      guardrail: 'citation-verifier',
      message: `Case number "${caseNumber}" matches a known pattern but was not found in the source text — AI may have matched the wrong document`,
      details: { caseNumber },
    };
  }

  return {
    status: 'pass',
    guardrail: 'citation-verifier',
    message: `Case number "${caseNumber}" is valid and present in source text`,
  };
}
