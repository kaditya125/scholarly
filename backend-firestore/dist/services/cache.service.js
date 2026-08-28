"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
const env_1 = require("../config/env");
const redisQuota_1 = require("./redisQuota");
class InMemoryCache {
    maxEntries;
    cache = new Map();
    /**
     * Bounded so a long-lived process cannot accumulate every key it has ever seen. Eviction is
     * oldest-inserted-first, which a Map gives for free via insertion order.
     */
    constructor(maxEntries = Number(process.env.MEMORY_CACHE_MAX_ENTRIES || 5000)) {
        this.maxEntries = maxEntries;
    }
    async get(key) {
        const item = this.cache.get(key);
        if (!item)
            return null;
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }
    async set(key, value, ttlSeconds) {
        const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        // Re-inserting moves the key to the end, so a hot key is not evicted for being old.
        this.cache.delete(key);
        this.cache.set(key, { value, expiry });
        while (this.cache.size > this.maxEntries) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined)
                break;
            this.cache.delete(oldest);
        }
    }
    async del(key) {
        this.cache.delete(key);
    }
}
class UpstashRedisCache {
    url;
    token;
    constructor(url, token) {
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
    async request(endpoint, init) {
        const response = await fetch(endpoint, {
            ...init,
            headers: { Authorization: `Bearer ${this.token}`, ...(init?.headers || {}) },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) {
            throw new Error(String(data?.error || `Upstash HTTP ${response.status}`));
        }
        return data;
    }
    async get(key) {
        try {
            const data = await this.request(`${this.url}/get/${encodeURIComponent(key)}`);
            if (data.result)
                return JSON.parse(data.result);
            return null;
        }
        catch (e) {
            if (!(0, redisQuota_1.noteRedisError)(e, 'cache.get'))
                console.error('Redis GET error:', e);
            return null;
        }
    }
    async set(key, value, ttlSeconds) {
        try {
            const stringValue = JSON.stringify(value);
            if (ttlSeconds) {
                await this.request(`${this.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(stringValue)}/EX/${ttlSeconds}`, { method: 'POST' });
            }
            else {
                await this.request(`${this.url}/set/${encodeURIComponent(key)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: stringValue,
                });
            }
        }
        catch (e) {
            if (!(0, redisQuota_1.noteRedisError)(e, 'cache.set'))
                console.error('Redis SET error:', e);
        }
    }
    async del(key) {
        try {
            await this.request(`${this.url}/del/${encodeURIComponent(key)}`);
        }
        catch (e) {
            if (!(0, redisQuota_1.noteRedisError)(e, 'cache.del'))
                console.error('Redis DEL error:', e);
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
class TieredCache {
    l1;
    l2;
    constructor(l1, l2) {
        this.l1 = l1;
        this.l2 = l2;
    }
    async get(key) {
        const hit = await this.l1.get(key);
        if (hit !== null)
            return hit;
        if ((0, redisQuota_1.isRedisOverQuota)())
            return null;
        const remote = await this.l2.get(key);
        // Populated without a TTL: the remote tier owns expiry, and L1 is bounded by size. A short
        // local TTL would only force the same key to be fetched again on the next request.
        if (remote !== null)
            await this.l1.set(key, remote);
        return remote;
    }
    async set(key, value, ttlSeconds) {
        await this.l1.set(key, value, ttlSeconds);
        if ((0, redisQuota_1.isRedisOverQuota)())
            return;
        await this.l2.set(key, value, ttlSeconds);
    }
    async del(key) {
        await this.l1.del(key);
        if ((0, redisQuota_1.isRedisOverQuota)())
            return;
        await this.l2.del(key);
    }
}
/**
 * Factory.
 *
 * ── THE TRAP THIS GUARDS ──────────────────────────────────────────────────────────────────
 * This previously read `new UpstashRedisCache(env.REDIS_URL, env.REDIS_TOKEN)`. REDIS_URL is the
 * RESP endpoint — `rediss://…upstash.io:6379` — but UpstashRedisCache is an HTTP client that
 * builds `${url}/get/${key}` and calls fetch() on it. fetch cannot speak rediss://, so every
 * get and set would have thrown, been swallowed by the catch in each method, and produced a
 * cache with a permanent 0% hit rate that logged nothing anyone would notice.
 *
 * It never fired only because REDIS_TOKEN was unset in production, so this branch was dead —
 * meaning the bug was waiting for whoever finally tried to turn Redis caching on.
 *
 * REDIS_REST_URL is now a separate variable, and the http(s) check below makes a misconfiguration
 * announce itself at boot instead of degrading into a silent no-op.
 */
function resolveCache() {
    const memory = new InMemoryCache();
    if (env_1.env.NODE_ENV !== 'production')
        return memory;
    const restUrl = env_1.env.REDIS_REST_URL;
    const token = env_1.env.REDIS_TOKEN;
    if (!restUrl || !token)
        return memory; // not configured: in-memory only, which is fine
    if (!/^https?:\/\//i.test(restUrl)) {
        console.warn('[cache] REDIS_REST_URL is not an http(s) URL, so the Redis cache tier is DISABLED. ' +
            'It must be the Upstash REST endpoint (https://…upstash.io), not the rediss:// ' +
            'connection string used by REDIS_URL. Falling back to in-memory cache.');
        return memory;
    }
    console.log('[cache] Redis cache tier enabled (in-memory L1 + Upstash REST L2)');
    return new TieredCache(memory, new UpstashRedisCache(restUrl, token));
}
exports.cacheService = resolveCache();
