import { describe, it, expect } from 'vitest';
import { repairCitation } from '@legal-os/citation-engine';

describe('repairCitation', () => {
  it('repairs un-quoted procedure + hyphen separator + נגד', () => {
    expect(repairCitation('רעא 1234-21 כהן נגד מדינת ישראל'))
      .toBe("רע\"א 1234/21 כהן נ' מדינת ישראל");
  });
  it('repairs en-dash separator', () => {
    const result = repairCitation('ע"א 5678–19 לוי נגד שמש');
    expect(result).toContain('5678/19');
  });
  it('repairs gershayim variant', () => {
    const result = repairCitation('ע״א 1111/20 כהן נגד לוי');
    expect(result.startsWith('ע"א')).toBe(true);
  });
  it('collapses extra whitespace', () => {
    const result = repairCitation('ע"א  1234/21   כהן  נגד  לוי');
    expect(result).not.toContain('  ');
  });
  it('is idempotent on already-canonical input', () => {
    const canonical = "רע\"א 1234/21 כהן נ' מדינת ישראל";
    expect(repairCitation(canonical)).toBe(canonical);
  });
});
