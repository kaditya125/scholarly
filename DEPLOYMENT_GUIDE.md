# DEPLOYMENT GUIDE — Scholarly AI (backend)

**Date:** 2026-07-05. Backend = `backend-firestore/` (Express/TS). Frontend = `frontend/` (Vite SPA + `server.ts`).

## 1. Prerequisites
- Node.js 22.x, npm 10.x
- Firebase project (Firestore + Auth) with a service account
- Pinecone index **`edtech-ai-rag`** — **dimension 768, metric cosine** (must match `gemini-embedding-001` @ 768)
- API keys: Gemini (required), Groq (required), Cohere (rerank), Tavily (web search, optional)

## 2. Environment (`backend-firestore/.env`)
See `.env.example`. Required/important:
```
NODE_ENV=production
PORT=8080
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GEMINI_API_KEY=...        # required (embeddings + metadata)
GROQ_API_KEY=...          # required (chat LLM)
COHERE_API_KEY=...        # reranking
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=edtech-ai-rag
PINECONE_NAMESPACE=production
TAVILY_API_KEY=...        # optional
CRON_SECRET=...           # protects POST /api/companion/evaluate
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com
REDIS_URL=               # (recommended for multi-instance; not yet wired to rate-limit/cache)
```
> ⚠️ Never commit `.env` (a `.gitignore` is included). If it was committed, `git rm --cached backend-firestore/.env` and rotate all keys.

## 3. Build & run
```
cd backend-firestore
npm ci
npm run build        # tsc -> dist/
npm start            # node dist/server.js  (listens on $PORT)
```
Dev: `npm run dev` (tsx). Typecheck: `npm run typecheck`.

## 4. Docker
```
cd backend-firestore
docker build -t scholarly-backend .
docker run -p 8080:8080 --env-file .env scholarly-backend
```
Multi-stage build (node:22-slim); container `HEALTHCHECK` hits `/health/live`. Provide env via `--env-file`/secrets (do not bake secrets into the image).

## 5. Firebase (Firestore rules + indexes) — REQUIRED before prod
From `backend-firestore/` (contains `firebase.json`, `firestore.rules`, `firestore.indexes.json`):
```
firebase use <project>
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```
Indexes are also needed for the notebooks OR-query, discussions, and asset queries (see `firestore.indexes.json`). If a query throws `FAILED_PRECONDITION`, deploy the suggested index.

## 6. Admin provisioning (one-time)
Admins require a `role` custom claim (`super_admin`/`admin`). There is no in-app flow yet; grant it out-of-band:
```js
// node script with firebase-admin initialized
await admin.auth().setCustomUserClaims('<uid>', { role: 'admin' });
```
The user must re-authenticate to pick up the new claim.

## 7. Health & orchestration
- **Liveness:** `GET /health/live` → 200 while the process runs (use for restart probes).
- **Readiness:** `GET /health/ready` → 200 when Firestore is reachable, else 503 (use to gate traffic / rolling deploys).
- **Legacy:** `GET /health` → 200 basic.
- Graceful shutdown on SIGTERM/SIGINT (10 s force-kill fallback).

## 8. Frontend
```
cd frontend
npm ci
# set VITE_API_URL to the backend origin (+ /api) at build time
npm run build        # vite build + esbuild server.ts -> dist/
npm start            # node dist/server.cjs
```
Set `VITE_API_URL=https://api.yourdomain.com/api`. Note: large main bundle (~3.2 MB) — see PERFORMANCE_REPORT.

## 9. Scaling caveats (read before multi-instance)
- Rate limiting and cache are **in-memory** — inconsistent across instances. Wire Redis (`REDIS_URL`, `rate-limit-redis`) before running >1 replica.
- Source ingestion is **fire-and-forget** in-process; heavy upload load should move to a job queue.
- Cloud Run/K8s: set container port 8080, liveness `/health/live`, readiness `/health/ready`, and `SIGTERM` grace ≥ 10 s.
