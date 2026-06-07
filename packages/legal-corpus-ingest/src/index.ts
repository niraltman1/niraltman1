export { runIngestion } from './run.js';
export type { RunOptions, RunSummary } from './run.js';
export { inferProcedureDomain, ALL_DOMAINS } from './domain-classify.js';
export type { LegalDomain } from './domain-classify.js';
export { parseLawHtml, htmlToText, extractMainContent } from './wiki-parse.js';
export {
  iterateValidLaws,
  countValidLaws,
  buildRegistryUrl,
  absolutizeNextLink,
  ODATA_BASE,
} from './odata-registry.js';
export type { ValidLaw } from './odata-registry.js';
export { resolveLaw, candidateTitle, candidateTitles } from './wiki-resolve.js';
export type { WikiResolution } from './wiki-resolve.js';
export { structureLaw, inferSourceType, shortName } from './structure.js';
export { ArtifactWriter } from './artifact.js';
export type { ArtifactRecord, EmbeddingRec } from './artifact.js';
export { ingestSupremeCourtCorpus, parseJudges } from './supreme-court-ingest.js';
export type {
  SupremeCourtSourceRecord,
  IngestSupremeCourtOptions,
  IngestSupremeCourtSummary,
  IngestDbHandle,
} from './supreme-court-ingest.js';
