/**
 * P8: concurrency testing, layer by layer.
 *
 * Deliberately NOT a 25-concurrent end-to-end run. The P5 latency trace already identified where
 * the time goes, and a blind end-to-end benchmark would spend LLM and embedding quota re-measuring
 * what is already known while telling us nothing about which layer breaks first:
 *
 *   exact PYQ   retrieval 5.1s of a 123s turn — 96% is model generation
 *   topic PYQ   20-40s, essentially all embedding under quota throttling
 *   Qdrant      6-35ms, nowhere near being the constraint
 *
 * So the cheap layers are tested hard and the expensive ones are tested gently:
 *
 *   FIRESTORE  canonical paper lookups at 1/5/10/25 — no model, no embedding, free to hammer
 *   QDRANT     vector search at 1/5/10/25 using a CONSTANT probe vector, so concurrency is
 *              measured without buying an embedding per request (the filter is applied whatever
 *              the vector contains; only the ordering is meaningless, and nothing here reads it)
 *   END-TO-END a small run on the exact-PYQ path only, which suppresses vector search, so the
 *              measurement isolates Firestore + generation without touching the embedding quota
 *
 * Reports p50/p95/p99 and error rate per level.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_COLLECTION, QDRANT_DIMENSION } from '../../../src/services/rag/qdrant.service';
import { canonicalPyqRetrievalService } from '../../../src/services/pyq/canonicalPyqRetrieval.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'p8-load-test.json');
const LEVELS = (process.env.P8_LEVELS ?? '1,5,10,25').split(',').map(Number);
const E2E_LEVELS = (process.env.P8_E2E_LEVELS ?? '1,3,5').split(',').map(Number);
const API = process.env.SADHYA_API ?? 'http://127.0.0.1:8080';

/** A constant stand-in for an embedding — see the embedding-guard note above. */
const PROBE_VECTOR = new Array(QDRANT_DIMENSION).fill(0.02);

interface Stat { level: number; n: number; errors: number; p50: number; p95: number; p99: number; max: number; meanMs: number }

function summarise(level: number, samples: number[], errors: number): Stat {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0);
  return {
    level, n: samples.length, errors,
    p50: at(50), p95: at(95), p99: at(99), max: s[s.length - 1] ?? 0,
    meanMs: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0,
  };
}

/** Fire `level` requests at once, repeated `rounds` times, timing each. */
async function burst(level: number, rounds: number, fn: () => Promise<void>): Promise<Stat> {
  const samples: number[] = [];
  let errors = 0;
  for (let r = 0; r < rounds; r++) {
    await Promise.all(Array.from({ length: level }, async () => {
      const t = Date.now();
      try { await fn(); samples.push(Date.now() - t); }
      catch { errors++; }
    }));
  }
  return summarise(level, samples, errors);
}

const row = (s: Stat) =>
  `    ${String(s.level).padStart(3)}  n=${String(s.n).padStart(4)}  err=${String(s.errors).padStart(3)}  ` +
  `p50=${String(s.p50).padStart(6)}ms  p95=${String(s.p95).padStart(6)}ms  p99=${String(s.p99).padStart(6)}ms  max=${String(s.max).padStart(6)}ms`;

async function main() {
  const db = firebaseApp.firestore();
  const results: any = { generatedAt: new Date().toISOString(), levels: LEVELS };

  // A real paper to look up, chosen from live data rather than hardcoded.
  const probe = await db.collection('pyq_questions').where('examId', '==', 'SSC_CGL').limit(50).get();
  const paperId = probe.docs.map((d) => (d.data() as any).canonicalPaperId).find(Boolean);
  console.log('=== P8 LAYERED LOAD TEST ===');
  console.log(`probe paper: ${paperId ?? '(none found)'}\n`);

  // ── Layer 1: Firestore canonical lookup ───────────────────────────────────────────────────
  console.log('1. FIRESTORE — canonical paper page (no model, no embedding)');
  results.firestore = [];
  for (const level of LEVELS) {
    const s = await burst(level, 2, async () => {
      await canonicalPyqRetrievalService.getPaperPage({ canonicalPaperId: paperId!, page: 1, pageSize: 40 });
    });
    console.log(row(s));
    results.firestore.push(s);
  }

  // ── Layer 2: Qdrant vector search ─────────────────────────────────────────────────────────
  console.log('\n2. QDRANT — filtered vector search (constant probe vector, no embedding spend)');
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  results.qdrant = [];
  for (const level of LEVELS) {
    const s = await burst(level, 3, async () => {
      // `.query()` with a `query` field, matching qdrant.service.ts — this client has no
      // `.search()` on the path the app actually uses, and calling it errored 100% of the time
      // while looking like a Qdrant capacity failure rather than a wrong method name.
      await (client as any).query(QDRANT_COLLECTION, {
        query: PROBE_VECTOR, limit: 8,
        filter: { must: [{ key: 'content_type', match: { value: 'pyq' } }, { key: 'examId', match: { value: 'SSC_CGL' } }] },
        with_payload: false, with_vector: false,
        params: { hnsw_ef: 512 },
      });
    });
    console.log(row(s));
    results.qdrant.push(s);
  }

  // ── Layer 3: end-to-end, exact-PYQ path only ──────────────────────────────────────────────
  console.log('\n3. END-TO-END — /chat/stream, exact-PYQ path (vector suppressed, so no embedding)');
  const feEnv = fs.readFileSync('/var/www/sadhya/frontend/.env', 'utf8');
  const key = feEnv.match(/^VITE_FIREBASE_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const custom = await firebaseApp.auth().createCustomToken('p8-load-probe');
  const ex: any = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  })).json();

  results.endToEnd = [];
  if (!ex.idToken) {
    console.log('   (token exchange failed; skipping end-to-end)');
  } else {
    for (const level of E2E_LEVELS) {
      const s = await burst(level, 1, async () => {
        const res = await fetch(`${API}/api/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ex.idToken}` },
          body: JSON.stringify({
            sessionId: `p8-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            message: 'Give me SSC CGL 2022 Shift 1 PYQs', model: 'gemini-2.5-flash', topicType: 'TEACHER',
          }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = (res.body as any).getReader();
        // Time to LAST byte: a streaming endpoint's p95 is meaningless if measured at first byte.
        while (true) { const { done } = await reader.read(); if (done) break; }
      });
      console.log(row(s));
      results.endToEnd.push(s);
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
