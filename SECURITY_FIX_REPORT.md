# SECURITY FIX REPORT — Scholarly AI (Phase 2 & 3)

**Date:** 2026-07-05
**Verification:** Backend `npx tsc --noEmit` → **exit 0 (clean)** after all changes. Frontend `npx tsc --noEmit` → unchanged (same 6 pre-existing errors, none introduced by these edits; fixed separately in Phase 7).
**Guarantees honored:** No URL shapes or response schemas changed. No endpoints removed. Identity now comes from the verified token; the frontend was updated in tandem so authenticated calls keep working.

> ⚠️ **Behavior change (intended & required):** routes that were previously open now return **401** without a valid Firebase token, and cross-user access returns **403**. This is the requested security hardening; the frontend token interceptor (Phase 3) was re-enabled so the app keeps functioning.

---

## 1. Authentication enforced on all user-facing routes (Finding A1)

**Fix:** Added `requireAuth` to every previously-unprotected router.

| Route file | Guard added |
|---|---|
| `routes/chat.routes.ts` | `router.use(requireAuth)` |
| `routes/planner.routes.ts` | `requireAuth` + `enforceSelf('userId')` per route |
| `routes/tests.routes.ts` | `requireAuth` + `enforceSelf('userId')` on `:userId` routes |
| `routes/users.routes.ts` | `requireAuth` + `enforceSelf('userId')` |
| `routes/briefing.routes.ts` | `requireAuth` + `enforceSelf('userId')` |
| `routes/graph.routes.ts` | `requireAuth` + `requireNotebookAccess()` |
| `routes/discussions.routes.ts` | `router.use(requireAuth)` |
| `routes/rooms.routes.ts` | `router.use(requireAuth)` |
| `routes/leaderboard.routes.ts` | `router.use(requireAuth)` |
| `routes/questions.routes.ts` | `router.use(requireAuth)` |
| `routes/companion.routes.ts` | `requireCronSecret` (shared-secret, not a user token) |
| `routes/feedback.routes.ts` | `requireAuth` (submit) + `requireAdmin` (summary) |

Already-protected routers were left unchanged: `notebooks`, `assets`, `publishedAssets`, `studyGroups`, `admin`.

---

## 2. Identity taken from the token, never the client (Finding A2)

New middleware in `src/middlewares/auth.ts`:
- **`enforceSelf(paramName='userId')`** — after `requireAuth`, rejects with 403 if `req.params[paramName] !== req.user.uid`. URL shape unchanged.
- **`requireCronSecret`** — validates `x-cron-secret`/Bearer against `env.CRON_SECRET`; permissive-with-warning if the secret is unset (backward compatible until configured).

Controller changes (identity now = `req.user.uid`):
- `controllers/chat.controller.ts` — `handleChat`, `handleChatStream`, `getUserSessions`, `getSessionHistory`, `deleteSession` all use `req.user.uid`; removed `userId` from the body/query contract (still accepted, now ignored).
- `controllers/discussions.controller.ts` — `createDiscussion` uses `req.user.uid` instead of the spoofable `x-user-id` header.
- `controllers/feedback.controller.ts` — `submitFeedback` uses `req.user.uid` instead of `req.body.userId`.

**Before (chat.controller):** `const { userId } = req.body;` → **After:** `const userId = req.user?.uid; if (!userId) return 401;`
**Before (discussions):** `req.headers['x-user-id']` → **After:** `req.user?.uid`.

---

## 3. Ownership verification (Findings A2/A3)

- **Chat session ownership:** added `ChatRepository.getSession(sessionId)` and updated `ChatService.getSessionHistory(sessionId, requesterId?)` to throw `Forbidden` (→ 403) when the session's `userId` differs from the requester. `deleteSession` already verified ownership in the repository.
- **Notebook / Planner / Assets / Study Group / Published Asset / User ownership:** `notebook`, `source`, `studyGroup`, `publishedAssets` controllers already enforced `req.user.uid` + service-level owner/editor/viewer checks (verified, unchanged). `planner`, `users`, `tests`, `briefing` are now self-scoped via `enforceSelf`.
- **Knowledge-graph ownership:** new `src/middlewares/ownership.ts` → `requireNotebookAccess()` reuses `notebookService.getNotebookById(id, uid)` (owner/editor/viewer/shared-link aware) and returns 403 otherwise. Applied to all `graph.routes.ts` endpoints.
- **Admin RBAC:** unchanged — already enforced by `requireAdmin` (`admin/middleware/rbac.middleware.ts`) server-side and `AdminGuard` client-side.

---

## 4. Firestore security rules + indexes (Finding B3)

