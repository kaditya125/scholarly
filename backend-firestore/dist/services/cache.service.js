"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
const env_1 = require("../config/env");
class InMemoryCache {
    cache = new Map();
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
        this.cache.set(key, { value, expiry });
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
    async get(key) {
        try {
            const response = await fetch(`${this.url}/get/${encodeURIComponent(key)}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.result) {
                return JSON.parse(data.result);
            }
            return null;
        }
        catch (e) {
            console.error('Redis GET error:', e);
            return null;
        }
    }
    async set(key, value, ttlSeconds) {
        try {
            const stringValue = JSON.stringify(value);
            let endpoint = `${this.url}/set/${encodeURIComponent(key)}`;
            const body = ttlSeconds
                ? JSON.stringify(["EX", ttlSeconds]) // Assuming we pass EX via body or query, actually Upstash REST API for SET with EX is `/set/key/val/EX/seconds`
                : undefined;
            if (ttlSeconds) {
                endpoint = `${this.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(stringValue)}/EX/${ttlSeconds}`;
                await fetch(endpoint, {
                    method: 'POST', // or GET depending on Upstash REST, standard is GET for simple or POST for body
                    headers: { Authorization: `Bearer ${this.token}` }
                });
            }
            else {
                await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: stringValue
                });
            }
        }
        catch (e) {
            console.error('Redis SET error:', e);
        }
    }
    async del(key) {
        try {
            await fetch(`${this.url}/del/${encodeURIComponent(key)}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
        }
        catch (e) {
            console.error('Redis DEL error:', e);
        }
    }
}
// Factory to resolve correct cache based on environment
exports.cacheService = (env_1.env.NODE_ENV === 'production' && env_1.env.REDIS_URL && env_1.env.REDIS_TOKEN)
    ? new UpstashRedisCache(env_1.env.REDIS_URL, env_1.env.REDIS_TOKEN)
    : new InMemoryCache();
