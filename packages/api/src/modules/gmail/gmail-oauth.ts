import { google } from 'googleapis';
import { encryptAES256GCM, decryptAES256GCM } from '../security/index.js';
import { deriveBackupKey } from '../security/key-provider.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function buildClient() {
  return new google.auth.OAuth2(
    process.env['GMAIL_CLIENT_ID'],
    process.env['GMAIL_CLIENT_SECRET'],
    process.env['GMAIL_REDIRECT_URI'] ?? 'http://localhost:3001/api/gmail/callback',
  );
}

export function getAuthUrl(): string {
  return buildClient().generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

export interface TokenStore {
  encrypted_token: string;
  token_iv:        string;
  token_tag:       string;
}

async function encryptToken(tokenJson: string): Promise<TokenStore> {
  const derived = await deriveBackupKey();
  if (!derived) {
    // No encryption key available — store as-is with empty iv/tag sentinel
    return { encrypted_token: tokenJson, token_iv: '', token_tag: '' };
  }
  const payload = encryptAES256GCM(Buffer.from(tokenJson, 'utf8'), derived.key);
  return {
    encrypted_token: payload.ciphertext.toString('base64'),
    token_iv:        payload.iv,
    token_tag:       payload.tag,
  };
}

async function decryptToken(store: TokenStore): Promise<string> {
  if (!store.token_iv) {
    // Stored unencrypted (no key was available at save time)
    return store.encrypted_token;
  }
  const derived = await deriveBackupKey();
  if (!derived) throw new Error('Cannot decrypt Gmail token: no encryption key available');
  const buf = decryptAES256GCM(
    {
      ciphertext: Buffer.from(store.encrypted_token, 'base64'),
      iv:         store.token_iv,
      tag:        store.token_tag,
    },
    derived.key,
  );
  return buf.toString('utf8');
}

export async function exchangeCode(code: string): Promise<TokenStore> {
  const client = buildClient();
  const { tokens } = await client.getToken(code);
  return encryptToken(JSON.stringify(tokens));
}

export async function getAccessToken(store: TokenStore): Promise<string> {
  const tokenJson = await decryptToken(store);
  const tokens    = JSON.parse(tokenJson) as { access_token?: string; refresh_token?: string; expiry_date?: number };

  const client = buildClient();
  client.setCredentials(tokens);

  // Refresh if expired or expiring within 5 minutes
  if (!tokens.access_token || (tokens.expiry_date && tokens.expiry_date < Date.now() + 300_000)) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    return credentials.access_token ?? '';
  }

  return tokens.access_token;
}

export async function refreshAndStore(store: TokenStore): Promise<TokenStore> {
  const tokenJson = await decryptToken(store);
  const tokens    = JSON.parse(tokenJson) as object;
  const client    = buildClient();
  client.setCredentials(tokens);
  const { credentials } = await client.refreshAccessToken();
  return encryptToken(JSON.stringify(credentials));
}