Created (they did not exist before):
- **`backend-firestore/firestore.rules`** — least-privilege, default-deny. Owner-scoped rules for `users`, `user_stats`, `notebooks` (+ subcollections via parent lookup), `chat_sessions` (+ `messages`). Signed-in read / backend-only write for reference/community collections (`questions`, `rooms`, `discussions`, `published_assets`, `leaderboard`, `study_groups`). No client access to `feature_flags`, `prompt_experiments`, `system_config`, `feedback`. Note documented in-file: the backend Admin SDK bypasses rules, so these protect any future/direct client SDK access.
- **`backend-firestore/firestore.indexes.json`** — composite indexes for verified query patterns: `notebooks` OR-query (`owner`/`userId`/`editors`/`viewers` each + `updatedAt DESC`), `discussions` (`roomId` + `createdAt DESC`), `assets` subcollection (`type` + `createdAt DESC`).
- **`backend-firestore/firebase.json`** — references both files so they are deployable via `firebase deploy --only firestore`.

> Indexes are limited to query patterns I could verify in code. The README also mentions test/leaderboard indexes; those are not included here because the exact query fields were not confirmed — add them if `tsc`/runtime `FAILED_PRECONDITION` errors appear.

---

## 5. Secrets removed from source (Finding B1)

`src/config/env.ts`:
- **Removed** hardcoded defaults for `PINECONE_API_KEY` (`pcsk_...`) and `TAVILY_API_KEY` (`tvly-...`); both are now `z.string().optional()`.
- **Added** `CRON_SECRET` and `CORS_ORIGINS`.
- **Added** non-fatal startup warnings when `PINECONE_API_KEY` / `TAVILY_API_KEY` / `GROQ_API_KEY` / `COHERE_API_KEY` are missing, and a production warning when `CORS_ORIGINS` is unset.
- `pinecone.service.ts` (`env.PINECONE_API_KEY || 'dummy_key'`) and `search.service.ts` (`env.TAVILY_API_KEY || ''`) already degrade gracefully; `src/scripts/test_infrastructure.ts` was updated to `env.PINECONE_API_KEY || ''` to satisfy the stricter type.
- `.env.example` rewritten to document every variable the app reads (previously missing `GROQ/PINECONE/TAVILY/REDIS/CRON/CORS`) with placeholders only.

> 🔴 **ACTION REQUIRED (out of band):** the two keys that were committed must be **rotated** in Pinecone and Tavily consoles — they are compromised regardless of this code change.

---

## 6. CORS hardened (Finding B4)

`src/server.ts`: production origin is now an env-driven allowlist:
```ts
const allowedOrigins = env.NODE_ENV === 'development'
  ? '*'
  : (env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : []);
```
Added `x-trace-id` and `x-cron-secret` to `allowedHeaders`. The hardcoded `https://your-production-domain.com` placeholder is gone.

---

## 7. Frontend authentication reconnected (Finding A5 / Phase 3)

`frontend/src/lib/api/client.ts`: the request interceptor now attaches the Firebase ID token to every request:
```ts
const token = await auth.currentUser?.getIdToken();
if (token) config.headers.Authorization = `Bearer ${token}`;
```
This unblocks all calls made through the shared `api` client — **Notebook** CRUD, source upload, **Learning Assets**, **Knowledge Graph** (`notebooksApi.getGraph`), **Explore/published assets**, **study groups**, and admin data fetches — which previously received 401. The streaming chat (`useWorkflowStream`) and briefing (`useBriefing`) hooks already attached tokens and are unaffected.

---

## Files changed

**Backend (modified):** `middlewares/auth.ts`, `config/env.ts`, `server.ts`, `controllers/{chat,discussions,feedback}.controller.ts`, `services/chat.service.ts`, `repositories/chat.repository.ts`, `scripts/test_infrastructure.ts`, `routes/{chat,planner,tests,users,briefing,graph,discussions,rooms,leaderboard,questions,companion,feedback}.routes.ts`, `.env.example`.
**Backend (new):** `middlewares/ownership.ts`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`.
**Frontend (modified):** `lib/api/client.ts`.

---

## Residual items (documented, not silently ignored)

- **`assets.controller` `updateAsset`/`deleteAsset`/`regenerateAsset`** authenticate (route-level `requireAuth`) but do not yet verify notebook ownership of the target asset. Recommend applying `requireNotebookAccess()` to `assets.routes.ts` (the `:notebookId` param is present) — deferred to avoid untested behavior change; noted for follow-up.
- **`tests` `submitTestAttempt(:attemptId)`** is authenticated but not attempt-ownership-checked (needs an attempt→owner lookup).
- **`users/:userId/stats`** is now self-scoped via `enforceSelf`. If a public-profile feature is intended, expose a separate sanitized endpoint rather than relaxing this one.
- **No admin provisioning flow** (`setCustomUserClaims`) still exists (Finding A6) — admins must be granted the `role` claim out of band. Not a code-injection fix; flagged for the roadmap.
- **Rate limiting** remains in-memory (Finding B5) — addressed in the roadmap, not this phase.
- **Key rotation** for the previously-committed Pinecone/Tavily keys must be performed in their consoles.
