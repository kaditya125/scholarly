# FEATURE INTEGRATION REPORT — Scholarly AI (Phase 5)

**Date:** 2026-07-05
**Method:** Each feature traced from route → controller → service → repository/provider. Status ∈ {WORKING, PARTIAL, NOT CONNECTED, MOCKED, BROKEN}. Evidence cited. Post-Phase-2/3 auth state assumed (frontend now sends tokens).

| # | Feature | Status | Evidence & Notes |
|---|---------|--------|------------------|
| 1 | **Notebook CRUD + sharing** | **WORKING** | `notebook.controller`/`service`/`repository` real; `req.user.uid` + owner/editor/viewer checks; `NotebookSharingService` for share/share-link. Frontend calls now carry a token (Phase 3). |
| 2 | **Source upload → parse → metadata → chunk → embed → Pinecone** | **WORKING** | `source.service.processUpload` runs a real background pipeline: `FileParserService` (pdf/docx/OCR) → `extractRichMetadata` (Gemini JSON) → `TextChunker.chunkPages(1000,200)` → `GoogleEmbeddingProvider` (batched 50) → `pineconeService.upsertVectors`. Status transitions persisted. **Caveats:** fire-and-forget (client must poll status); `deleteSource` does NOT delete Pinecone vectors (orphaned, acknowledged in code). |
| 3 | **Knowledge Graph — nodes** | **PARTIAL** | Nodes ARE generated on upload (`addKGNodes` from Gemini-extracted definitions/people/places/formulae/keywords) and read via `graph.service`/`graph.repository`. **Edges are never created** (`addKGEdges` uncalled) → no prerequisites/relationships; `importance`/`difficulty`/`mastery` are hardcoded defaults; `generateLearningPath` is trivial (comment: "Mock BFS"). |
| 4 | **Knowledge Graph — in chat** | **NOT CONNECTED** | `KnowledgeGraphAgent.execute` runs in `WorkflowEngine` but its `graphContext` is never injected into the prompt; only acts in `REVISION` mode; reads via `FirestoreGraphProvider` (distinct from notebook `kg_nodes`). |
| 5 | **Learning Assets — generate** | **NOT CONNECTED** | `notebookService.addLearningAsset` has **no caller** — no flow persists flashcard/quiz/mindmap assets. Chat modes (FLASHCARDS/QUIZ/MIND_MAP) produce text in the reply only. |
| 6 | **Learning Assets — manage (update/delete/duplicate)** | **WORKING** | `assets.service` real Firestore ops; routes authenticated. |
| 7 | **Learning Assets — regenerate** | **MOCKED** | `assets.service.regenerateAsset` self-labelled "MOCK REGENERATION"; only bumps `difficulty`/`versionHistory`, no LLM call. |
| 8 | **Planner** | **PARTIAL** | `planner.service` + `PlannerAgent` create/rebalance a timetable (real), with burnout break-injection heuristic. `markTaskCompleted` KG-mastery update is a `console.log` mock. Frontend `lib/api/planner.ts` targets non-existent endpoints (`/planner` vs backend `/planner/:userId/timetable`) — pre-existing contract mismatch. |
| 9 | **Morning Briefing** | **WORKING (backend)** | `dailyBriefing.service` + `MorningBriefingAgent`; route `/briefing/:userId/today` (now `requireAuth`+`enforceSelf`); `useBriefing` sends token and uses `user.uid`. |
| 10 | **AI Coach** | **NOT CONNECTED** | `aiCoachService` registers an `eventBus.on(TEST_COMPLETED)` listener in its constructor, but the singleton is **never imported/instantiated**, and no code `emit`s events. Downstream `graphService`/`plannerService` inside it are inline `console.log` mocks. |
| 11 | **Admin Panel — access control + shell** | **WORKING** | `AdminGuard` (real `getIdTokenResult` claim check) via `AdminLayout`; backend `admin.routes` uses `requireAdmin`. |
| 12 | **Admin Panel — data endpoints** | **PARTIAL** | Mixed: some admin controllers call real services; `feature-flags.controller.getFlags` returns hardcoded stub data. Frontend admin data calls now carry a token (Phase 3) but still require the `role` claim to be provisioned (no in-app provisioning flow exists). |
| 13 | **Prompt Versioning** | **PARTIAL** | `promptExperiment.service` persists versions/experiments to Firestore and is exposed via `prompt-studio.controller`; NOT consulted by live prompt building. |
| 14 | **Feature Flags** | **NOT CONNECTED** | `featureFlag.service` real CRUD + cache, but `isEnabled()` is never called by the request pipeline. Three overlapping flag mechanisms exist. |
| 15 | **Prompt A/B Testing** | **NOT CONNECTED** | `getExperimentalPrompt` only referenced by an admin controller; `WorkflowEngine`/agents never call it. |
| 16 | **Continuous Evaluation** | **PARTIAL (offline only)** | `scripts/run_regression.ts`, `src/scripts/continuousEval.ts`, `comprehensiveBenchmark.ts` exist and use the legacy `WorkflowEngine.processEducationalQuery`. No scheduled/live eval. The committed regression run targeted an empty `mock_notebook` (artifact). |
| 17 | **Multi-Agent Routing** | **PARTIAL** | Real multi-step orchestration (`TeacherAgent` → verification → `ResponseFormatter`) in `WorkflowEngine`. But provider "routing" is Groq-only; `AIOrchestrator` (real Gemini+Groq router) and `AIProviderFactory` (mocked) are both unused; UI model selector is cosmetic. |
| 18 | **Verification** | **PARTIAL** | The working verifier is `retrievalService.verifyClaimsAndCalculateConfidence` (real Groq judge), invoked in chat when a notebook + citations exist; **fails open** on parse error. The separate `VerificationAgent` is BROKEN (resolves an unregistered provider) and not instantiated. |
| 19 | **EventBus** | **NOT CONNECTED** | Subscriber defined but never activated; no emitter (see #10). |
| 20 | **Chat + Streaming (SSE)** | **WORKING** | `WorkflowEngine.executeStream` via `ChatService.processChatStream`; `useWorkflowStream` SSE reader; now `requireAuth` + `req.user.uid`. TTFT caveat: full draft is generated before the formatter streams. |
| 21 | **Citations** | **WORKING (notebook chats)** | `WorkflowEngine` emits `citation` events from notebook retrieval results; frontend renders them. |
| 22 | **RAG retrieval + rerank** | **WORKING** | `retrieval.service`: embeddings → Pinecone → 0.5 floor → dedup → Cohere rerank → authority/exam/freshness weighting; `sanitizeContext` injection guard; `rewriteQuery` real. |

---

## Integration status summary

- **WORKING (8):** Notebook CRUD, Source ingestion pipeline, Learning-asset management, Morning Briefing (backend), Admin access control, Chat/SSE, Citations, RAG retrieval.
- **PARTIAL (7):** KG nodes, Planner, Admin data endpoints, Prompt Versioning, Continuous Evaluation, Multi-agent routing, Verification.
- **NOT CONNECTED (5):** KG-in-chat, Learning-asset generation, AI Coach, Feature Flags, Prompt A/B, EventBus. *(6 lines; EventBus and AI Coach are the same root cause.)*
- **MOCKED (1):** Asset regeneration.
- **BROKEN (1):** `VerificationAgent` (would throw; superseded by the working retrieval verifier).

## Highest-value integration follow-ups (for the roadmap)
1. Generate KG **edges** and use `graphContext` in chat prompts (unlocks the flagship "Knowledge Graph" claim end-to-end).
2. Wire **asset generation** (`addLearningAsset`) into the chat FLASHCARDS/QUIZ/MIND_MAP modes so assets persist.
3. Activate **AI Coach**: instantiate `aiCoachService` and emit `TEST_COMPLETED`/`TASK_COMPLETED`.
4. Consult **feature flags** and **prompt experiments** in `WorkflowEngine`, or retire them.
5. Adopt `AIOrchestrator` to make **model routing / UI model selection** real, or remove the selector.
