# TEST REPORT — Scholarly AI

**Date:** 2026-07-05. Honest, measured results. **No coverage target was met or fabricated.**

## What was run

### Backend unit tests (new, this pass) — ✅ GREEN
`npx jest tests/unit --coverage`
- `tests/unit/retry.test.ts` — `withTimeout` (resolve/timeout), `withRetry` (success, retry-on-429, no-retry-on-400, give-up). 5 tests.
- `tests/unit/textChunker.test.ts` — paragraph split, sub-chunking, whitespace-only. 3 tests.
- `tests/unit/auth.middleware.test.ts` — `requireAuth` (401 no token / valid / invalid), `enforceSelf` (403 / allow / 401), `requireCronSecret` (permissive when unset). 8 tests.
- **Result: 3 suites, 16 tests, all PASS.** (`tests/setup.ts` provides a hermetic env.)

### Coverage — measured, LOW
```
Statements : 2.67% (100/3735)
Branches   : 3.24% (48/1480)
Functions  : 2.32% (14/603)
Lines      : 2.48% (86/3466)
```
This is honest: the new unit tests cover only the critical utilities/middleware; `collectCoverageFrom` spans the entire `src/`. **The 80% backend / 70% frontend targets are NOT met.**

### Live smoke / E2E — ✅ GREEN (real services)
- `src/scripts/test_infrastructure.ts` — Firestore, Pinecone, Gemini, Groq, Tavily all reachable.
- `src/scripts/live_e2e_test.ts` — **9/9**: health, 401 unauth, 200 with token, notebook create, `enforceSelf` 403, streamed Groq chat.
- `src/scripts/live_rag_test.ts` — RAG ingest → READY, grounded answer + 1 citation.
- `/health/live` 200, `/health/ready` `{firestore:true}`.

## What is broken / not run (honest)
- **Legacy `tests/integration/*` — RED (pre-existing, not introduced here).** Git-verified: `git diff HEAD -- backend-firestore/tests/` is empty (I changed no legacy tests) and the original `auth.ts` was logically identical. Failure causes:
  - Missing modules: `services/tests.service`, `rag/WorkflowEngine`, `rag/knowledgeGraph.service` (never existed).
  - Stale APIs: `pineconeService.searchQuery`, `createNotebook(userId, File)`, `notebook.status`, `planningMode`.
  - Incomplete Firebase mock (auth/upload/isolation) → real `verifyIdToken` rejects fake tokens.
- **Frontend Playwright (`tests/e2e/workspace.spec.ts`)** — NOT run (no browser + needs a running app + creds).
- **Load / stress / soak tests** — NOT performed.
- **AI quality benchmark (hallucination rate, citation accuracy)** — NOT meaningfully measured; the existing `run_regression.ts` targets an empty `mock_notebook` (unrepresentative). Grounding was verified qualitatively (1 correct citation on a fictional fact).

## To reach the stated targets (roadmap)
1. Add a backend `"test"` npm script; wire CI (fail on red).
2. Rewrite/replace the 6 stale integration suites against current APIs; add a complete `firebase-admin` mock (or the Firestore emulator).
3. Add unit tests for services/repositories (notebook, chat, retrieval, planner) — the bulk of the 3735 statements.
4. Seed a golden RAG dataset + judge to measure real hallucination/citation-accuracy.
5. Run Playwright against a deployed preview; add k6/Artillery load tests against staging.

**Bottom line:** critical security + resilience paths now have passing unit tests and the full happy-path is live-verified end-to-end, but overall automated coverage (~2.5%) is far from production-grade.
