# BUILD VALIDATION REPORT — Scholarly AI (Phase 7)

**Date:** 2026-07-05
**Environment:** Windows, PowerShell 7, Node v22.12.0, npm 10.9.0. `node_modules` present in both apps (no reinstall needed).

## Summary

| Step | Backend | Frontend |
|---|---|---|
| `npm install` | already installed | already installed |
| Typecheck (`tsc --noEmit`) | ✅ exit 0 | ✅ exit 0 (after fixing 6 pre-existing errors) |
| Production build | ✅ `npm run build` (tsc → `dist/`) exit 0 | ✅ `npm run build` (vite + esbuild → `dist/`) exit 0 (chunk-size warning) |
| Unit/integration tests | ⚠️ 1 suite pass, 9 pre-existing broken | ⚠️ Playwright not runnable here |

**Both applications compile and build successfully.** No compilation issue introduced by Phases 2–6 remains; the backend stayed green throughout, and the 6 frontend errors that predated this work are now fixed.

---

## 1. Frontend compile errors fixed (were pre-existing at baseline)

| File | Error | Fix |
|---|---|---|
| `hooks/ai/useGraph.ts` | `getGraph()` called with 0 args (needs `notebookId`) | Made `useGraph(notebookId?)`, pass it, `enabled` only when present |
| `lib/api/publishedAssets.ts` | imports non-exported `PublishedAsset` from `./studyGroups` | Removed the unused import |
| `types.ts` / `pages/Notebooks.tsx` (×2) | `Notebook.owner` doesn't exist | Added `owner?`, `editors?`, `viewers?` to the `Notebook` type (matches backend response) |
| `pages/TestEngine.tsx` (×2) | `Cannot find name 'navigate'` | Added `const navigate = useNavigate();` (hook was imported but never called) |

Post-fix: `npx tsc --noEmit` → **exit 0** for the frontend.

## 2. Build outputs

- **Backend:** `tsc` emitted JS to `dist/` (exit 0).
- **Frontend:** `vite build` produced `dist/assets/*` and `esbuild` produced `dist/server.cjs` (exit 0).
  - ⚠️ **Warning:** main bundle `index-*.js` ≈ **3.2 MB (850 KB gzip)**. Mermaid diagram types are already split into separate chunks, but the primary chunk is large. Recommend `manualChunks` / route-level `React.lazy` (tracked in PERFORMANCE_VALIDATION.md). This is a warning, not a build failure.

## 3. Tests

### Backend (jest, invoked via `npx jest` — there is no `test` npm script)
Result: **10 suites — 1 passed, 9 failed. 4 tests executed (1 passed, 3 failed); the rest failed to compile/import.**

- ✅ `tests/integration/rag.test.ts` — PASS.
- ❌ 9 suites fail for reasons that are **pre-existing and independent of this work** (proven below):

| Suite | Root cause | Category |
|---|---|---|
| `load.test.ts` | imports `src/services/rag/WorkflowEngine` (does not exist; it's `core/workflow/WorkflowEngine`) | stale path |
| `kg_validation.test.ts` | imports `src/services/rag/knowledgeGraph.service` (does not exist) | stale path |
| `dashboard_e2e.test.ts` | imports `src/services/tests.service` (does not exist; it's `services/tests/*`) | stale path |
| `resilience.test.ts` | uses `pineconeService.searchQuery` (method is `queryVectors`) | stale API |
| `notebook_e2e.test.ts` | `createNotebook(userId, File)` + `notebook.status` (wrong signature/field) | stale API |
| `planner_e2e.test.ts` | `planningMode` type mismatch | stale API |
| `auth.test.ts` | `jest.mock('firebase-admin')` omits `apps`/`initializeApp`, so `config/firebase.ts` throws on `admin.apps.length` | incomplete mock |
| `upload.test.ts` | sends a fake `Bearer valid_mock_token` but never mocks `verifyIdToken` → real Firebase rejects → 401 (expected 400) | missing mock |
| `isolation.test.ts` | same as above → 401 (expected 403) | missing mock |

### Proof these are NOT regressions from my changes
1. `git show HEAD:backend-firestore/src/middlewares/auth.ts` shows the **original** `requireAuth` is logically identical to the current one (same `import { auth } from '../config/firebase'`, same token check, same `verifyIdToken`, same 401s). My edit only *added* `env` import, `enforceSelf`, and `requireCronSecret`; `requireAuth`'s behavior is unchanged.
2. `git diff --stat HEAD -- backend-firestore/tests/` is **empty** — I modified no test files.
3. The failing suites reference modules/methods that **do not exist anywhere** in the repo, so they could not have passed against the committed code either.

The only visible effect of my changes on test output is a harmless `[env] PINECONE_API_KEY/TAVILY_API_KEY is not set` **console warning** (because those keys are no longer hard-coded defaults). Warnings do not fail tests; `GEMINI_API_KEY` is present (env parsing succeeded, so no `process.exit`).

### Frontend (Playwright)
`tests/e2e/workspace.spec.ts` requires a running app, installed browsers, and Firebase/backend credentials. **Not executable in this environment** — not run. (Marked as coverage gap in the readiness report.)

## 4. Conclusion
- ✅ Backend & frontend **typecheck and build cleanly**.
- ✅ The 6 pre-existing frontend compile errors are fixed.
- ⚠️ The backend `tests/integration/*` suite is **stale scaffolding** (wrong module paths, outdated APIs, incomplete Firebase mocks) and was already broken before this work — **git-verified**. Repairing it (correct imports, a complete `firebase-admin` mock, and `verifyIdToken` stubs) is recommended as a follow-up but was out of scope for a "no-behavior-change" hardening pass.
- 🔴 Recommend adding a backend `"test"` npm script and fixing/rewriting the integration suite so CI can gate on it.
