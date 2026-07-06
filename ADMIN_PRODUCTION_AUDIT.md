# Admin Dashboard — Production Data Audit

**Date:** 2026-07-05
**Scope:** `admin-dashboard/` (Vite/React admin app) + `backend-firestore/src/admin/` (Express admin API)
**Objective:** Convert the Admin Dashboard from a mocked demonstration into a production-backed administration system with **zero mocked data** on any shipped screen.

---

## 1. Executive Summary

Every Admin module is now wired to a real backend endpoint that reads from a real
data source (Firestore, Firebase Admin SDK, Pinecone, Telemetry, Feedback, or the
Feature-Flag store). All hardcoded `useState` mock arrays and static demo objects were
removed from the 18 admin pages and replaced with authenticated **React Query + Axios**
hooks. Requests carry a Firebase ID token; the backend enforces RBAC
(`super_admin` / `admin` / `moderator`) on every `/api/admin/*` route.

Where a module has **no real data source in this codebase** (managed GCP backups, a
durable request-log sink, prompt-injection threat tracking, per-dimension LLM-judge
scores), the endpoint returns an **honest empty result plus an explanatory note** instead
of fabricated values. These are called out explicitly below.

### Verification performed (this pass)
| Check | Result |
|---|---|
| `admin-dashboard` typecheck (`tsc -p tsconfig.app.json --noEmit`) | **EXIT 0** |
| `admin-dashboard` production build (`tsc -b && vite build`) | **EXIT 0** (2490 modules; advisory chunk-size warning only) |
| `backend-firestore` typecheck (`tsc --noEmit`) | **EXIT 0** |
| Live admin API test (`src/scripts/live_admin_test.ts`, real Firebase/Pinecone) | **22/22 PASS** |
| Residual-mock grep (pages) | **0 mock identifiers, 0 mock `useState` arrays** |

**Live server:** ran on `localhost:8081` against Firebase project `schaolarly` with the real
`.env` (Firebase Admin, Pinecone `edtech-ai-rag`). Port 8080 was occupied by a separate
process, so testing used 8081.

---

## 2. Architecture of the Change

### Frontend (`admin-dashboard`)
- **Added dependencies:** `axios`, `@tanstack/react-query`.
- **`src/lib/api/client.ts`** — Axios instance; base URL from `VITE_API_URL`
  (default `http://localhost:8080/api`). A request interceptor attaches the current
  Firebase user's ID token (`auth.currentUser.getIdToken()`). A response interceptor
  normalizes errors (401 → "Not authenticated", 403 → "Access denied…").
- **`src/lib/api/queryClient.ts`** — React Query client (retry ×2 w/ backoff, 30s stale time).
- **`src/lib/api/hooks.ts`** — one hook per module + `useToggleFeatureFlag` (optimistic)
  and `useResolveAlert` mutations.
- **`src/admin/components/DataStates.tsx`** — shared `LoadingState`, `ErrorState`
  (with retry), `EmptyState`, and `DataNotice` (honest-source banner).
- **`main.tsx`** — wrapped app in `QueryClientProvider`.
- **`AdminGuard.tsx`** — client role gate narrowed to `super_admin`/`admin`/`moderator`;
  the previous unconditional DEV bypass is now opt-in via `VITE_ALLOW_DEV_ADMIN=true`
  (default off). The backend RBAC is the real enforcement point.
- **18 pages + Overview landing** rewritten to consume hooks with loading / error / empty
  states, client-side search & filtering, and honest-source notices.

### Backend (`backend-firestore/src/admin`)
- **`services/admin-aggregates.service.ts`** (new) — single source of truth; composes the
  existing real services/repositories into the shapes each module needs. **No fabricated values.**
- **16 controllers** rewritten as thin wrappers that delegate to the aggregates service.
- **RBAC** (`rbac.middleware.ts`) — `requireAdmin` now allows `super_admin`, `admin`, `moderator`.
  Role is read from the verified Firebase ID token custom claim (`decodedToken.role`).
- **New capability methods** added to existing infrastructure:
  - `PineconeService.getIndexStats()` → `describeIndexStats()` (real namespaces/vectors/dim/fullness)
  - `GraphRepository.getGlobalStats()` / `getRecentNodesGlobal()` → `collectionGroup('kg_nodes'|'kg_edges')`
  - `NotebookRepository.getGlobalStats()` / `listRecent()` → platform-wide counts + recent list
- **New endpoints:** `PATCH /feature-flags/:name` (toggle) and `POST /security/alerts/:id/resolve`.

---

