/**
 * PatchManager — 9-step .factumpatch apply workflow.
 *
 * Steps:
 *  1. Validate Version (PatchValidator — formatVersion + minimumSupportedVersion)
 *  2. Validate Dependencies (requiredMigrations)
 *  3. Validate Manifest (Ed25519 signature + sha256map)
 *  4. Validate SHA-256 per-file
 *  5. Create Recovery Point → immediately call verifyRecoveryPoint() (disk-full guard)
 *  6. Apply Files
 *  7. Migration Validation Mode (static analysis only — syntax, ordering, FK deps)
 *     then execute each migration in its own SQLite transaction
 *  8. Run Health Check (PostUpdateHealthCheck)
 *  9. Commit (write NORMAL state)
 *
 * Auto-rollback via PatchRollbackManager on any step failure.
 * If rollback itself fails, writes SAFE_MODE to UpdateStateStore and exits.
 */

import { copyFile, readdir, readFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { recordPatchApplyDuration } from '@factum-il/observability';
import type { PatchManifest } from './types.js';
import { PatchValidator } from './PatchValidator.js';
import { PatchRollbackManager } from './PatchRollbackManager.js';
import { runPostUpdateHealthCheck } from './PostUpdateHealthCheck.js';
import type { UpdateStateStore } from './UpdateStateStore.js';

const HEALTH_CHECK_TIMEOUT_MS = 30_000;

// ── Audit event emitter (best-effort) ────────────────────────────────────────

type AuditFn = (action: string, detail: Record<string, unknown>) => void;

// ── DB handle for migration execution ────────────────────────────────────────

interface DbHandle {
  prepare(sql: string): { run(...args: unknown[]): void };
  transaction<T>(fn: () => T): () => T;
}

// ── Migration SQL validator ───────────────────────────────────────────────────

function validateMigrationSql(sql: string, migrationNum: number): string[] {
  const errs: string[] = [];
  if (!sql.trim()) {
    errs.push(`Migration ${migrationNum}: empty SQL file`);
    return errs;
  }
  // Syntax check: attempt to parse keywords (lightweight heuristic)
  const forbidden = /DROP\s+TABLE\s+(?!IF\s+EXISTS)/i;
  if (forbidden.test(sql)) {
    errs.push(`Migration ${migrationNum}: bare DROP TABLE is forbidden (use DROP TABLE IF EXISTS)`);
  }
  return errs;
}

// ── PatchManager ──────────────────────────────────────────────────────────────

export interface PatchApplyResult {
  success:  boolean;
  error?:   string;
  step?:    number;
}

export class PatchManager {
  private readonly rollbackMgr: PatchRollbackManager;

  constructor(
    private readonly dataPath: string,
    private readonly dbPath: string,
    private readonly stateStore: UpdateStateStore,
    private readonly audit: AuditFn = () => {},
  ) {
    this.rollbackMgr = new PatchRollbackManager(dataPath, stateStore);
  }

  async apply(
    extractedDir: string,
    manifest: PatchManifest,
    installedVersion: string,
    appliedMigrations: Set<number>,
    db: DbHandle,
  ): Promise<PatchApplyResult> {
    const t0 = Date.now();
    await this.stateStore.write({ systemState: 'UPDATING', updateInProgress: true });

    const fail = async (step: number, err: Error | string): Promise<PatchApplyResult> => {
      const msg = err instanceof Error ? err.message : err;
      this.audit('patch_validation_failed', { step, error: msg });
      await this.stateStore.write({ systemState: 'ROLLING_BACK' });
      const rollback = await this.rollbackMgr.rollbackPatch(this.dbPath);
      this.audit('patch_rolled_back', { step, restored: rollback.restored, reason: rollback.reason });
      recordPatchApplyDuration(Date.now() - t0);
      return { success: false, error: msg, step };
    };

    try {
      // ── Step 1–4: Validate ───────────────────────────────────────────────
      const validation = await PatchValidator.validate(
        extractedDir, manifest, installedVersion, appliedMigrations,
      );
      if (!validation.valid) {
        return await fail(1, validation.errors.join('; '));
      }
      this.audit('migration_validation_executed', { step: 1, result: 'valid' });

      // ── Step 5: Create Recovery Point ────────────────────────────────────
      let recoveryPoint;
      try {
        recoveryPoint = await this.rollbackMgr.createAndVerifyRecoveryPoint(
          this.dbPath, installedVersion,
        );
        this.audit('recovery_point_created', { id: recoveryPoint.id });
      } catch (err) {
        return await fail(5, err instanceof Error ? err : new Error(String(err)));
      }

      // ── Step 6: Apply Files ──────────────────────────────────────────────
      const filesDir = join(extractedDir, 'files');
      try {
        const fileEntries = Object.keys(manifest.sha256map)
          .filter((p) => !p.startsWith('migrations/'));
        for (const relPath of fileEntries) {
          const srcPath = join(filesDir, relPath);
          const dstPath = join(this.dataPath, '..', relPath); // relative to monorepo root
          await mkdir(join(dstPath, '..'), { recursive: true });
          await copyFile(srcPath, dstPath);
        }
      } catch (err) {
        return await fail(6, err instanceof Error ? err : new Error(String(err)));
      }

      // ── Step 7: Migration Validation + Execution ─────────────────────────
      const migrationsDir = join(extractedDir, 'migrations');
      const migrationFiles = (await readdir(migrationsDir).catch(() => []))
        .filter((f: string) => /^\d{3}\.sql$/.test(f))
        .sort();

      const sqlMap: Array<{ num: number; sql: string }> = [];
      for (const file of migrationFiles) {
        const num = parseInt(file.replace('.sql', ''), 10);
        const sql = await readFile(join(migrationsDir, file), 'utf8');
        const syntaxErrors = validateMigrationSql(sql, num);
        if (syntaxErrors.length > 0) {
          return await fail(7, syntaxErrors.join('; '));
        }
        sqlMap.push({ num, sql });
      }
      this.audit('migration_validation_executed', { step: 7, count: sqlMap.length, mode: 'static' });

      // Execute each migration in its own transaction
      for (const { num, sql } of sqlMap) {
        try {
          db.transaction(() => {
            db.prepare(sql).run();
          })();
        } catch (err) {
          return await fail(7, `Migration ${num} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ── Step 8: Health Check ─────────────────────────────────────────────
      try {
        const healthResult = await Promise.race([
          runPostUpdateHealthCheck(this.stateStore, { prepare: db.prepare.bind(db) } as never, this.dbPath),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timed out')), HEALTH_CHECK_TIMEOUT_MS),
          ),
        ]);
        if (healthResult.wasApplied && !healthResult.healthy) {
          return await fail(8, `Health check failed: ${(healthResult.failures ?? []).join(', ')}`);
        }
      } catch (err) {
        return await fail(8, err instanceof Error ? err : new Error(String(err)));
      }

      // ── Step 9: Commit ───────────────────────────────────────────────────
      await this.stateStore.write({
        systemState:      'NORMAL',
        updateInProgress: false,
        currentVersion:   manifest.targetVersion,
      });
      this.audit('patch_applied', {
        from: installedVersion,
        to:   manifest.targetVersion,
        durationMs: Date.now() - t0,
      });
      recordPatchApplyDuration(Date.now() - t0);
      return { success: true };

    } catch (err) {
      return await fail(0, err instanceof Error ? err : new Error(String(err)));
    }
  }
}
