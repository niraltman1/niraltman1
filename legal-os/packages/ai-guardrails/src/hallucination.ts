import type { ExtractionPayload, GuardrailContext, GuardrailResult } from './types.js';

// Fields that are direct quotes from the document — must appear in OCR text.
// procedureType and documentType are AI classifications, not direct quotes — skip them.
const VERIFIABLE_STRING_FIELDS = [
  'caseNumber',
  'courtName',
  'judgeName',
  'offenseType',
  'nextHearing',
] as const;

type VerifiableField = (typeof VERIFIABLE_STRING_FIELDS)[number];

/**
 * Hallucination detection: checks that each non-null string field from
 * ExtractionPayload is a substring of ocrText (case-insensitive).
 * A field present in the payload but absent from ocrText is flagged as hallucinated.
 * confidence < 0.7 triggers 'warn'; a missing field triggers 'fail'.
 */
export function detectHallucination(
  payload: ExtractionPayload,
  ctx: GuardrailContext,
): GuardrailResult {
  const lowerOcr = ctx.ocrText.toLowerCase();
  const hallucinatedFields: string[] = [];

  for (const field of VERIFIABLE_STRING_FIELDS) {
    const value = payload[field as VerifiableField];
    if (value === null) continue;
    if (!lowerOcr.includes(value.toLowerCase())) {
      hallucinatedFields.push(field);
    }
  }

  // Also check individual charge strings
  for (const charge of payload.charges) {
    if (charge && !lowerOcr.includes(charge.toLowerCase())) {
      hallucinatedFields.push(`charges["${charge}"]`);
    }
  }

  if (hallucinatedFields.length > 0) {
    return {
      status: 'fail',
      guardrail: 'hallucination',
      message: `Extracted fields not found in source text: ${hallucinatedFields.join(', ')}`,
      details: { hallucinatedFields },
    };
  }

  if (payload.confidence < 0.7) {
    return {
      status: 'warn',
      guardrail: 'hallucination',
      message: `Low confidence (${payload.confidence.toFixed(2)}) — extraction may be unreliable`,
      details: { confidence: payload.confidence },
    };
  }

  return {
    status: 'pass',
    guardrail: 'hallucination',
    message: 'All extracted fields verified in source text',
  };
}
