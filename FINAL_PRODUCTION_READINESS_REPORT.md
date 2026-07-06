# FINAL PRODUCTION READINESS REPORT — Scholarly AI

**Date:** 2026-07-05
**Scope:** Assessment after the Phase 2–7 hardening pass (security, frontend auth, telemetry, build fixes). Scores are post-remediation. Every score is backed by code evidence in the companion reports.

---

## Overall verdict: **BETA — not yet production-ready**

The platform moved from **Prototype** (open IDOR across the API, committed live secrets, no Firestore rules, a broken frontend build, fabricated telemetry) to a **hardened Beta**: authentication/authorization is now enforced in code, secrets are out of source, security rules/indexes exist, both apps build clean, and analytics are real measurements. However, production is **gated** by items that are either out-of-band (secret rotation, rules deployment), or incomplete (several features NOT CONNECTED, integration test suite broken, no structured curriculum). I am **not** rating it production-ready, and deliberately not overstating it.

### Live Validation Addendum (2026-07-05) — see LIVE_VALIDATION_REPORT.md
Real credentials were later supplied, so the app was booted and exercised against live Firebase/Pinecone/Gemini/Groq/Cohere/Tavily. This uncovered **six runtime bugs that build/typecheck could not catch** — most importantly the server **crashed on startup** (DI import-ordering) and **RAG never worked** (Pinecone SDK v8 `upsert({records})` API change + deprecated `text-embedding-004` embedding model). All six were fixed. Live results: **infra 6/6 services OK**, **E2E 9/9** (incl. 401 unauth / 403 cross-user / streamed Groq chat), and **RAG grounded retrieval with citations WORKING** (verified with a fictional fact). This raises confidence materially — the core product genuinely runs now — but the gating items below still stand, plus two new must-dos: **rotate the exposed keys** and **`git rm --cached backend-firestore/.env`** (a `.gitignore` was added). Net verdict remains **BETA**, now on firmer, live-verified footing.

---

## Scores (0–10)

| Dimension | Before (audit) | After (this pass) | Reasoning |
|---|---:|---:|---|
| **Security** | 2 | **6** | Fixed: `requireAuth` on all user routes, identity from `req.user.uid`, ownership checks (self + notebook + session), `firestore.rules` + `firestore.indexes.json`, secrets removed from `env.ts`, env-driven CORS, CRON secret, frontend token reconnected. Gated by: **key rotation** (Pinecone/Tavily keys were committed), **rules deployment**, no admin-claim provisioning flow, in-memory rate limiting, `assets` ownership residual, verification fails-open. |
| **Architecture** | 5 | **5** | Unchanged by design (no refactor per constraints). Clean provider/DI abstractions; but dead layers (`AIProviderFactory`, `AIOrchestrator`, `EventBus`, `VerificationAgent`) and docs-vs-reality gap remain (see DEAD_CODE_REPORT). |
| **AI System** | 6 | **6** | Strong prompt system + real RAG (embed→Pinecone→Cohere rerank→weighting) + **now-real telemetry**. Gated by: KG has no edges & is unused in chat, feature flags / prompt A-B not wired, model routing is Groq-only (UI selector cosmetic), verification fails open. |
| **Performance** | 4 | **5** | Real latency/TTFT/cost instrumentation replaces fabricated constants; Firestore indexes added. Remaining: sequential LLM calls, TTFT includes full draft, unbounded chat reads, in-memory cache, 3.2 MB main bundle. |
| **Frontend** | 6 | **6.5** | Now **compiles clean** (6 pre-existing errors fixed) and auth token is attached (unblocks Notebooks/Assets/Graph/Admin). Remaining: no app-shell route guard, Analytics page → non-existent endpoints, mock sidebar sections, no 404, large bundle. |
| **Backend** | 5 | **6.5** | Auth/ownership enforced consistently; secrets/CORS fixed; builds clean. Remaining: Zod validation still not applied to most bodies, unbounded queries, orphaned Pinecone vectors on source delete. |
| **Database** | 3 | **6** | `firestore.rules` (least-privilege) + `firestore.indexes.json` (verified query patterns) now exist. Remaining: non-transactional quota update, no vector cleanup on delete, unbounded reads. |
| **Testing** | 3 | **3** | Both apps typecheck + build clean, but the backend `tests/integration/*` suite is **pre-existing broken** (stale paths, incomplete Firebase mocks — git-verified as not my regression); only `rag.test.ts` passes. No `test` npm script; Playwright not runnable here. |
| **Maintainability** | 5 | **5.5** | Dead code catalogued (not deleted, per rules); 9 evidence-based reports added. Duplication (`middleware/` vs `middlewares/`, triple feature-flags) remains. |
| **Scalability** | 3 | **4** | Indexes help; but in-memory rate limit/cache (not Redis), fire-and-forget ingestion without a job queue, and unbounded reads cap this. |
| **Documentation** | 3 | **5** | Added accurate audit/fix/validation reports and rewrote `.env.example`. Product docs (`docs/*.md` Phase-6 claims) still overstate reality and were not changed. |

