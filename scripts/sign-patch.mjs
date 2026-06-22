#!/usr/bin/env node
/**
 * Signs a patch manifest for Factum-IL OTA updates.
 *
 * Usage:
 *   FACTUM_SIGN_PRIVATE_KEY=<base64url-pkcs8-der> \
 *     node scripts/sign-patch.mjs path/to/extracted-patch/
 *
 * Reads:  <patchDir>/manifest.json
 * Writes: <patchDir>/manifest.sig  (base64url-encoded Ed25519 signature over SHA-256 of manifest.json)
 *
 * The private key must be the PKCS#8 DER key output by generate-signing-key.mjs (stderr).
 * Store it in CI secrets — never commit it.
 */

import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const patchDir = process.argv[2];
if (!patchDir) {
  process.stderr.write('Usage: node sign-patch.mjs <extracted-patch-dir>\n');
  process.exit(1);
}

const privKeyB64 = process.env['FACTUM_SIGN_PRIVATE_KEY'];
if (!privKeyB64) {
  process.stderr.write('FACTUM_SIGN_PRIVATE_KEY env var is required\n');
  process.exit(1);
}

const manifestBytes = await readFile(join(patchDir, 'manifest.json'));
const digest = createHash('sha256').update(manifestBytes).digest();

const privateKey = createPrivateKey({
  key:    Buffer.from(privKeyB64, 'base64url'),
  format: 'der',
  type:   'pkcs8',
});

const sigBuf = sign(null, digest, privateKey);
const sigB64 = sigBuf.toString('base64url');

await writeFile(join(patchDir, 'manifest.sig'), sigB64 + '\n', 'utf8');
process.stdout.write(`Signed: ${join(patchDir, 'manifest.sig')}\n`);
