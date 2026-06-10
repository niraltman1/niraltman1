import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import type { Repos } from '../db.js';

// Compute a deterministic signature hash from doc hash + signer ID + signed timestamp
function computeSignatureHash(documentHash: string, signerId: number, signedAt: string): string {
  return createHash('sha256')
    .update(`${documentHash}:${signerId}:${signedAt}`)
    .digest('hex');
}

const signatureRequestSchema = z.object({
  documentId: z.number(),
}).strict();

const signatureSignSchema = z.object({
  signatureId: z.number(),
  notes:       z.string().optional(),
}).strict();

const signatureRejectSchema = z.object({
  signatureId: z.number(),
  notes:       z.string().min(1),
}).strict();

export function signaturesRouter(repos: Repos): Router {
  const router = Router();
  router.use(requireAuth(repos));

  // POST /api/signatures/request  { documentId: number }
  // Creates a pending signature row for the currently logged-in user.
  router.post('/request', validate(signatureRequestSchema), asyncHandler((req, res) => {
    const { documentId } = req.body as z.infer<typeof signatureRequestSchema>;

    const doc = repos.db.prepare('SELECT id, file_hash FROM Documents WHERE id = ?').get(documentId) as
      { id: number; file_hash: string } | undefined;
    if (!doc) throw new NotFoundError(`Document ${documentId} not found`);

    const userId   = (req as unknown as { userId: number }).userId;
    const username = (req as unknown as { username: string }).username;

    repos.db.prepare(`
      INSERT OR IGNORE INTO DocumentSignatures (document_id, signer_id, signer_name, document_hash, signature_hash)
      VALUES (@documentId, @signerId, @signerName, @documentHash, @sigHash)
    `).run({
      documentId,
      signerId:     userId,
      signerName:   username,
      documentHash: doc.file_hash ?? '',
      sigHash:      'pending',  // placeholder until signed
    });

    const row = repos.db.prepare(
      'SELECT * FROM DocumentSignatures WHERE document_id = ? AND signer_id = ?'
    ).get(documentId, userId);

    ok(res, row, 201);
  }));

  // POST /api/signatures/sign  { signatureId: number, notes?: string }
  router.post('/sign', validate(signatureSignSchema), asyncHandler((req, res) => {
    const { signatureId, notes } = req.body as z.infer<typeof signatureSignSchema>;

    const userId = (req as unknown as { userId: number }).userId;

    const sig = repos.db.prepare('SELECT * FROM DocumentSignatures WHERE id = ?').get(signatureId) as
      { id: number; signer_id: number; document_hash: string; status: string } | undefined;
    if (!sig) throw new NotFoundError(`Signature ${signatureId} not found`);
    if (sig.signer_id !== userId) throw new ValidationError('You can only sign your own pending signatures');
    if (sig.status !== 'pending') throw new ValidationError(`Signature already ${sig.status}`);

    const signedAt = new Date().toISOString();
    const sigHash  = computeSignatureHash(sig.document_hash, userId, signedAt);

    repos.db.prepare(`
      UPDATE DocumentSignatures
         SET status = 'signed',
             signature_hash = @sigHash,
             signed_at = @signedAt,
             notes = @notes
       WHERE id = @id
    `).run({
      sigHash,
      signedAt,
      notes: notes ?? null,
      id:    signatureId,
    });

    ok(res, repos.db.prepare('SELECT * FROM DocumentSignatures WHERE id = ?').get(signatureId));
  }));

  // POST /api/signatures/reject  { signatureId: number, notes: string }
  router.post('/reject', validate(signatureRejectSchema), asyncHandler((req, res) => {
    const { signatureId, notes } = req.body as z.infer<typeof signatureRejectSchema>;
    if (!notes.trim()) throw new ValidationError('notes (string) required for rejection');

    const userId = (req as unknown as { userId: number }).userId;

    const sig = repos.db.prepare('SELECT id, signer_id, status FROM DocumentSignatures WHERE id = ?').get(signatureId) as
      { id: number; signer_id: number; status: string } | undefined;
    if (!sig) throw new NotFoundError(`Signature ${signatureId} not found`);
    if (sig.signer_id !== userId) throw new ValidationError('You can only reject your own pending signatures');
    if (sig.status !== 'pending') throw new ValidationError(`Signature already ${sig.status}`);

    repos.db.prepare(`
      UPDATE DocumentSignatures SET status = 'rejected', notes = @notes WHERE id = @id
    `).run({ notes, id: signatureId });

    ok(res, repos.db.prepare('SELECT * FROM DocumentSignatures WHERE id = ?').get(signatureId));
  }));

  // GET /api/signatures/document/:documentId
  router.get('/document/:documentId', asyncHandler((req, res) => {
    const documentId = Number(req.params['documentId']);
    if (!Number.isFinite(documentId)) throw new ValidationError('documentId must be a number');

    const rows = repos.db.prepare(
      'SELECT * FROM DocumentSignatures WHERE document_id = ? ORDER BY created_at DESC'
    ).all(documentId);

    ok(res, rows);
  }));

  // GET /api/signatures/pending  — pending for current user
  router.get('/pending', asyncHandler((req, res) => {
    const userId = (req as unknown as { userId: number }).userId;

    const rows = repos.db.prepare(`
      SELECT ds.*, d.filename, d.original_path
        FROM DocumentSignatures ds
        JOIN Documents d ON d.id = ds.document_id
       WHERE ds.signer_id = ? AND ds.status = 'pending'
       ORDER BY ds.created_at DESC
    `).all(userId);

    ok(res, rows);
  }));

  return router;
}
