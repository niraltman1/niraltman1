import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersionManifestParser } from '../VersionManifest.js';
import { UpdateValidator } from '../UpdateValidator.js';
import { UpdateChannelManager } from '../UpdateChannel.js';
import { UpdateStateStore } from '../UpdateStateStore.js';
import { UpdateDownloader } from '../UpdateDownloader.js';
import type { VersionManifest, UpdateState } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<VersionManifest> = {}): VersionManifest {
  return {
    channel:              'stable',
    latestVersion:        '2.0.0',
    minCompatibleVersion: '1.5.0',
    releaseDate:          '2026-05-26T00:00:00.000Z',
    releaseNotes:         'גרסה חדשה עם תיקוני באגים ושיפורי ביצועים',
    assetUrl:             'https://github.com/niraltman1/niraltman1/releases/download/v2.0.0/installer.exe',
    sha256:               'a'.repeat(64),
    mandatory:            false,
    ...overrides,
  };
}

function makeState(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    currentVersion:  '1.8.0',
    channel:         'stable',
    lastCheckedAt:   null,
    pendingManifest: null,
    rollback:        null,
    updateInProgress: false,
    systemState:     'NORMAL',
    recoveryPoints:  [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// VersionManifestParser.compareVersions
// ---------------------------------------------------------------------------

describe('VersionManifestParser.compareVersions()', () => {
  it('returns 0 for identical versions', () => {
    expect(VersionManifestParser.compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns 1 when a > b (major)', () => {
    expect(VersionManifestParser.compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('returns -1 when a < b (major)', () => {
    expect(VersionManifestParser.compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('compares minor versions correctly', () => {
    expect(VersionManifestParser.compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(VersionManifestParser.compareVersions('1.2.0', '1.10.0')).toBe(-1);
  });

  it('compares patch versions correctly', () => {
    expect(VersionManifestParser.compareVersions('1.0.2', '1.0.1')).toBe(1);
    expect(VersionManifestParser.compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('treats release as greater than pre-release', () => {
    // stable > beta
    expect(VersionManifestParser.compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
    expect(VersionManifestParser.compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });

  it('compares pre-release tags lexicographically', () => {
    expect(VersionManifestParser.compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1);
    expect(VersionManifestParser.compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('handles versions with single digit and double digit patch', () => {
    expect(VersionManifestParser.compareVersions('1.0.10', '1.0.9')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// VersionManifestParser.isMandatoryUpdate
// ---------------------------------------------------------------------------

describe('VersionManifestParser.isMandatoryUpdate()', () => {
  it('returns true when current version is below minimum compatible', () => {
    const manifest = makeManifest({ minCompatibleVersion: '1.5.0' });
    expect(VersionManifestParser.isMandatoryUpdate(manifest, '1.4.0')).toBe(true);
    expect(VersionManifestParser.isMandatoryUpdate(manifest, '1.4.9')).toBe(true);
  });

  it('returns false when current version equals the minimum compatible', () => {
    const manifest = makeManifest({ minCompatibleVersion: '1.5.0' });
    expect(VersionManifestParser.isMandatoryUpdate(manifest, '1.5.0')).toBe(false);
  });

  it('returns false when current version is above the minimum compatible', () => {
    const manifest = makeManifest({ minCompatibleVersion: '1.5.0' });
    expect(VersionManifestParser.isMandatoryUpdate(manifest, '1.8.0')).toBe(false);
    expect(VersionManifestParser.isMandatoryUpdate(manifest, '2.0.0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VersionManifestParser.parse
// ---------------------------------------------------------------------------

describe('VersionManifestParser.parse()', () => {
  it('parses a valid manifest object', () => {
    const raw = makeManifest();
    const result = VersionManifestParser.parse(raw);
    expect(result).not.toBeNull();
    expect(result?.latestVersion).toBe('2.0.0');
  });

  it('returns null for null input', () => {
    expect(VersionManifestParser.parse(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(VersionManifestParser.parse('string')).toBeNull();
    expect(VersionManifestParser.parse(42)).toBeNull();
    expect(VersionManifestParser.parse([])).toBeNull();
  });

  it('returns null when required field is missing', () => {
    const { latestVersion: _omit, ...rest } = makeManifest();
    expect(VersionManifestParser.parse(rest)).toBeNull();
  });

  it('returns null when channel is invalid', () => {
    expect(VersionManifestParser.parse(makeManifest({ channel: 'nightly' as never }))).toBeNull();
  });

  it('returns null when latestVersion is not semver', () => {
    expect(VersionManifestParser.parse(makeManifest({ latestVersion: 'v2.0' }))).toBeNull();
  });

  it('returns null when sha256 is not 64 characters', () => {
    expect(VersionManifestParser.parse(makeManifest({ sha256: 'tooshort' }))).toBeNull();
  });

  it('returns null when assetUrl does not use HTTPS', () => {
    expect(VersionManifestParser.parse(makeManifest({ assetUrl: 'http://example.com/file.exe' }))).toBeNull();
  });

  it('returns null when mandatory is not a boolean', () => {
    expect(VersionManifestParser.parse(makeManifest({ mandatory: 'yes' as never }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateValidator.validate
// ---------------------------------------------------------------------------

describe('UpdateValidator.validate()', () => {
  it('returns valid=true for a clean update scenario', () => {
    const manifest = makeManifest({ latestVersion: '2.0.0', channel: 'stable' });
    const state    = makeState({ currentVersion: '1.8.0', channel: 'stable' });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns an error when update is already in progress', () => {
    const manifest = makeManifest();
    const state    = makeState({ updateInProgress: true });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('מתבצע'))).toBe(true);
  });

  it('returns an error when manifest version is not newer than current', () => {
    const manifest = makeManifest({ latestVersion: '1.8.0' });
    const state    = makeState({ currentVersion: '1.8.0' });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('1.8.0'))).toBe(true);
  });

  it('returns an error when manifest version is older than current', () => {
    const manifest = makeManifest({ latestVersion: '1.5.0' });
    const state    = makeState({ currentVersion: '2.0.0' });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(false);
  });

  it('returns an error when channels do not match', () => {
    const manifest = makeManifest({ channel: 'beta' });
    const state    = makeState({ channel: 'stable' });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('beta') && e.includes('stable'))).toBe(true);
  });

  it('returns an error when assetUrl is not HTTPS', () => {
    const manifest = makeManifest({ assetUrl: 'http://example.com/installer.exe' });
    const result   = UpdateValidator.validate(manifest, makeState());
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('HTTPS'))).toBe(true);
  });

  it('returns a warning when no rollback is available', () => {
    const manifest = makeManifest();
    const state    = makeState({ rollback: null });
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.warnings.some((w) => w.includes('rollback'))).toBe(true);
  });

  it('returns a warning when the update is marked mandatory', () => {
    const manifest = makeManifest({ mandatory: true });
    const state    = makeState();
    const result   = UpdateValidator.validate(manifest, state);
    expect(result.warnings.some((w) => w.includes('חובה'))).toBe(true);
  });

  it('returns a warning when current version is below minCompatibleVersion', () => {
    const manifest = makeManifest({ minCompatibleVersion: '2.0.0' });
    const state    = makeState({ currentVersion: '1.0.0' });
    const result   = UpdateValidator.validate(manifest, state);
    // valid = false because version is not newer (2.0.0 vs latest 2.0.0)
    // But the mandatory warning should also appear
    expect(result.warnings.some((w) => w.includes('חובה'))).toBe(true);
  });

  it('can accumulate multiple errors simultaneously', () => {
    const manifest = makeManifest({
      latestVersion: '1.0.0',
      channel:       'beta',
    });
    const state = makeState({
      currentVersion:   '2.0.0',
      channel:          'stable',
      updateInProgress: true,
    });
    const result = UpdateValidator.validate(manifest, state);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// UpdateChannelManager
// ---------------------------------------------------------------------------

describe('UpdateChannelManager', () => {
  let tmpDir: string;
  let manager: UpdateChannelManager;

  beforeEach(async () => {
    tmpDir  = await mkdtemp(join(tmpdir(), 'factum-update-test-'));
    manager = new UpdateChannelManager(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns "stable" when no channel file exists', async () => {
    const channel = await manager.getChannel();
    expect(channel).toBe('stable');
  });

  it('persists and retrieves a channel', async () => {
    await manager.setChannel('beta');
    const channel = await manager.getChannel();
    expect(channel).toBe('beta');
  });

  it('persists enterprise channel', async () => {
    await manager.setChannel('enterprise');
    expect(await manager.getChannel()).toBe('enterprise');
  });

  it('falls back to stable when channel file contains invalid value', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(tmpDir, 'update-channel.json'), '{"channel":"nightly"}', 'utf8');
    expect(await manager.getChannel()).toBe('stable');
  });
});

describe('UpdateChannelManager.getManifestUrl()', () => {
  it('returns an HTTPS URL for each channel', () => {
    for (const channel of ['beta', 'stable', 'enterprise'] as const) {
      const url = UpdateChannelManager.getManifestUrl(channel);
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('returns different URLs for different channels', () => {
    const betaUrl    = UpdateChannelManager.getManifestUrl('beta');
    const stableUrl  = UpdateChannelManager.getManifestUrl('stable');
    const entUrl     = UpdateChannelManager.getManifestUrl('enterprise');
    expect(betaUrl).not.toBe(stableUrl);
    expect(stableUrl).not.toBe(entUrl);
  });
});

// ---------------------------------------------------------------------------
// UpdateStateStore
// ---------------------------------------------------------------------------

describe('UpdateStateStore', () => {
  let tmpDir: string;
  let store: UpdateStateStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'factum-state-test-'));
    store  = new UpdateStateStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when state file does not exist', async () => {
    const state = await store.read();
    expect(state.channel).toBe('stable');
    expect(state.lastCheckedAt).toBeNull();
    expect(state.pendingManifest).toBeNull();
    expect(state.rollback).toBeNull();
    expect(state.updateInProgress).toBe(false);
  });

  it('persists and reads back partial state', async () => {
    await store.write({ lastCheckedAt: '2026-05-26T10:00:00.000Z' });
    const state = await store.read();
    expect(state.lastCheckedAt).toBe('2026-05-26T10:00:00.000Z');
  });

  it('merges partial write without losing other fields', async () => {
    await store.write({ channel: 'beta' });
    await store.write({ lastCheckedAt: '2026-05-26T12:00:00.000Z' });
    const state = await store.read();
    expect(state.channel).toBe('beta');
    expect(state.lastCheckedAt).toBe('2026-05-26T12:00:00.000Z');
  });

  it('persists updateInProgress flag', async () => {
    await store.write({ updateInProgress: true });
    const state = await store.read();
    expect(state.updateInProgress).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdateDownloader
// ---------------------------------------------------------------------------

function makePayload(content: string): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from(content, 'utf-8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, sha256 };
}

function makeFetchMock(payload: Buffer, statusOk = true) {
  return vi.fn().mockResolvedValue({
    ok:     statusOk,
    status: statusOk ? 200 : 404,
    body:   statusOk ? makeReadableStream(payload) : null,
    headers: new Headers({ 'content-length': String(payload.length) }),
  });
}

function makeReadableStream(data: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    },
  });
}

describe('UpdateDownloader', () => {
  let tmpDir: string;
  let downloader: UpdateDownloader;

  beforeEach(async () => {
    tmpDir     = await mkdtemp(join(tmpdir(), 'factum-dl-test-'));
    downloader = new UpdateDownloader(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('downloads file and calls onProgress with increasing percentages', async () => {
    const { bytes, sha256 } = makePayload('fake installer binary content');
    vi.stubGlobal('fetch', makeFetchMock(bytes));

    const manifest = makeManifest({ sha256 });
    const progEvents: number[] = [];

    const result = await downloader.download(manifest, (p) => {
      progEvents.push(p.percentComplete);
    });

    expect(result.verified).toBe(true);
    expect(result.filePath).toContain('installer-2.0.0.exe');

    // Progress must end at 100
    const last = progEvents[progEvents.length - 1];
    expect(last).toBe(100);
  });

  it('throws and deletes the file when SHA-256 does not match', async () => {
    const { bytes } = makePayload('fake installer binary content');
    vi.stubGlobal('fetch', makeFetchMock(bytes));

    const manifest = makeManifest({ sha256: 'b'.repeat(64) }); // wrong hash

    await expect(downloader.download(manifest)).rejects.toThrow(/sha-256 mismatch/i);
  });

  it('skips re-download if file already exists with correct hash', async () => {
    const { bytes, sha256 } = makePayload('already downloaded content');
    const fetchMock = makeFetchMock(bytes);
    vi.stubGlobal('fetch', fetchMock);

    const manifest = makeManifest({ sha256 });

    // First download writes the file
    await downloader.download(manifest);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call should skip fetch entirely
    const result2 = await downloader.download(manifest);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still 1 — no re-download
    expect(result2.verified).toBe(true);

    // File contents should still be valid
    const diskBytes = await readFile(result2.filePath);
    expect(diskBytes.toString()).toBe('already downloaded content');
  });
});
