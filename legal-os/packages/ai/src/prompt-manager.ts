import { createHash } from 'node:crypto';
import { logger } from '@legal-os/shared';
import type { DatabaseConnection } from '@legal-os/database';

const AGENT = 'AIStrategist';

export interface PromptVersion {
  readonly key:      string;
  readonly version:  number;
  readonly template: string;
  readonly hash:     string;
}

/**
 * Manages versioned, deterministic prompt templates.
 * Prompts are stored in AIPromptVersions and referenced by hash.
 * Only the active version of each prompt key is used for new enrichments.
 *
 * Determinism rule: the same prompt template + input always produces the
 * same prompt text. Temperature is fixed at 0.1 in OllamaClient.
 */
export class PromptManager {
  private readonly cache = new Map<string, PromptVersion>();

  constructor(private readonly db: DatabaseConnection | null = null) {
    this.registerDefaults();
  }

  /** Returns the active prompt template for a key, or throws if not found. */
  get(key: string): PromptVersion {
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (this.db) {
      const row = this.db.prepare(`
        SELECT prompt_key, version, prompt_template, prompt_hash
          FROM AIPromptVersions
         WHERE prompt_key = ? AND is_active = 1
         ORDER BY version DESC LIMIT 1
      `).get(key) as { prompt_key: string; version: number; prompt_template: string; prompt_hash: string } | undefined;

      if (row) {
        const pv: PromptVersion = {
          key:      row.prompt_key,
          version:  row.version,
          template: row.prompt_template,
          hash:     row.prompt_hash,
        };
        this.cache.set(key, pv);
        return pv;
      }
    }

    throw new Error(`No active prompt found for key: ${key}`);
  }

  /**
   * Renders a prompt template by substituting {{variable}} placeholders.
   * Returns { rendered, promptHash }.
   */
  render(key: string, variables: Record<string, string>): { rendered: string; promptHash: string } {
    const pv = this.get(key);
    let rendered = pv.template;
    for (const [k, v] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v);
    }
    const promptHash = createHash('sha256').update(rendered, 'utf-8').digest('hex');
    return { rendered, promptHash };
  }

  /** Registers a new prompt version. Deactivates previous versions of same key. */
  register(key: string, template: string): PromptVersion {
    const hash = createHash('sha256').update(template, 'utf-8').digest('hex');

    let version = 1;
    if (this.db) {
      const latest = this.db.prepare(
        "SELECT MAX(version) as v FROM AIPromptVersions WHERE prompt_key = ?",
      ).get(key) as { v: number | null };
      version = (latest.v ?? 0) + 1;

      this.db.transaction(() => {
        this.db!.prepare("UPDATE AIPromptVersions SET is_active = 0 WHERE prompt_key = ?").run(key);
        this.db!.prepare(`
          INSERT INTO AIPromptVersions (prompt_key, version, prompt_template, prompt_hash)
          VALUES (?, ?, ?, ?)
        `).run(key, version, template, hash);
      })();
    }

    const pv: PromptVersion = { key, version, template, hash };
    this.cache.set(key, pv);

    logger.info(`PromptManager: registered ${key} v${version} (hash=${hash.slice(0, 8)})`, {
      category: 'ai', agentSource: AGENT,
    });
    return pv;
  }

  private registerDefaults(): void {
    const CLASSIFY_TEMPLATE = `You are a legal document classification assistant for Israeli law.
Respond ONLY with a valid JSON object containing exactly these keys:
  "document_type" (string or null),
  "document_date" (ISO-8601 string or null),
  "suggested_case_number" (string or null — only if explicitly stated in the text),
  "suggested_client_name" (string or null — only if explicitly stated in the text),
  "confidence" (number 0.0–1.0).

CRITICAL RULES:
- Do NOT invent case numbers, IDs, or names that are not present in the text.
- Do NOT override regex-extracted data.
- Confidence must be honest: low if text is unclear.

Filename: {{filename}}
Language: {{language}}

--- DOCUMENT TEXT (first 2000 characters) ---
{{ocr_text}}
--- END ---`;

    this.cache.set('classify_document', {
      key:      'classify_document',
      version:  1,
      template: CLASSIFY_TEMPLATE,
      hash:     createHash('sha256').update(CLASSIFY_TEMPLATE, 'utf-8').digest('hex'),
    });
  }
}
