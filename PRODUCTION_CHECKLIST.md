# PRODUCTION CHECKLIST — Scholarly AI

**Date:** 2026-07-05. PASS = verified done · WARN = partial/needs attention · FAIL = not done / blocker.

## Security
| Item | Status | Evidence |
|---|---|---|
| AuthN on protected routes | PASS | `requireAuth` on all user routes; live 401 without token |
| AuthZ / ownership | PASS | `enforceSelf` (403 live), `requireNotebookAccess` on notebook+graph+assets |
| Admin RBAC | PASS | `requireAdmin` (role claim) + `AdminGuard` |
| Admin provisioning | FAIL | No `setCustomUserClaims` flow — admins can't be created in-app |
| Secrets out of source | WARN | Removed from code; **but `.env` is committed & keys were exposed → rotate + `git rm --cached`** |
| Firestore security rules | FAIL | Written (`firestore.rules`) but **not deployed** |
| CORS allowlist (prod) | PASS | `CORS_ORIGINS`-driven |
| Helmet / headers | PASS | `helmet()` enabled |
| Input validation (Zod) | WARN | Middleware exists; not applied to most write bodies |
| Rate limiting | WARN | In-memory only (not Redis); ineffective multi-instance |
| Prompt-injection mitigation | WARN | `sanitizeContext` on retrieved docs; user query not sanitized |
| File upload limits | PASS | multer 25 MB; type handled by parser |

## Reliability / Resilience
| Item | Status | Evidence |
|---|---|---|
| Graceful shutdown | PASS | SIGTERM/SIGINT close server |
| unhandledRejection / uncaughtException | PASS | Added handlers (log / graceful shutdown) |
| Liveness endpoint | PASS | `/health/live` (200) |
| Readiness endpoint | PASS | `/health/ready` (pings Firestore) |
| Timeout + retry on external AI | PASS | Groq (30s) + embeddings (20s), backoff on 429/5xx |
| Telemetry memory bound | PASS | Buffers capped at 5000 |
| Circuit breaker | WARN | Not implemented (retry/timeout only) |
| Duplicate-request/upload guards | FAIL | Not implemented |

## Scalability
| Item | Status | Evidence |
|---|---|---|
| Composite indexes defined | PASS | `firestore.indexes.json` (needs deploy) |
| Bounded chat message reads | PASS | `getMessages` limitToLast(2000) |
| Bounded session list | FAIL | `getSessionsByUser` fetches all + in-memory sort |
| Distributed cache (Redis) | FAIL | In-memory only |
| Stateless / horizontally scalable | WARN | Yes for app logic, but in-memory rate-limit/cache break at >1 instance |

## Observability
| Item | Status | Evidence |
|---|---|---|
| Structured logging | PASS | winston + trace IDs |
| Request IDs | PASS | `traceId.middleware` |
| Real latency/cost metrics | PASS | Telemetry (live-verified) |
| Metrics export / dashboards | FAIL | Logs only; no Prometheus/OTel export |
| Error reporting (Sentry etc.) | FAIL | Not integrated |

## Deployment
| Item | Status | Evidence |
|---|---|---|
| Env schema validation | PASS | `config/env.ts` (Zod) |
| Dockerfile | PASS | Multi-stage + HEALTHCHECK (build not run here) |
| `.dockerignore` / `.gitignore` | PASS | Added |
| CI pipeline | FAIL | None; no `test` npm script |

## Testing
| Item | Status | Evidence |
|---|---|---|
| Unit tests (critical utils/mw) | PASS | 16 passing (retry, chunker, auth) |
| Backend coverage ≥80% | FAIL | ~2.5% actual |
| Integration suite green | FAIL | Legacy suite pre-existing broken |
| Frontend E2E | FAIL | Not run (no browser) |
| Load test | FAIL | Not performed |

## AI
| Item | Status | Evidence |
|---|---|---|
| RAG grounded retrieval + citations | PASS | Live-verified |
| Real latency/cost telemetry | PASS | Live-verified |
| Hallucination/citation benchmark | FAIL | Needs seeded golden dataset |
| Multi-provider routing | FAIL | Groq-only; UI selector cosmetic |

**Blockers before production:** admin provisioning, secret rotation + untrack `.env`, deploy Firestore rules, Redis rate-limit/cache, a green CI with real coverage, and a frontend live pass.