## 3. Per-Module Audit

Legend — **Live**: served from real production data. **Live (empty)**: real query, currently
returns zero rows because the source collection is empty in this environment. **Partial/Honest gap**:
real where a source exists, with a documented limitation.

| # | Module | Route | Status | Backend service / data source | Notes & remaining tech debt |
|---|---|---|---|---|---|
| 1 | AI Monitoring | `GET /api/admin/metrics/ai` | Live (empty) | `TelemetryService.getSystemHealth()` + hourly `telemetry` buckets | Real provider stats, latency, tokens, cost, 24h latency timeline. Zero until AI telemetry is recorded. |
| 2 | Cost Analytics | `GET /api/admin/metrics/costs` | Live (empty) | `TelemetryService.getCostAnalytics()` + `cost_records` daily buckets | Real totals, daily series, provider spend, top users. Zero until cost records exist. |
| 3 | Continuous Evaluation | `GET /api/admin/evaluation` | Partial (honest) | `FeedbackService` (`user_feedback`) | Real satisfaction, 7-day trend, negative-feedback list. **Per-dimension LLM-judge scores are not implemented** → `dimensions: []` + note (UI shows real feedback distribution instead). |
| 4 | Curriculum Ingestion | `GET /api/admin/curriculum/jobs` | **Live** | `collectionGroup('sources')` | Verified `jobs=10, totalSources=10`. Progress derived from real source status. Stats over recent 200 sources; total is a full count. |
| 5 | Knowledge Graph | `GET /api/admin/knowledge-graph/nodes` | **Live** | `GraphRepository` collectionGroup `kg_nodes`/`kg_edges` | Verified `nodes=46`. `edges=0` — the `kg_edges` subcollection is currently empty (ingestion writes nodes but few/no edges). Weak-concept count is over the returned sample (documented in-payload). |
| 6 | Pinecone Vector DB | `GET /api/admin/vector-db/namespaces` | **Live** | `PineconeService.getIndexStats()` | Verified `index=edtech-ai-rag, dim=768, totalVectors=8, namespaces=1`. (Replaces the old mock that wrongly showed dim 1536.) |
| 7 | Prompt Studio | `GET /api/admin/prompts` | Live (empty) | `telemetry` grouped by `promptVersion` + `prompt_experiments` | Real prompt versions (calls/latency/cost) + experiments. The mock editor/simulator was removed — there is **no prompt-CRUD / execution API**, so only real usage data is shown. |
| 8 | Feature Flags | `GET /api/admin/feature-flags` · `PATCH .../:name` | **Live** | `FeatureFlagService` (`feature_flags`) + `seedDefaults()` | Verified `flags=10`; live optimistic toggle verified (PATCH 200, reverted). |
| 9 | User Management | `GET /api/admin/users` | **Live** | Firebase Admin `auth.listUsers()` | Verified `users=7`. Role from custom claims; status from `disabled`/`lastSignInTime`. **Pagination beyond the first 1000 users not yet implemented** (note returned when more exist). No suspend/role-edit mutations (read-only). |
| 10 | Security Monitoring | `GET /api/admin/security/threats` · `POST .../alerts/:id/resolve` | Partial (honest) | `TelemetryService.getActiveAlerts()` (`admin_alerts`) + verification pass-rate | Real alerts (latency / verification failure / token usage) + real guardrail pass-rate + resolve action. **Dedicated prompt-injection / WAF threat tracking is not implemented** (noted in payload). |
| 11 | Learning Assets | `GET /api/admin/assets` | Live (empty) | `PublishedAssetsService.getPublishedAssets()` | Real community-published assets (downloads, rating, author). Zero until assets are published. Admin upload/moderation mutations not implemented (read-only). |
| 12 | Notebook Management | `GET /api/admin/notebooks` | **Live** | `NotebookRepository` (count + recent) | Verified `total=14`. Recent list with owner, sharing, doc/KG counts. Admin delete/hide mutations not implemented (read-only). |
| 13 | System Logs | `GET /api/admin/logs` | Honest gap | `admin_alerts` event stream | **Application request/debug logs go to stdout (winston) and are not persisted to a queryable store.** This surfaces the real Firestore alert stream; a durable sink (e.g. Cloud Logging) is required for full request logs. Client-side JSON export provided. |
| 14 | Notifications | `GET /api/admin/notifications` | Live (empty) | Unresolved `admin_alerts` | System notifications from real alerts. **User-facing broadcast/campaign notifications are not implemented.** |
| 15 | Backup & Restore | `GET /api/admin/backups` | **Honest gap (no source)** | — | Firestore backups are managed by **Google Cloud** (scheduled exports / PITR) and are **not exposed via the app SDK**. Returns `supported:false` + explanatory note; **no fabricated backup rows**. |
| 16 | System Health | `GET /api/admin/system/health` | **Live** | `process`/`os` metrics + Firestore & Pinecone probes | Verified real `uptime=71s, heap=83.4MB, services=4`. Redis reported `not_configured` when `REDIS_URL` unset. Fabricated CPU time-series removed → real runtime metrics panel. |
| 17 | Settings | `GET /api/admin/settings` | **Live** | `env` + `FeatureFlagService` | Verified `env=development, model=llama-3.3-70b-versatile, flags=10`. Read-only; **secrets are never returned.** No settings-write endpoint (config is env-driven). |
| 18 | Overview (landing) | reuses module hooks | **Live** | Composite of health/AI/users/notebooks/security | Replaces the previous `WIP` placeholder with real KPIs + quick links. |

