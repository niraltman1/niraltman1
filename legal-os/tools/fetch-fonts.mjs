#!/usr/bin/env node
/**
 * Downloads required WOFF2 fonts from Google Fonts API for self-hosting.
 * Idempotent: skips files that already exist.
 * Run before building the dashboard: node tools/fetch-fonts.mjs
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'apps', 'dashboard', 'src', 'styles', 'fonts');

// Google Fonts CSS2 API — returns @font-face with WOFF2 URLs
const FONT_QUERIES = [
  'family=Heebo:wght@300;400;500;600;700;800',
  'family=Frank+Ruhl+Libre:wght@400;500;700;900',
  'family=Inter:wght@400;500;600;700',
  'family=JetBrains+Mono:wght@400;500;700',
];

// Use a modern Chrome Windows UA so Google Fonts returns WOFF2 (not TTF)
const WOFF2_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': WOFF2_UA },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location).then(resolve, reject);
      }
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadFile(url, dest) {
  if (existsSync(dest)) { console.log(`  skip  ${dest.split('/').pop()}`); return; }
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      const ws = createWriteStream(dest);
      pipeline(res, ws).then(resolve, reject);
    }).on('error', reject);
  });
}

await mkdir(OUT_DIR, { recursive: true });

const allCss = [];
for (const q of FONT_QUERIES) {
  const url = `https://fonts.googleapis.com/css2?${q}&display=swap`;
  console.log(`Fetching CSS: ${q.split('=')[1].split(':')[0]}`);
  const css = await fetchText(url);
  allCss.push(css);
}

// Extract WOFF2 URLs and their font-family/weight metadata from the CSS
const combined = allCss.join('\n');
const urlPattern = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
const facePattern = /font-family:\s*'([^']+)'[^}]*font-weight:\s*(\d+)[^}]*src:\s*[^}]*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/gs;

const downloads = [];
let match;
// Use simple URL extraction — one file per unique URL
const seen = new Set();
while ((match = urlPattern.exec(combined)) !== null) {
  const woff2Url = match[1];
  if (seen.has(woff2Url)) continue;
  seen.add(woff2Url);
  // Derive filename from URL path segments
  const parts = new URL(woff2Url).pathname.split('/');
  const filename = parts[parts.length - 1];
  downloads.push({ url: woff2Url, filename });
}

console.log(`\nDownloading ${downloads.length} WOFF2 files…`);
for (const { url, filename } of downloads) {
  const dest = join(OUT_DIR, filename);
  process.stdout.write(`  ${filename} … `);
  await downloadFile(url, dest);
  console.log('ok');
}

// Write a CSS file with @font-face rules pointing at local files
const localCss = combined.replace(
  /url\((https:\/\/fonts\.gstatic\.com\/([^)]+\.woff2))\)/g,
  (_, _fullUrl, path) => {
    const filename = path.split('/').pop();
    return `url('./fonts/${filename}')`;
  },
);

const cssDest = join(OUT_DIR, '..', 'fonts.css');
await writeFile(cssDest, localCss, 'utf8');
console.log(`\nfonts.css written to ${cssDest}`);
