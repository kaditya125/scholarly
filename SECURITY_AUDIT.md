# SECURITY AUDIT — Scholarly AI

**Date:** 2026-07-05. Severity: Critical / High / Medium / Low / Info. Many items were fixed in code across prior sessions and this pass; residual risks are flagged.

## Critical
- **C1 — Exposed & committed secrets.** The Firebase admin private key and Gemini/Groq/NVIDIA/Cohere keys were pasted in chat, and `backend-firestore/.env` is tracked in git (`git ls-files` confirms). Previously the Pinecone/Tavily keys were hardcoded in `env.ts`. **Action:** rotate ALL of these; run `git rm --cached backend-firestore/.env` (a `.gitignore` was added). *Status: NOT done (requires you).* 
- **C2 — Firestore security rules not deployed.** `firestore.rules` (least-privilege) authored + `firebase.json` created, but not deployed. Until deployed, only backend enforcement protects data. **Action:** `firebase deploy --only firestore`.

## High
- **H1 — Admin provisioning gap.** RBAC is enforced (`requireAdmin` reads the `role` custom claim; `AdminGuard` too), but no code sets the claim. Admins can't be created in-app. **Action:** add a one-time script/endpoint using `auth.setCustomUserClaims`.
- **H2 — Rate limiting in-memory & disabled in dev.** `express-rate-limit` (100/15min prod) is per-instance and `skip`ped in dev. Ineffective at scale. **Action:** `rate-limit-redis` + per-user limits on expensive AI routes.
- **H3 — Input validation not enforced.** `validateRequest` (Zod) exists but is not applied to most write endpoints; raw `req.body` reaches services. **Action:** add Zod schemas per route.

## Medium
- **M1 — Verification fails open** (`retrieval.service`): parse failure → `isValid:true`. Fix: fail closed.
- **M2 — 50 MB JSON body limit** for base64 chat attachments (memory/DoS vector). Consider a stricter per-route limit + streaming uploads.
- **M3 — Prompt-injection**: retrieved docs are sanitized (`sanitizeContext`), but the raw user query is interpolated into agent prompts without sanitization. Low practical risk (query is a user turn) but note it.
- **M4 — File-upload hardening**: only extension/mime + size (25 MB). No zip-bomb/DOCX-entity protection; OCR is English-only.

## Low / Info
- **L1 — Firebase web API key** in `frontend/src/lib/firebase.ts` is public-by-design; safe *iff* Firestore rules are deployed (see C2).
- **L2 — Cross-user profile reads**: `GET /users/:userId/stats` is self-scoped (`enforceSelf`). If public profiles are desired later, add a separate sanitized endpoint rather than relaxing this.
- **Info — CSRF**: not applicable (Bearer-token auth via header, not cookies).

## Verified-good controls (live-tested)
- ✅ `requireAuth` rejects missing/invalid tokens (401) — live.
- ✅ `enforceSelf` rejects cross-user access (403) — live.
- ✅ Identity derived from the verified token (`req.user.uid`), never the request body/header (chat, discussions, feedback all fixed).
- ✅ `requireNotebookAccess` on graph + asset mutation routes (owner/editor/viewer).
- ✅ `requireAdmin` on all `/api/admin/*`.
- ✅ `helmet()`, env-driven CORS allowlist, CRON shared-secret on `/companion/evaluate`.
- ✅ Unit tests cover `requireAuth` (401/valid/invalid) and `enforceSelf` (403/allow/401).

## Endpoint auth matrix (summary)
- **Token required:** chat, planner, tests, users, briefing, graph, discussions, rooms, leaderboard, questions, notebooks, assets, explore, study-groups, feedback (+ admin summary → admin).
- **Self-scoped (`enforceSelf`):** planner, users, briefing, tests (`:userId` routes).
- **Notebook ownership:** notebooks/*, graph/*, assets/*.
- **Admin role:** all `/api/admin/*`, `GET /api/chat/feedback/summary`.
- **CRON secret:** `POST /api/companion/evaluate`.

**Net:** application-layer authN/authZ is solid and live-verified. Production blockers are operational: rotate/untrack secrets, deploy rules, provision admin claims, move rate-limiting to Redis.
