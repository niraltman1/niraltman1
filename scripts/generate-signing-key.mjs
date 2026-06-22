#!/usr/bin/env node
/**
 * One-time script to generate a Factum-IL Ed25519 signing keypair.
 *
 * Usage:
 *   node scripts/generate-signing-key.mjs
 *
 * Output:
 *   stdout — base64url-encoded public key  → embed in PatchValidator.ts TrustedSigningKeys
 *   stderr — base64url-encoded private key → store in CI secret FACTUM_SIGN_PRIVATE_KEY (never commit)
 *
 * Key rotation: add the new key to TrustedSigningKeys under a new keyId,
 * ship the code, then sign new patches with the new keyId.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding:  { type: 'spki',  format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});

const pubB64  = publicKey.toString('base64url');
const privB64 = privateKey.toString('base64url');

process.stdout.write(pubB64 + '\n');
process.stderr.write(privB64 + '\n');
