import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { docxRouter } from '../docx.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

// ─── Mock the docx generator — irrelevant to body validation ─────────────────
vi.mock('../../utils/docx-generator.js', () => ({
  generateDocx: vi.fn().mockReturnValue(Buffer.from('fake-docx-bytes')),
}));

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT, id_number TEXT, address_he TEXT);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, case_number TEXT, title_he TEXT, case_type TEXT, court_name TEXT);
`;

describe('docxRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let fakeClients: { findById: ReturnType<typeof vi.fn> };
  let fakeCases: { findById: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    fakeClients = {
      findById: vi.fn().mockReturnValue({
        id: 1, nameHe: 'ישראל ישראלי', idNumber: '123456782', addressHe: 'רחוב הרצל 1, תל אביב',
      }),
    };
    fakeCases = {
      findById: vi.fn().mockReturnValue({
        id: 2, caseNumber: 'תא-2024-042', titleHe: 'תביעה אזרחית', caseType: 'civil', courtName: 'בית משפט שלום תל אביב',
      }),
    };

    const repos = { db, clients: fakeClients, cases: fakeCases } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/docx', docxRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('POST /power-of-attorney', () => {
    it('rejects a body missing clientId with 4xx', async () => {
      const res = await request(app).post('/api/docx/power-of-attorney').send({ caseId: 2 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeClients.findById).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric clientId with 4xx', async () => {
      const res = await request(app).post('/api/docx/power-of-attorney').send({ clientId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and returns a docx attachment', async () => {
      const res = await request(app).post('/api/docx/power-of-attorney').send({ clientId: 1, caseId: 2 });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('wordprocessingml.document');
      expect(fakeClients.findById).toHaveBeenCalledWith(1);
      expect(fakeCases.findById).toHaveBeenCalledWith(2);
    });
  });

  describe('POST /fee-agreement', () => {
    it('rejects a body missing clientId with 4xx', async () => {
      const res = await request(app).post('/api/docx/fee-agreement').send({ feeAmount: '5000' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown field (strict schema) with 4xx', async () => {
      const res = await request(app).post('/api/docx/fee-agreement').send({ clientId: 1, extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and returns a docx attachment', async () => {
      const res = await request(app).post('/api/docx/fee-agreement').send({
        clientId: 1, caseId: 2, feeAmount: '5000', feeCurrency: '₪', successBonus: '10%',
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('wordprocessingml.document');
      expect(fakeClients.findById).toHaveBeenCalledWith(1);
    });
  });
});
