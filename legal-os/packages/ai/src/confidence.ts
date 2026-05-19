import { CONFIDENCE_THRESHOLD, clamp, roundConfidence } from '@legal-os/shared';
import type { ConfidenceScore } from '@legal-os/shared';

export interface ConfidenceInputs {
  ocrConfidence:           number;  // 0–1 from Tesseract
  regexMatchCount:         number;  // number of regex patterns that fired
  regexPossibleCount:      number;  // total patterns attempted
  aiResponseConfidence:    number;  // 0–1 from AI response
  crossDocumentMatches:    number;  // number of corroborating documents
  fieldsPopulated:         number;  // how many metadata fields have values
  totalFields:             number;  // total expected metadata fields
}

const WEIGHTS = {
  ocrQuality:             0.25,
  regexCertainty:         0.30,
  aiConsistency:          0.20,
  crossDocument:          0.15,
  metadataCompleteness:   0.10,
} as const;

/**
 * Computes a deterministic confidence score from multiple signals.
 * AI confidence NEVER overrides regex authority.
 */
export class ConfidenceCalculator {
  calculate(inputs: ConfidenceInputs): ConfidenceScore {
    const ocrQuality = clamp(inputs.ocrConfidence, 0, 1);

    const regexCertainty = inputs.regexPossibleCount > 0
      ? clamp(inputs.regexMatchCount / inputs.regexPossibleCount, 0, 1)
      : 0;

    // AI is advisory only; cap its contribution at 80% of its nominal weight
    const aiConsistency = clamp(inputs.aiResponseConfidence * 0.8, 0, 1);

    const crossDocumentValidation = clamp(
      inputs.crossDocumentMatches > 0
        ? Math.min(inputs.crossDocumentMatches / 3, 1)  // saturates at 3 corroborators
        : 0,
      0, 1,
    );

    const metadataCompleteness = inputs.totalFields > 0
      ? clamp(inputs.fieldsPopulated / inputs.totalFields, 0, 1)
      : 0;

    const total = roundConfidence(
      ocrQuality            * WEIGHTS.ocrQuality           +
      regexCertainty        * WEIGHTS.regexCertainty        +
      aiConsistency         * WEIGHTS.aiConsistency         +
      crossDocumentValidation * WEIGHTS.crossDocument       +
      metadataCompleteness  * WEIGHTS.metadataCompleteness,
    );

    return {
      total,
      ocrQuality:            roundConfidence(ocrQuality),
      regexCertainty:        roundConfidence(regexCertainty),
      aiConsistency:         roundConfidence(aiConsistency),
      crossDocumentValidation: roundConfidence(crossDocumentValidation),
      metadataCompleteness:  roundConfidence(metadataCompleteness),
      meetsThreshold:        total >= CONFIDENCE_THRESHOLD,
    };
  }
}
