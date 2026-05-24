import { createHash, randomBytes, pbkdf2Sync } from 'node:crypto';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { UnauthorizedError, ForbiddenError } from '../errors/api-error.js';
import { logAuditEvent } from './audit-logger.js';

export type UserRole = 'admin' | 'attorney' | 'assistant' | 'reviewer' | 'read_only';

const ROLE_ORDER: Record<UserRole, number> = {
  admin: 5, attorney: 4, assistant: 3, reviewer: 2, read_only: 1,
};

const SESSION_TTL_HOURS = Number(process.env['SESSION_TTL_HOURS'] ?? 8);

// Default admin seeded on first startup when no users exist
const DEFAULT_ADMIN_USERNAME = process.env['FACTUM_IL_ADMIN_USER'] ?? 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env['FACTUM_IL_ADMIN_PASS'] ?? 'changeme';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
  return actual === expected;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiresAt(): string {
  const d = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);
  return d.toISOString();
}

export function seedDefaultAdmin(repos: Repos): void {
  const count = (repos.db.prepare('SELECT COUNT(*) as n FROM system_users').get() as { n: number }).n;
  if (count === 0) {
    const hash = hashPassword(DEFAULT_ADMIN_PASSWORD);
    repos.db.prepare(
      "INSERT INTO system_users (username, password_hash, role) VALUES (?, ?, 'admin')",
    ).run(DEFAULT_ADMIN_USERNAME, hash);
    console.log(`[Auth] Default admin account created (username: ${DEFAULT_ADMIN_USERNAME})`);
    console.log('[Auth] IMPORTANT: Change the admin password after first login');
  }
}

export function requireAuth(repos: Repos): RequestHandler {
  return asyncHandler((req, _res, next) => {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError();

    const token     = header.slice(7);
    const tokenHash = hashToken(token);
    const session   = repos.db.prepare(`
      SELECT s.id, s.user_id, s.expires_at, u.role, u.username, u.is_active
      FROM user_sessions s
      JOIN system_users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash) as { id: number; user_id: number; expires_at: string; role: string; username: string; is_active: number } | undefined;

    if (!session) throw new UnauthorizedError('Invalid or expired token');
    if (!session.is_active) throw new UnauthorizedError('Account disabled');
    if (new Date(session.expires_at) < new Date()) {
      repos.db.prepare('DELETE FROM user_sessions WHERE id = ?').run(session.id);
      logAuditEvent(repos.db, { eventType: 'session_expire', actorId: session.user_id, resourceType: 'session' });
      throw new UnauthorizedError('Session expired');
    }

    (req as unknown as Record<string, unknown>)['userId']   = session.user_id;
    (req as unknown as Record<string, unknown>)['userRole'] = session.role;
    (req as unknown as Record<string, unknown>)['username'] = session.username;
    next();
  });
}

export function requireRole(minRole: UserRole, repos: Repos): RequestHandler {
  const authGuard = requireAuth(repos);
  return (req, res, next) => {
    authGuard(req, res, () => {
      const role = (req as unknown as { userRole?: string }).userRole as UserRole | undefined;
      if (!role || ROLE_ORDER[role] < ROLE_ORDER[minRole]) {
        throw new ForbiddenError(`Role '${minRole}' or higher required`);
      }
      next();
    });
  };
}

export function authRouter(repos: Repos): Router {
  const router = Router();

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) throw new UnauthorizedError('Username and password required');

    const user = repos.db.prepare(
      'SELECT id, username, password_hash, role, is_active FROM system_users WHERE username = ?',
    ).get(username) as { id: number; username: string; password_hash: string; role: string; is_active: number } | undefined;

    if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
      logAuditEvent(repos.db, {
        eventType: 'login', resourceType: 'session', severity: 'warn',
        actionDetail: { username, success: false },
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    const token     = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    repos.db.prepare(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    ).run(user.id, tokenHash, expiresAt());

    repos.db.prepare("UPDATE system_users SET last_login = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(user.id);

    logAuditEvent(repos.db, {
      eventType: 'login', actorId: user.id, actorRole: user.role,
      resourceType: 'session', actionDetail: { success: true },
      ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
    });

    ok(res, { token, role: user.role, username: user.username, expiresIn: SESSION_TTL_HOURS * 3600 });
  }));

  router.post('/logout', requireAuth(repos), asyncHandler((req, res) => {
    const header = req.headers['authorization']!;
    const token  = header.slice(7);
    const hash   = hashToken(token);
    repos.db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hash);
    const actorId = (req as unknown as { userId?: number }).userId;
    logAuditEvent(repos.db, {
      eventType: 'logout',
      ...(actorId !== undefined ? { actorId } : {}),
      resourceType: 'session',
    });
    ok(res, { message: 'Logged out' });
  }));

  router.get('/me', requireAuth(repos), asyncHandler((req, res) => {
    const userId = (req as unknown as { userId?: number }).userId!;
    const user   = repos.db.prepare(
      'SELECT id, username, role, last_login FROM system_users WHERE id = ?',
    ).get(userId) as { id: number; username: string; role: string; last_login: string | null };
    ok(res, user);
  }));

  // Change password (self or admin)
  router.post('/change-password', requireAuth(repos), asyncHandler((req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) throw new UnauthorizedError('currentPassword and newPassword required');
    if (newPassword.length < 8) throw new UnauthorizedError('Password must be at least 8 characters');

    const userId = (req as unknown as { userId?: number }).userId!;
    const user   = repos.db.prepare('SELECT password_hash FROM system_users WHERE id = ?').get(userId) as { password_hash: string };

    if (!verifyPassword(currentPassword, user.password_hash)) throw new UnauthorizedError('Current password incorrect');

    const newHash = hashPassword(newPassword);
    repos.db.prepare('UPDATE system_users SET password_hash = ? WHERE id = ?').run(newHash, userId);
    repos.db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);

    logAuditEvent(repos.db, { eventType: 'update', actorId: userId, resourceType: 'system_user', actionDetail: { field: 'password' }, severity: 'warn' });
    ok(res, { message: 'Password changed. All sessions invalidated.' });
  }));

  // Admin: list users
  router.get('/users', requireRole('admin', repos), asyncHandler((_req, res) => {
    const users = repos.db.prepare(
      'SELECT id, username, role, is_active, last_login, created_at FROM system_users ORDER BY id',
    ).all();
    ok(res, users);
  }));

  // Admin: create user
  router.post('/users', requireRole('admin', repos), asyncHandler((req, res) => {
    const { username, password, role } = req.body as { username?: string; password?: string; role?: string };
    if (!username || !password) throw new UnauthorizedError('username and password required');
    const validRoles: UserRole[] = ['admin', 'attorney', 'assistant', 'reviewer', 'read_only'];
    const userRole = (validRoles.includes(role as UserRole) ? role : 'assistant') as UserRole;
    const hash = hashPassword(password);
    const result = repos.db.prepare(
      'INSERT INTO system_users (username, password_hash, role) VALUES (?, ?, ?)',
    ).run(username, hash, userRole);
    ok(res, { id: result.lastInsertRowid, username, role: userRole }, 201);
  }));

  return router;
}
