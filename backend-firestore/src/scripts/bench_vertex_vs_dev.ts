/**
 * Fair latency benchmark: Vertex AI (Express) vs Gemini Developer API.
 * Same model, same prompts, 1 warmup (discarded) + N timed runs. Reports min/avg/max.
 * Read-only, tiny prompts (cost ~₹0). Usage: npx tsx src/scripts/bench_vertex_vs_dev.ts
 */
import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
const e = config().parsed as Record<string, string>;

const DEV_KEY = e.GEMINI_API_KEY;
const VTX_KEY = e.GOOGLE_VERTEX_API_KEY;
const MODEL = 'gemini-2.5-flash';
const EMB = 'gemini-embedding-001';
const N = 20;
const PROMPT = 'Reply with exactly: OK';

// Explicit vertexai flags so the ambient GOOGLE_GENAI_USE_VERTEXAI env var
// (which the SDK auto-reads) can't cross-contaminate the two clients.
const dev = new GoogleGenAI({ vertexai: false, apiKey: DEV_KEY });
const vtx = new GoogleGenAI({ vertexai: true, apiKey: VTX_KEY });

function pct(s: number[], p: number) {
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const avg = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return `min=${s[0]} p50=${pct(s, 50)} p90=${pct(s, 90)} avg=${avg} max=${s[s.length - 1]} (ms)`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Returns latency in ms, or a string error code ('429' / 'ERR') on failure.
async function timeGen(ai: GoogleGenAI): Promise<number | string> {
  const t = Date.now();
  try {
    await ai.models.generateContent({ model: MODEL, contents: PROMPT, config: { temperature: 0 } as any });
    return Date.now() - t;
  } catch (err: any) {
    return (err?.status === 429 || String(err?.message || '').includes('429')) ? '429' : 'ERR';
  }
}
async function timeEmb(ai: GoogleGenAI): Promise<number | string> {
  const t = Date.now();
  try {
    await ai.models.embedContent({ model: EMB, contents: 'force mass acceleration', config: { outputDimensionality: 768 } });
    return Date.now() - t;
  } catch (err: any) {
    return (err?.status === 429 || String(err?.message || '').includes('429')) ? '429' : 'ERR';
  }
}

function summarize(results: (number | string)[]) {
  const ok = results.filter((x): x is number => typeof x === 'number');
  const rate429 = results.filter((x) => x === '429').length;
  const errs = results.filter((x) => x === 'ERR').length;
  const tail = `  |  ok=${ok.length}/${results.length} 429=${rate429} err=${errs}`;
  return (ok.length ? stats(ok) : 'no successful calls') + tail;
}

async function bench(label: string, ai: GoogleGenAI) {
  await timeGen(ai);                        // warmup (discarded)
  const gen: (number | string)[] = [];
  for (let i = 0; i < N; i++) { gen.push(await timeGen(ai)); await sleep(300); }
  await timeEmb(ai);                         // warmup (discarded)
  const emb: (number | string)[] = [];
  for (let i = 0; i < N; i++) { emb.push(await timeEmb(ai)); await sleep(300); }
  console.log(`\n${label}`);
  console.log(`  generateContent : ${summarize(gen)}`);
  console.log(`  embedContent    : ${summarize(emb)}`);
}

async function run() {
  console.log(`Benchmark — ${N} warm runs each, model=${MODEL}`);
  console.log('='.repeat(56));
  await bench('VERTEX AI (Express)', vtx);
  await bench('GEMINI Developer API', dev);
  console.log('\n(First call of each is a discarded warmup / cold start.)');
  process.exit(0);
}
run().catch((err) => { console.error(err?.message || err); process.exit(1); });
