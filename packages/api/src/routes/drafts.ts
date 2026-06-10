import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { NotFoundError, ValidationError } from '../errors/api-error.js';

const createSchema = z.object({
  title:          z.string().min(1).max(500).optional(),
  matterId:       z.number().int().positive().optional(),
  clientId:       z.number().int().positive().optional(),
  documentType:   z.enum(['motion','brief','letter','contract','opinion','general']).optional(),
  contentJson:    z.string().optional(),
  parentDraftId:  z.number().int().positive().optional(),
  forkReason:     z.string().max(500).optional(),
  createdBy:      z.string().max(200).optional(),
}).strict();

const updateSchema = z.object({
  title:          z.string().min(1).max(500).optional(),
  contentJson:    z.string().optional(),
  contentHtml:    z.string().optional(),
  wordCount:      z.number().int().min(0).optional(),
  status:         z.enum(['draft','review','final','archived']).optional(),
  changeReason:   z.string().max(200).optional(),
  isAiGenerated:  z.boolean().optional(),
  aiOperation:    z.string().max(200).optional(),
  createdBy:      z.string().max(200).optional(),
}).strict();

const citationSchema = z.object({
  citationRef:  z.string().min(1).max(500),
  entityType:   z.enum(['case_law','legislation','regulation','precedent','internal']).optional(),
  entityId:     z.number().int().positive().optional(),
  nodeId:       z.string().max(200).optional(),
}).strict();

const shelfSchema = z.object({
  shelfType:   z.enum(['case','legislation','precedent','note','ai_output','excerpt','document']),
  title:       z.string().min(1).max(500),
  contentHe:   z.string().optional(),
  sourceRef:   z.string().max(500).optional(),
  entityId:    z.number().int().positive().optional(),
  entityType:  z.string().max(100).optional(),
}).strict();

