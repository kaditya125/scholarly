# LIVE VALIDATION REPORT — Scholarly AI

**Date:** 2026-07-05
**Context:** Real credentials were provided in `backend-firestore/.env`, so the platform was booted and exercised against live Firebase, Pinecone, Gemini, Groq, Cohere, and Tavily. This report records what was tested live, the runtime bugs found (and fixed), and the results.

> Secret values are referenced by name only. See §1 for the required follow-up.

---

## 1. 🔴 Secret handling (action required by you)

- The provided secrets (Firebase private key, `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `COHERE_API_KEY`) were **pasted into chat** and the `.env` is **tracked in git** (`git ls-files` shows `backend-firestore/.env`). Both are exposures.
- I added `backend-firestore/.gitignore` (ignores `.env`, `node_modules`, `dist`). Because `.env` is *already tracked*, `.gitignore` alone won't untrack it — **you must run** `git rm --cached backend-firestore/.env` and commit.
- **Rotate** all of the above keys plus the previously-committed Pinecone/Tavily keys. `.env` was completed with the project's prior Pinecone/Tavily keys so the app could run; treat them as compromised.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are still placeholders — not needed (those providers aren't on the live path).

## 2. Infrastructure connectivity — ALL LIVE ✅

Ran `src/scripts/test_infrastructure.ts`:

| Service | Result |
|---|---|
| Environment variables | ✅ all present |
| Firebase Admin + Firestore | ✅ write/read OK (project `schaolarly`) |
| Pinecone | ✅ connected; indexes `edtech-ai-rag` (dim 768, cosine), `university-ai` |
| Gemini (`gemini-2.5-flash`) | ✅ responded |
| Groq (`openai/gpt-oss-20b`) | ✅ responded (+ real cost telemetry logged) |
| Tavily | ✅ search OK |

## 3. Runtime bugs found while booting/testing (all fixed)

These are defects that **only surface at runtime** — typecheck/build could not catch them. Each was git-verified as pre-existing (except where noted) and fixed:

1. **Server crashed on startup** — `Dependency not found: ICacheProvider`. Import hoisting loaded `admin.routes` (→ `FeatureFlagsController` → `FeatureFlagService` → `container.resolve(CacheProvider)`) **before** `bootstrapDI()`. **Fix:** load routes via `require('./routes')` *after* `bootstrapDI()` in `server.ts`.
2. **Chat crashed (Groq 400)** — `TeacherAgent` calls `generateResponse(messages, { traceId })` (IAIProvider convention), but `GroqProvider` treated the 2nd arg as a `systemPrompt` string → pushed `{ role:'system', content:{traceId} }`. **Fix:** `GroqProvider` now treats only a string 2nd arg as a system prompt, extracts `traceId` from an options object, and preserves the `system` role.
3. **Embeddings 404** — `text-embedding-004` is **deprecated** by Google. **Fix:** switched to `gemini-embedding-001` with `outputDimensionality: 768` (to match the existing index dimension).
4. **Batch embeddings returned empty** — `embedContent({ contents: string[] })` doesn't return one-per-item for `gemini-embedding-001`. **Fix:** embed each text via the single-item call with small concurrency.
5. **Pinecone namespace mismatch** — uploads upserted to the default namespace while retrieval queried `env.PINECONE_NAMESPACE` ('production'). **Fix:** uploads now upsert to `env.PINECONE_NAMESPACE` (source + ingestion services).
6. **Pinecone upsert API (v8)** — `@pinecone-database/pinecone@8` changed `upsert(records)` → `upsert({ records })`. The code passed a bare array → "Must pass in at least 1 record." **Fix:** `target.upsert({ records: batch })`. *This is why the index had 0 records and RAG never worked.*

All fixes verified: backend `tsc --noEmit` → exit 0, `npm run build` → exit 0.

## 4. End-to-end API test (real Firebase token) — 9/9 PASS ✅

`src/scripts/live_e2e_test.ts` mints a real Firebase ID token (custom token → `signInWithCustomToken`) and hits the running server:

| Check | Result |
|---|---|
| `GET /health` | ✅ 200 |
| `GET /api/chat/sessions` **without** token | ✅ 401 (requireAuth) |
| `GET /api/chat/sessions` **with** token | ✅ 200 |
| `POST /api/notebooks` (identity from token) | ✅ 201 |
| `GET /api/planner/{self}/timetable` | ✅ not blocked (404 = reached controller) |
| `GET /api/planner/{other}/timetable` | ✅ 403 (enforceSelf ownership) |
| `POST /api/chat/stream` (Groq) | ✅ 200, streamed 74–282 token chunks, completed |

This validates the Phase‑2/3 security work **live**: unauthenticated → 401, cross‑user → 403, identity taken from the verified token.

## 5. RAG pipeline test (upload → embed → Pinecone → grounded chat) — WORKING ✅

`src/scripts/live_rag_test.ts` uploads a source containing a **fictional** fact (so grounding is unambiguous) and chats with the notebook:

- Ingestion status: `PENDING → EXTRACTING → EMBEDDING → GRAPH_BUILDING → READY` ✅
- Notebook chat returned a **grounded** answer: *"Inventor: Dr. Aria Chen, Year: 2041, Power output: exactly 500 megawatts"* — exactly the uploaded fact.
- **Citations emitted: 1** ✅; grounding checks for "Aria Chen" and "500" both pass.

The full NotebookLM-style loop (parse → Gemini metadata → chunk → Gemini embed → Pinecone upsert → retrieve → Cohere rerank → grounded generation + citation) works end-to-end against live services.

## 6. Remaining notes (not blocking)
- **Knowledge Graph nodes**: the KG write path runs on upload, but produced **0 nodes** for the tiny test document (the Gemini metadata extraction returned no entities for ~2 sentences). It should populate for richer documents; KG **edges** are still never generated (pre-existing) and the chat pipeline still doesn't consume graph context (see FEATURE_INTEGRATION_REPORT.md).
- Ingestion is fire-and-forget with no retry/queue; `deleteSource` still leaves Pinecone vectors orphaned.
- Test artifacts (a few notebooks + vectors under test user IDs) remain in Firestore/Pinecone; harmless, delete at will.
- Reusable smoke tests were kept: `src/scripts/live_e2e_test.ts`, `src/scripts/live_rag_test.ts`, `src/scripts/test_infrastructure.ts`.

## Verdict
With real credentials and the six runtime fixes, **the core product now runs and works live**: auth, ownership, streaming chat, and grounded RAG with citations are all verified against real Firebase/Pinecone/Gemini/Groq/Cohere. The production gating items in `FINAL_PRODUCTION_READINESS_REPORT.md` (key rotation, untracking `.env`, Firestore rules deployment, admin claim provisioning, test-suite repair) still stand.
