# FINAL PRODUCTION READINESS — Scholarly AI

**Date:** 2026-07-05
**Method:** Only items **implemented + executed + runtime-verified** are marked complete. Everything else is explicitly partial/missing. No estimates presented as facts.

---

## Overall verdict: **BETA — ~6.0/10 for production deployment. Not production-ready.**

The core product is now genuinely functional and live-verified (auth, ownership, streaming chat, grounded RAG with citations), and this pass added real reliability/observability/deployment hardening. But hard production gates remain (secrets, Firestore rules deployment, admin provisioning, test coverage, frontend validation, several unwired features). I am not inflating this.

Trajectory (unchanged from prior guidance): rotate secrets + untrack `.env` + deploy rules + admin provisioning → ~7; green CI with real coverage + Redis rate-limit + frontend live pass → ~8; complete/remove half-wired features + monitoring + load test → ~9.

---

## Feature status (verified)
✅ Fully implemented & runtime-verified · 🟡 partial · 🔴 missing/mock/not-wired

| Feature | Status |
|---|---|
| Login / auth (Firebase) | ✅ (backend token verify live; frontend flow code-verified, not browser-tested) |
| Notebook CRUD + source upload | ✅ (live: upload→READY) |
| OCR / chunking / embeddings / Pinecone / RAG / rerank | ✅ (live grounded retrieval + citation) |
| Chat + SSE streaming + citations | ✅ (live) |
| Workflow Engine orchestration | ✅ (live) |
| Real telemetry (latency/cost/TTFT) | ✅ (live) |
| Morning Briefing | 🟡 (wired; not browser-tested) |
| Planner | 🟡 (gen real; KG-mastery update mocked; FE endpoint mismatch) |
| Knowledge Graph nodes | 🟡 (written on upload; 0 for tiny doc) |
| Knowledge Graph edges / KG-in-chat | 🔴 (edges never created; agent output discarded) |
| Learning-asset generation | 🔴 (no caller; regenerate mocked) |
| AI Coach / EventBus | 🔴 (never activated) |
| Feature flags / Prompt A-B | 🔴 (services exist, not consulted) |
| Continuous evaluation | 🟡 (offline scripts; not scheduled/representative) |
| Multi-provider routing | 🔴 (Groq-only; UI selector cosmetic) |
| Admin panel (guarding) | ✅ (RBAC live) / data endpoints 🟡 (some stubbed) |
| Curriculum (SSC/UPSC/TRE/BPSC/JEE/NEET/Banking/Railway/State PCS) | 🔴 as a structured system — generic RAG only; admin curriculum mocked; LLM prompt-knowledge only (see CURRICULUM_STATUS_REPORT) |
| Community (discussions/rooms/study groups/leaderboard) | 🟡 (wired; leaderboard social fields placeholder; not browser-tested) |
| Dashboard / Analytics (frontend) | 🟡/🔴 (analytics page calls non-existent endpoints) |

## Production requirements (PASS / WARNING / FAIL)
| Requirement | Result |
|---|---|
| Boots & serves (runtime) | PASS (fixed startup crash) |
| AuthN / AuthZ / RBAC | PASS (live 401/403; admin claim) |
| Secrets not in source | WARNING (removed from code; `.env` committed & keys exposed → rotate + untrack) |
| Firestore security rules | FAIL (authored, not deployed) |
| Admin provisioning | FAIL (no in-app claim flow) |
| Rate limiting (multi-instance) | FAIL (in-memory) |
| Input validation (Zod) enforced | WARNING (not on most writes) |
| Liveness / readiness / graceful shutdown | PASS |
| unhandled rejection/exception handling | PASS |
| Timeout + retry on external calls | PASS |
| Structured logging + request IDs | PASS |
| Metrics export / error reporting | FAIL (logs only; no Sentry/OTel export) |
| Docker / deploy artifacts | PASS (Dockerfile + ignores; build not executed here) |
| CI pipeline | FAIL (none) |
| Backend test coverage ≥80% | FAIL (~2.5% measured) |
| Integration suite green | FAIL (legacy suite pre-existing broken) |
| Frontend E2E / live UI | FAIL (not run — no browser) |
| Load / soak testing | FAIL (not performed) |
| RAG grounding + citations | PASS (live) |
| AI quality benchmark (hallucination/citation-accuracy) | FAIL (needs seeded golden dataset) |

## Verified score breakdown (0–10)
| Dimension | Score | Basis |
|---|---|---|
| Core functionality (runs & works) | 8 | Live E2E 9/9 + RAG grounded |
| Security (app layer) | 7 | Live 401/403, RBAC, ownership, helmet, CORS |
| Security (ops: secrets/rules) | 3 | Not rotated; rules undeployed |
| Reliability/resilience | 6.5 | Health probes, process handlers, retry/timeout, graceful shutdown |
| Observability | 6 | Real telemetry + trace IDs; no export/alerting |
| Scalability | 4 | Bounded chat reads + indexes; in-memory limiter/cache |
| Performance | 5 | Works; TTFT ~10s; bundle 3.2MB |
| Testing | 3 | 16 passing unit tests; ~2.5% coverage; legacy suite red |
| Frontend | 6 | Compiles; token wired; **not browser-verified** |
| Deployment readiness | 6.5 | Docker + guide + health; rules/CI pending |
| Feature completeness vs vision | 5 | Core loop done; KG/coach/flags/curriculum not wired |
| **Composite (production deployment)** | **~6.0** | Weighted toward the ops/security/testing gates |

## Verification limits (explicit — do not assume beyond these)
- **Frontend was never executed in a browser** (no browser available). All frontend statuses are code-verified only.
- **No load/concurrency test** — the "thousands of concurrent students" target is unproven; in-memory rate-limit/cache would likely be the first failure point.
- **Coverage is ~2.5%**, measured — not a target.
- **AI quality** verified qualitatively (one grounded citation on a fictional fact), not via a statistical benchmark.
- **Docker image build was not executed** in this environment (Dockerfile authored and reviewed).
- Live tests ran on a single dev instance against the real project `schaolarly`; they leave benign test data (notebooks/vectors under test UIDs).

## Must-do before production (ordered)
1. Rotate all exposed keys; `git rm --cached backend-firestore/.env`.
2. `firebase deploy --only firestore:rules,firestore:indexes`.
3. Add admin custom-claim provisioning.
4. Redis-backed rate limiting + cache (deps already present).
5. Repair/replace the integration test suite; add CI; raise coverage on services/repositories.
6. Live-validate the frontend (Playwright against a deployed preview) and fix the planner/analytics endpoint mismatches.
7. Reduce TTFT (stream TeacherAgent directly); split the frontend bundle.
8. Decide per feature: wire it (KG edges/chat, asset generation, AI Coach, feature flags, curriculum) or remove the UI/claims.
9. Add error reporting + metrics export; run a load test against staging.
