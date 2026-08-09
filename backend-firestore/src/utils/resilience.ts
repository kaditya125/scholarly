import { circuitBreaker, timeout, handleAll, ConsecutiveBreaker, BrokenCircuitError, TaskCancelledError, wrap, TimeoutStrategy } from 'cockatiel';
import { logger } from './logger';
import { ProviderTimeoutError, ProviderError } from '../core/errors/providerErrors';

// 1. LLM Policy
// Trips after 5 consecutive failures, half-opens after 10 seconds.
const llmBreaker = circuitBreaker(
  handleAll,
  {
    halfOpenAfter: 10 * 1000,
    breaker: new ConsecutiveBreaker(5)
  }
);

llmBreaker.onBreak(() => logger.error('[Resilience] LLM Circuit Breaker tripped OPEN'));
llmBreaker.onHalfOpen(() => logger.warn('[Resilience] LLM Circuit Breaker transitioning to HALF-OPEN'));
llmBreaker.onSuccess(() => logger.info('[Resilience] LLM Circuit Breaker CLOSED (healthy)'));

// 60-second timeout for LLM generation
const llmTimeout = timeout(60 * 1000, TimeoutStrategy.Cooperative);

// Composite Policy for LLMs: Timeout wrapped in Circuit Breaker
export const llmPolicy = wrap(llmBreaker, llmTimeout);

// 2. Vector DB Policy (Pinecone)
// Trips after 10 consecutive failures, half-opens after 15 seconds.
const vectorDbBreaker = circuitBreaker(
  handleAll,
  {
    halfOpenAfter: 15 * 1000,
    breaker: new ConsecutiveBreaker(10)
  }
);

vectorDbBreaker.onBreak(() => logger.error('[Resilience] VectorDB Circuit Breaker tripped OPEN'));
vectorDbBreaker.onHalfOpen(() => logger.warn('[Resilience] VectorDB Circuit Breaker transitioning to HALF-OPEN'));
vectorDbBreaker.onSuccess(() => logger.info('[Resilience] VectorDB Circuit Breaker CLOSED (healthy)'));

// 15-second timeout for Vector DB queries
const vectorDbTimeout = timeout(15 * 1000, TimeoutStrategy.Cooperative);

// Composite Policy for Vector DB
export const vectorDbPolicy = wrap(vectorDbBreaker, vectorDbTimeout);

/**
 * Helper to map cockatiel errors to our standard ProviderError types.
 */
export function mapCockatielError(error: any, provider: 'gemini' | 'vertex' | 'pinecone' | 'groq'): never {
  if (error instanceof BrokenCircuitError) {
    throw new ProviderError(`Circuit Breaker is OPEN for ${provider}. Rejecting request to protect system.`, true); // 2nd arg is retryable boolean
  }
  if (error instanceof TaskCancelledError) {
    throw new ProviderTimeoutError(`${provider} operation timed out (Cockatiel Timeout Policy)`);
  }
  throw error;
}
