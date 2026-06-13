import { createHash } from 'node:crypto';
import { logger } from '@factum-il/shared';
import type { DatabaseConnection } from '../connection.js';

const CACHE_TTL_MS = 60_000;

export interface SearchOptions {
  readonly limit?:    number;
  readonly entities?: Array<'documents' | 'clients' | 'cases' | 'legislation' | 'drafts' | 'precedents'>;
  readonly filter?: {
    readonly documentType?:    string;
    readonly processingState?: string;
    readonly clientId?:        number;
    readonly caseId?:          number;
    readonly dateFrom?:        string;   // ISO 8601
    readonly dateTo?:          string;
    readonly minConfidence?:   number;
    readonly language?:        string;
  };
  readonly boosts?: {
    readonly recentDays?: number;
    readonly caseOpen?:   number;
  };
}

export interface SearchHit {
  readonly entityType: 'document' | 'client' | 'case' | 'legislation' | 'draft' | 'precedent';
  readonly id:         number;
  readonly rank:       number;
  readonly snippet:    string;
  readonly title:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hebrew prefix normalization
//  Common conjunctive/preposition prefixes attached to words in Hebrew:
//    ו (and), ב (in), ל (to/for), מ (from), כ (like/as), ש (that),
//    ה (the definite article — kept separately as it changes semantics less)
// ─────────────────────────────────────────────────────────────────────────────

// Single-character prefixes that are safely strippable for search
const HE_CONJUNCTIVE = /^[ובלמכש]/;
// Two-character compound prefixes (ש+preposition)
const HE_COMPOUND    = /^(?:שב|של|שמ|שכ|שה|מה|ממ)/;
// Legal-specific synonym expansion (search term → additional terms to OR)
const LEGAL_SYNONYMS: Record<string, string[]> = {
  חוזה:  ['הסכם', 'עסקה'],
  הסכם:  ['חוזה', 'עסקה'],
  פסיקה: ['פסק', 'דין', 'פסק-דין'],
  תביעה: ['תלונה', 'ערעור'],
  צוואה: ['ירושה', 'עיזבון'],
  שכירות: ['חכירה', 'שכר-דירה'],
  ייפוי:  ['ייפוי-כח', 'יפוי כח'],
};

export class SearchEngine {
  constructor(private readonly db: DatabaseConnection) {}

  // ───────────────────────────────────────────────
  //  Main entry point
  // ───────────────────────────────────────────────

