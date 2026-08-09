# Chat Latency Investigation & Fix — Final Report

**Date:** 2026-07-16
**Scope:** Root-cause the reported chat latency, fix what's fixable in code, measure the real
impact against live production credentials (Firebase, Vertex/Gemini, Grok, Pinecone, Cohere,
Redis) — no mocks, no synthetic numbers.

**Bottom line:** Two real, verified fixes shipped. The semantic-cache fix delivers a **10–18x
speedup at n=25**, proven, not projected. The greeting fast-path is confirmed structurally
correct and consistent at scale. The concurrency + Gemini-thinking-mode fix is code-correct but
its dollar-value in wall-clock time could **not** be isolated from this environment's own
network variance to Vertex — that number can only come from a staging/production run.

---

## 1. How this was investigated

All numbers in this report came from actually running the code against live credentials —
never from static analysis or estimation:

1. A static probe of the Intelligence Layer's routing decisions (pure, no network calls).
2. A connectivity probe confirming live Firebase/Vertex/Pinecone egress works from this
   environment.
3. A single live end-to-end run per query category (baseline).
4. Four fixes applied to the code.
5. A 5-repetitions-per-category statistical trial (post-fix, before the worker gap below was
   found).
6. A 25-repetitions-per-category statistical trial (**101 live calls total**), after fixing a
   methodology bug in the test harness itself.

Every trial's raw data is preserved in the repo for audit: `trial_results.json` (pre-fix, n=5),
`trial_results_postfix.json` (post-fix, n=5, cache untested due to the worker gap),
`trial_results_large.json` (post-fix, n=25, cache verified working).

---

## 2. Bugs found and fixed

### 2.1 Greeting matcher didn't catch common phrasing
`isGreetingMessage()` required the ENTIRE message to match a greeting word — "hi there!" failed
because of the trailing "there". This meant simple greetings fell through to the full 9-stage
GraphRAG + reasoning-model pipeline just to say hello.

**Fix:** `src/config/prompts.ts` — the regex now allows a trailing social-filler group
("there", "everyone", "buddy", "again", …) while still rejecting real content
("hi, explain osmosis" correctly still runs the full pipeline). Covered by
`tests/unit/greetingMatcher.test.ts` (4 tests).

### 2.2 Intelligence routing + semantic cache were computed but never consumed
The Phase 2/3 Intelligence Layer was already computing the *right* cheaper decisions (skip
retrieval for greetings, use the fast model for definitions, reuse cached answers) — but the
consumption flags defaulted OFF, so production ran the expensive path regardless.

**Fix:** Enabled in `.env`: `ENABLE_INTELLIGENCE_RETRIEVAL`, `ENABLE_INTELLIGENCE_MODEL`,
`ENABLE_SEMANTIC_CACHE`, `ENABLE_INTELLIGENCE_LAYER`.

### 2.3 Gemini's "thinking mode" was silently on for the fast tier
When the ModelRouter picks the "fast" tier (Gemini) for a low-complexity query, the answer-
generation call never disabled Gemini's internal "thinking" pass — so "fast" queries paid a
hidden reasoning budget before the first visible token, measured at **~45s TTFT vs ~10s** for an
equivalent reasoning-tier (Grok) call on the same complexity. This only became observable once
2.2 started actually routing queries to the fast tier.

**Fix:** `src/core/workflow/services/GenerationOrchestrator.ts` — `disableThinking: true` is now
set specifically on the router-chosen fast-tier path. Every other path (routing off, reasoning
tier, Grok-fallback) is untouched.

### 2.4 Reasoning-trace and answer-generation calls ran fully sequentially
The "thinking out loud" reasoning-trace network call ran to completion *before* the answer-
generation call even started, even though neither depends on the other's output — two
independent round-trips (auth handshake + connection + TTFB) paid back-to-back instead of
overlapped.

**Fix:** `GenerationOrchestrator.stream()` now prepares the answer call and calls `.next()` on
its async generator immediately, so its network request starts *while* the reasoning trace is
still streaming. The exact SSE event order (reasoning → progress → answer chunks) is unchanged;
only the underlying network timing overlaps. Fails open: any setup error clears the early call
and falls back to the original sequential behavior.

### 2.5 Provider cold start
Added `src/lib/warmup.ts` — fires a throwaway embedding + reasoning call right after
`bootstrapDI()` in `server.ts`, non-blocking and guarded, so the first real user request doesn't
pay a cold connection. (`ENABLE_WARMUP`, default on.)

