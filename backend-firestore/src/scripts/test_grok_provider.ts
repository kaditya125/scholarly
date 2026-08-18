/**
 * Smoke test: confirm the ReasoningProvider (Grok on Vertex) is wired via DI and
 * answers a TeacherAgent-style call. Uses the real DI container + provider.
 *
 * Usage: npx tsx src/scripts/test_grok_provider.ts
 */
import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { IAIProvider } from '../core/interfaces/IAIProvider';

async function run() {
  bootstrapDI();
  const provider = container.resolve<IAIProvider>(TOKENS.ReasoningProvider);
  console.log('ReasoningProvider =', (provider as any)?.constructor?.name);

  const t = Date.now();
  const res = await provider.generateResponse(
    [{ role: 'user', content: 'In one sentence, explain what inertia is to a class 11 student.' } as any],
    'You are Sadhya AI, a concise expert physics tutor.',
    { traceId: 'grok-smoke' } as any
  );
  console.log(`latency=${Date.now() - t}ms`);
  console.log('reply:', (res.reply || '').slice(0, 300));
  console.log('RESULT:', res.reply && res.reply.length > 0 ? 'OK' : 'FAILED');
  process.exit(res.reply ? 0 : 1);
}

run().catch((e) => { console.error('smoke test error:', e?.message || e); process.exit(1); });
