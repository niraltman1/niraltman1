import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { casesRouter } from '../cases.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Cases (id INTEGER PRIMARY KEY, case_number TEXT, title_he TEXT, case_type TEXT, court_name TEXT, registry_status TEXT, created_at TEXT DEFAULT '2026-01-01');
`;

describe('casesRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let fakeCases: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByClientId: ReturnType<typeof vi.fn>;
  };
  let fakeContacts: { getForCase: ReturnType<typeof vi.fn>; linkToCase: ReturnType<typeof vi.fn>; unlinkFromCase: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    fakeCases = {
      list:           vi.fn().mockReturnValue({ items: [], total: 0 }),
      create:         vi.fn().mockImplementation((input: Record<string, unknown>) => ({ id: 1, ...input })),
      findById:       vi.fn().mockReturnValue({ id: 1, caseNumber: 'תא-2024-042' }),
      findByClientId: vi.fn().mockReturnValue([]),
    };
    fakeContacts = {
      getForCase:     vi.fn().mockReturnValue([]),
      linkToCase:     vi.fn(),
      unlinkFromCase: vi.fn(),
    };

    const repos = {
      db,
      cases:     fakeCases,
      contacts:  fakeContacts,
      calendar:  { caseTimeline: vi.fn().mockReturnValue([]), deadlinesAtRisk: vi.fn().mockReturnValue([]) },
      citations: { caseCitationIntelligence: vi.fn().mockReturnValue({}) },
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/cases', casesRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('GET /', () => {
    it('rejects a non-numeric clientId query param with 4xx', async () => {
      const res = await request(app).get('/api/cases').query({ clientId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown query param (strict schema) with 4xx', async () => {
      const res = await request(app).get('/api/cases').query({ unknownFilter: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid clientId and returns matching cases', async () => {
      const res = await request(app).get('/api/cases').query({ clientId: '5' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeCases.findByClientId).toHaveBeenCalledWith(5);
    });

    it('accepts an empty query and returns the paginated list', async () => {
      const res = await request(app).get('/api/cases');
      expect(res.status).toBe(200);
      expect(fakeCases.list).toHaveBeenCalled();
    });
  });

  describe('POST /', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/cases').send({ titleHe: 'תביעה' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeCases.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid caseType enum value with 4xx', async () => {
      const res = await request(app).post('/api/cases').send({
        caseNumber: 'תא-2024-042', titleHe: 'תביעה', clientId: 1, caseType: 'imaginary',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and creates the case', async () => {
      const res = await request(app).post('/api/cases').send({
        caseNumber: 'תא-2024-042', titleHe: 'תביעה אזרחית', clientId: 1, caseType: 'civil',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(1);
      expect(fakeCases.create).toHaveBeenCalledWith(expect.objectContaining({ caseNumber: 'תא-2024-042' }));
    });
  });

  describe('POST /:id/contacts', () => {
    it('rejects a body missing contactId with 4xx', async () => {
      const res = await request(app).post('/api/cases/1/contacts').send({ roleInCase: 'עד' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeContacts.linkToCase).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric contactId with 4xx', async () => {
      const res = await request(app).post('/api/cases/1/contacts').send({ contactId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and links the contact', async () => {
      const res = await request(app).post('/api/cases/1/contacts').send({ contactId: 7, roleInCase: 'עד' });
      expect(res.status).toBe(200);
      expect(res.body.data.linked).toBe(true);
      expect(fakeContacts.linkToCase).toHaveBeenCalledWith(1, 7, 'עד');
    });
  });
});
