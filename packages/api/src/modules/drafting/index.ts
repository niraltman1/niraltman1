/**
 * modules/drafting — Business logic extracted from routes/drafts.ts.
 *
 * Covers:
 *   - buildPrintHtml: wrap draft content in a print-ready RTL HTML shell
 *   - snapshotVersion: create a version snapshot entry when content changes
 *   - restoreVersion: apply a historical snapshot back onto the live draft
 */

import type { DraftsRepository } from '@factum-il/database';

// ── HTML print wrapper ────────────────────────────────────────────────────────

/**
 * Wrap draft content in a print-ready RTL HTML document.
 * Used by GET /api/drafts/:id/export/html.
 */
export function buildPrintHtml(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  body { font-family: David, serif; font-size: 14pt; margin: 2cm; direction: rtl; }
  h1 { font-size: 16pt; text-align: center; }
  h2 { font-size: 14pt; }
  p  { line-height: 1.6; }
  @media print { body { margin: 1.5cm; } }
</style>
</head>
<body>
<h1>${title}</h1>
${contentHtml}
</body>
</html>`;
}

// ── Version snapshot helpers ──────────────────────────────────────────────────

/** Shape of the fields accepted by draftsRepository.createVersion. */
export interface VersionPayload {
  draft_id:        number;
  version_number:  number;
  content_json:    string | null;
  content_html:    string | null;
  word_count:      number;
  change_reason:   string;
  is_ai_generated: 0 | 1;
  ai_operation:    string | null;
  created_by:      string | null;
}

/**
 * Create a version snapshot of the current draft content.
 * Calls drafts.nextVersionNumber then drafts.createVersion.
 * Returns the new version number.
 */
export function snapshotVersion(
  drafts: DraftsRepository,
  draftId: number,
  opts: {
    contentJson:    string;
    contentHtml?:   string | null;
    wordCount?:     number;
    changeReason?:  string;
    isAiGenerated?: boolean;
    aiOperation?:   string | null;
    createdBy?:     string | null;
    currentWordCount?: number;
  },
): number {
  const nextVer = drafts.nextVersionNumber(draftId);
  drafts.createVersion(draftId, {
    draft_id:        draftId,
    version_number:  nextVer,
    content_json:    opts.contentJson,
    content_html:    opts.contentHtml ?? null,
    word_count:      opts.wordCount ?? opts.currentWordCount ?? 0,
    change_reason:   opts.changeReason ?? 'autosave',
    is_ai_generated: opts.isAiGenerated ? 1 : 0,
    ai_operation:    opts.aiOperation ?? null,
    created_by:      opts.createdBy ?? null,
  });
  return nextVer;
}

/**
 * Restore a draft to a historical version.
 * Updates the live draft row and records a new version snapshot.
 * Returns the updated draft record.
 */
export function restoreToVersion(
  drafts: DraftsRepository,
  draftId: number,
  fromVersionNumber: number,
): ReturnType<DraftsRepository['update']> {
  const snapshot = drafts.getVersion(draftId, fromVersionNumber);
  if (!snapshot) {
    throw new Error(`Version ${fromVersionNumber} not found for draft ${draftId}`);
  }

  const updated = drafts.update(draftId, {
    content_json: snapshot.content_json,
    content_html: snapshot.content_html,
    word_count:   snapshot.word_count,
  });

  const nextVer = drafts.nextVersionNumber(draftId);
  drafts.createVersion(draftId, {
    draft_id:        draftId,
    version_number:  nextVer,
    content_json:    snapshot.content_json,
    content_html:    snapshot.content_html,
    word_count:      snapshot.word_count,
    change_reason:   `restore from v${fromVersionNumber}`,
    is_ai_generated: 0,
    ai_operation:    null,
    created_by:      null,
  });

  return updated;
}
