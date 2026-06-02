export type { EntityKind, LegalEntity, CourtLevel } from './types.js';
export { COURT_LEVELS, normalizeCourt, courtRank } from './courts.js';
export { normalizeJudge } from './judges.js';
export { LEGAL_SYNONYM_GROUPS, getSynonymExpansions } from './synonyms.js';
export { normalizeEntity } from './normalizer.js';
export { findEntityByAlias, getRelatedEntities, upsertEntity, upsertRelation } from './graph.js';
