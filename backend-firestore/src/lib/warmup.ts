import { container, TOKENS } from '../core/di/container';
import { featureFlags } from '../config/featureFlags';

/**
 * Warms the latency-critical providers on boot so the FIRST real user request does not pay the
 * cold-start (the Vertex/Gemini auth handshake was measured at ~12s on a cold process). Fully
 * guarded and non-blocking — any failure is swallowed and never affects startup or requests.
 *
 * Called once after bootstrapDI() in server.ts. Cost is a single tiny embedding + one short
 * reasoning generation (fractions of a cent per boot).
 */
export function warmupProviders(): void {
  if (!featureFlags.warmup) return;

  // Fire-and-forget; do not await (must not block server.listen).
  void (async () => {
    const t0 = Date.now();
    const results: string[] = [];

    // 1. Embedding provider (the ~12s cold-start culprit).
    try {
      const embed: any = container.resolve(TOKENS.EmbeddingProvider);
      if (embed?.generateEmbedding) {
        await embed.generateEmbedding('warmup');
        results.push(`embedding ${Date.now() - t0}ms`);
      }
    } catch (e: any) {
      results.push(`embedding failed: ${e?.message || e}`);
    }

    // 2. Reasoning provider (first answer generation otherwise pays a cold connection).
    try {
      const reasoning: any = container.resolve(TOKENS.ReasoningProvider);
      if (reasoning?.generateResponse) {
        await reasoning.generateResponse([{ role: 'user', content: 'ok', timestamp: Date.now() }], undefined, { warmup: true });
        results.push(`reasoning ${Date.now() - t0}ms`);
      }
    } catch (e: any) {
      results.push(`reasoning failed: ${e?.message || e}`);
    }

    console.log(`🔥 Provider warmup complete in ${Date.now() - t0}ms [${results.join(', ')}]`);
  })();
}
