import { createHash } from 'node:crypto';
import type { LegalSourceType } from '@factum-il/database';
import type { ValidLaw } from './odata-registry.js';
import type { WikiResolution } from './wiki-resolve.js';
import type { ArtifactRecord } from './artifact.js';
import { parseLawHtml } from './wiki-parse.js';
import { inferProcedureDomain } from './domain-classify.js';

/** Infer the corpus source_type CHECK value from the Hebrew law-name prefix. */
export function inferSourceType(name: string): LegalSourceType {
  const n = name.trim();
  if (n.startsWith('פקודת')) return 'ordinance';
  if (n.startsWith('תקנות')) return 'regulation';
  if (n.startsWith('כללי') || n.startsWith('תקנון')) return 'rules';
  return 'statute';
}

/** Short name = the law name up to (but excluding) the first comma / year clause. */
export function shortName(name: string): string {
  const i = name.indexOf(',');
  return (i > 0 ? name.slice(0, i) : name).trim();
}

function contentHash(sections: { sectionLabel: string; verbatimText: string }[]): string {
  return createHash('sha256')
    .update(sections.map((s) => `${s.sectionLabel} ${s.verbatimText}`).join(''), 'utf-8')
    .digest('hex');
}

/**
 * Combine OData registry metadata with the (optional) verbatim WikiSource HTML into a single
 * artifact record. A law with no ID-verified WikiSource page (or no parseable text) becomes a
 * metadata-only record — a registry row with zero sections. Text is never fabricated.
 * Embeddings are left empty here and filled by the entry script when `--embed` is set.
 */
export function structureLaw(law: ValidLaw, resolved: WikiResolution): ArtifactRecord {
  const base = {
    schemaVersion: 1 as const,
    sourceKey:   `il_law_${law.israelLawId}`,
    israelLawId: law.israelLawId,
    titleHe:     law.name,
    shortName:   shortName(law.name),
    sourceType:      inferSourceType(law.name),
    procedureDomain: inferProcedureDomain(law.name),
    year:        law.year,
    lastUpdated: law.lastUpdated,
    magarId:     resolved.magarId ?? null,
    embeddings:  [] as ArtifactRecord['embeddings'],
  };

  if (!resolved.matched || !resolved.html) {
    return { ...base, sourceUrl: null, status: 'metadata_only', contentHash: null, sections: [] };
  }

  const sections = parseLawHtml(resolved.html);
  if (sections.length === 0) {
    return { ...base, sourceUrl: resolved.pageUrl ?? null, status: 'metadata_only', contentHash: null, sections: [] };
  }

  return {
    ...base,
    sourceUrl:   resolved.pageUrl ?? null,
    status:      'ingested',
    contentHash: contentHash(sections),
    sections,
  };
}