  search(rawQuery: string, opts: SearchOptions = {}): SearchHit[] {
    const normalised = this.normaliseHebrew(rawQuery.trim());
    if (normalised.length === 0) return [];

    const cacheKey = this.cacheKey(normalised, opts);
    const cached   = this.getCached(cacheKey);
    if (cached) return cached;

    const limit    = opts.limit ?? 50;
    const entities = opts.entities ?? ['documents', 'clients', 'cases', 'legislation', 'drafts', 'precedents'];
    const hits: SearchHit[] = [];

    // Build prefix-stripped + synonym-expanded FTS query
    const ftsQuery = this.buildFTSQuery(normalised);

    // Query-planner: apply indexed metadata pre-filter when filters are specified
    const docIdFilter = opts.filter ? this.resolveDocIdFilter(opts.filter, limit * 5) : null;

    if (entities.includes('cases')) {
      hits.push(...this.searchCases(ftsQuery, limit));
    }
    if (entities.includes('clients')) {
      hits.push(...this.searchClients(ftsQuery, limit));
    }
    if (entities.includes('documents')) {
      hits.push(...this.searchDocuments(ftsQuery, limit, opts.boosts?.recentDays, docIdFilter));
    }
    if (entities.includes('legislation')) {
      hits.push(...this.searchLegislation(ftsQuery, limit));
    }
    if (entities.includes('drafts')) {
      hits.push(...this.searchDrafts(ftsQuery, limit));
    }
    if (entities.includes('precedents')) {
      hits.push(...this.searchPrecedents(ftsQuery, limit));
    }

    const seen = new Set<string>();
    const ranked = hits
      .sort((a, b) => b.rank - a.rank)
      .filter((h) => {
        const key = `${h.entityType}:${h.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    if (ranked.length > 0) {
      this.cacheResults(cacheKey, ranked, normalised);
    }

    logger.debug(`Search: "${normalised}" → ${ranked.length} hits`, {
      category: 'system', agentSource: 'SearchEngine',
    });

    return ranked;
  }

  // ───────────────────────────────────────────────
  //  Hebrew normalisation
  // ───────────────────────────────────────────────

  normaliseHebrew(text: string): string {
    return text
      .replace(/[ְ-ׇ]/g, '')  // strip nikud (full block)
      .replace(/[׳״]/g, '')   // strip geresh/gershayim
      .replace(/[׳״]/g, '')             // ASCII-range lookalikes
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ───────────────────────────────────────────────
  //  FTS query builder with prefix normalisation + synonym expansion
  // ───────────────────────────────────────────────

  buildFTSQuery(normalised: string): string {
    const tokens = normalised.split(/\s+/).filter((w) => w.length > 0);
    const clean = (v: string) => v.replace(/["()*]/g, '').trim();

    // Single-token path: can safely use OR between prefix variants.
    // FTS5 does NOT support parenthesised OR groups like (A* OR B*), so for
    // multi-token queries we fall back to one prefix term per input token
    // (preserving implicit-AND semantics) to avoid a syntax error.
    if (tokens.length === 1) {
      const token   = tokens[0]!;
      const variants = new Set<string>([token]);

      const stripped = token.replace(HE_COMPOUND, '').replace(HE_CONJUNCTIVE, '');
      if (stripped !== token && stripped.length >= 2) variants.add(stripped);

      if (!token.startsWith('ה') && stripped.length >= 2) {
        variants.add(`ה${stripped}`);
      }

      const syns = LEGAL_SYNONYMS[token] ?? LEGAL_SYNONYMS[stripped] ?? [];
      for (const s of syns) variants.add(s);

      return [...variants].map((v) => `${clean(v)}*`).join(' OR ');
    }

    // Multi-token path: one prefix term per token, space-joined (implicit AND).
    return tokens.map((t) => `${clean(t)}*`).join(' ');
  }

  // ───────────────────────────────────────────────
  //  Query planner — indexed pre-filter via SearchMeta
  // ───────────────────────────────────────────────

  private resolveDocIdFilter(
    filter: NonNullable<SearchOptions['filter']>,
    maxIds: number,
  ): number[] | null {
    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (filter.documentType)    { conditions.push('document_type = ?');    params.push(filter.documentType); }
    if (filter.processingState) { conditions.push('processing_state = ?'); params.push(filter.processingState); }
    if (filter.clientId)        { conditions.push('client_id = ?');        params.push(filter.clientId); }
    if (filter.caseId)          { conditions.push('case_id = ?');          params.push(filter.caseId); }
    if (filter.dateFrom)        { conditions.push('document_date >= ?');   params.push(filter.dateFrom); }
    if (filter.dateTo)          { conditions.push('document_date <= ?');   params.push(filter.dateTo); }
    if (filter.minConfidence)   { conditions.push('confidence >= ?');      params.push(filter.minConfidence); }
    if (filter.language)        { conditions.push('language = ?');         params.push(filter.language); }

    if (conditions.length === 0) return null;

    try {
      const sql = `
        SELECT document_id FROM SearchMeta
        WHERE ${conditions.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT ?
      `;
      const rows = this.db.prepare(sql).all(...params, maxIds) as { document_id: number }[];
      return rows.map((r) => r.document_id);
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────────
  //  Per-entity search queries
  // ───────────────────────────────────────────────

  private searchDocuments(
    ftsQuery: string,
    limit: number,
    recentDays?: number,
    docIdFilter?: number[] | null,
  ): SearchHit[] {
    try {
      // Guard against SQL injection via arithmetic interpolation: coerce to safe integer.
      const safeDays = recentDays !== undefined && Number.isFinite(Number(recentDays)) && Number(recentDays) > 0
        ? Math.floor(Number(recentDays))
        : undefined;

      const recencyBoost = safeDays
        ? `+ (CASE WHEN d.created_at >= datetime('now', '-${safeDays} days') THEN 2.0 ELSE 0.0 END)`
        : '';

      // Use parameterized placeholders — never interpolate ID arrays into SQL strings.
      const idFilter = docIdFilter && docIdFilter.length > 0 ? docIdFilter : null;
      const idClause = idFilter
        ? `AND d.id IN (${idFilter.map(() => '?').join(',')})`
        : '';

      const rows = this.db.prepare(`
        SELECT d.id, d.filename, d.document_type, fts.rank
               ${recencyBoost ? ', (ABS(fts.rank) ' + recencyBoost + ') AS adj_rank' : ', ABS(fts.rank) AS adj_rank'}
          FROM fts_documents fts
          JOIN Documents d ON d.id = fts.rowid
         WHERE fts_documents MATCH ?
           AND d.processing_state NOT IN ('DISCOVERED','FAILED','ROLLED_BACK')
           ${idClause}
         ORDER BY adj_rank DESC
         LIMIT ?
      `).all(ftsQuery, ...(idFilter ?? []), limit) as Record<string, unknown>[];

      return rows.map((r) => ({
        entityType: 'document' as const,
        id:         Number(r['id']),
        rank:       Number(r['adj_rank'] ?? r['rank'] ?? 0),
        snippet:    String(r['filename'] ?? ''),
        title:      String(r['filename'] ?? ''),
      }));
    } catch {
      return [];
    }
  }

  private searchClients(ftsQuery: string, limit: number): SearchHit[] {
    try {
      const rows = this.db.prepare(`
        SELECT c.id, c.name_he, c.id_number, ABS(fts.rank) AS adj_rank
          FROM fts_clients fts
          JOIN Clients c ON c.id = fts.rowid
         WHERE fts_clients MATCH ?
           AND c.is_active = 1
         ORDER BY adj_rank DESC
         LIMIT ?
      `).all(ftsQuery, limit) as Record<string, unknown>[];

      return rows.map((r) => ({
        entityType: 'client' as const,
        id:         Number(r['id']),
        rank:       Number(r['adj_rank'] ?? 0) + 1.5,
        snippet:    String(r['name_he'] ?? ''),
        title:      String(r['name_he'] ?? ''),
      }));
    } catch {
      return [];
    }
  }

  private searchCases(ftsQuery: string, limit: number): SearchHit[] {
    try {
      const rows = this.db.prepare(`
        SELECT ca.id, ca.title_he, ca.case_number, ca.status, ABS(fts.rank) AS adj_rank
          FROM fts_cases fts
          JOIN Cases ca ON ca.id = fts.rowid
         WHERE fts_cases MATCH ?
         ORDER BY
           CASE ca.status WHEN 'open' THEN 0 ELSE 1 END,
           adj_rank DESC
         LIMIT ?
      `).all(ftsQuery, limit) as Record<string, unknown>[];

      return rows.map((r) => ({
        entityType: 'case' as const,
        id:         Number(r['id']),
        rank:       Number(r['adj_rank'] ?? 0) + 2.0,
        snippet:    String(r['case_number'] ?? ''),
        title:      `${r['case_number'] ?? ''} – ${r['title_he'] ?? ''}`,
      }));
    } catch {
      return [];
    }
  }

  private searchLegislation(ftsQuery: string, limit: number): SearchHit[] {
    try {
      const rows = this.db.prepare(`
        SELECT ls.id, ls.heading_he, ls.verbatim_text_he, ABS(fts.rank) AS adj_rank,
               src.short_name
          FROM fts_legal_sections fts
          JOIN LegalSections ls  ON ls.id = fts.rowid
          JOIN LegalSources  src ON src.id = ls.source_id
         WHERE fts_legal_sections MATCH ?
           AND src.is_active = 1
         ORDER BY adj_rank DESC
         LIMIT ?
      `).all(ftsQuery, limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        entityType: 'legislation' as const,
        id:         Number(r['id']),
        rank:       Number(r['adj_rank'] ?? 0),
        snippet:    String(r['verbatim_text_he'] ?? '').slice(0, 200),
        title:      `${r['short_name'] ?? ''} · ${r['heading_he'] ?? ''}`,
      }));
    } catch {
      return [];
    }
  }

  private searchDrafts(ftsQuery: string, limit: number): SearchHit[] {
    try {
      const rows = this.db.prepare(`
        SELECT d.id, d.title, d.content_html, d.updated_at
          FROM LegalDrafts d
         WHERE d.is_active = 1
           AND (d.title LIKE '%' || ? || '%' OR d.content_html LIKE '%' || ? || '%')
         ORDER BY d.updated_at DESC
         LIMIT ?
      `).all(ftsQuery.replace(/"/g, '').replace(/\*/g, ''), ftsQuery.replace(/"/g, '').replace(/\*/g, ''), limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        entityType: 'draft' as const,
        id:         Number(r['id']),
        rank:       0.5,
        snippet:    String(r['title'] ?? ''),
        title:      String(r['title'] ?? ''),
      }));
    } catch {
      return [];
    }
  }

  private searchPrecedents(ftsQuery: string, limit: number): SearchHit[] {
    try {
      const rows = this.db.prepare(`
        SELECT id, citation, summary_he, ABS(rank) AS adj_rank
          FROM legal_precedents
         WHERE citation LIKE '%' || ? || '%'
            OR summary_he LIKE '%' || ? || '%'
         ORDER BY adj_rank ASC
         LIMIT ?
      `).all(ftsQuery.replace(/"/g, '').replace(/\*/g, ''), ftsQuery.replace(/"/g, '').replace(/\*/g, ''), limit) as Record<string, unknown>[];
      return rows.map((r) => ({
        entityType: 'precedent' as const,
        id:         Number(r['id']),
        rank:       1.0,
        snippet:    String(r['summary_he'] ?? '').slice(0, 200),
        title:      String(r['citation'] ?? ''),
      }));
    } catch {
      return [];
    }
  }

  // ───────────────────────────────────────────────
  //  Result cache
  // ───────────────────────────────────────────────

  private cacheKey(query: string, opts: SearchOptions): string {
    return createHash('sha256')
      .update(JSON.stringify({ query, opts }))
      .digest('hex');
  }

  private getCached(queryHash: string): SearchHit[] | null {
    try {
      const row = this.db.prepare(
        "SELECT result_ids_json FROM SearchRankingCache WHERE query_hash = ? AND expires_at > datetime('now')",
      ).get(queryHash) as { result_ids_json: string } | undefined;
      return row ? JSON.parse(row.result_ids_json) as SearchHit[] : null;
    } catch {
      return null;
    }
  }

  private cacheResults(queryHash: string, results: SearchHit[], queryText: string): void {
    try {
      const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      this.db.prepare(`
        INSERT OR REPLACE INTO SearchRankingCache
          (query_hash, query_text, result_ids_json, total_hits, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(queryHash, queryText, JSON.stringify(results), results.length, expires);
    } catch { /* non-fatal */ }
  }
}