function printWrapper(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  body { font-family: David, serif; font-size: 14pt; margin: 2cm; direction: rtl; }
  h1 { font-size: 16pt; text-align: center; }
  h2 { font-size: 14pt; }
  p  { line-height: 1.6; }
  @media print { body { margin: 1.5cm; } }
</style>
</head>
<body>
<h1>${title}</h1>
${contentHtml}
</body>
</html>`;
}

export function draftsRouter(repos: Repos): Router {
  const router = Router();

  // ─── List ──────────────────────────────────────────────────────────────────
  router.get('/', asyncHandler((req, res) => {
    const matterId = req.query['matterId'] ? Number(req.query['matterId']) : undefined;
    const clientId = req.query['clientId'] ? Number(req.query['clientId']) : undefined;
    const status   = req.query['status']   ? String(req.query['status'])   : undefined;
    ok(res, repos.drafts.list({ matterId, clientId, status }));
  }));

  // ─── Get single ────────────────────────────────────────────────────────────
  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const draft = repos.drafts.get(id);
    if (!draft) throw new NotFoundError('Draft');
    ok(res, draft);
  }));

  // ─── Create ────────────────────────────────────────────────────────────────
  router.post('/', validate(createSchema), asyncHandler((req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const draft = repos.drafts.create({
      title:          b.title ?? 'טיוטה חדשה',
      content_json:   b.contentJson ?? null,
      content_html:   null,
      matter_id:      b.matterId ?? null,
      client_id:      b.clientId ?? null,
      document_type:  b.documentType ?? 'general',
      status:         'draft',
      word_count:     0,
      parent_draft_id: b.parentDraftId ?? null,
      fork_reason:    b.forkReason ?? null,
      created_by:     b.createdBy ?? null,
      is_active:      1,
    });
    ok(res, draft, 201);
  }));

  // ─── Update (autosave) ─────────────────────────────────────────────────────
  router.patch('/:id', validate(updateSchema), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!repos.drafts.get(id)) throw new NotFoundError('Draft');

    const b = req.body as z.infer<typeof updateSchema>;
    const updated = repos.drafts.update(id, {
      title:        b.title,
      content_json: b.contentJson,
      content_html: b.contentHtml,
      word_count:   b.wordCount,
      status:       b.status,
    });

    // Snapshot version when content changes
    if (b.contentJson !== undefined) {
      const nextVer = repos.drafts.nextVersionNumber(id);
      repos.drafts.createVersion(id, {
        draft_id:        id,
        version_number:  nextVer,
        content_json:    b.contentJson,
        content_html:    b.contentHtml ?? null,
        word_count:      b.wordCount ?? updated.word_count,
        change_reason:   b.changeReason ?? 'autosave',
        is_ai_generated: b.isAiGenerated ? 1 : 0,
        ai_operation:    b.aiOperation ?? null,
        created_by:      b.createdBy ?? null,
      });
    }

    ok(res, updated);
  }));

  // ─── Archive ───────────────────────────────────────────────────────────────
  router.delete('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!repos.drafts.get(id)) throw new NotFoundError('Draft');
    repos.drafts.archive(id);
    ok(res, { archived: true });
  }));

  // ─── Fork ──────────────────────────────────────────────────────────────────
  router.post('/:id/fork', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const { forkReason, createdBy } = (req.body ?? {}) as { forkReason?: string; createdBy?: string };
    const forked = repos.drafts.fork(id, forkReason ?? null, createdBy ?? null);
    ok(res, forked, 201);
  }));

  // ─── Versions ──────────────────────────────────────────────────────────────
  router.get('/:id/versions', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    ok(res, repos.drafts.listVersions(id));
  }));

  router.post('/:id/restore/:versionNumber', asyncHandler((req, res) => {
    const id  = Number(req.params['id']);
    const ver = Number(req.params['versionNumber']);
    if (!Number.isFinite(id) || !Number.isFinite(ver)) throw new ValidationError('invalid id or version');
    const snapshot = repos.drafts.getVersion(id, ver);
    if (!snapshot) throw new NotFoundError('DraftVersion');
    const updated = repos.drafts.update(id, {
      content_json: snapshot.content_json,
      content_html: snapshot.content_html ?? undefined,
      word_count:   snapshot.word_count,
    });
    const nextVer = repos.drafts.nextVersionNumber(id);
    repos.drafts.createVersion(id, {
      draft_id:        id,
      version_number:  nextVer,
      content_json:    snapshot.content_json,
      content_html:    snapshot.content_html,
      word_count:      snapshot.word_count,
      change_reason:   `restore from v${ver}`,
      is_ai_generated: 0,
      ai_operation:    null,
      created_by:      null,
    });
    ok(res, updated);
  }));

  // ─── Citations ─────────────────────────────────────────────────────────────
  router.get('/:id/citations', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    ok(res, repos.drafts.getCitations(id));
  }));

  router.post('/:id/citations', validate(citationSchema), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const b = req.body as z.infer<typeof citationSchema>;
    const citation = repos.drafts.addCitation(id, {
      draft_id:     id,
      citation_ref: b.citationRef,
      entity_type:  b.entityType ?? 'case_law',
      entity_id:    b.entityId ?? null,
      node_id:      b.nodeId ?? null,
    });
    ok(res, citation, 201);
  }));

  router.delete('/citations/:citationId', asyncHandler((req, res) => {
    const citationId = Number(req.params['citationId']);
    if (!Number.isFinite(citationId)) throw new ValidationError('invalid citation id');
    repos.drafts.removeCitation(citationId);
    ok(res, { deleted: true });
  }));

  // ─── Evidence Shelf ────────────────────────────────────────────────────────
  router.get('/:id/shelf', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    ok(res, repos.drafts.getShelf(id));
  }));

  router.post('/:id/shelf', validate(shelfSchema), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const b = req.body as z.infer<typeof shelfSchema>;
    const item = repos.drafts.addToShelf(id, {
      draft_id:    id,
      shelf_type:  b.shelfType,
      title:       b.title,
      content_he:  b.contentHe ?? null,
      source_ref:  b.sourceRef ?? null,
      entity_id:   b.entityId ?? null,
      entity_type: b.entityType ?? null,
      is_inserted: 0,
    });
    ok(res, item, 201);
  }));

  router.patch('/shelf/:itemId/insert', asyncHandler((req, res) => {
    const itemId = Number(req.params['itemId']);
    if (!Number.isFinite(itemId)) throw new ValidationError('invalid item id');
    repos.drafts.markInserted(itemId);
    ok(res, { inserted: true });
  }));

  router.delete('/shelf/:itemId', asyncHandler((req, res) => {
    const itemId = Number(req.params['itemId']);
    if (!Number.isFinite(itemId)) throw new ValidationError('invalid item id');
    repos.drafts.removeFromShelf(itemId);
    ok(res, { deleted: true });
  }));

  // ─── Export HTML ───────────────────────────────────────────────────────────
  router.get('/:id/export/html', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const draft = repos.drafts.get(id);
    if (!draft) throw new NotFoundError('Draft');
    const html = printWrapper(draft.title, draft.content_html ?? '<p>אין תוכן</p>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="draft-${id}.html"`);
    res.send(html);
  }));

  // ─── Knowledge Graph queries ───────────────────────────────────────────────
  router.get('/knowledge/by-citation', asyncHandler((req, res) => {
    const ref = String(req.query['ref'] ?? '');
    if (!ref) throw new ValidationError('ref is required');
    ok(res, repos.drafts.findDraftsUsingCitation(ref));
  }));

  router.get('/knowledge/by-section', asyncHandler((req, res) => {
    const key = String(req.query['key'] ?? '');
    if (!key) throw new ValidationError('key is required');
    ok(res, repos.drafts.findDraftsUsingLegalSection(key));
  }));

  return router;
}
