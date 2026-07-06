# TECHNICAL DEBT — Scholarly AI

**Date:** 2026-07-05. Ordered by impact. Each item: what, where, why it matters, suggested fix. Nothing here was auto-removed (per constraints).

## High
1. **Broken legacy integration test suite** — `tests/integration/*` reference removed modules (`services/tests.service`, `rag/WorkflowEngine`, `rag/knowledgeGraph.service`), stale APIs (`pineconeService.searchQuery`, `createNotebook(userId, File)`), and incomplete Firebase mocks. → Rewrite against current APIs or delete; add a `test` npm script + CI gate.
2. **Unbounded `getSessionsByUser`** — `chat.repository.ts` fetches all sessions then sorts in memory (avoids composite index). → Add `(userId ASC, createdAt DESC)` index (already in `firestore.indexes.json`) and switch to `orderBy().limit()`.
3. **In-memory rate limiting & cache** — `server.ts` (express-rate-limit) + `cache.service`. Not shared across instances. → Use `rate-limit-redis` + Redis (deps already present).
4. **Frontend contract mismatches** — `lib/api/planner.ts` calls `/planner` (backend `/planner/:userId/timetable`); `lib/api/analytics.ts` calls `/analytics/metrics` & `GET /companion/evaluate` (no such routes). → Align client to real routes or add compatibility endpoints.
5. **Frontend bundle ~3.2 MB** — heavy libs (mermaid, d3, pdfjs, tesseract, force-graph) not split. → `React.lazy` + `manualChunks`.

## Medium
6. **Duplicate/overlapping subsystems** — `middleware/` vs `middlewares/`; three feature-flag mechanisms (`featureFlag.service`, `config.service.getFeatureFlags`, admin `feature-flags.controller` stub); two orchestrators (`WorkflowEngine` live, `AIOrchestrator` dead) + mock `AIProviderFactory`. → Consolidate to one of each; remove the rest.
7. **Not-wired features presented as complete** — KG edges never generated; KG unused in chat; learning-asset generation (`addLearningAsset`) has no caller; `regenerateAsset` mocked; AI Coach/EventBus never activated; prompt A/B + feature flags not consulted. → Wire or clearly mark as roadmap.
8. **Verification fails open** — `retrieval.service.verifyClaimsAndCalculateConfidence` returns `isValid:true` on parse error. → Fail closed or surface uncertainty to the client.
9. **Ingestion is fire-and-forget** — no retry/queue; `deleteSource` leaves orphaned Pinecone vectors; per-document duplicate uploads not deduped. → Job queue + vector cleanup by metadata filter.
10. **Curriculum system is generic RAG** — no structured syllabus hierarchy; admin curriculum dashboard mocked. → Build curriculum schema + real ingest endpoint, or stop advertising per-exam curriculum.

## Low
11. **Model selector cosmetic** — backend always uses Groq `gpt-oss-20b`; adopt `AIOrchestrator` (real Gemini+Groq router) or remove the UI options.
12. **Type safety** — frequent `as any` at agent/provider boundaries; two divergent AI provider interfaces (`IAIProvider` vs `AIProvider`). → Unify the interface.
13. **Dead code** — `AIProviderFactory.ts`, `AIOrchestrator`, `middleware/rateLimiter.ts`, `gpt/nvidia/claude.provider.ts`, frontend `AdminRoute.tsx`, empty `frontend/src/data/`. → Remove after owner sign-off.
14. **Docs vs reality** — `backend-firestore/docs/*.md` describe unbuilt Phase-6 infra (k8s, Redis global context, Pub/Sub, Yjs, sandbox); root `README.md` is Google AI Studio boilerplate. → Replace with the current reports.
15. **OCR English-only** — `tesseract.js` 'eng'; Indian-language content unsupported.

## Recently paid down (this hardening pass)
- Server startup DI-ordering crash, Groq message-shape crash, deprecated embedding model, batch-embedding bug, Pinecone namespace mismatch, Pinecone v8 upsert API — all fixed & live-verified.
- Added retry/timeout on AI calls, telemetry memory cap, bounded chat reads, asset-route ownership, health/liveness/readiness, process error handlers, Dockerfile, unit tests.
