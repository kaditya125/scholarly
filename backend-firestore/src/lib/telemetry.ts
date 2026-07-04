import { Request, Response, NextFunction } from 'express';

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
    this.metrics.push(entry);
  },

  logFailure(operation: string, error: Error, metadata?: any) {
    console.error(`[TELEMETRY_ERROR] ${operation} failed:`, error.message, metadata || '');
    this.metrics.push({
      operation,
      error: error.message,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  },

  logCost(provider: string, tokens: number, type: 'input' | 'output', metadata?: any) {
    // Rough estimate rates per 1k tokens
    const rates: Record<string, any> = {
      'gemini': { input: 0.000125, output: 0.000375 },
      'groq': { input: 0.00005, output: 0.00008 }
    };
    const rate = rates[provider]?.[type] || 0;
    const cost = (tokens / 1000) * rate;
    
    console.log(`[TELEMETRY_COST] ${provider} ${type} - ${tokens} tokens - $${cost.toFixed(6)}`);
    this.costs.push({
      provider,
      tokens,
      type,
      cost,
      timestamp: new Date().toISOString(),
      ...metadata
    });
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
