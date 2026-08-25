/**
 * RAG warm-up.
 *
 * Measured on this project: the FIRST retrieval after a process start costs ~6.1s (embedding
 * 2250ms + Pinecone 3824ms), while every subsequent one costs ~1.1s. None of that gap is the
 * services being slow — it is SDK construction, auth handshake, index discovery and model
 * warm-up, all paid once and all charged to whichever student happens to ask first.
 *
 * This pays that cost at boot instead, on nobody's turn.
 *
 * Deliberately NOT part of startup's critical path (§2): if Google or Pinecone is unreachable,
 * the API must still come up and serve text chat. Failure is logged and swallowed.
 */
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { pineconeService } from './pinecone.service';

/** Bounded so a hanging provider cannot keep a boot-time task alive indefinitely. */
const WARMUP_TIMEOUT_MS = Number(process.env.RAG_WARMUP_TIMEOUT_MS || 15000);

/** Shortest text that still forces a real embedding round trip. */
const WARMUP_QUERY = 'warmup';

let warmed = false;
export const isRagWarm = () => warmed;

const log = (event: string, fields: Record<string, unknown> = {}) => {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`[rag] ${event}${pairs ? ' ' + pairs : ''}`);
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Runs once per process. Issues the smallest request that still forces each client through its
 * real initialisation path — a cheaper no-op would leave the handshake unpaid and defeat the
 * point. Never throws.
 */
export async function warmupRag(): Promise<void> {
  if (warmed) return;
  const started = Date.now();
  log('RAG_WARMUP_STARTED');

  try {
    const embedder = new GoogleEmbeddingProvider();

    const tEmb = Date.now();
    const vector = await withTimeout(embedder.generateEmbedding(WARMUP_QUERY), WARMUP_TIMEOUT_MS, 'embedding warmup');
    const embMs = Date.now() - tEmb;

    // topK 1 with no filter: enough to force auth + index discovery, cheap enough to be free.
    const tPine = Date.now();
    await withTimeout(pineconeService.queryVectors(vector as any, 1), WARMUP_TIMEOUT_MS, 'pinecone warmup');
    const pineMs = Date.now() - tPine;

    warmed = true;
    log('RAG_WARMUP_COMPLETED', { durationMs: Date.now() - started, embeddingMs: embMs, pineconeMs: pineMs });
  } catch (err: any) {
    // Retrieval still works on demand — the first student simply pays the cold cost, exactly as
    // before this existed. Nothing is broken by a failed warm-up.
    log('RAG_WARMUP_FAILED', { durationMs: Date.now() - started, reason: String(err?.message || err).slice(0, 140) });
  }
}
