# PERFORMANCE REPORT — Scholarly AI

**Date:** 2026-07-05. Numbers below are **real, measured** via in-app telemetry during live runs (single instance, dev machine, live Groq/Gemini/Pinecone/Cohere). Not a load test.

## Measured latency (chat + RAG, from `[TELEMETRY]` logs)
| Stage | Observed | Notes |
|---|---|---|
| Query embedding (Gemini) | ~0.8 s | `gemini-embedding-001` @ 768 dims |
| Pinecone search | ~1–2.6 s | topK*4 then rerank |
| Retrieval total (notebook) | ~2–3.4 s | embed + search + Cohere rerank + weighting |
| Generation (Groq) | ~2.8–3.9 s | `openai/gpt-oss-20b` |
| **TTFT (time to first token)** | **~9–15 s** | ⚠️ high — see bottleneck #1 |
| Workflow total | ~9–16 s | end-to-end per chat turn |
| Cost / query | ~$0.0001–0.0002 | real token usage (Groq); embedding cost not yet metered |

## Bottlenecks (prioritized)
1. **TTFT is dominated by non-streamed work.** `WorkflowEngine` generates the FULL `TeacherAgent` draft (blocking Groq call) and only then streams via `ResponseFormatter` (a *second* Groq call). So the user waits ~9–15 s before the first token. **Fix:** stream the TeacherAgent output directly, or overlap draft+format, or drop the second formatting pass for latency-sensitive modes. (High impact, moderate effort.)
2. **Multiple sequential LLM calls per turn** — up to: query rewrite + TeacherAgent + ResponseFormatter (+ verification when a notebook is attached). **Fix:** collapse where possible; make verification async/non-blocking.
3. **Unbounded `getSessionsByUser`** (fetch-all + in-memory sort). **Fix:** composite index + `orderBy().limit()`.
4. **Frontend main bundle ~3.2 MB (850 KB gzip).** Mermaid diagram types are already split, but the core chunk is large. **Fix:** route-level `React.lazy`, `manualChunks` for d3/pdfjs/tesseract/force-graph.
5. **In-memory cache + rate limiter** — no cross-instance sharing; cache cold on every restart/instance. **Fix:** Redis (deps present).

## Improvements made this pass (verified)
- ✅ **Real metrics** replace the previously-fabricated constants (`retrievalLatencyMs:100`, etc.) — retrieval/generation/TTFT/workflow latency + cost now measured; live-confirmed.
- ✅ **Timeout + retry with backoff** on Groq (30 s) and embeddings (20 s) — resilience to transient 429/5xx without hanging.
- ✅ **Telemetry buffers capped** at 5000 entries — fixed an unbounded-memory growth (leak) in a long-running process.
- ✅ **Bounded chat reads** — `getMessages` now `limitToLast(2000)` (was: read all).
- ✅ **Firestore composite indexes** authored (`firestore.indexes.json`) to prevent `FAILED_PRECONDITION` on the notebooks OR-query / discussions / assets.
- ✅ **compression()** + retrieval result caching (10 min) already present and confirmed via `cacheHit` telemetry.

## Not done / not measured (honest)
- No load / soak / concurrency test (would need a load harness + staging env).
- Embedding-cost metering (`generateEmbeddings` doesn't emit `logCost`) → embedding cost reported as 0.
- Frontend runtime performance (render, re-renders, memory) — not measured (no browser).
- Streamed-generation token cost not captured (Groq stream lacks usage; enable `stream_options.include_usage`).

## Recommendation
The single highest-value performance fix is **#1 (TTFT)** — users currently wait ~10 s for the first token. Everything else is scale-hardening (Redis, pagination, bundle splitting) that matters at concurrency but not for correctness.
