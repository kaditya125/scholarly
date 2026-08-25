import { env } from '../config/env';
import { isRedisOverQuota, noteRedisError } from './redisQuota';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

class InMemoryCache implements CacheService {
  private cache = new Map<string, { value: any; expiry: number | null }>();

  /**
   * Bounded so a long-lived process cannot accumulate every key it has ever seen. Eviction is
   * oldest-inserted-first, which a Map gives for free via insertion order.
   */
  constructor(private readonly maxEntries = Number(process.env.MEMORY_CACHE_MAX_ENTRIES || 5000)) {}

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    // Re-inserting moves the key to the end, so a hot key is not evicted for being old.
    this.cache.delete(key);
    this.cache.set(key, { value, expiry });
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

class UpstashRedisCache implements CacheService {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, ''); // remove trailing slash
    this.token = token;
  }

  /**
   * Upstash answers a quota rejection with a NON-2xx status and an `error` field. This used to go
   * unchecked: `data.result` was simply undefined, `get` returned null, and the caller read that as
   * an ordinary cache miss. Every miss then wrote back through `set`, so an exhausted quota cost
   * TWO requests per lookup at a guaranteed 0% hit rate — spending the budget fastest exactly when
   * there was none left. Surfacing it lets the breaker stop the traffic instead.
   */
  private async request(endpoint: string, init?: RequestInit): Promise<any> {
    const response = await fetch(endpoint, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({} as any));
    if (!response.ok || data?.error) {
      throw new Error(String(data?.error || `Upstash HTTP ${response.status}`));
    }
    return data;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.request(`${this.url}/get/${encodeURIComponent(key)}`);
      if (data.result) return JSON.parse(data.result) as T;
      return null;
    } catch (e) {
      if (!noteRedisError(e, 'cache.get')) console.error('Redis GET error:', e);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSeconds) {
        await this.request(
          `${this.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(stringValue)}/EX/${ttlSeconds}`,
          { method: 'POST' },
        );
      } else {
        await this.request(`${this.url}/set/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: stringValue,
        });
      }
    } catch (e) {
      if (!noteRedisError(e, 'cache.set')) console.error('Redis SET error:', e);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.request(`${this.url}/del/${encodeURIComponent(key)}`);
    } catch (e) {
      if (!noteRedisError(e, 'cache.del')) console.error('Redis DEL error:', e);
    }
  }
}

/**
 * In-process L1 in front of Redis.
 *
 * Upstash bills per REQUEST, so the cost of a cache is measured in lookups, not bytes. The hot
 * path here is RAG retrieval, where the same query text recurs constantly — and every one of those
 * repeats was previously a network round trip to Upstash purely to be told something this process
 * already knew a moment ago.
 *
 * L1 answers those for free. Redis stays the shared tier so cached work survives a restart and
 * still serves a second instance if this ever runs more than one, which is why it is not simply
 * replaced by memory.
 */
class TieredCache implements CacheService {
  constructor(private readonly l1: InMemoryCache, private readonly l2: CacheService) {}

  async get<T>(key: string): Promise<T | null> {
    const hit = await this.l1.get<T>(key);
    if (hit !== null) return hit;

    if (isRedisOverQuota()) return null;

    const remote = await this.l2.get<T>(key);
    // Populated without a TTL: the remote tier owns expiry, and L1 is bounded by size. A short
    // local TTL would only force the same key to be fetched again on the next request.
    if (remote !== null) await this.l1.set(key, remote);
    return remote;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.l1.set(key, value, ttlSeconds);
    if (isRedisOverQuota()) return;
    await this.l2.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.l1.del(key);
    if (isRedisOverQuota()) return;
    await this.l2.del(key);
  }
}

// Factory to resolve correct cache based on environment
export const cacheService: CacheService =
  (env.NODE_ENV === 'production' && env.REDIS_URL && env.REDIS_TOKEN)
    ? new TieredCache(new InMemoryCache(), new UpstashRedisCache(env.REDIS_URL, env.REDIS_TOKEN))
    : new InMemoryCache();
