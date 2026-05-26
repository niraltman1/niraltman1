/**
 * UpdateChannelManager — reads and persists the user's selected update channel.
 *
 * Channel preference is stored in {dataPath}/update-channel.json.
 * Defaults to 'stable' if the file does not exist or cannot be parsed.
 *
 * Future: getManifestUrl() will point at GitHub Releases for each channel.
 * For now the URLs are static constants — the actual manifest fetch lives
 * outside this package.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { UpdateChannel } from './types.js';

const VALID_CHANNELS: ReadonlySet<string> = new Set<UpdateChannel>([
  'beta',
  'stable',
  'enterprise',
]);

const DEFAULT_CHANNEL: UpdateChannel = 'stable';

// Future GitHub Releases manifest URLs — channel-specific asset files
const MANIFEST_URLS: Record<UpdateChannel, string> = {
  beta:       'https://github.com/niraltman1/niraltman1/releases/download/channel-beta/manifest.json',
  stable:     'https://github.com/niraltman1/niraltman1/releases/download/channel-stable/manifest.json',
  enterprise: 'https://github.com/niraltman1/niraltman1/releases/download/channel-enterprise/manifest.json',
};

interface ChannelFile {
  channel: string;
}

export class UpdateChannelManager {
  private readonly channelFilePath: string;

  constructor(private readonly dataPath: string) {
    this.channelFilePath = join(dataPath, 'update-channel.json');
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Reads the persisted channel preference.
   * Falls back to 'stable' if the file is missing, unreadable, or contains
   * an unrecognised channel value.
   */
  async getChannel(): Promise<UpdateChannel> {
    try {
      const raw    = await readFile(this.channelFilePath, 'utf8');
      const parsed = JSON.parse(raw) as ChannelFile;
      const ch     = parsed.channel;
      if (typeof ch === 'string' && VALID_CHANNELS.has(ch)) {
        return ch as UpdateChannel;
      }
    } catch {
      // File missing or unreadable — use default
    }
    return DEFAULT_CHANNEL;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Persists the user's channel preference.
   * Creates the parent directory if needed.
   */
  async setChannel(channel: UpdateChannel): Promise<void> {
    await mkdir(dirname(this.channelFilePath), { recursive: true });
    await writeFile(
      this.channelFilePath,
      JSON.stringify({ channel, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the GitHub Releases manifest URL for the given channel.
   * Future implementation will call this to know where to fetch manifests from.
   */
  static getManifestUrl(channel: UpdateChannel): string {
    return MANIFEST_URLS[channel];
  }
}
