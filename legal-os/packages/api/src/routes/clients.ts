import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { validate } from '../middleware/validate.js';
import { createClientSchema, updateClientSchema } from '../validation/clients.js';
import { NotFoundError } from '../errors/api-error.js';

export function clientsRouter(repos: Repos): Router {
  const router = Router();
  const { clients, cases } = repos;

  router.get('/', asyncHandler((req, res) => {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const result = clients.list(page, pageSize);
    ok(res, result);
  }));

  router.post('/', validate(createClientSchema), asyncHandler((req, res) => {
    const client = clients.create(req.body as Parameters<typeof clients.create>[0]);
    ok(res, { id: client.id }, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const client = clients.findById(id);
    if (!client) throw new NotFoundError('Client');
    ok(res, client);
  }));

  router.patch('/:id', validate(updateClientSchema), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const updated = clients.update(id, req.body as Parameters<typeof clients.update>[1]);
    if (!updated) throw new NotFoundError('Client');
    ok(res, updated);
  }));

  router.get('/:id/timeline', asyncHandler((req, res) => {
    const clientId = Number(req.params['id']);
    const client = clients.findById(clientId);
    if (!client) throw new NotFoundError('Client');
    const clientCases = cases.findByClientId(clientId);
    const allEvents = clientCases.flatMap((c) => cases.getTimeline(c.id));
    allEvents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    ok(res, allEvents);
  }));

  // WhatsApp-ready plain-text status report (enhanced Phase 15)
  router.get('/:id/summary/text', asyncHandler((req, res) => {
    const clientId = Number(req.params['id']);
    const client   = clients.findById(clientId);
    if (!client) throw new NotFoundError('Client');

    const { tasks, trafficCases } = repos;
    const done    = tasks.completedByClient(clientId, 7);
    const pending = tasks.pendingByClient(clientId);

    // Open cases
    const openCases = cases.findByClientId(clientId, 'open');

    // Traffic alerts for this client
    const allAlerts = trafficCases.getAlerts(30);
    const clientCaseIds = new Set(openCases.map((c) => c.id));
    const myAlerts = allAlerts.filter((a) => clientCaseIds.has(a.caseId));

    const doneLines = done.length
      ? done.map((t) => `✅ ${t.title}`).join('\n')
      : '—';

    const pendingLines = pending.length
      ? pending.map((t) => {
          const due = t.dueDate ? ` (עד ${new Date(t.dueDate).toLocaleDateString('he-IL')})` : '';
          const urg = t.urgency === 'critical' ? ' ⚠️' : t.urgency === 'warning' ? ' 🕐' : '';
          const priority = t.priority === 'critical' ? ' 🔴' : t.priority === 'high' ? ' 🟡' : '';
          return `📌 ${t.title}${due}${urg}${priority}`;
        }).join('\n')
      : '—';

    const caseLines = openCases.length
      ? openCases.map((c) => `⚖️ תיק ${c.caseNumber}${c.courtName ? ` — ${c.courtName}` : ''}`).join('\n')
      : '—';

    const alertLines = myAlerts.length
      ? myAlerts.map((a) => {
          if (a.rejectionDetected) return `🚨 בקשה נדחתה: תיק ${a.caseNumber}`;
          return `⏳ ${a.daysRemaining} ימים להתיישנות: תיק ${a.caseNumber}`;
        }).join('\n')
      : null;

    const sections: string[] = [
      `*${process.env['FIRM_NAME'] ?? 'אלטמן משרד עורכי דין'} — עדכון ל${client.nameHe}*`,
      ``,
      `📁 *תיקים פתוחים:*`,
      caseLines,
      ``,
      `✅ *בוצע (7 ימים אחרונים):*`,
      doneLines,
      ``,
      `📅 *ממתין לטיפול:*`,
      pendingLines,
    ];

    if (alertLines) {
      sections.push(``, `⚠️ *התראות חשובות:*`, alertLines);
    }

    sections.push(``, `_עודכן: ${new Date().toLocaleString('he-IL')}_`);

    const text = sections.join('\n');

    ok(res, {
      text,
      clientName:   client.nameHe,
      doneCount:    done.length,
      pendingCount: pending.length,
      openCaseCount: openCases.length,
      alertCount:   myAlerts.length,
    });
  }));

  return router;
}
