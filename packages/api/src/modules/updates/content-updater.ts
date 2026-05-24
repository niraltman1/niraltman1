import type { Repos } from '../../db.js';

export interface StensTemplateUpdate {
  nameHe:      string;
  category:    string;
  formSchema:  string;
  version:     string;
  contentHash: string;
}

export interface ContentBundle {
  version:        string;
  stensTemplates: StensTemplateUpdate[];
  bundleHash:     string;
}

export async function fetchContentBundle(endpointUrl: string): Promise<ContentBundle | null> {
  if (!endpointUrl.startsWith('https://')) {
    console.warn('[Updates] Content URL must use HTTPS — skipping');
    return null;
  }
  try {
    const res = await fetch(endpointUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return await res.json() as ContentBundle;
  } catch (e) {
    console.warn('[Updates] Failed to fetch content bundle:', e);
    return null;
  }
}

export async function applyContentBundle(
  repos: Repos,
  bundle: ContentBundle,
): Promise<{ stensApplied: number; skipped: number }> {
  const { applied, skipped } = repos.stens.applyContentUpdate(bundle.stensTemplates);

  repos.db.prepare(`
    INSERT INTO UpdateLog (channel, version, status, details)
    VALUES ('content', ?, 'success', ?)
  `).run(bundle.version, JSON.stringify({ stensApplied: applied, skipped }));

  return { stensApplied: applied, skipped };
}
