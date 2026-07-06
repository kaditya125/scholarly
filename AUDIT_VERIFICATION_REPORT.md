# AUDIT VERIFICATION REPORT — Scholarly AI

**Date:** 2026-07-05
**Method:** Every finding below was checked directly against source code (file + line/function evidence). Status is one of **VERIFIED**, **PARTIALLY TRUE**, or **FALSE**. No code was modified during this phase.
**Scope:** `d:\scholarly\backend-firestore` (Express/TS API) and `d:\scholarly\frontend` (React/Vite SPA).

Legend — Severity: `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFO`.

---

## A. Authentication & Authorization

### A1. Most API routes do not enforce authentication — VERIFIED
- **Location:** `backend-firestore/src/routes/*.ts`, mounted in `src/routes/index.ts`.
- **Code evidence:** `requireAuth` (`src/middlewares/auth.ts`) is applied only in `notebooks.routes.ts`, `assets.routes.ts`, `publishedAssets.routes.ts`, `studyGroups.routes.ts` (each `router.use(requireAuth)`). It is **absent** from `chat.routes.ts`, `planner.routes.ts`, `tests.routes.ts`, `leaderboard.routes.ts`, `discussions.routes.ts`, `rooms.routes.ts`, `users.routes.ts`, `companion.routes.ts`, `briefing.routes.ts`, `graph.routes.ts`, `feedback.routes.ts`, `questions.routes.ts`.
- **Root cause:** Auth middleware was added per-feature during development and never applied globally.
- **Severity:** CRITICAL
- **Recommended fix:** Apply `requireAuth` to every user-facing router; add ownership checks (see A2/A3).

### A2. Endpoints trust a client-supplied `userId` (impersonation / IDOR) — VERIFIED
- **Location & evidence:**
  - `src/controllers/chat.controller.ts` → `handleChat`/`handleChatStream` read `const { userId } = req.body` (self-comment: *"In a real app, userId should be extracted from the auth middleware… For now, we extract from body"*). `getUserSessions`/`deleteSession` read `req.query.userId`.
  - `src/controllers/planner.controller.ts`, `userStats.controller.ts`, `briefing.controller.ts`, `tests.controller.ts` read `const { userId } = req.params` with no verification.
  - `src/controllers/discussions.controller.ts` → `createDiscussion` reads `req.headers['x-user-id']` (self-comment: *"In a real app, participantId comes from auth token"*).