### 2.6 Test-methodology bug found mid-investigation
The first post-fix statistical trial showed the cache making things *worse*, which didn't match
the code. Root cause: the trial script enqueued `cache.store` as a background job but never
started the BullMQ `BackgroundWorker` that consumes it — so the cache was never actually
populated. This was a bug in the test harness, not the product. Fixed by calling
`startBackgroundWorker()` before the large trial; the fix's effect is proven in section 3.3.

*(Unrelated to this investigation: a separate in-flight migration from an in-process background
executor to a Redis-backed BullMQ queue was completed by another agent working the same codebase
concurrently. That migration was verified compiling and green — 33 suites / 297 unit tests —
before this investigation resumed on top of it.)*

---

## 3. Results — the real numbers (n=25 per category, 101 live calls)

| Category | Median | Mean | p25 | p75 | p90 | Errors |
|---|---|---|---|---|---|---|
| Greeting | 3,237ms | 6,647ms* | 2,380ms | 3,873ms | 11,655ms | 1/25 |
| Definition (fresh) | 25,898ms | 31,202ms | 11,945ms | 39,646ms | 45,429ms | 5/25 |
| Concept (fresh) | 18,519ms | 21,562ms | 16,371ms | 31,844ms | 38,923ms | 0/25 |
| Cache (fresh, 1st ask) | 39,814ms | — | — | — | — | 0/1 |
| **Cache (repeat, cached)** | **1,441ms** | 3,361ms | 595ms | 2,636ms | 12,033ms | 0/25 |

*mean skewed by one 58s outlier; median is the reliable figure.

### 3.1 Semantic cache — fixed, proven
Every one of the 25 `cache_repeat` calls hit `path: semantic_cache` in the structured logs —
verified directly, not inferred from timing. Median **1,441ms vs ~20,000–26,000ms** for an
equivalent fresh call: a **10–18x speedup**, holding consistently across all 25 runs, not a
lucky single sample.

### 3.2 Greeting fast-path — structurally fixed, confirmed at scale
24/25 runs correctly executed only 4 pipeline stages with 0 citations (down from the full
9-stage GraphRAG pipeline pre-fix). Median time (~3.2s) matches the earlier small-sample
baseline, so the improvement is consistent, not a statistical fluke — though the remaining
~3 seconds is now almost entirely a single external LLM call, which this environment's network
path to Vertex cannot make faster.

### 3.3 Definition / concept (fresh queries) — fix is correct, magnitude unproven
Medians of 26s and 18.5s are still slow, and the spread stayed wide even at n=25 (p25=12s to
p90=45s for definitions). If this were random noise, a 5x larger sample should have tightened
that spread — it didn't. That's the signal that the variance is a **real, external,
provider-side characteristic** (this environment's connection to Vertex), not something
averaging more samples can resolve. The concurrency and thinking-mode fixes are logically
verified correct in code and unit-tested, but this sandbox cannot certify their wall-clock
dollar-value. That requires a staging/production run with a stable network path to the
providers.

### 3.4 New finding, later corrected and fixed: mid-stream network drops were unprotected
**Correction:** this section originally claimed the 6 errors in the n=25 trial were `429
RESOURCE_EXHAUSTED` rate limits. That was wrong — re-checking the actual stored error field
(not just a log line) showed the real errors were `ETIMEDOUT`, `ECONNABORTED`, `fetch failed`,
`terminated`, and a JSON-truncation, i.e. **genuine mid-stream network drops** from this sandbox
to Google's servers, not provider throttling.

**Root cause found:** `GeminiProvider.generateStreamResponse` and
`GrokVertexProvider.generateStreamResponse` only wrapped the *connection-establishing* call
(`generateContentStream()` / the initial `fetch()`) in retry/fallback. Once that resolved, the
token-read loop (`for await` / `reader.read()`) ran with **zero protection** — a network drop
mid-stream propagated as a raw, unretried exception. Compounding this, `isUnavailable()` in
`providerErrors.ts` didn't recognize the `ECONNABORTED` error code or the bare word "terminated",
so even a protected retry would have classified these as non-retryable.

**Fix (`src/services/ai/gemini.provider.ts`, `grok-vertex.provider.ts`,
`src/core/errors/providerErrors.ts`):** resilience now covers the whole attempt (connect + read),
with a clear boundary — while nothing has reached the caller yet, a failure retries the whole
attempt (bounded, then Grok falls back to Gemini); once even one chunk has streamed to the user,
a later drop throws a clean typed error instead of retrying (which would duplicate/garble visible
output). True streaming is preserved — nothing is buffered — so TTFT is unaffected on the normal
path. `isUnavailable()` now also recognizes `ECONNABORTED`, `EPIPE`, `UND_ERR_SOCKET`, and the
messages "terminated"/"other side closed". Covered by `tests/unit/streamResilience.test.ts` (9
tests) and 2 new regression cases in `tests/unit/providerErrors.test.ts`, using the exact error
shapes observed in the trial.

The circuit breaker itself was never the problem — it correctly stayed "CLOSED (healthy)"
throughout, because the errors never reached it (they occurred after its wrapped promise had
already resolved). This was purely a gap in what the resilience layer covered.

---

## 4. What is honestly NOT settled

- **The absolute latency win for fresh (non-cached) queries** — the fixes are correct, but this
  sandbox's own network variance to Vertex (250ms–12,000ms observed for the *identical*
  embedding call across different runs) is large enough to swallow any improvement the fixes
  could plausibly produce. No percentage is claimed for this.
