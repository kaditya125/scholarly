# Scholarly AI — Staging Certification Plan

**Purpose:** define the concrete, executable work required to move from "release-candidate" to a
defensible **GO**, using a real staging environment. This is the plan the Production Readiness
Report's remaining blockers point to. Nothing here has been executed yet — it is the runbook.

---

## 0. Blunt precondition: the current integration suite is not real coverage

Before building on `tests/integration/`, know that it currently provides **false confidence** and
must be rebuilt. Verified findings:

- **`load.test.ts` — broken import.** Imports `../../src/services/rag/WorkflowEngine`, which does
  **not exist** (the engine lives at `src/core/workflow/WorkflowEngine.ts` after the Phase 1
  refactor). The test body only asserts `largeHistory.length > 100` — it exercises nothing.
- **`resilience.test.ts` — stale API.** Mocks `pineconeService.searchQuery`, but the real method
  is `queryVectors` (see `retrieval.service.ts`). The mock targets a method that isn't called, so
  the assertion does not test the real fallback path.
- **`isolation.test.ts` — tests a mock, not the app.** Builds a throwaway Express route with a
  hardcoded `mock_user_1` owner instead of the real `NotebookController`/`notebookService`. It
  proves a hand-written `if` works, not that tenant isolation holds in production code.
- **`rag.test.ts` — pseudo test.** Asserts a local regex against a string; imports
  `RetrievalService` but never calls it.

**These are not counted in `npm test` (which targets `tests/unit` only), so they don't fail CI —
they just sit as dead weight implying coverage that doesn't exist.** They must be rewritten as
real integration tests (below) or deleted. Do not treat them as evidence.

---

## 1. Staging environment specification

| Component | Requirement |
|---|---|
| Backend | The built image (`npm run build` → `node dist/server.js`), deployed to the target runtime (Cloud Run / equivalent) with `NODE_ENV=production`. |
| Firestore | A dedicated **staging** project (never prod), with `firestore.rules` deployed and `firestore.indexes.json` applied. |
| Pinecone | A staging index, seeded with the NCERT curriculum corpus (`ncert-*` notebooks) + a set of synthetic user notebooks for isolation tests. |
| Providers | Real Gemini/Grok/Cohere keys scoped to a staging budget with alerting. `CRON_SECRET`, `CORS_ORIGINS` set (verifies the fail-closed + CORS paths). |
| Redis | Staging Upstash instance (`REDIS_URL`/`REDIS_TOKEN`) to exercise the real cache path. |
| Test identities | ≥3 seeded Firebase users (student A, student B, admin) with real ID tokens minted for the test harness. |
| Load tooling | k6 (or Artillery) runner with network access to staging. |
| Observability | Confirm logs/metrics/telemetry land in the staging sink (Firestore `telemetry`/`cost` collections + log aggregator). |

**Seed data must be deterministic** (a fixed set of chapters + a labelled relevance set) so quality
metrics are comparable run-over-run.

---

## 2. Revised, defensible test bar

The blanket ">95% coverage" target incentivizes low-value mock tests. Replace it with:

| Layer | Bar | How proven |
|---|---|---|
| `core/intelligence`, `core/workflow`, `utils` | ≥ 90% statements | unit (mocked) — mostly met today (intelligence 87.6%) |
| Controllers | ≥ 80% statements | unit (mocked) — chat/source/notebook done; finish the rest |
| Repositories, RAG services (graphRetrieval/ingestion/pinecone) | integration-tested against staging, not mock-% | integration suite §3 |
| End-to-end user journeys | green on staging | integration suite §3 |

Rationale: mocking Pinecone/Firestore/graph traversal to hit a % tests the mocks, not the system.
Those layers are certified by integration tests against real dependencies.

---

## 3. Phase-by-phase runbook (with pass thresholds tied to success criteria)

### 3.1 Integration / E2E (rebuild `tests/integration/`)
Rewrite as real supertest-against-staging (or against an in-process app with **live** Firestore/
Pinecone/providers) journeys:
- Auth: valid token → 200; missing/invalid → 401; `enforceSelf` cross-user → 403.
- **Tenant isolation (critical):** student B requests student A's notebook/session/sources/graph →
  403/404 on **every** endpoint. Vector queries scoped so A never sees B's chunks. This replaces the
  fake `isolation.test.ts`.
- Full chat journey: request → workflow → retrieval → generation → SSE stream → memory write →
  analytics record. Assert the SSE event order (reasoning → progress → chunks → done) and that a
  session doc + telemetry record persist.
- Notebook upload → ingestion → READY/READY_DEGRADED → retrievable in chat.
- **Exit:** all journeys green; isolation has zero cross-tenant leaks.

