import { describe, it, expect } from 'vitest';
import { buildRegistryUrl, absolutizeNextLink, ODATA_BASE } from '../odata-registry.js';

describe('odata-registry URL building', () => {
  it('filters on the valid-law literal and never sends $orderby', () => {
    const url = buildRegistryUrl();
    // 'תקף' URL-encoded, single-quoted inside the filter.
    expect(url).toContain('%D7%AA%D7%A7%D7%A3');
    expect(decodeURIComponent(url)).toContain("LawValidityDesc eq 'תקף'");
    expect(url).toContain('$format=json');
    expect(url).not.toContain('$orderby'); // $orderby suppresses @odata.nextLink — must be absent
  });

  it('selects only the registry fields we need', () => {
    const decoded = decodeURIComponent(buildRegistryUrl());
    for (const f of ['IsraelLawID', 'Name', 'LastUpdatedDate']) expect(decoded).toContain(f);
  });

  it('resolves a relative nextLink against the base and preserves $format=json', () => {
    const next = "KNS_IsraelLaw?$filter=x&$skiptoken=guid'abc'";
    const abs = absolutizeNextLink(next, ODATA_BASE);
    expect(abs.startsWith(`${ODATA_BASE}/`)).toBe(true);
    expect(abs).toContain('$format=json');
  });

  it('passes an absolute nextLink through (still ensuring json format)', () => {
    const abs = absolutizeNextLink('https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_IsraelLaw?$skiptoken=1');
    expect(abs.startsWith('https://knesset.gov.il/')).toBe(true);
    expect(abs).toContain('$format=json');
  });
});