**Composite production-readiness score: ~5.5 / 10 → BETA.**

---

## What was actually fixed in this pass (evidence: SECURITY_FIX / PERFORMANCE_VALIDATION / BUILD_VALIDATION)
- **Authentication** enforced on `chat, planner, tests, users, briefing, graph, discussions, rooms, leaderboard, questions, feedback` (+ CRON secret on `companion`). Identity now from the verified token, not `req.body`/headers.
- **Authorization**: `enforceSelf` on `:userId` routes; `requireNotebookAccess` on graph routes; chat-session ownership; feedback summary → `requireAdmin`.
- **Firestore** least-privilege `firestore.rules` + `firestore.indexes.json` + `firebase.json` created.
- **Secrets** removed from `src/config/env.ts`; `.env.example` documents all vars.
- **CORS** env-driven allowlist; placeholder removed.
- **Frontend** token interceptor reconnected (unblocks the flagship Notebook/RAG feature from the UI).
- **Telemetry** real (retrieval/rerank/generation/TTFT/workflow latency + verification-derived quality + real Groq token cost) replacing fabricated constants.
- **Build** green on both apps; 6 pre-existing frontend compile errors fixed.

All backend changes verified by `tsc --noEmit` (exit 0) and `npm run build` (exit 0); frontend the same.

---

## Production gating items (must-do before go-live)

**CRITICAL (out-of-band / deployment):**
1. **Rotate** the previously-committed Pinecone and Tavily API keys.
2. **Deploy** `firestore.rules` + `firestore.indexes.json` (`firebase deploy --only firestore`).
3. Provision at least one admin via Firebase **custom claims** (`role`), and add an in-app/CLI provisioning path.
4. **Live end-to-end verification** with real credentials (none available in this environment) — nothing here was runtime-executed.

**HIGH (before beta→GA):**
5. Repair the integration test suite (correct module paths, complete `firebase-admin` mock, `verifyIdToken` stubs) and add a `test` script + CI gate.
6. Apply Zod validation to state-changing request bodies; add pagination to chat reads.
7. Move rate limiting/cache to Redis; add per-user + AI-endpoint limits.
8. Fix the Analytics page → wire a real read endpoint for `users/{uid}/analytics_logs`.

**MEDIUM (feature completion — see FEATURE_INTEGRATION_REPORT):**
9. Generate KG **edges** and inject `graphContext` into chat; wire **asset generation**; activate **AI Coach** (emit/subscribe events); consult **feature flags** & **prompt experiments** at runtime; adopt `AIOrchestrator` (or remove the cosmetic model selector).
10. Implement a real **curriculum** system (see CURRICULUM_STATUS_REPORT) or stop presenting the mocked admin curriculum view as functional.

---

## Honesty & constraints statement
- **No feature was removed, no API shape changed, no UI redesigned.** Changes are additive/behavioral-security only, each verified by compilation.
- **No live run** was possible (no credentials); functional statuses are code-traced (see FUNCTIONAL_VALIDATION_REPORT).
- The one behavior change users will notice — previously-open endpoints now require a token — is intentional (the requested security fix) and was compensated by reconnecting the frontend token interceptor.
- Corrections were made to the initial audit where deeper reading disproved earlier assumptions (KG *is* populated on upload; EventBus has an inert subscriber; the live upload path is real and sophisticated). Integrity over consistency.

**Bottom line: Scholarly AI is a strong Beta with a genuinely capable RAG core and prompt system, now security-hardened at the code level. It is not production-ready until the CRITICAL gating items (secret rotation, rules deployment, admin provisioning, and live verification) are completed and the broken test suite is repaired.**
