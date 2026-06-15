/**
 * EnvironmentSnapshot — collects system-level diagnostics without touching the database.
 *
 * Uses only Node.js built-ins (node:os, node:fs, node:path) and environment variables.
 * All paths are resolved from well-known FACTUM_IL_* env vars with safe defaults.
 */

import { platform, arch, release, totalmem, freemem, uptime } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SystemSnapshot, ModelInfo, InstallerDiagnostics } from './types.js';

/** Model the system must have for full AI functionality */
const REQUIRED_MODEL = 'BrainboxAI/law-il-E2B:Q4_K_M';

/**
 * Environment variable keys that are safe to include in support bundles.
 * Anything containing SECRET / KEY / TOKEN / PASSWORD / CREDENTIAL is omitted.
 */
const SAFE_VAR_PREFIXES = ['FACTUM_', 'NODE_', 'npm_', 'PATH', 'USERPROFILE', 'HOME'];
const BLOCKED_SUBSTRINGS = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'CREDENTIAL', 'PRIVATE'];

export class EnvironmentSnapshot {
  // ---------------------------------------------------------------------------
  // System snapshot
  // ---------------------------------------------------------------------------

  /**
   * Collects a point-in-time snapshot of the host environment.
   * Safe to call at any time — never throws.
   */
  collect(traceId: string): SystemSnapshot {
    const factumRoot = process.env['FACTUM_IL_ROOT'] ?? '';
    const dataPath   = process.env['FACTUM_IL_DATA_PATH'] ?? '';
    // Log path matches the pattern in packages/observability/src/logger.ts
    const localAppData = process.env['LOCALAPPDATA'] ?? process.env['HOME'] ?? '';
    const logPath = join(localAppData, 'FactumIL', 'logs');

    return {
      capturedAt:     new Date().toISOString(),
      traceId,
      appVersion:     this._readAppVersion(),
      nodeVersion:    process.version,
      platform:       platform(),
      arch:           arch(),
      osVersion:      release(),
      totalMemoryMB:  Math.round(totalmem() / (1024 * 1024)),
      freeMemoryMB:   Math.round(freemem()  / (1024 * 1024)),
      uptimeSeconds:  Math.round(uptime()),
      factumRoot,
      dataPath,
      logPath,
    };
  }

  // ---------------------------------------------------------------------------
  // Model info
  // ---------------------------------------------------------------------------

  /**
   * Checks whether the required Ollama model is available locally.
   * Attempts a best-effort path probe for the GGUF file; reachability to the
   * Ollama HTTP daemon is NOT tested here (that's done in DiagnosticsCollector).
   */
  collectModelInfo(): ModelInfo {
    const modelsPath = this._modelsPath();
    const ggufFilename = 'gemma-4-E2B-it.BF16-mmproj.gguf';
    const ggufPath = join(modelsPath, 'BrainboxAI', ggufFilename);

    const ggufPresent = existsSync(ggufPath);

    return {
      required:        REQUIRED_MODEL,
      present:         ggufPresent,
      source:          ggufPresent ? 'local-gguf' : 'unknown',
      // Conditionally include ggufPath — exactOptionalPropertyTypes requires omission rather than undefined
      ...(ggufPresent ? { ggufPath: ggufPath } : {}),
      ollamaReachable: false, // populated later by DiagnosticsCollector
    };
  }

  // ---------------------------------------------------------------------------
  // Installer diagnostics
  // ---------------------------------------------------------------------------

  collectInstallerDiagnostics(): InstallerDiagnostics {
    const installPath  = process.env['FACTUM_IL_ROOT'] ?? process.cwd();
    const modelsPath   = this._modelsPath();
    const ggufFilename = 'gemma-4-E2B-it.BF16-mmproj.gguf';
    const ggufPath     = join(modelsPath, 'BrainboxAI', ggufFilename);
    const ggufPresent  = existsSync(ggufPath);

    // Ollama: check for the ollama binary in common Windows locations
    const ollamaPresent =
      existsSync(join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Ollama', 'ollama.exe')) ||
      existsSync('C:\\Program Files\\Ollama\\ollama.exe') ||
      existsSync('/usr/local/bin/ollama') ||
      existsSync('/usr/bin/ollama');

    // WebView2: check registry-based sentinel file (Windows only)
    const webview2Sentinel = join(
      process.env['LOCALAPPDATA'] ?? 'C:\\',
      'Microsoft',
      'EdgeWebView',
      'Application',
    );
    const webview2Present = existsSync(webview2Sentinel);

    return {
      installedVersion: this._readAppVersion(),
      installPath,
      modelsPath,
      ggufPresent,
      ollamaPresent,
      webview2Present,
    };
  }

  // ---------------------------------------------------------------------------
  // Safe env vars
  // ---------------------------------------------------------------------------

  /**
   * Returns a filtered copy of `process.env` with all sensitive variables removed.
   * Only variables with whitelisted prefixes and no blocked substrings are included.
   */
  collectSafeEnvVars(): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;

      // Must start with a safe prefix
      const hasSafePrefix = SAFE_VAR_PREFIXES.some((p) => key.startsWith(p));
      if (!hasSafePrefix) continue;

      // Must not contain blocked substrings in the key name
      const keyUpper = key.toUpperCase();
      const isBlocked = BLOCKED_SUBSTRINGS.some((b) => keyUpper.includes(b));
      if (isBlocked) continue;

      result[key] = value;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _readAppVersion(): string {
    try {
      // Attempt to read from generated version file (injected at build time)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const factumRoot = process.env['FACTUM_IL_ROOT'] ?? '';
      const versionFile = join(factumRoot, 'version.json');
      if (existsSync(versionFile)) {
        // Dynamic require is the simplest approach here without async import
        const raw = require('node:fs').readFileSync(versionFile, 'utf8') as string;
        const parsed = JSON.parse(raw) as { version?: string };
        if (typeof parsed.version === 'string') return parsed.version;
      }
    } catch {
      // Fall through to unknown
    }
    return process.env['FACTUM_IL_VERSION'] ?? 'unknown';
  }

  private _modelsPath(): string {
    return (
      process.env['FACTUM_IL_MODELS_PATH'] ??
      join(
        process.env['LOCALAPPDATA'] ?? process.env['HOME'] ?? '',
        'FactumIL',
        'models',
      )
    );
  }
}
