import { Request, Response, NextFunction } from 'express';

// Cap the in-memory telemetry buffers so they cannot grow without bound (memory leak
// protection for a long-running process). Oldest entries are dropped past the cap.
const MAX_ENTRIES = 5000;

function capPush(arr: any[], entry: any) {
  arr.push(entry);
  if (arr.length > MAX_ENTRIES) {
    arr.splice(0, arr.length - MAX_ENTRIES);
  }
}

export const Telemetry = {
  metrics: [] as any[],
  costs: [] as any[],

  logLatency(operation: string, durationMs: number, metadata?: any) {
    const entry = {
      operation,
      durationMs,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    console.log(`[TELEMETRY] ${operation} - ${durationMs.toFixed(2)}ms`, metadata || '');
    capPush(this.metrics, entry);
  },

  logTTFT(operation: string, durationMs: number, metadata?: any) {
    console.log(`[TELEMETRY_TTFT] ${operation} - First Token in ${durationMs.toFixed(2)}ms`, metadata || '');
    capPush(this.metrics, {
      operation,
      ttftMs: durationMs,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },

  logCacheHit(operation: string, hit: boolean, metadata?: any) {
    console.log(`[TELEMETRY_CACHE] ${operation} - ${hit ? 'HIT' : 'MISS'}`);
    capPush(this.metrics, {
      operation,
      cacheHit: hit,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },

  logFailure(operation: string, error: Error, metadata?: any) {
    console.error(`[TELEMETRY_ERROR] ${operation} failed:`, error.message, metadata || '');
    capPush(this.metrics, {
      operation,
      error: error.message,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },

  // Batch cost updates to avoid hammering Firestore
  _pendingCostUpdates: {} as Record<string, { llm: number, embedding: number }>,
  _platformPendingCost: { llm: 0, embedding: 0 } as { llm: number, embedding: number },
  _costFlushTimeout: null as any,

  logCost(provider: string, tokens: number, type: 'input' | 'output', metadata?: { userId?: string, operationType?: 'llm' | 'embedding' } & any) {
    const rates: Record<string, any> = {
      'gemini': { input: 0.000125, output: 0.000375 },
      'groq': { input: 0.00005, output: 0.00008 },
      'gemini-embedding': { input: 0.00002, output: 0.00002 } // ~ $0.02 per 1M tokens
    };
    const rate = rates[provider]?.[type] || 0;
    const cost = (tokens / 1000) * rate;

    if (cost === 0) return;

    console.log(`[TELEMETRY_COST] ${provider} ${type} - ${tokens} tokens - $${cost.toFixed(6)}`);
    capPush(this.costs, {
      provider, tokens, type, cost, timestamp: new Date().toISOString(), ...metadata
    });

    const opType = metadata?.operationType || (provider.includes('embedding') ? 'embedding' : 'llm');
    const userId = metadata?.userId;

    // Accumulate platform total
    if (!this._platformPendingCost) this._platformPendingCost = { llm: 0, embedding: 0 };
    if (opType === 'embedding') this._platformPendingCost.embedding += cost;
    else this._platformPendingCost.llm += cost;

    // Accumulate user total
    if (userId) {
      if (!this._pendingCostUpdates[userId]) this._pendingCostUpdates[userId] = { llm: 0, embedding: 0 };
      if (opType === 'embedding') this._pendingCostUpdates[userId].embedding += cost;
      else this._pendingCostUpdates[userId].llm += cost;
    }

    if (!this._costFlushTimeout) {
      this._costFlushTimeout = setTimeout(() => this.flushCosts(), 10000); // Flush every 10s
    }
  },

  async flushCosts() {
    this._costFlushTimeout = null;
    const { db } = require('../config/firebase');
    const FieldValue = require('firebase-admin/firestore').FieldValue;

    const platformUpdate = { ...this._platformPendingCost };
    const userUpdates = { ...this._pendingCostUpdates };
    
    this._platformPendingCost = { llm: 0, embedding: 0 };
    this._pendingCostUpdates = {};

    try {
      const batch = db.batch();
      
      // Update global platform stats
      if (platformUpdate.llm > 0 || platformUpdate.embedding > 0) {
        const platformRef = db.collection('platform').doc('stats');
        batch.set(platformRef, {
          totalLlmCostUsd: FieldValue.increment(platformUpdate.llm),
          totalEmbeddingCostUsd: FieldValue.increment(platformUpdate.embedding),
          totalCostUsd: FieldValue.increment(platformUpdate.llm + platformUpdate.embedding)
        }, { merge: true });
      }

      // Update individual user stats
      for (const [userId, costs] of Object.entries(userUpdates)) {
        if (costs.llm > 0 || costs.embedding > 0) {
          const userStatsRef = db.collection('users').doc(userId).collection('profile').doc('stats');
          batch.set(userStatsRef, {
            totalLlmCostUsd: FieldValue.increment(costs.llm),
            totalEmbeddingCostUsd: FieldValue.increment(costs.embedding),
            totalCostUsd: FieldValue.increment(costs.llm + costs.embedding)
          }, { merge: true });
        }
      }

      await batch.commit();
    } catch (e) {
      console.error('[TELEMETRY_COST] Failed to flush costs to DB', e);
      // Restore pending on failure
      this._platformPendingCost.llm += platformUpdate.llm;
      this._platformPendingCost.embedding += platformUpdate.embedding;
      for (const [userId, costs] of Object.entries(userUpdates)) {
        if (!this._pendingCostUpdates[userId]) this._pendingCostUpdates[userId] = { llm: 0, embedding: 0 };
        this._pendingCostUpdates[userId].llm += costs.llm;
        this._pendingCostUpdates[userId].embedding += costs.embedding;
      }
    }
  },

  async measure<T>(operation: string, fn: () => Promise<T>, metadata?: any): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      this.logLatency(operation, end - start, metadata);
      return result;
    } catch (error: any) {
      this.logFailure(operation, error, metadata);
      throw error;
    }
  }
};

export const telemetryMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  res.on('finish', () => {
    const end = performance.now();
    Telemetry.logLatency('API_REQUEST', end - start, {
      method: req.method,
      path: req.path,
      status: res.statusCode
    });
  });
  next();
};
