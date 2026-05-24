import type { GuardrailResult } from './types.js';

// Prompt injection patterns — Hebrew and English.
// Derived from / extending the delimiter-based approach in packages/api/src/utils/prompt-security.ts
// (which strips %%BEGIN/END_OCR_TEXT%% and %%BEGIN/END_DOCUMENT_TEXT%% boundary tokens).
// Here we detect intent-based injection patterns that survive delimiter sanitization.

const INJECTION_PATTERNS: readonly RegExp[] = [
  // Hebrew: "ignore previous instructions" variants
  /התעלם\s+מ(ה)?הוראות?\s*(קודמות?|הקודמות?)/i,
  // Hebrew: "you are now" — persona hijack
  /אתה\s+עכשיו/i,
  // English: ignore previous instructions
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  // English: persona hijack
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\b/i,
  /\bpretend\s+you\s+are\b/i,
  // Model-control tokens used in Llama/Mistral/Alpaca instruction format
  /\bsystem\s*:/i,
  /\[INST\]/,
  /<<SYS>>/,
  // Unusual density: the word "JSON" repeated 3+ times suggests someone is
  // trying to coerce output format from inside the OCR content
  /(?:JSON.*?){3}/i,
  // Same for "prompt"
  /(?:\bprompt\b.*?){3}/i,
];

/**
 * Detects prompt injection patterns in OCR'd text that could manipulate the AI.
 * Returns 'fail' if any injection pattern is found, 'pass' otherwise.
 */
export function isolateInjection(ocrText: string): GuardrailResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(ocrText)) {
      return {
        status: 'fail',
        guardrail: 'injection-isolator',
        message: `Potential prompt injection detected in OCR text (matched: ${pattern.source})`,
        details: { matchedPattern: pattern.source },
      };
    }
  }

  return {
    status: 'pass',
    guardrail: 'injection-isolator',
    message: 'No prompt injection patterns detected in OCR text',
  };
}
