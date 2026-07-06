# RUNBOOK — Scholarly AI (operations)

**Date:** 2026-07-05. Practical operational procedures. Log prefixes to grep: `[TELEMETRY]`, `[TELEMETRY_TTFT]`, `[TELEMETRY_COST]`, `[unhandledRejection]`, `[uncaughtException]`, `[Security]`, `[env]`.

## Quick health
- Liveness: `curl -sf http://<host>:8080/health/live` → `{"status":"alive"}`
- Readiness: `curl -s http://<host>:8080/health/ready` → `{"status":"ready","checks":{"firestore":true}}` (503 if Firestore down)
- Smoke tests (from `backend-firestore/`): `npx tsx src/scripts/test_infrastructure.ts` (checks Firestore/Pinecone/Gemini/Groq/Tavily).

## Common incidents & remedies

### 1. Server won't start — "Dependency not found for token"
- Cause: a controller resolving DI at module load before `bootstrapDI()`. This was fixed (routes are `require`d after bootstrap). If it recurs, ensure any new eager `container.resolve(...)` is moved into a method/getter (lazy), or that its module loads after `bootstrapDI()`.

### 2. `/health/ready` returns 503
- Firestore unreachable / bad credentials. Check `FIREBASE_*` env, service-account validity, network egress. `test_infrastructure.ts` isolates it.

### 3. Chat returns an error / empty stream
- Check logs for the SSE error event. Common: Groq 429 (now auto-retried with backoff) → transient, or invalid `GROQ_API_KEY`. `[TELEMETRY_COST] groq` lines confirm Groq calls succeed.
- If Groq 400 about `messages.0` content → a caller passed a non-string system prompt (guarded in `GroqProvider`); check recent changes.

### 4. RAG returns ungrounded answers / no citations
- Verify ingestion reached `READY` (`GET /api/notebooks/:id/sources` → status). If stuck/FAILED, check logs:
  - Embedding 404 → embedding model changed; must be a valid Gemini model (`gemini-embedding-001`) with `outputDimensionality` matching the index dim (768).
  - Pinecone "at least 1 record" → SDK API shape (`upsert({records})`), fixed.
  - Namespace: upsert and query both use `PINECONE_NAMESPACE`; a mismatch yields empty retrieval.
- Confirm the Pinecone index dim (768) matches the embedding output dim.

### 5. Rate-limit / 429 from our API
- `express-rate-limit` (100 req / 15 min / IP in prod). It's in-memory per instance. Raise the limit or move to Redis for shared limits.

### 6. High latency / slow first token
- Expected TTFT ~10 s (TeacherAgent draft is generated before the formatter streams — see PERFORMANCE_REPORT #1). Not an outage. Watch `[TELEMETRY_TTFT]`.

### 7. Memory growth over time
- Telemetry buffers are capped (5000). If memory still grows, suspect per-request accumulation elsewhere; capture a heap snapshot.

### 8. `uncaughtException` in logs
- The process logs `[uncaughtException]` then shuts down gracefully; the orchestrator should restart it. Investigate the stack; add handling at the source.

## Routine procedures
- **Rotate a key:** update the value in the secret store / `.env`, redeploy. Keys currently in use: Firebase SA, Gemini, Groq, Cohere, Pinecone, Tavily.
- **Grant admin:** `admin.auth().setCustomUserClaims('<uid>', { role: 'admin' })`; user re-logs in.
- **Deploy Firestore rules/indexes:** `firebase deploy --only firestore:rules,firestore:indexes`.
- **Re-run live verification after deploy:** `npx tsx src/scripts/live_e2e_test.ts` and `live_rag_test.ts` (point `E2E_BASE` at the environment; requires a valid token exchange / web API key).

## Escalation signals
- `/health/ready` flapping → dependency instability (Firestore/Pinecone).
- Spike in `[TELEMETRY_ERROR]` or SSE error events → provider outage/quota.
- Sudden `[TELEMETRY_COST]` increase → runaway usage / abuse (no per-user AI rate limit yet — watch this).
