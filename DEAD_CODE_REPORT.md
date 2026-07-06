# DEAD CODE REPORT — Scholarly AI (Phase 4)

**Date:** 2026-07-05
**Rule honored:** *Nothing was deleted.* This is analysis only, with evidence (grep of `**/*.ts(x)`, node_modules excluded). Each item is categorized **SAFE TO REMOVE**, **NEEDS INTEGRATION**, or **KEEP**.

> Correction to the earlier audit: `EventBus` and `aiCoach.service` are **not** "completely unused" as first reported (that was a bad-glob false negative). The accurate status is captured below and the Phase-1 report (finding C4) has been corrected.

---

## A. SAFE TO REMOVE (verified: no importers, no runtime effect)

| Item | Location | Evidence |
|---|---|---|
| Mocked multi-LLM router | `src/core/providers/AIProviderFactory.ts` | Only self-references; the class body is `setTimeout` + canned strings. Never imported. |
| Duplicate rate limiter | `src/middleware/rateLimiter.ts` (whole `src/middleware/` dir) | No importers. `server.ts` uses `express-rate-limit` directly. Distinct from the real `src/middlewares/` dir. |
| Unused provider | `src/services/ai/gpt.provider.ts` | No importers. |
| Unused provider | `src/services/ai/nvidia.provider.ts` | No importers. |
| Unused provider | `src/services/ai/claude.provider.ts` | No importers; also no `@anthropic-ai/sdk` dependency. |
| Mocked client-side admin guard | `frontend/src/components/AdminRoute.tsx` | Imported in `App.tsx` but never rendered; the real guard is `admin/components/AdminGuard.tsx` (used by `AdminLayout`). |
| Empty folder | `frontend/src/data/` | Contains no files. |
| Unused imports | `App.tsx`: `AdminRoute`, `AdminDashboard`, `Analytics` | Imported but not referenced in the route tree (`/analytics` renders `<Dashboard/>`; admin uses `<AdminRoutes/>`). |

> Recommendation: remove only after a code-owner sign-off. None of these affect current runtime behavior, so removal is low-risk but should be a separate, isolated commit.

---

## B. NEEDS INTEGRATION (real code that is wired partially or not activated — DO NOT delete; connect it)

### B1. `AIOrchestrator` — a real multi-provider orchestrator, never used
- **Location:** `src/services/ai/ai.orchestrator.ts` (`export const aiOrchestrator`).
- **Evidence:** No importers anywhere (only comments in `retrieval.service.ts`/`userMemory.service.ts` mention "orchestrator"). The live path is `WorkflowEngine` (Groq-only via DI).
- **Note:** This is NOT mocked — it selects Gemini (primary) vs Groq (fast) by mode and builds the real Scholarly prompt. It is effectively the multi-provider routing the mocked `AIProviderFactory` only pretended to do.
- **Action:** Either adopt `AIOrchestrator` inside the workflow (to get true multi-provider behavior and make the UI model selector meaningful) or consciously retire it. Do not leave both.

### B2. EventBus + AI Coach — subscriber defined but never activated, and no emitter
- **Location:** `src/core/workflow/EventBus.ts`, `src/services/aiCoach.service.ts` (`eventBus.on(EventNames.TEST_COMPLETED, …)`).
- **Evidence:** `aiCoachService` (which registers the listener in its constructor) is never imported → `initializeListeners()` never runs. No `eventBus.emit(...)` exists anywhere. The listener's downstream `graphService`/`plannerService` are inline mocks (`console.log`).
- **Action to make "AI Coach" real:** (1) import/instantiate `aiCoachService` at startup; (2) `eventBus.emit(EventNames.TEST_COMPLETED, …)` in `resultAnalysis`/test-submit flow and `TASK_COMPLETED` in the planner; (3) replace the inline mock `graphService`/`plannerService` with the real services.

### B3. `KnowledgeGraphAgent` — executed but output discarded
- **Location:** `WorkflowEngine.executeStream` (`new KnowledgeGraphAgent(); await graphAgent.execute(...)`).
- **Evidence:** `agentContext.sharedState['graphContext']` is set but never injected into the TeacherAgent prompt; also only does anything in `REVISION` mode and needs concept nodes that ingestion never creates.
- **Action:** Inject `graphContext` into the prompt AND add KG node/edge extraction during ingestion (see FEATURE_INTEGRATION_REPORT.md).

### B4. `VerificationAgent` — imported, never instantiated, would throw
- **Location:** imported in `WorkflowEngine.ts` (line 7) but never `new`-ed; `execute()` resolves `TOKENS.VerificationProvider`, which DI never registers.
- **Action:** Either register a `VerificationProvider` and use the agent, or remove it and keep the working `retrievalService.verifyClaimsAndCalculateConfidence` (which is the de-facto verifier). Remove the dead import from `WorkflowEngine.ts` regardless.

### B5. Feature flags & prompt experiments — real services, never consulted
- **Location:** `src/services/featureFlag.service.ts` (`isEnabled` only self-referenced), `src/services/promptExperiment.service.ts` (`getExperimentalPrompt` only used by an admin controller).
- **Action:** Consult `featureFlagService.isEnabled(...)` in `WorkflowEngine`/RAG (e.g., `ENABLE_WEB_SEARCH`, `ENABLE_COHERE_RERANK`) and call `getExperimentalPrompt` in prompt building — or retire. Also consolidate the 3 overlapping flag mechanisms (`featureFlag.service`, `config.service.getFeatureFlags`, admin `feature-flags.controller` stub).

---

## C. KEEP (in active use, or intentional utilities)

| Item | Reason |
|---|---|
| `src/services/ai/gemini.provider.ts` | Used by `source.service.ts` (live source ingestion) and `ai.orchestrator.ts`. |
| `src/core/agents/PlannerAgent.ts` | Used by `planner.service.ts` (wired via planner routes). |
| `src/core/agents/MorningBriefingAgent.ts` | Used by `dailyBriefing.service.ts` (wired via briefing route). |
| `src/core/agents/TeacherAgent.ts`, `ResponseFormatter.ts`, `KnowledgeGraphAgent.ts` | Instantiated in the live `WorkflowEngine`. |
| `src/core/agents/AICoachAgent.ts` | Referenced by `aiCoach.service` (see B2; class kept, activation pending). |
| `scripts/*.ts`, `src/scripts/*.ts`, `test-briefing.ts` | Dev/ops/benchmark utilities. |
| Alternate AI provider interfaces | Support the intended provider abstraction; keep if adopting `AIOrchestrator`. |

---

## Summary counts
- **Safe to remove:** 8 items (2 whole files that are pure mocks, 3 unused providers, 1 dead dir/file, 1 unused component, unused imports, 1 empty folder).
- **Needs integration:** 5 subsystems (AIOrchestrator, EventBus/AI-Coach, KnowledgeGraphAgent output, VerificationAgent, feature flags/prompt A-B).
- **Keep:** all live agents/providers/services.

No deletions were performed.
