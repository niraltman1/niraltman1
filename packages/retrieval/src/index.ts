export type { Chunk } from './chunker.js';
export { chunkDocument } from './chunker.js';
export { embed, cosineSimilarity } from './embedder.js';
export { indexDocument } from './indexer.js';
export type { IndexResult } from './indexer.js';
export { hybridSearch } from './hybrid-search.js';
export type { SearchResult } from './hybrid-search.js';
export { deterministicSearch } from './deterministic-wrapper.js';
export { createCaseScopedRetriever } from './case-scoped-retriever.js';
export type { CaseScopedRetriever } from './case-scoped-retriever.js';
export { searchLegalSections } from './legal-section-search.js';
export type { LegalSectionResult } from './legal-section-search.js';
export { rerank, rerankWithCrossEncoder } from './reranker.js';
export type {
  RerankCandidate,
  RerankContext,
  RerankedResult,
  RerankFactors,
  AuthoritySignal,
} from './reranker.js';