---

## 4. Authentication & RBAC (verified)

- Frontend sends `Authorization: Bearer <Firebase ID token>` on every admin request.
- Backend `requireAdmin` verifies the token via `auth.verifyIdToken()` and checks the
  `role` custom claim against `['super_admin','admin','moderator']`.
- Live results: **no token → 401**, **`student` role → 403**, **no role → 403**,
  **`admin` → 200 on all 17 GET endpoints**, **`moderator` → 200**.

---

## 5. Honest Gaps & Remaining Technical Debt

1. **Backups (no real source):** GCP-managed; not exposed via the app SDK. Would require the
   Firebase/GCS Management API + service-account permissions to list real exports.
2. **System Logs (no durable sink):** request/debug logs are stdout-only. Integrate Cloud
   Logging (or a log store) to surface real request-level logs; the endpoint currently
   returns the `admin_alerts` event stream.
3. **Continuous Eval dimensions:** no LLM-judge pipeline exists, so per-dimension scores are
   intentionally empty. `overallScore` is derived from the real user-satisfaction rate.
4. **Security threat tracking:** no dedicated prompt-injection/WAF logging; signals are
   derived from `admin_alerts` + the RAG verification pass-rate.
5. **Knowledge Graph edges = 0:** `kg_edges` subcollections are empty in this environment;
   node counts are real. Confirm the ingestion pipeline writes edges if edge analytics are needed.
6. **Read-only modules:** Users, Notebooks, and Learning Assets expose no admin mutations
   (suspend/role-change, delete/hide, moderate). Only Feature Flags (toggle) and Security
   (resolve alert) have write endpoints. Add mutations if operator actions are required.
7. **User pagination:** `auth.listUsers()` returns the first page (≤1000). Add `pageToken`
   paging for larger tenants.
8. **Telemetry population:** AI Monitoring / Cost / Prompt usage are real but read zero until
   the AI request path records `telemetry` and `cost_records`. Confirm the workflow engine
   writes these in production.
9. **Bundle size:** the admin build emits a single ~1.38 MB JS chunk (advisory). Consider
   route-level code-splitting.
10. **Frontend runtime not browser-verified:** see limitations below.

---

## 6. Verification Limitations (explicitly stated)

- **Backend endpoints were live-verified** with real Firebase/Pinecone via an automated
  script (22/22). Values reported are the actual responses.
- **The admin-dashboard was type-checked and production-built (both EXIT 0) but was NOT
  loaded in a real browser** in this environment. React Query wiring, token attachment, and
  data mapping are verified by compilation and by the backend contract, not by a rendered UI
  session. A browser smoke test (login as an `admin`-claim user, load each page) is
  recommended before release.
- **"Live (empty)" modules** were verified to return real, correctly-shaped responses; their
  zero values reflect empty source collections in the test environment, not mocked data.
- **RBAC end-to-end** depends on real users being assigned a `role` custom claim via
  `admin.auth().setCustomUserClaims(uid, { role })`. The live test used ephemeral token
  claims; production requires an actual claim-provisioning step (still open).
- Admin **mutations** verified: Feature-Flag toggle (PATCH, round-tripped). Alert-resolve
  (POST) endpoint is wired but was not exercised in the run (no unresolved alerts existed).

---

## 7. Result

**Zero mocked data remains on any Admin Dashboard screen.** Every module is backed by a
real endpoint and a real data source, RBAC is enforced, and every module that lacks a real
data source states that limitation openly rather than displaying invented values. The
remaining items in §5 are integration/operational gaps, not mock data.