### 3.2 RAG / Retrieval quality (replaces pseudo `rag.test.ts`)
With the labelled relevance set (queries → known-relevant chunk ids):
- Compute **Recall@5, Recall@10, MRR, nDCG@10** over ≥100 labelled queries.
- Grounding + citation accuracy: sample ≥100 answers, verify each citation resolves to a real
  chunk that supports the claim.
- **Exit thresholds (proposed, tune with product):** Recall@10 ≥ 0.85, MRR ≥ 0.7, nDCG@10 ≥ 0.75,
  citation accuracy ≥ 0.95, grounding ≥ 0.9. Wire the existing `EvaluationService` to score these.

### 3.3 AI quality benchmark
- Author ≥1,000 benchmark questions across the required subjects (math/bio/physics/chem/history/
  coding) + Bloom levels + Hindi/English/Hinglish, each with a rubric or reference answer.
- Run through the live pipeline; score hallucination, grounding, reasoning, completeness, safety,
  consistency (re-ask N times) via `EvaluationService` + a judge model.
- **Exit:** hallucination ≤ 5%, grounding ≥ 90%, safety refusals correct on an adversarial subset.

### 3.4 Performance (real numbers)
- Warm-path single-user: measure **TTFT** and **total response** via the `Telemetry` TTFT/latency
  records against staging.
- **Exit:** TTFT p50 < 1s, total p50 < 3s (the stated targets); record p95/p99 for the report.

### 3.5 Load (k6) — replaces the broken `load.test.ts`
- Ramp profiles: 100 → 500 → 1000 → 5000 → 10000 concurrent virtual users on `/api/chat/stream`
  and read endpoints.
- Capture error rate, throughput, p50/p95/p99 latency, memory/CPU, autoscaling reaction, queue
  growth, and **provider 429/throttle** behavior.
- **Exit:** error rate < 1% and p95 within SLO at the target concurrency the business needs (define
  it — 10k may not be the real requirement); graceful shedding (429s, not crashes) beyond it.

### 3.6 Stress + Chaos
- Huge notebooks / long conversations (verify context truncation — the thing `load.test.ts`
  *claimed* to test but didn't), large PDFs/images.
- Kill/timeout each dependency in turn (Pinecone, Firestore, Gemini, Cohere, Redis, network drop),
  one at a time, under moderate load.
- **Exit:** every failure degrades gracefully (503 or degraded result, single SSE `error` event),
  no process crash, no data corruption, recovery on dependency restore. This is where the
  `runResilient`/retry/backgroundExecutor primitives (unit-proven) get validated end-to-end.

### 3.7 Security red-team
- Prompt injection + jailbreak battery against the live model (the real test of the
  `sanitizeContext` guard — unit-proven, must be confirmed end-to-end).
- Cross-user / notebook leakage attempts (overlaps §3.1 isolation).
- AuthZ fuzzing (IDOR on every `:id`/`:userId` route), rate-limit verification **behind the proxy**
  (confirms the new `trust proxy` fix), token abuse, and PII handling in logs.
- Vector/graph poisoning: ingest adversarial content, confirm it can't override system instructions
  or leak across tenants.
- **Exit:** zero successful injections that exfiltrate system prompt or other users' data; zero IDOR;
  rate limiting effective per-client.

### 3.8 Observability validation
- Drive traffic; confirm StageLogger spans, TTFT/latency/cost telemetry, intelligence analytics,
  and error tracking all land in staging sinks and are queryable. Verify feature-flag state is
  observable.

---

## 4. Execution order & GO exit criteria

Sequence (each gates the next): **3.1 → 3.8 → 3.6/3.7 → 3.2 → 3.4 → 3.5 → 3.3.**
(Get journeys + observability + resilience/security solid before spending model budget on the
1,000-question benchmark and 10k load.)

Declare **GO** only when, on staging with real dependencies:
1. Integration journeys green; **zero cross-tenant leakage**.
2. Security red-team: no injection/IDOR/leak findings open.
3. Retrieval + AI quality meet the §3.2/§3.3 thresholds.
4. TTFT p50 < 1s, response p50 < 3s (§3.4).
5. Load: error rate < 1% at the defined target concurrency; graceful shedding beyond (§3.5).
6. Chaos: graceful degradation for every single-dependency failure (§3.6).
7. Observability complete (§3.8); CI gate green (already in place); no critical bugs open.

Until items 1–7 produce green evidence **on staging**, status remains release-candidate.

---

## 5. Immediate next actions (no live infra needed)

These can start now, in parallel with provisioning staging:
1. **Delete or quarantine** the four placeholder integration tests so they stop implying coverage;
   replace with the §3.1 skeletons (guarded to skip when staging env vars are absent).
2. Author the labelled relevance set (§3.2) and the benchmark question bank (§3.3) — data work,
   not infra-bound.
3. Write the k6 scripts (§3.5) and the chaos toggles (§3.6) so they're ready when staging is up.
4. Finish mocked unit coverage for the remaining thin controllers to hit the §2 controller bar.
