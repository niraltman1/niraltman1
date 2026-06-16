/**
 * Tests for /api/legal — Unified Legal Knowledge Platform routes.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { legalKnowledgeRouter } from '../legal-knowledge.js';
import { errorHandler } from '../../middleware/error.js';
import type { LegalKnowledgeService } from '../../services/legal-knowledge-service.js';

function buildMockService(): LegalKnowledgeService {
  return {
    stats: vi.fn().mockReturnValue({
      total: 42, publicCount: 40,
      bySource: [{ source: 'guychuk/case-law-israel', count: 42 }],
      byDocumentType: [{ type: 'VERDICT', count: 42 }],
      withEmbeddings: 10, citationCount: 5,
    }),
    citationStats: vi.fn().mockReturnValue({
      total: 5, resolved: 3, unresolved: 2, uniqueSources: 5,
    }),
    listSources: vi.fn().mockReturnValue([
      { sourceId: 'guychuk/case-law-israel', sourceName: 'Israeli Case Law', sourceType: 'CASE_LAW', isActive: true },
    ]),
    getSource: vi.fn().mockReturnValue({
      sourceId: 'guychuk/case-law-israel', sourceName: 'Israeli Case Law', sourceType: 'CASE_LAW',
    }),
    listDocuments: vi.fn().mockReturnValue([]),
    getDocument: vi.fn().mockReturnValue({
      documentId: 'FDOC-00000001', title: 'Test Verdict', court: 'בית המשפט העליון',
      text: 'Test text', visibilityScope: 'PUBLIC', sourceDataset: 'guychuk/case-law-israel',
    }),
    search: vi.fn().mockReturnValue([
      { documentId: 'FDOC-00000001', title: 'Test', court: 'עליון', snippet: '...test...', rank: -1 },
    ]),
    getCitationsFrom: vi.fn().mockReturnValue([{ id: 1, citationText: 'בג"ץ 1/99' }]),
    getCitationsTo:   vi.fn().mockReturnValue([]),
    topCitedDocuments: vi.fn().mockReturnValue([]),
    getIngestionProgress: vi.fn().mockReturnValue({ sourceId: 'guychuk/case-law-israel', status: 'IDLE', processed: 0 }),
    getAllProgress: vi.fn().mockReturnValue([]),
  } as unknown as LegalKnowledgeService;
}

function buildApp(svc: LegalKnowledgeService) {
  const app = express();
  app.use(express.json());
  app.use('/api/legal', legalKnowledgeRouter(svc));
  app.use(errorHandler);
  return app;
}

describe('GET /api/legal/stats', () => {
  it('returns corpus stats and citation stats', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.stats.total).toBe(42);
    expect(res.body.data.citationStats).toBeDefined();
  });
});

describe('GET /api/legal/sources', () => {
  it('returns list of registered sources', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/sources');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].sourceId).toBe('guychuk/case-law-israel');
  });
});

describe('GET /api/legal/sources/:sourceId', () => {
  it('returns a single source by ID', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/sources/guychuk%2Fcase-law-israel');
    expect(res.status).toBe(200);
    expect(res.body.data.sourceId).toBe('guychuk/case-law-israel');
  });

  it('returns 404 for unknown source', async () => {
    const svc = buildMockService();
    (svc.getSource as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await request(buildApp(svc)).get('/api/legal/sources/unknown-source');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/legal/documents', () => {
  it('returns document list', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/documents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts limit and offset params', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/documents?limit=10&offset=20');
    expect(res.status).toBe(200);
    expect(svc.listDocuments).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
  });

  it('rejects invalid limit with 422', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/documents?limit=abc');
    expect(res.status).toBe(422);
  });
});

describe('GET /api/legal/documents/:documentId', () => {
  it('returns a document by FDOC ID', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/documents/FDOC-00000001');
    expect(res.status).toBe(200);
    expect(res.body.data.documentId).toBe('FDOC-00000001');
  });

  it('returns 422 for non-FDOC IDs', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/documents/not-fdoc-format');
    expect(res.status).toBe(422);
  });

  it('returns 404 when document not found', async () => {
    const svc = buildMockService();
    (svc.getDocument as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await request(buildApp(svc)).get('/api/legal/documents/FDOC-99999999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/legal/search', () => {
  it('returns search hits', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/search?q=%D7%A4%D7%A1%D7%99%D7%A7%D7%94');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].documentId).toBe('FDOC-00000001');
  });

  it('returns 422 without q param', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/search');
    expect(res.status).toBe(422);
  });

  it('returns 422 with empty q param', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/search?q=');
    expect(res.status).toBe(422);
  });
});

describe('GET /api/legal/citations/:documentId', () => {
  it('returns citations from and to a document', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/citations/FDOC-00000001');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('from');
    expect(res.body.data).toHaveProperty('to');
  });

  it('returns 422 for non-FDOC IDs', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/citations/invalid-id');
    expect(res.status).toBe(422);
  });
});

describe('GET /api/legal/graph/top-cited', () => {
  it('returns top cited documents', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/graph/top-cited');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/legal/ingestion/progress', () => {
  it('returns all progress when no source filter', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/ingestion/progress');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns single source progress when source filter provided', async () => {
    const svc = buildMockService();
    const res = await request(buildApp(svc)).get('/api/legal/ingestion/progress?source=guychuk%2Fcase-law-israel');
    expect(res.status).toBe(200);
    expect(res.body.data.sourceId).toBe('guychuk/case-law-israel');
  });
});
