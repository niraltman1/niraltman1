import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { clientsRouter } from '../clients.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT, name_en TEXT, id_number TEXT, phone TEXT, email TEXT, address_he TEXT, notes TEXT, is_active INTEGER DEFAULT 1);
`;

describe('clientsRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let fakeClients: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let fakeCases: { findByClientId: ReturnType<typeof vi.fn>; getTimeline: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    fakeClients = {
      list:     vi.fn().mockReturnValue({ items: [], total: 0 }),
      create:   vi.fn().mockImplementation((input: Record<string, unknown>) => ({ id: 1, ...input })),
      findById: vi.fn().mockReturnValue({ id: 1, nameHe: 'ישראל ישראלי' }),
      update:   vi.fn().mockImplementation((id: number, updates: Record<string, unknown>) => ({ id, ...updates })),
    };
    fakeCases = {
      findByClientId: vi.fn().mockReturnValue([]),
      getTimeline:    vi.fn().mockReturnValue([]),
    };

    const repos = {
      db,
      clients: fakeClients,
      cases:   fakeCases,
      tasks:   { completedByClient: vi.fn().mockReturnValue([]), pendingByClient: vi.fn().mockReturnValue([]) },
      trafficCases: { getAlerts: vi.fn().mockReturnValue([]) },
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/clients', clientsRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('POST /', () => {
    it('rejects a body missing nameHe with 4xx', async () => {
      const res = await request(app).post('/api/clients').send({ phone: '0501234567' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeClients.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid email with 4xx', async () => {
      const res = await request(app).post('/api/clients').send({ nameHe: 'ישראל ישראלי', email: 'not-an-email' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown field (strict schema) with 4xx', async () => {
      const res = await request(app).post('/api/clients').send({ nameHe: 'ישראל ישראלי', extra: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and creates the client', async () => {
      const res = await request(app).post('/api/clients').send({
        nameHe: 'ישראל ישראלי', idNumber: '123456782', idType: 'personal', phone: '0501234567', email: 'israel@example.com',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(1);
      expect(fakeClients.create).toHaveBeenCalledWith(expect.objectContaining({ nameHe: 'ישראל ישראלי' }));
    });
  });

  describe('PATCH /:id', () => {
    it('rejects an invalid idType enum value with 4xx', async () => {
      const res = await request(app).patch('/api/clients/1').send({ idType: 'invalid_type' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeClients.update).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean isActive with 4xx', async () => {
      const res = await request(app).patch('/api/clients/1').send({ isActive: 'yes' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed partial update', async () => {
      const res = await request(app).patch('/api/clients/1').send({ phone: '0521112233', isActive: false });
      expect(res.status).toBe(200);
      expect(fakeClients.update).toHaveBeenCalledWith(1, expect.objectContaining({ phone: '0521112233', isActive: false }));
    });
  });
});
