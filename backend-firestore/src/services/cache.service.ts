import { env } from '../config/env';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

class InMemoryCache implements CacheService {
  private cache = new Map<string, { value: any; expiry: number | null }>();

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
    this.cache.set(key, { value, expiry });
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

  async get<T>(key: string): Promise<T | null> {
    try {
      const response = await fetch(`${this.url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      const data = await response.json();
      if (data.result) {
        return JSON.parse(data.result) as T;
      }
      return null;
    } catch (e) {
      console.error('Redis GET error:', e);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
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
      } else {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: stringValue
        });
      }
    } catch (e) {
      console.error('Redis SET error:', e);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await fetch(`${this.url}/del/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
    } catch (e) {
      console.error('Redis DEL error:', e);
    }
  }
}

// Factory to resolve correct cache based on environment
export const cacheService: CacheService = 
  (env.NODE_ENV === 'production' && env.REDIS_URL && env.REDIS_TOKEN)
    ? new UpstashRedisCache(env.REDIS_URL, env.REDIS_TOKEN)
    : new InMemoryCache();