- **Root cause:** Identity taken from request instead of the verified Firebase token.
- **Severity:** CRITICAL (any caller can read/write/delete another user's data; `POST /users/:userId/xp` lets anyone grant XP to anyone).
- **Recommended fix:** Derive identity from `req.user.uid`; enforce `req.params.userId === req.user.uid`.

### A3. `graph.routes.ts` has neither auth nor notebook-ownership checks — VERIFIED
- **Location:** `src/routes/graph.routes.ts`, `src/controllers/graph.controller.ts`.
- **Code evidence:** Routes `/:notebookId/graph`, `/graph/search`, `/graph/stats`, `/graph/path/:nodeId` have no middleware; `GraphController.getGraph` calls `graphService.getGraph(notebookId)` with no `userId`. Mounted under `/notebooks` but as a **separate** router, so `notebooks.routes.ts`' `requireAuth` does **not** apply.
- **Root cause:** Graph router mounted alongside notebooks without inheriting its guard.
- **Severity:** HIGH (any user can read any notebook's knowledge graph by ID).
- **Recommended fix:** `requireAuth` + a notebook-ownership middleware reusing `notebookService.getNotebookById(id, uid)`.

### A4. Notebook/Source/StudyGroup/PublishedAssets controllers ARE correctly secured — VERIFIED (positive)
- **Evidence:** `notebook.controller.ts`, `source.controller.ts`, `studyGroup.controller.ts`, `publishedAssets.controller.ts` all use `req.user?.uid` + 401 guard; `notebook.service.getNotebookById`/`notebook.repository.getNotebook` enforce owner/editor/viewer membership. This part of the audit's "auth broken everywhere" is **narrower than stated** — these modules are sound; the gap is the missing route guards elsewhere and the frontend token (A5).

### A5. Frontend shared API client never attaches the Firebase token — VERIFIED
- **Location:** `frontend/src/lib/api/client.ts`.
- **Code evidence:** The request interceptor body is commented out:
  ```ts
  // const token = await auth.currentUser?.getIdToken();
  // if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
  ```
  `lib/api/notebooks.ts` (and others) use this `api` instance. By contrast `hooks/ai/useWorkflowStream.ts` and `hooks/ai/useBriefing.ts` fetch `getIdToken()` directly.
- **Root cause:** Interceptor left disabled; only the streaming/briefing hooks were wired for auth.
- **Severity:** HIGH — calls to the token-protected `/notebooks*`, `/explore*`, `/study-groups*` routes return **401**, so the Notebook/RAG feature is broken from the UI.
- **Recommended fix:** Re-enable the interceptor (Phase 3).

### A6. Admin RBAC is real on both ends — PARTIALLY TRUE (audit under-credited it)
- **Evidence:** Backend `admin/routes/admin.routes.ts` applies `router.use(requireAdmin)`; `admin/middleware/rbac.middleware.ts` verifies the token and checks `decodedToken.role`. Frontend `admin/layouts/AdminLayout.tsx` wraps content in `admin/components/AdminGuard.tsx`, which calls `user.getIdTokenResult(true)` and checks `claims.role`. **The mocked `frontend/src/components/AdminRoute.tsx` (`const role = 'ADMIN'`) is NOT used** by the admin routing (`App.tsx` → `AdminRoutes` → `AdminLayout`).
- **Residual issue:** No code ever calls `setCustomUserClaims`, so the `role` claim can only be set out-of-band; admins cannot be provisioned in-app. **Severity:** MEDIUM.

---

## B. Secrets & Configuration

### B1. Live secrets hardcoded in source — VERIFIED
- **Location:** `backend-firestore/src/config/env.ts`.
- **Code evidence:**
  ```ts
  PINECONE_API_KEY: z.string().default('pcsk_4VuMim_...'),
  TAVILY_API_KEY:  z.string().default('tvly-dev-2fN5iS-...'),
  ```
- **Root cause:** Default values used as a convenience; committed to VCS.
- **Severity:** CRITICAL — keys are exposed and must be rotated.
- **Recommended fix:** Remove defaults, load from env only, warn if missing (both `pinecone.service.ts` and `search.service.ts` already tolerate a missing key).

### B2. Firebase web API key committed in frontend — VERIFIED / INFO
- **Location:** `frontend/src/lib/firebase.ts` (`apiKey: "AIzaSy..."`).
- **Assessment:** Firebase **web** API keys are public identifiers by design; not a leak per se. BUT protection then depends on Firestore rules, which are **missing** (B3). **Severity:** LOW (contingent on B3).

### B3. No Firestore security rules or index definitions — VERIFIED
- **Evidence:** Workspace search for `firestore.rules` / `firestore.indexes.json` returns none.
- **Root cause:** Never authored; the backend relies on the Admin SDK (which bypasses rules).
- **Severity:** CRITICAL (data governance) — if any client SDK access is ever added, or the project is in test-mode, data is exposed.
- **Recommended fix:** Author least-privilege `firestore.rules` (default-deny + owner-based) and `firestore.indexes.json` for verified query patterns.

### B4. Production CORS origin is a placeholder — VERIFIED
- **Location:** `backend-firestore/src/server.ts`.
- **Code evidence:** `origin: env.NODE_ENV === 'development' ? '*' : ['https://your-production-domain.com']`.
- **Severity:** HIGH (deploy-breaking / misconfigured). **Fix:** env-driven allowlist.

### B5. Rate limiting is in-memory and disabled in dev — VERIFIED
- **Location:** `server.ts` — `express-rate-limit` with `skip: () => env.NODE_ENV === 'development'`; `rate-limit-redis` is a dependency but unused.
- **Severity:** MEDIUM (ineffective across multiple instances). **Fix (later phase):** Redis store + per-user limits.

---

## C. AI Pipeline & Telemetry

### C1. Workflow analytics are hardcoded placeholders — VERIFIED
- **Location:** `src/core/workflow/WorkflowEngine.ts` → `executeStream()` → `analyticsProvider.logWorkflowMetrics(...)`.
- **Code evidence:** `retrievalLatencyMs: 100, // Placeholder`, `rerankingLatencyMs: 150, // Placeholder`, `hallucinationRate: 0, // Placeholder`, `averageConfidence: 0.95`, `citationCoverage: 1.0`, `embeddingCost: 0`, `generationCost: 0`.
- **Root cause:** Metrics never wired to real measurement.
- **Severity:** HIGH (any cost/latency dashboard is fabricated). **Fix:** Phase 6 — measure real stage latencies + confidence.

### C2. Multi-LLM router is fully mocked and unused — VERIFIED
- **Location:** `src/core/providers/AIProviderFactory.ts`.
- **Evidence:** `callGroq/callGemini/callOpenAI/callClaude` are `setTimeout` + canned strings (`` `Groq (Fast) Response for: ${prompt}` ``). Grep: only self-references — never imported. The live provider is `GroqProvider` via DI (`registry.ts`).
- **Severity:** MEDIUM (dead code; "cost-aware routing" claim false). **Fix:** integrate or remove (Phase 4/5).

### C3. UI model selection is cosmetic — VERIFIED
- **Evidence:** `frontend/src/pages/Chat.tsx` offers Gemini/Llama/Nemotron/GPT-OSS; backend DI registers `new GroqProvider()` (default `openai/gpt-oss-20b`) and `WorkflowEngine` resolves `TOKENS.AIProvider` without consulting `req.model`. **Severity:** MEDIUM.

### C4. `EventBus` is inert — defined subscriber, never activated, no emitter — VERIFIED (evidence corrected)
- **Location:** `src/core/workflow/EventBus.ts`; a subscriber exists in `src/services/aiCoach.service.ts` (`eventBus.on(EventNames.TEST_COMPLETED, …)` inside `initializeListeners()`).
- **Correction:** an earlier pass reported "no usages" — that was a false negative from a bad search glob. A subscriber DOES exist. However: (a) the `aiCoachService` singleton that registers the listener is **never imported/instantiated** anywhere, so `initializeListeners()` never runs; and (b) no code ever calls `eventBus.emit(...)`. Net effect at runtime: **no active publishers or subscribers**.
- **Severity:** LOW. Implication unchanged: the "EventBus-driven AI Coach" is not active. See DEAD_CODE_REPORT.md → "needs integration".

### C5. `VerificationAgent` would throw if executed — VERIFIED
- **Location:** `src/core/agents/VerificationAgent.ts` resolves `TOKENS.VerificationProvider`, which `registry.ts` never registers (`container.resolve` throws "Dependency not found"). Not used by `executeStream` (which calls `retrievalService.verifyClaimsAndCalculateConfidence` directly). **Severity:** LOW (dead/broken). Note: the *real* verification path (`retrieval.service.ts`) exists and works, but **fails open** (`catch → isValid:true, confidence:0.8`).

### C6. Knowledge Graph IS populated on upload; the chat-time agent's output is discarded — VERIFIED (evidence corrected)
- **KG population (real):** `source.service.processUpload` (live route `POST /notebooks/:id/sources`) extracts entities via Gemini (`extractRichMetadata`) and writes nodes via `notebookRepository.addKGNodes` (+ `GRAPH_BUILT` timeline event). The read API (`graph.service` → `graph.repository`) serves them. **BUT only NODES are created — `addKGEdges` is never called**, so there are no relationships/prerequisites; node `importance`/`difficulty`/`mastery` are defaults; `generateLearningPath` BFS is therefore trivial.
- **Chat-time (inert):** `WorkflowEngine.executeStream` runs `KnowledgeGraphAgent.execute` but never injects `sharedState['graphContext']` into the TeacherAgent prompt; the agent also only acts in `REVISION` mode and reads via `FirestoreGraphProvider` (separate from the notebook `kg_nodes` subcollection).
- **Correction:** my earlier "no KG generation at ingestion" referred to `ingestion.service.ts` (the ADMIN curriculum path used by `curriculum.controller`), NOT the live notebook path `source.service.ts`, which DOES build KG nodes.
- **Severity:** MEDIUM (nodes exist and are viewable; edges missing; unused in chat).

### C7. Mock OCR confidence & citation coordinates — VERIFIED (scope clarified)
- **Location:** `src/services/rag/ingestion.service.ts` (the ADMIN curriculum ingestion path used by `curriculum.controller`) — `ocrConfidence: 0.95, // Mock OCR confidence`, `pageCoordinates: '[[0,0],[0,0]]', // Mock bounding box`.
- **Clarification:** the live USER notebook upload path (`source.service.ts`) does NOT use these mocks — it stores real `pageNumber`/`paragraphIndex` per chunk (though it computes no pixel bounding boxes). So click-to-highlight can resolve to page/paragraph, not an exact pixel region.
- **Severity:** MEDIUM.

### C8. RAG retrieval is genuinely implemented — VERIFIED (positive)
- **Location:** `src/services/rag/retrieval.service.ts` + `pinecone.service.ts`. Real Google embeddings → Pinecone query (`topK*4`, `filter{notebookId}`) → 0.50 floor → dedup → Cohere rerank → authority/exam/freshness weighting; `rewriteQuery` and `verifyClaimsAndCalculateConfidence` are real LLM calls; `sanitizeContext` strips injection patterns. The audit's positive assessment here holds.

### C9. Prompt system is high quality — VERIFIED (positive)
- **Location:** `src/config/prompts.ts` (identity, exam knowledge base, 10 modes, personalization). Genuine strength.

### C10. Regression report reflects an empty test index, not real quality — VERIFIED
- **Location:** `backend-firestore/reports/regression_report_1783166549280.json` (hallucination_rate 1, citation 0, `retrieved_text: "..."`) + `scripts/run_regression.ts`.
- **Evidence:** The script calls `service.retrieveContext(q.question, 'mock_notebook', …)`; `'mock_notebook'` has no ingested vectors → retrieval returns `[]` → `retrievedText = '' ` → `substring(0,150)+'...'` = `"..."`; the Gemini judge then flags empty context as hallucination.
- **Conclusion:** The 100% hallucination figure is a **test-harness artifact**, not proof the production pipeline is broken. End-to-end RAG quality remains **unverified**.

---

## D. Feature Wiring (scaffolding present, not connected)

### D1. Feature flags exist but never gate the pipeline — VERIFIED
- **Location:** `src/services/featureFlag.service.ts` (real Firestore CRUD + cache). Grep: `isEnabled(` is only referenced inside the service itself — the WorkflowEngine/RAG never call it. Also duplicated by `config.service.getFeatureFlags` and a hardcoded-stub `admin/controllers/feature-flags.controller.ts`. **Severity:** MEDIUM.

### D2. Prompt A/B testing exists but is not applied to traffic — VERIFIED
- **Location:** `src/services/promptExperiment.service.ts`. Grep: `getExperimentalPrompt` only referenced by `admin/controllers/prompt-studio.controller.ts`; live prompt building (`buildScholarlySystemPrompt`, `getTeacherPrompt`) never calls it. **Severity:** LOW/MEDIUM.

### D3. "Continuous evaluation" is offline scripts only — VERIFIED
- **Location:** `src/scripts/continuousEval.ts`, `scripts/run_regression.ts`, `src/scripts/comprehensiveBenchmark.ts` (use the older `WorkflowEngine.processEducationalQuery`, which is otherwise unused by the live path). No scheduled/live evaluation service. **Severity:** MEDIUM.

### D4. Frontend planner/analytics API modules target non-existent endpoints — VERIFIED
- **Location:** `frontend/src/lib/api/planner.ts` calls `GET/POST /planner`, `PATCH /planner/:id`; backend exposes `GET/POST /planner/:userId/timetable` etc. `frontend/src/lib/api/analytics.ts` calls `/analytics/metrics` and `GET /companion/evaluate`; backend has no `/analytics` router and `/companion/evaluate` is `POST`. **Severity:** MEDIUM (pre-existing contract mismatch; independent of the auth work).

---

## E. Database & Scalability

### E1. Unbounded reads in chat repository — VERIFIED
- **Location:** `src/repositories/chat.repository.ts` — `getMessages` loads all messages; `getSessionsByUser` fetches all sessions then sorts in memory (no `limit`). **Severity:** MEDIUM.

### E2. Leaderboard social fields are placeholders — VERIFIED
- **Location:** `src/repositories/leaderboard.repository.ts` — `name: 'User '+id`, `followers: "12"`, `rankTrend/scoreTrend` hardcoded; only XP ranking is real. **Severity:** LOW.

### E3. Documented composite indexes are not deployed — VERIFIED
- **Evidence:** `notebook.repository.getNotebooksByUser` uses `Filter.or(owner/userId/editors/viewers)` + `orderBy('updatedAt')`; `discussions.repository.findByRoom` uses `where('roomId')` + `orderBy('createdAt')` (self-comment: *"Requires composite index"*). No `firestore.indexes.json` exists. **Severity:** HIGH (these queries will fail at runtime without indexes).

---

## F. Code Quality / Dead Code (summary — detailed in DEAD_CODE_REPORT.md)

- Duplicate middleware dirs `src/middleware/` vs `src/middlewares/` — VERIFIED.
- Dead: `AIProviderFactory.ts`, `EventBus.ts`, `VerificationAgent.ts`, frontend `AdminRoute.tsx`, empty `frontend/src/data/`, unused `gpt/nvidia/claude/gemini` providers (only Groq wired) — VERIFIED.
- Root `README.md` is leftover Google AI Studio boilerplate; `docs/*.md` describe unbuilt Phase-6 infrastructure (k8s, Terraform, Redis Global Context Engine, Yjs CRDT, gVisor sandbox) — VERIFIED.

---

## Verification Outcome Summary

| ID | Finding | Status | Severity |
|----|---------|--------|----------|
| A1 | Most routes lack `requireAuth` | VERIFIED | CRITICAL |
| A2 | Endpoints trust client `userId` | VERIFIED | CRITICAL |
| A3 | Graph routes: no auth/ownership | VERIFIED | HIGH |
| A4 | Notebook/etc. controllers secured | VERIFIED (positive) | INFO |
| A5 | Frontend client omits token | VERIFIED | HIGH |
| A6 | Admin RBAC real (mock unused) | PARTIALLY TRUE | MEDIUM |
| B1 | Hardcoded live secrets | VERIFIED | CRITICAL |
| B3 | No Firestore rules/indexes | VERIFIED | CRITICAL |
| B4 | CORS prod placeholder | VERIFIED | HIGH |
| B5 | In-memory rate limit, off in dev | VERIFIED | MEDIUM |
| C1 | Fabricated workflow metrics | VERIFIED | HIGH |
| C2 | Mocked multi-LLM router (dead) | VERIFIED | MEDIUM |
| C3 | Cosmetic model selection | VERIFIED | MEDIUM |
| C4 | EventBus inert (subscriber defined, never activated, no emitter) | VERIFIED | LOW |
| C5 | VerificationAgent broken/dead | VERIFIED | LOW |
| C6 | KG output discarded in chat | VERIFIED | MEDIUM |
| C7 | Mock OCR/citation coordinates | VERIFIED | MEDIUM |
| C8 | RAG retrieval real | VERIFIED (positive) | INFO |
| C9 | Prompt system strong | VERIFIED (positive) | INFO |
| C10 | Regression report = empty-index artifact | VERIFIED | HIGH |
| D1 | Feature flags not enforced | VERIFIED | MEDIUM |
| D2 | Prompt A/B not applied | VERIFIED | MEDIUM |
| D3 | Continuous eval = offline scripts | VERIFIED | MEDIUM |
| D4 | FE planner/analytics endpoints mismatched | VERIFIED | MEDIUM |
| E1 | Unbounded chat reads | VERIFIED | MEDIUM |
| E2 | Leaderboard placeholders | VERIFIED | LOW |
| E3 | Composite indexes not deployed | VERIFIED | HIGH |

**No audit finding was found to be FALSE.** Two were **PARTIALLY TRUE** (A6 admin RBAC is stronger than implied; the "auth broken everywhere" claim is narrower — notebook/source/studygroup/publishedAssets controllers are correctly secured).
