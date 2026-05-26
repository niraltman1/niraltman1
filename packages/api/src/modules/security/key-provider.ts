import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { hostname } from 'node:os';

const scryptAsync = promisify(scrypt);

export type KeySource = 'env' | 'passphrase' | 'dpapi';

export interface DerivedKey {
  key:    Buffer;
  source: KeySource;
}

export async function deriveBackupKey(): Promise<DerivedKey | null> {
  // Priority 1: raw hex key from env (32 bytes = 64 hex chars)
  const envKey = process.env['BACKUP_ENCRYPT_KEY'];
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length !== 32) {
      console.warn('[Security] BACKUP_ENCRYPT_KEY must be 64 hex chars (32 bytes) — skipping encryption');
      return null;
    }
    return { key: buf, source: 'env' };
  }

  // Priority 2: passphrase → scrypt with machine hostname as salt
  const passphrase = process.env['BACKUP_PASSPHRASE'];
  if (passphrase) {
    const salt = Buffer.from(hostname(), 'utf-8');
    const key  = (await scryptAsync(passphrase, salt, 32)) as Buffer;
    return { key, source: 'passphrase' };
  }

  // Priority 3: Windows DPAPI (non-fatal on non-Windows)
  if (process.platform === 'win32') {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify: prom } = await import('node:util');
      const exec = prom(execFile);
      // Use PowerShell DPAPI to derive a machine-bound key from a fixed seed
      const psScript = `
        $seed = [System.Text.Encoding]::UTF8.GetBytes('factum-il-backup-key')
        $protected = [System.Security.Cryptography.ProtectedData]::Protect($seed, $null, 'LocalMachine')
        [Convert]::ToBase64String($protected)
      `.trim();
      const { stdout } = await exec('powershell', ['-NoProfile', '-Command', psScript], { timeout: 5000 });
      const protected64 = stdout.trim();
      // Use first 32 bytes of the protected data as key material
      const raw = Buffer.from(protected64, 'base64').subarray(0, 32);
      if (raw.length === 32) return { key: raw, source: 'dpapi' };
    } catch (e) {
      console.warn('[Security] DPAPI key derivation failed:', e);
    }
  }

  return null;
}