- **Load-bearing production behavior at scale** (concurrent users, autoscaling, sustained
  throughput) — untested here; see `docs/STAGING_CERTIFICATION_PLAN.md` and
  `tests/load/chat_load.js` for the k6-based plan to measure this on staging.
- **Provider quota headroom** — the 429s observed at n=25 sequential calls suggest quota should
  be reviewed before higher production volume.

---

## 5. Files changed

- `src/config/prompts.ts` — greeting matcher regex fix.
- `src/core/workflow/services/GenerationOrchestrator.ts` — concurrency overlap + Gemini
  thinking-mode fix.
- `src/lib/warmup.ts` (new) — provider warmup on boot.
- `src/server.ts` — wired warmup.
- `.env` — enabled `ENABLE_INTELLIGENCE_RETRIEVAL`, `ENABLE_INTELLIGENCE_MODEL`,
  `ENABLE_SEMANTIC_CACHE`, `ENABLE_INTELLIGENCE_LAYER`, `ENABLE_WARMUP`.
- `src/services/ai/gemini.provider.ts`, `src/services/ai/grok-vertex.provider.ts` — mid-stream
  network-drop resilience fix (section 3.4).
- `src/core/errors/providerErrors.ts` — `isUnavailable()` now recognizes `ECONNABORTED`,
  `EPIPE`, `UND_ERR_SOCKET`, and "terminated"/"other side closed" messages.
- `tests/unit/greetingMatcher.test.ts` (new) — 4 tests.
- `tests/unit/streamResilience.test.ts` (new) — 9 tests for the mid-stream resilience fix.
- `tests/unit/providerErrors.test.ts` — 2 new regression tests for the real error shapes
  observed in the trial.
- Verification: `npx tsc --noEmit` clean, `npm run build` clean, full unit suite
  **35 suites / 311 tests, 0 failures** (run 5x to confirm no flakiness in the new suite).

## 6. Evidence retained
- `trial_results.json` — pre-fix baseline (n=5/category).
- `trial_results_postfix.json` — post-fix, cache untested (n=5/category; the worker-gap run).
- `trial_results_large.json` — post-fix, cache verified (n=25/category, 101 calls) — the
  authoritative dataset for this report.

## 7. Recommended next steps
1. Run `tests/load/chat_load.js` (k6) against staging to get a trustworthy wall-clock
   before/after number for fresh-query latency, per `docs/STAGING_CERTIFICATION_PLAN.md`.
   *(Not done — k6 is not installed in this environment; requires a staging deploy.)*
2. ~~Review Vertex quota/rate limits~~ — **not needed**; section 3.4 was corrected. The
   original errors were network drops, not quota exhaustion, and are now fixed in code.
3. ~~Circuit-breaker-aware backoff for 429s~~ — **done**, see section 3.4 (the real fix was
   broader than 429 handling: mid-stream resilience for any network drop).
4. Consider whether "Incomplete JSON segment at the end" (one of the six original errors)
   should also be treated as a retryable network symptom — deliberately left unclassified for
   now (see the test note in `providerErrors.test.ts`) since it could also indicate a genuine
   malformed-response bug. Revisit if it recurs.
