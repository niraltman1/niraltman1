/**
 * GraphInsightsCache — async cache interface for Knowledge Graph queries.
 *
 * The async interface is intentional: it lets a future RedisGraphCache
 * replace MemoryGraphCache at call sites without any rewriting.
 * (Electron main + worker + background service each have their own heap,
 * so in-process Map() would split the cache across processes.)
 *
 * Cache key versioning: all keys include a version prefix (e.g. "graph:v1").
 * When the DB schema changes, increment the version constant to automatically
 * invalidate stale entries without a deploy-time flush step.
 */

export const GRAPH_CACHE_VERSION = 'v1' as const;

export interface GraphCacheOptions {
  /** Override the default TTL (15 minutes) for this specific entry. */
  ttlMs?: number;
}

export interface GraphCacheProvider {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, opts?: GraphCacheOptions): Promise<void>;
  invalidate(prefix?: string): Promise<void>;
}

// ── Cache key helpers ─────────────────────────────────────────────────────────

export const CacheKeys = {
  graph:    `graph:${GRAPH_CACHE_VERSION}`,
  related:  (caseId: number) => `related:${GRAPH_CACHE_VERSION}:${caseId}`,
  insights: `insights:${GRAPH_CACHE_VERSION}`,
} as const;

// ── MemoryGraphCache ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value:     T;
  expiresAt: number;
  lastUsed:  number;
}

const DEFAULT_TTL_MS  = 15 * 60 * 1_000; // 15 minutes
const MAX_ENTRIES     = 5_000;
const SWEEP_INTERVAL  = 5 * 60 * 1_000;  // sweep every 5 minutes

export class MemoryGraphCache implements GraphCacheProvider {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.sweepTimer = setInterval(() => this._sweep(), SWEEP_INTERVAL);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastUsed = Date.now();
    return entry.value as T;
  }

  async set<T>(key: string, value: T, opts?: GraphCacheOptions): Promise<void> {
    if (this.store.size >= MAX_ENTRIES) this._evictLRU();
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (opts?.ttlMs ?? DEFAULT_TTL_MS),
      lastUsed:  Date.now(),
    });
  }

  async invalidate(prefix?: string): Promise<void> {
    if (prefix === undefined) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  stop(): void {
    clearInterval(this.sweepTimer);
  }

  private _sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  private _evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastUsed < oldestTime) { oldestTime = entry.lastUsed; oldestKey = key; }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

// ── Singleton instance (used by routes via GraphCacheInvalidationService) ─────

export const graphCache: GraphCacheProvider = new MemoryGraphCache();
