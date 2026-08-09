import { circuitBreaker, handleAll, ConsecutiveBreaker } from 'cockatiel';

/**
 * Circuit breaker configuration for TTS calls
 * 
 * Protects against cascading failures by opening the circuit after
 * consecutive failures and allowing it to recover gradually.
 * 
 * Configuration:
 * - 5 consecutive failures → circuit opens
 * - 60 second cooldown before retry
 * - Half-open state: test with single request
 */
const ttsCircuitBreakerPolicy = circuitBreaker(
  handleAll,
  {
    halfOpenAfter: 60 * 1000, // 60 seconds
    breaker: new ConsecutiveBreaker(5), // 5 consecutive failures
  }
);

/**
 * Wrap a TTS synthesis function with circuit breaker protection
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await ttsCircuitBreakerPolicy.execute(() => fn(...args));
    } catch (error: any) {
      // Log circuit breaker state
      if (error.message?.includes('circuit is open')) {
        console.error('[TTS Circuit Breaker] Circuit is OPEN - blocking request', {
          timestamp: new Date().toISOString(),
          args: args.map(a => typeof a === 'string' ? a.substring(0, 50) : typeof a)
        });
      }
      throw error;
    }
  }) as T;
}

/**
 * Get current circuit breaker state for monitoring
 */
export function getCircuitBreakerState() {
  // Note: Cockatiel doesn't expose state directly, but failures will log
  return {
    policy: 'consecutive-breaker',
    threshold: 5,
    halfOpenAfter: 60000,
  };
}
