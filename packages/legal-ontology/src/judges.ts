const HONORIFIC_RE = /(?:כב[׳']?\.?\s*)?(?:ה)?שופט(?:ת)?\s*|ד[״"]ר\s+(?:ה)?שופט(?:ת)?\s*|כבוד(?:\s+ה)?שופט(?:ת)?\s*/gi;

export function normalizeJudge(raw: string): string {
  return raw.replace(HONORIFIC_RE, '').trim();
}
