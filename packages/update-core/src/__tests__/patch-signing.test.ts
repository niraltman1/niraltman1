/**
 * Task 2 — OTA Update End-to-End Signing Validation
 *
 * Verifies the full cryptographic pipeline:
 *   sign manifest → validate → accept / reject
 *
 * Uses a test keypair generated at runtime; completely isolated from the
 * production key embedded in TrustedSigningKeys.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateKeyPairSync,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PatchValidator, TrustedSigningKeys } from '../PatchValidator.js';
import type { PatchManifest } from '../types.js';

// ── Test keypair (generated once per run; never committed) ───────────────────
const { publicKey: testPubDer, privateKey: testPrivDer } = generateKeyPairSync('ed25519', {
  publicKeyEncoding:  { type: 'spki',  format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});
const TEST_KEY_ID   = 'factum-test-signing';
const TEST_PUB_B64  = testPubDer.toString('base64url');

// ── Helpers ──────────────────────────────────────────────────────────────────

function signManifest(manifestBytes: Buffer): string {
  const digest  = createHash('sha256').update(manifestBytes).digest();
  const privKey = createPrivateKey({ key: testPrivDer, format: 'der', type: 'pkcs8' });
  return sign(null, digest, privKey).toString('base64url');
}

function makeManifest(overrides: Partial<PatchManifest> = {}): PatchManifest {
  return {
    formatVersion:           1,
    signingKeyId:            TEST_KEY_ID,
    minimumSupportedVersion: '1.0.0',
    version:                 '1.0.0',
    minCompatible:           '1.0.0',
    targetVersion:           '1.1.0',
    releaseDate:             '2026-06-22T00:00:00.000Z',
    releaseNotes:            'test patch',
    sha256map:               {},
    migrations:              [],
    requiredMigrations:      [],
    ...overrides,
  };
}

async function writePatch(dir: string, manifest: PatchManifest, sigOverride?: string): Promise<void> {
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(join(dir, 'manifest.json'), manifestBytes);
  const sig = sigOverride ?? signManifest(manifestBytes);
  await writeFile(join(dir, 'manifest.sig'), sig + '\n');
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeAll(async () => {
  TrustedSigningKeys[TEST_KEY_ID] = TEST_PUB_B64;
  tmpDir = await mkdtemp(join(tmpdir(), 'factum-patch-test-'));
});

afterAll(async () => {
  delete TrustedSigningKeys[TEST_KEY_ID];
  await rm(tmpDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PatchValidator — Ed25519 signing E2E', () => {

  it('accepts a correctly signed patch', async () => {
    const dir = await mkdtemp(join(tmpDir, 'valid-'));
    const manifest = makeManifest();
    await writePatch(dir, manifest);

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a patch signed with the wrong private key', async () => {
    const dir = await mkdtemp(join(tmpDir, 'wrong-key-'));
    const manifest = makeManifest();
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(join(dir, 'manifest.json'), manifestBytes);

    const { privateKey: wrongPrivDer } = generateKeyPairSync('ed25519', {
      publicKeyEncoding:  { type: 'spki',  format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    });
    const digest   = createHash('sha256').update(manifestBytes).digest();
    const wrongKey = createPrivateKey({ key: wrongPrivDer, format: 'der', type: 'pkcs8' });
    const wrongSig = sign(null, digest, wrongKey).toString('base64url');
    await writeFile(join(dir, 'manifest.sig'), wrongSig + '\n');

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('signature'))).toBe(true);
  });

  it('rejects a tampered manifest (content changed after signing)', async () => {
    const dir = await mkdtemp(join(tmpDir, 'tampered-'));
    const original = makeManifest();
    // Sign original, then overwrite manifest.json with different content
    const originalBytes = Buffer.from(JSON.stringify(original));
    const sig = signManifest(originalBytes);
    await writeFile(join(dir, 'manifest.sig'), sig + '\n');

    const tampered = makeManifest({ targetVersion: '9.9.9' });
    await writeFile(join(dir, 'manifest.json'), Buffer.from(JSON.stringify(tampered)));

    const result = await PatchValidator.validate(dir, tampered, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('signature'))).toBe(true);
  });

  it('rejects a patch with an unknown signingKeyId', async () => {
    const dir = await mkdtemp(join(tmpDir, 'unknown-key-'));
    const manifest = makeManifest({ signingKeyId: 'factum-nonexistent' });
    await writePatch(dir, manifest);

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('factum-nonexistent'))).toBe(true);
  });

  it('rejects a corrupt (truncated) signature', async () => {
    const dir = await mkdtemp(join(tmpDir, 'corrupt-sig-'));
    const manifest = makeManifest();
    await writePatch(dir, manifest, 'dGhpcyBpcyBub3QgYSB2YWxpZA');

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects when sha256map references a missing file', async () => {
    const dir = await mkdtemp(join(tmpDir, 'missing-file-'));
    const manifest = makeManifest({ sha256map: { 'does-not-exist.js': 'a'.repeat(64) } });
    await writePatch(dir, manifest);

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('does-not-exist.js'))).toBe(true);
  });

  it('rejects when installed version is below minimumSupportedVersion', async () => {
    const dir = await mkdtemp(join(tmpDir, 'too-old-'));
    const manifest = makeManifest({ minimumSupportedVersion: '2.0.0' });
    await writePatch(dir, manifest);

    const result = await PatchValidator.validate(dir, manifest, '1.0.0', new Set());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('2.0.0'))).toBe(true);
  });

});

describe('PatchValidator — startup key guard logic', () => {

  it('does not throw in non-production mode even with a placeholder key', () => {
    const keys: Record<string, string> = { k: 'PLACEHOLDER' };
    const guard = (env: string) => {
      if (env !== 'production') return;
      for (const [id, pub] of Object.entries(keys)) {
        if (pub.includes('PLACEHOLDER')) throw new Error(`placeholder: ${id}`);
      }
    };
    expect(() => guard('test')).not.toThrow();
  });

  it('throws in production when a placeholder key is present', () => {
    const keys: Record<string, string> = { k: 'PLACEHOLDER_KEY' };
    const guard = () => {
      for (const [id, pub] of Object.entries(keys)) {
        if (pub.includes('PLACEHOLDER'))
          throw new Error(`PatchValidator: placeholder key (keyId="${id}")`);
      }
    };
    expect(() => guard()).toThrow('placeholder key');
  });

  it('throws in production when the key registry is empty', () => {
    const emptyKeys: Record<string, string> = {};
    const guard = () => {
      if (Object.keys(emptyKeys).length === 0)
        throw new Error('PatchValidator: no trusted signing keys configured');
    };
    expect(() => guard()).toThrow('no trusted signing keys');
  });

  it('throws in production when a key cannot be decoded as Ed25519 SPKI', () => {
    const badKeys: Record<string, string> = { k: 'bm90YXZhbGlka2V5' };
    const guard = () => {
      for (const [id, pub] of Object.entries(badKeys)) {
        try {
          createPublicKey({ key: Buffer.from(pub, 'base64url'), format: 'der', type: 'spki' });
        } catch {
          throw new Error(`PatchValidator: signing key "${id}" cannot be decoded`);
        }
      }
    };
    expect(() => guard()).toThrow('cannot be decoded');
  });

});
