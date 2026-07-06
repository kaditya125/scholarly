# FUNCTIONAL VALIDATION REPORT — Scholarly AI (Phase 8)

**Date:** 2026-07-05
**Verification method:** **Static code-path tracing** (route → controller → service → repository/provider → frontend caller). This environment has **no live Firebase/Pinecone/Groq/Gemini credentials**, so end-to-end runtime execution was not possible. Each workflow is marked with what it depends on to run live.

Status: **PASS** = complete, wired path (should work with valid creds) · **PARTIAL** = works but incomplete/mocked in part · **FAIL** = broken/not wired.

| # | Workflow | Status | Evidence (code path) | Runtime dependency |
|---|----------|--------|----------------------|--------------------|
| 1 | Student Login (Signin) | PASS | `firebase.ts` (Google/GitHub popup) + `AuthContext.onAuthStateChanged`; `Signin.tsx`/`Signup.tsx`. | Firebase Auth |
| 2 | Notebook Creation | PASS | `notebooksApi.createNotebook` → `POST /notebooks` (`requireAuth`) → `notebook.controller.createNotebook` (`req.user.uid`) → `notebook.service`/`repository`. Unblocked by the Phase-3 token interceptor. | Firebase, Firestore |
| 3 | Notebook Switching | PASS | `Notebooks.tsx` `activeNotebook` state → `useNotebookSources(notebookId)` polls `GET /notebooks/:id/sources`. | Firestore |
| 4 | PDF Upload | PASS | `notebooksApi.uploadSource` (multipart, token) → `POST /notebooks/:id/sources` (multer 25 MB) → `source.controller` → `source.service.processUpload`. | Firestore, Pinecone, Gemini |
| 5 | OCR | PARTIAL | `FileParserService` uses `tesseract.js` (**`eng` only**) for images, `pdf-parse` for PDFs. Works for English; **no Hindi/regional OCR** despite Indian-exam focus. | — |
| 6 | Chunking | PASS | `TextChunker.chunkPages(1000, 200)` in `source.service`. | — |
| 7 | Embedding | PASS | `GoogleEmbeddingProvider.generateEmbeddings` (batched 50) in `source.service`. | Gemini/Google |
| 8 | Pinecone Storage | PASS | `pineconeService.upsertVectors` (batch 100). | Pinecone |
| 9 | Chat | PASS | `POST /chat/stream` (`requireAuth`, `req.user.uid`) → `ChatService.processChatStream` → `workflowEngine.executeStream`. | Groq, Firestore |
| 10 | Streaming (SSE) | PASS | `useWorkflowStream` fetch+reader; server SSE via `res.write('data: …')`. Token attached. | Groq |
| 11 | Citations | PASS | `WorkflowEngine` emits `citation` events from notebook retrieval; frontend renders `CitationViewerPanel`. Note: page/paragraph only (no pixel highlight). | Pinecone, Cohere |
| 12 | Flashcard Generation | PARTIAL | Chat `FLASHCARDS` mode produces flashcard **text** in the reply (real, prompt-driven). **Not persisted** as a `LearningAsset` (`addLearningAsset` has no caller). | Groq |
| 13 | Quiz Generation | PARTIAL | Two paths: chat `QUIZ` mode (text) and `adaptiveTest.service.generateAdaptiveTest` (`POST /tests/adaptive/:userId/generate`, now `enforceSelf`). Adaptive generation is real; quiz **assets** are not persisted via the asset pipeline. | Groq/Gemini, Firestore |
| 14 | Knowledge Graph | PARTIAL | Nodes built on upload (`source.service.addKGNodes` from Gemini metadata) and read via `GET /notebooks/:id/graph` (now `requireNotebookAccess`) → `KnowledgeGraphViewer`. **No edges** (`addKGEdges` uncalled); not used in chat. | Firestore, Gemini |
| 15 | Planner | PARTIAL | `PlannerService.createGoalAndGenerateTimetable`/`adaptRebalanceTimetable` (real, + burnout heuristic). KG-mastery update is a `console.log` mock. Frontend `lib/api/planner.ts` calls `/planner` (backend is `/planner/:userId/timetable`) — **pre-existing contract mismatch**. | Firestore, LLM |
| 16 | Morning Briefing | PASS (backend) | `useBriefing` (token, `user.uid`) → `GET /briefing/:userId/today` (`requireAuth`+`enforceSelf`) → `dailyBriefing.service` + `MorningBriefingAgent`. | LLM, Firestore |
| 17 | Dashboard | PARTIAL (Unable to fully verify) | `StudentDashboard.tsx` renders; data-source mix not fully traced. Renders without live data. | Firestore/LLM |
| 18 | Analytics | FAIL (data) / PASS (renders) | `/analytics` route renders `<Dashboard/>`; `analyticsApi.getMetrics` calls `GET /analytics/metrics` and `GET /companion/evaluate` — **neither route exists** on the backend. Real analytics logs now written to `users/{uid}/analytics_logs` (Phase 6) but there's no read endpoint wired to the page. | — |
| 19 | Leaderboard | PARTIAL | `GET /leaderboard` (now `requireAuth`) → real XP ranking from `user_stats`; **name/followers/trends are placeholders**. | Firestore |
| 20 | Admin Login | PASS | `AdminGuard` verifies `getIdTokenResult(true).claims.role`; backend `requireAdmin` checks the same claim. **No in-app provisioning** to set the claim. | Firebase custom claims |
| 21 | Admin Dashboard | PARTIAL | Pages render under `AdminLayout`/`AdminGuard`; data endpoints mixed — some real, `feature-flags.controller` returns a hardcoded stub, `curriculum.controller.getJobs` returns **mock jobs**. Admin API calls now carry a token (Phase 3). | Firestore + role claim |
| 22 | Prompt Editing | PARTIAL | `prompt-studio.controller` + `promptExperiment.service` (real Firestore CRUD). Edited/experimental prompts are **not consumed** by the live `WorkflowEngine`. | Firestore |
| 23 | Feature Flags | PARTIAL | `featureFlag.service` real CRUD + cache; `isEnabled()` **never called** by the pipeline; a duplicate hardcoded-stub admin controller also exists. | Firestore |

## Tally
- **PASS:** 10 (login, notebook create/switch, upload, chunking, embedding, Pinecone, chat, streaming, citations, briefing, admin login) — core NotebookLM/RAG loop is structurally complete and (post-Phase-3) reachable from the UI.
- **PARTIAL:** 10 (OCR, flashcards, quiz, KG, planner, dashboard, leaderboard, admin dashboard, prompt editing, feature flags).
- **FAIL:** 1 (Analytics page → non-existent backend endpoints).

## Honesty statement
No workflow was executed end-to-end (no credentials in this environment). Statuses reflect **verified code paths**, not live runs. To convert PASS(code-traced) → PASS(runtime), deploy with the `.env` in `SECURITY_FIX_REPORT.md` §5 and exercise the runbook in `PERFORMANCE_VALIDATION.md` §5. The security/auth changes were compile-verified (backend `tsc` exit 0) and the auth routing interaction was reasoned through explicitly (chat+feedback co-mounting).
