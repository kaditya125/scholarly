# FINAL SYSTEM AUDIT — Scholarly AI

**Date:** 2026-07-05
**Basis:** Direct code reading + live execution against real Firebase/Pinecone/Gemini/Groq/Cohere. Status legend: ✅ implemented & runtime-verified · 🟢 implemented (code-verified, not run) · 🟡 partial · 🟥 mock/stub · ⚫ dead/not wired · 🔴 risk.

> This consolidates and supersedes the earlier per-area reports (AUDIT_VERIFICATION, FEATURE_INTEGRATION, LIVE_VALIDATION). Where those conflict, this file is current.

## Backend — module map

| Module | Status | Notes |
|---|---|---|
| Express server (`server.ts`) | ✅ | Boots (DI-ordering bug fixed), helmet, compression, morgan, CORS allowlist, rate limit, graceful shutdown, process error handlers, `/health` + `/health/live` + `/health/ready`. |
| DI container/registry | 🟢 | Map-based; registers Groq/Google-embed/Cohere/cache/graph/memory/analytics. `VectorStore`/`Verification` tokens defined but unregistered (unused). |
| Auth middleware (`requireAuth`, `enforceSelf`, `requireCronSecret`) | ✅ | Firebase token verify; self-scoping; cron secret. Unit-tested + live-tested (401/403). |
| Ownership (`requireNotebookAccess`) | ✅ | Reuses `notebookService.getNotebookById`; applied to graph + assets routes. |
| Chat controller/service | ✅ | `req.user.uid` identity; SSE streaming; session ownership; verified live. |
| WorkflowEngine (`executeStream`) | ✅ | Live orchestration: context → (KG agent) → retrieval → TeacherAgent → verify → ResponseFormatter (SSE) → real telemetry. TTFT high (draft-then-format). |
| `processEducationalQuery` (legacy) | ⚫ | Only used by offline benchmark scripts. |
| RAG: retrieval.service | ✅ | Embed → Pinecone → 0.5 floor → dedup → Cohere rerank → authority/exam/freshness weighting; injection sanitization; live-verified grounded retrieval. |
| RAG: pinecone.service | ✅ | v8 `upsert({records})` fixed; namespace consistent (upsert+query use `PINECONE_NAMESPACE`). |
| RAG: embeddings (Google) | ✅ | `gemini-embedding-001` @ 768 dims (matches index); per-item batching; retry+timeout. |
| Source ingestion (`source.service`) | ✅ | Live notebook upload: parse → Gemini metadata → chunk → embed → Pinecone → KG nodes → READY. Fire-and-forget; `deleteSource` orphans vectors. |
| Curriculum ingestion (`ingestion.service`) | 🟡 | Real service, but admin route only exposes mocked `getJobs`; no wired ingest endpoint. |
| Knowledge Graph (read) | 🟢 | `graph.service`/repo read nodes/edges. |
| Knowledge Graph (write) | 🟡 | Nodes written on upload; **edges never created**; produced 0 nodes for tiny test doc. |
| KG in chat | ⚫ | `KnowledgeGraphAgent` runs but output never injected into prompt. |
| VerificationAgent | ⚫ | Would throw (unregistered provider); real verification lives in retrieval.service (fails-open on parse error). |
| Planner (service + agent) | 🟢/🟡 | Timetable gen + burnout heuristic real; KG-mastery update is a `console.log` mock. |
| Morning Briefing | 🟢 | Service + agent + route + `useBriefing` (token). |
| AI Coach / EventBus | ⚫ | `aiCoachService` never instantiated; no event emitter; inline mock deps. |
| Admin panel (RBAC) | ✅ | `requireAdmin` (role claim) + `AdminGuard`; no in-app claim provisioning. |
| Admin data controllers | 🟡 | Mixed real/stub; `feature-flags.controller` + `curriculum.controller.getJobs` return hardcoded data. |
| Feature flags | 🟡/⚫ | Real service; never consulted by pipeline; 3 overlapping mechanisms. |
| Prompt versioning / A-B | 🟡/⚫ | Real service; not applied to live prompts. |
| Continuous evaluation | 🟡 | Offline scripts only; not scheduled; regression harness targets empty index. |
| Telemetry / tracing | ✅ | Real latency/cost/TTFT now (capped buffers). Trace-ID only (not OTel). |
| Repositories (12) | 🟢/🟡 | Solid; chat reads now bounded; `getSessionsByUser` still in-memory sort (unbounded — see TECHNICAL_DEBT). Leaderboard social fields placeholder. |
| Dead code | ⚫ | `AIProviderFactory` (mock), `AIOrchestrator` (unused), `middleware/rateLimiter.ts`, `gpt/nvidia/claude.provider`. |

## Frontend — module map (code-verified; **not** browser-tested)

| Area | Status | Notes |
|---|---|---|
| Routing (`App.tsx`) | 🟢 | Maps pages; no 404 route; no app-shell auth guard; unused imports (`AdminRoute`, `AdminDashboard`, `Analytics`). |
| Auth (`AuthContext`, `firebase.ts`) | 🟢 | Firebase web SDK; `AdminGuard` real claim check. |
| API client (`lib/api/client.ts`) | 🟢 | Token interceptor **re-enabled** (was disabled) — unblocks notebooks/assets/graph/admin. |
| Chat page | 🟢 | Real SSE via `useWorkflowStream`; markdown/KaTeX/Mermaid; model selector cosmetic (backend always Groq). |
| Notebooks/graph/assets components | 🟢/🟡 | Real API wiring; depth not browser-verified. |
| `lib/api/planner.ts`, `analytics.ts` | 🔴 | Target non-existent endpoints (`/planner`, `/analytics/metrics`) — pre-existing contract mismatch. |
| Bundle | 🔴 | Main chunk ~3.2 MB (850 KB gz); code-splitting recommended. |
| Playwright E2E | 🟡 | 1 spec; not runnable here (needs browser + running app). |

## Top risks (see dedicated reports)
1. Exposed/committed secrets (SECURITY_AUDIT).
2. Firestore rules written but not deployed (SECURITY_AUDIT).
3. In-memory rate-limit & cache — not multi-instance safe (PERFORMANCE_REPORT).
4. ~2.5% test coverage; legacy integration suite broken (TEST_REPORT).
5. Several advertised features not wired (this file + FEATURE_INTEGRATION_REPORT).
