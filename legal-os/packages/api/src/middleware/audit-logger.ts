import type { RequestHandler } from 'express';
import type { DatabaseConnection } from '@legal-os/database';
import type { Repos } from '../db.js';

export interface AuditEvent {
  eventType: 'read' | 'create' | 'update' | 'delete' | 'export' | 'ai_query'
           | 'login' | 'logout' | 'erasure' | 'session_expire';
  actorId?:      number;
  actorRole?:    string;
  resourceType:  string;
  resourceId?:   string;
  actionDetail?: Record<string, unknown>;
  severity?:     'info' | 'warn' | 'critical';
  ipAddress?:    string;
  userAgent?:    string;
}

export function logAuditEvent(db: DatabaseConnection, event: AuditEvent): void {
  db.prepare(`
    INSERT INTO audit_events
      (event_type, actor_id, actor_role, resource_type, resource_id,
       action_detail, ip_address, user_agent, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventType,
    event.actorId ?? null,
    event.actorRole ?? null,
    event.resourceType,
    event.resourceId ?? null,
    event.actionDetail ? JSON.stringify(event.actionDetail) : null,
    event.ipAddress ?? null,
    event.userAgent ?? null,
    event.severity ?? 'info',
  );
}

// Map route path prefixes to resource type labels
const RESOURCE_TYPE_MAP: Array<[RegExp, string]> = [
  [/^\/api\/clients/,    'client'],
  [/^\/api\/cases/,      'case'],
  [/^\/api\/documents/,  'document'],
  [/^\/api\/contacts/,   'contact'],
  [/^\/api\/citations/,  'citation'],
  [/^\/api\/case-law/,   'case_law'],
  [/^\/api\/insolvency/, 'insolvency'],
  [/^\/api\/ledger/,     'ledger'],
  [/^\/api\/tasks/,      'task'],
  [/^\/api\/docx/,       'export'],
  [/^\/api\/admin/,      'admin'],
  [/^\/api\/backup/,     'backup'],
  [/^\/api\/erasure/,    'erasure'],
];

function resolveResourceType(path: string): string {
  for (const [pattern, type] of RESOURCE_TYPE_MAP) {
    if (pattern.test(path)) return type;
  }
  return 'api';
}

function resolveSeverity(method: string, resourceType: string): 'info' | 'warn' | 'critical' {
  if (resourceType === 'export' || resourceType === 'backup') return 'critical';
  if (resourceType === 'erasure') return 'critical';
  if (method === 'DELETE') return 'warn';
  return 'info';
}

// Middleware: auto-log destructive and export HTTP methods
export function auditMiddleware(repos: Repos): RequestHandler {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) { next(); return; }

    res.on('finish', () => {
      const resourceType = resolveResourceType(req.path);
      const failed       = res.statusCode >= 400;
      // Successful writes get severity by resource type; failures escalate to 'warn'/'critical'
      const severity     = failed
        ? (res.statusCode >= 500 ? 'critical' : 'warn')
        : resolveSeverity(method, resourceType);
      const actorId      = (req as unknown as { userId?: number }).userId;
      const actorRole    = (req as unknown as { userRole?: string }).userRole;
      const resourceId   = req.params['id'];
      const ipAddress    = req.ip;
      const userAgent    = req.get('user-agent');

      logAuditEvent(repos.db, {
        eventType:    method === 'DELETE' ? 'delete' : 'create',
        ...(actorId    !== undefined ? { actorId }    : {}),
        ...(actorRole  !== undefined ? { actorRole }  : {}),
        resourceType,
        ...(resourceId !== undefined ? { resourceId } : {}),
        actionDetail: { method, path: req.path, status: res.statusCode, ...(failed ? { failed: true } : {}) },
        severity,
        ...(ipAddress  !== undefined ? { ipAddress }  : {}),
        ...(userAgent  !== undefined ? { userAgent }  : {}),
      });
    });

    next();
  };
}
