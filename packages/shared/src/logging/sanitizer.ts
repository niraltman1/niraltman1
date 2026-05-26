const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{9}\b/g, '[ID_NUMBER]'],
  [/\b05\d[-\s]?\d{7}\b/g, '[PHONE]'],
  [/\b0[23489]-?\d{7}\b/g, '[PHONE]'],
  [/\+972[-\s]?\d{1,2}[-\s]?\d{7}/g, '[PHONE]'],
  [/\bIL\d{21}\b/g, '[IBAN]'],
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  [/"id_number"\s*:\s*"[^"]*"/g, '"id_number":"[REDACTED]"'],
  [/"phone"\s*:\s*"[^"]*"/g, '"phone":"[REDACTED]"'],
  [/"whatsapp_phone"\s*:\s*"[^"]*"/g, '"whatsapp_phone":"[REDACTED]"'],
  [/"driving_license_number"\s*:\s*"[^"]*"/g, '"driving_license_number":"[REDACTED]"'],
  [/"password"\s*:\s*"[^"]*"/g, '"password":"[REDACTED]"'],
  [/"password_hash"\s*:\s*"[^"]*"/g, '"password_hash":"[REDACTED]"'],
  [/"token"\s*:\s*"[^"]*"/g, '"token":"[REDACTED]"'],
  [/"token_hash"\s*:\s*"[^"]*"/g, '"token_hash":"[REDACTED]"'],
];

export function sanitizeForLog(input: string): string {
  let result = input;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// Strip PII-bearing query params from URLs before logging
const SENSITIVE_PARAMS = ['idNumber', 'id_number', 'phone', 'email', 'q', 'search', 'password', 'token'];

export function sanitizeUrlForLog(url: string): string {
  // Only process strings that look like URL paths (must start with /)
  if (!url.startsWith('/')) return url;
  try {
    const u = new URL(url, 'http://localhost');
    let hasSensitive = false;
    for (const param of SENSITIVE_PARAMS) {
      if (u.searchParams.has(param)) {
        u.searchParams.set(param, 'REDACTED');
        hasSensitive = true;
      }
    }
    if (!hasSensitive) return url;
    // Decode the search string so REDACTED is not URL-encoded
    const search = u.search ? decodeURIComponent(u.search).replace(/REDACTED/g, '[REDACTED]') : '';
    return u.pathname + search;
  } catch {
    return url;
  }
}
