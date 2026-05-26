import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Repos } from '../db.js';
import { logger } from '@factum-il/shared';

export interface DeadlineRule {
  regulation:   string;
  section:      string;
  days:         number;
  description_he: string;
}

export interface RegistryEntry {
  id:               number;
  prefix_code:      string | null;
  full_name_he:     string | null;
  subject_he:       string;
  case_type:        string;
  procedure_domain: string;
  deadline_rules:   DeadlineRule[];
  registry_source:  string;
}

interface RegistryFile {
  metadata:          Record<string, unknown>;
  procedure_domains: Record<string, { name_he: string; year: number }>;
  case_types:        RegistryEntry[];
}

// ── Path resolution ────────────────────────────────────────────────────────────
// Resolve from FACTUM_IL_ROOT env var (set by installer) or fall back to monorepo
// root relative to the compiled output at packages/api/dist/utils/.

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = process.env['FACTUM_IL_ROOT']
  ?? join(__dirname, '..', '..', '..', '..');   // dist/utils → api → packages → factum-il
const LIB_DIR    = join(REPO_ROOT, 'powershell', 'lib');
const BASE_PATH  = join(LIB_DIR, 'Legal_Registry.json');
const EXT_DIR    = join(LIB_DIR, 'User_Extensions');

// ── In-memory index: prefix_code (normalised) → RegistryEntry ─────────────────
const _index = new Map<string, RegistryEntry>();
let _loaded  = false;

function normalise(prefix: string): string {
  return prefix.trim().replace(/\s+/g, ' ');
}

function loadFile(path: string, source: string): RegistryEntry[] {
  try {
    const raw  = readFileSync(path, 'utf8');
    const data = JSON.parse(raw) as RegistryFile;
    if (!Array.isArray(data.case_types)) return [];
    return data.case_types;
  } catch (e) {
    logger.warn(`[legal-registry] Failed to load ${source}: ${String(e)}`, { category: 'system' });
    return [];
  }
}

export function initRegistry(): void {
  if (_loaded) return;
  _loaded = true;

  if (!existsSync(BASE_PATH)) {
    logger.warn('[legal-registry] Legal_Registry.json not found — run: node tools/ingest-legal-sources.mjs', { category: 'system' });
    return;
  }

  const baseEntries = loadFile(BASE_PATH, 'Legal_Registry.json');
  for (const entry of baseEntries) {
    if (entry.prefix_code) _index.set(normalise(entry.prefix_code), entry);
  }

  // Merge User_Extensions — extensions override base entries by prefix_code
  if (existsSync(EXT_DIR)) {
    let extFiles: string[] = [];
    try { extFiles = readdirSync(EXT_DIR).filter((f) => f.endsWith('.json')); } catch { /* empty */ }
    for (const file of extFiles) {
      const entries = loadFile(join(EXT_DIR, file), `User_Extensions/${file}`);
      for (const entry of entries) {
        if (entry.prefix_code) _index.set(normalise(entry.prefix_code), { ...entry, registry_source: 'user_extension' });
      }
      logger.info(`[legal-registry] Loaded extension: ${file} (${entries.filter((e) => e.prefix_code).length} entries)`, { category: 'system' });
    }
  }

  logger.info(`[legal-registry] Registry ready — ${_index.size} prefix entries`, { category: 'system' });
}

export function lookupPrefix(prefix: string): RegistryEntry | null {
  return _index.get(normalise(prefix)) ?? null;
}

export function tagManualReview(caseId: number, repos: Repos): void {
  repos.db.prepare(`
    UPDATE Cases
       SET registry_status = 'manual_review_required',
           updated_at      = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?
  `).run(caseId);
}

export function tagMapped(caseId: number, repos: Repos): void {
  repos.db.prepare(`
    UPDATE Cases
       SET registry_status = 'mapped',
           updated_at      = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?
  `).run(caseId);
}
