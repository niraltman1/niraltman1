import type { GuardrailResult } from './types.js';

/**
 * Israeli ID (ת.ז.) check digit algorithm:
 *
 * Given a 9-digit number, multiply each digit alternately by 1 and 2
 * (positions 0,2,4,6,8 × 1; positions 1,3,5,7 × 2).
 * If the product of a single digit exceeds 9, sum its digits (i.e., subtract 9).
 * Sum all adjusted values. The result must be divisible by 10.
 *
 * This is equivalent to the Luhn algorithm applied to a 9-digit string.
 */
function isIsraeliId(digits: string): boolean {
  if (digits.length !== 9) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const charCode = digits.charCodeAt(i);
    // Reject non-digit characters
    if (charCode < 48 || charCode > 57) return false;

    let val = (charCode - 48) * (i % 2 === 0 ? 1 : 2);
    // If the product exceeds a single digit, subtract 9 (same as summing its digits)
    if (val > 9) val -= 9;
    sum += val;
  }

  return sum % 10 === 0;
}

// Matches any run of exactly 9 consecutive ASCII digits (not part of a longer digit string)
const NINE_DIGIT_RE = /(?<!\d)(\d{9})(?!\d)/g;

/**
 * Returns the text with all valid Israeli ID numbers replaced with '[ID REDACTED]'.
 * Never throws — always returns a string.
 */
export function shieldPrivileged(text: string): string {
  return text.replace(NINE_DIGIT_RE, (match) => {
    return isIsraeliId(match) ? '[ID REDACTED]' : match;
  });
}

/**
 * Checks whether the text contains any Israeli ID numbers.
 * Returns 'warn' if found, 'pass' otherwise.
 */
export function checkPrivilege(text: string): GuardrailResult {
  const matches: string[] = [];

  // Reset lastIndex because the regex has the 'g' flag and may be reused
  let match: RegExpExecArray | null;
  const re = /(?<!\d)(\d{9})(?!\d)/g;
  while ((match = re.exec(text)) !== null) {
    const candidate = match[1];
    if (candidate !== undefined && isIsraeliId(candidate)) {
      matches.push(candidate);
    }
  }

  if (matches.length > 0) {
    return {
      status: 'warn',
      guardrail: 'privilege-shield',
      message: `Found ${matches.length} Israeli ID number(s) in text — attorney-client privilege risk`,
      details: { count: matches.length },
    };
  }

  return {
    status: 'pass',
    guardrail: 'privilege-shield',
    message: 'No privileged identifiers detected',
  };
}
