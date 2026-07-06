# PERFORMANCE VALIDATION — Scholarly AI (Phase 6)

**Date:** 2026-07-05
**Change:** Replaced the fabricated constant metrics in `WorkflowEngine.executeStream` with real, code-level measurements. Backend `tsc --noEmit` → **exit 0** after the change.

> **Honesty note:** This environment has no live Firebase / Pinecone / Groq / Gemini credentials, so I could **not** capture real latency *numbers* from a running request. What is validated here is that the **instrumentation is wired and compiles**, and that the previously-fabricated constants are gone. Actual numbers require deploying with credentials and reading `users/{uid}/analytics_logs` + the `[TELEMETRY]` logs.

---

## 1. What was fabricated before (removed)

`WorkflowEngine.executeStream` previously logged hardcoded constants:
```
retrievalLatencyMs: 100,   // Placeholder
rerankingLatencyMs: 150,   // Placeholder
hallucinationRate: 0,      // Placeholder
averageConfidence: 0.95,   // constant
citationCoverage: 1.0,     // constant
embeddingCost: 0, generationCost: 0
cacheHit: false
```
The `'done'` event also emitted a constant `confidenceScore: 0.95`.

## 2. What is now measured (real)

| Metric | Source of truth (now) |
|---|---|
| `retrievalLatencyMs` | `Date.now()` timer wrapping the entire RAG retrieval phase (web + notebook). |
| `rerankingLatencyMs` | Summed from `Telemetry` `cohere_rerank` spans that `RetrievalService` already records, sliced to this request. |
| `generationLatencyMs` | `Date.now()` timer wrapping TeacherAgent draft → ResponseFormatter stream completion. |
| **TTFT** (time-to-first-token) | `Telemetry.logTTFT('chat_workflow', firstChunkAt - workflowStartTime)` emitted when the first chunk is streamed. |
| `workflowDurationMs` | Real end-to-end timer (also logged via `Telemetry.logLatency('chat_workflow_total', …)`). |
| `hallucinationRate` | `unsupportedClaims / totalClaims` from the real verification report (when a notebook + citations exist). |
| `averageConfidence` | `verification.confidenceScore` (real) when verification runs; documented fallback otherwise. |
| `citationCoverage` | `supportedClaims / totalClaims` from verification; else based on presence of citations. |
| `cacheHit` | Derived from a `retrieval_cache_hit` telemetry span (real cache signal from `RetrievalService`). |
| `generationCost` | Summed from real token-usage cost events; **added `Telemetry.logCost('groq', usage.prompt/ completion_tokens, …)` in `GroqProvider.generateResponse`** so non-streamed Groq calls (TeacherAgent draft, query-rewrite, verification) contribute real cost. |
| `embedding` / `pinecone` latency | Already recorded by `RetrievalService` (`query_embedding`, `pinecone_search` spans) and now readable per request via the telemetry slice. |

The `'done'` event now emits the measured `confidenceScore` too (consistent with the logged value).

Files changed: `src/core/workflow/WorkflowEngine.ts`, `src/services/ai/groq.provider.ts`.

## 3. Honest limitations of the current instrumentation

- **Embedding cost = 0** unless `GoogleEmbeddingProvider` emits `Telemetry.logCost(..., 'embedding')`. It does not yet, so embedding cost is not attributed (follow-up: add one `logCost` call in the embedding provider).
- **Streamed generation tokens are not counted.** `ResponseFormatter` streams via Groq `generateStreamResponse`, which does not return `usage`; only the non-streamed calls contribute to `generationCost`. Full cost needs token counting on the stream (Groq supports `stream_options: { include_usage: true }` — a small follow-up).
- **Telemetry buffers are process-global arrays** (`Telemetry.metrics`, `Telemetry.costs`). Per-request attribution via index slicing is accurate single-threaded but can interleave under high concurrency. Production should use per-request context (e.g., AsyncLocalStorage) and **flush/cap** these arrays (currently they grow unbounded in memory — a memory leak at scale).
- **No live numbers captured** here (no credentials) — see the honesty note above.

## 4. Other performance findings (status)

| Area | Status | Note |
|---|---|---|
| **Streaming / TTFT** | ⚠️ Structural latency | The full TeacherAgent draft is generated (blocking) before `ResponseFormatter` starts streaming — TTFT includes the entire draft. Consider streaming the teacher output directly or overlapping. Now measurable via TTFT telemetry. |
| **Sequential LLM calls** | ⚠️ | Per chat: (optional) query rewrite + TeacherAgent + ResponseFormatter (+ verification) = up to 3–4 sequential LLM round-trips. Real cost/latency now visible in telemetry. |
| **Backend — DB reads** | ⚠️ Unbounded | `chat.repository.getMessages` (all messages) and `getSessionsByUser` (all sessions, in-memory sort) lack pagination. Recommend `limit` + cursor. (Not changed in this phase to avoid API-shape changes.) |
| **Caching** | ⚠️ In-memory | `cache.service` / rate limiting are in-memory (not verified as Redis-backed); inconsistent across instances. `RetrievalService` does cache embeddings/results (10 min) — real and now surfaced via `cacheHit`. |
| **Firestore indexes** | ✅ Addressed | `firestore.indexes.json` added for the verified `notebooks` OR-query, `discussions`, and `assets` queries (Phase 2), preventing `FAILED_PRECONDITION` latency/errors. |
| **Frontend bundle** | ⚠️ Not changed | Heavy libs (`mermaid`, `d3`, `pdfjs-dist`, `tesseract.js`, `react-force-graph-2d`) — code-splitting/lazy-loading not verified; recommend `React.lazy` + route-level splitting. |

## 5. How to capture real numbers (runbook)
1. Provide `.env` (Firebase, `PINECONE_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `COHERE_API_KEY`).
2. `npm run dev` (backend) + issue an authenticated `POST /api/chat/stream` with a `notebookId` that has ingested sources.
3. Read the `[TELEMETRY]`, `[TELEMETRY_TTFT]`, `[TELEMETRY_COST]` console lines and the `users/{uid}/analytics_logs` documents — all values are now real.
