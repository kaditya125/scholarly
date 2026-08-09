/**
 * Async token-bucket rate limiter.
 *
 * Shared across LLM / embedding / vision calls so no single component can independently
 * hammer the provider API and trigger cascading 429s. Backward compatible: opt-in — call
 * `await limiter.acquire()` before a rate-limited request.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.lastRefill = now;
  }

  /** Waits until `cost` tokens are available, then consumes them. */
  async acquire(cost = 1): Promise<void> {
    // Bounded loop: worst case waits proportional to the deficit.
    for (let i = 0; i < 10000; i++) {
      this.refill();
      if (this.tokens >= cost) { this.tokens -= cost; return; }
      const deficit = cost - this.tokens;
      const waitMs = Math.max(50, Math.ceil((deficit / this.refillPerSec) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// Shared limiter for Gemini generateContent (non-embedding) LLM calls. Conservative
// defaults; tune via env without a code change. Embeddings are already paced inside
// GoogleEmbeddingProvider (1s spacing + runResilient), so they use their own path.
const LLM_RATE = Number(process.env.LLM_RATE_PER_SEC || '4');
const LLM_BURST = Number(process.env.LLM_BURST || '8');
export const geminiLimiter = new TokenBucketRateLimiter(LLM_BURST, LLM_RATE);
