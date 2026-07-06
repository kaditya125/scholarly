# API REFERENCE — Scholarly AI backend

**Date:** 2026-07-05. Base path: `/api` (except health). Auth: `Authorization: Bearer <Firebase ID token>` unless noted.
Auth column: **Auth** = valid token required · **Self** = token + `enforceSelf` (path `:userId` must equal caller) · **NB** = token + notebook access (owner/editor/viewer) · **Admin** = `role` claim · **Cron** = `x-cron-secret` · **—** = none.

## Health (no `/api` prefix)
| Method | Path | Auth |
|---|---|---|
| GET | `/health` | — |
| GET | `/health/live` | — |
| GET | `/health/ready` | — |

## Chat  (`/api/chat`)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/chat/` | Auth | Non-streaming chat; body `{sessionId,message,model,topicType}`; userId from token |
| POST | `/chat/stream` | Auth | SSE stream (`progress`/`chunk`/`citation`/`warning`/`done`); optional `notebookId`, `attachments` |
| GET | `/chat/sessions` | Auth | Caller's sessions |
| GET | `/chat/sessions/:sessionId` | Auth | Ownership-checked history |
| DELETE | `/chat/sessions/:sessionId` | Auth | Ownership-checked delete |
| POST | `/chat/:messageId/feedback` | Auth | Submit AI-response feedback |
| GET | `/chat/feedback/summary` | Admin | Feedback summary |

## Notebooks  (`/api/notebooks`)
| Method | Path | Auth |
|---|---|---|
| GET/POST | `/notebooks` | Auth |
| GET/PUT/DELETE | `/notebooks/:id` | Auth (ownership in service) |
| POST | `/notebooks/:id/share`, `/notebooks/:id/share-link` | Auth |
| GET | `/notebooks/:id/sources` | Auth |
| POST | `/notebooks/:id/sources` (multipart `file`, 25 MB) | Auth |
| DELETE | `/notebooks/:id/sources/:sourceId` | Auth |
| GET | `/notebooks/:id/timeline`, `/notebooks/:id/assets` | Auth |

## Knowledge Graph  (mounted under `/api/notebooks`)
| Method | Path | Auth |
|---|---|---|
| GET | `/notebooks/:notebookId/graph` | NB |
| GET | `/notebooks/:notebookId/graph/search?q=` | NB |
| GET | `/notebooks/:notebookId/graph/stats` | NB |
| GET | `/notebooks/:notebookId/graph/path/:nodeId` | NB |

## Learning Assets  (mounted under `/api/notebooks`)
| Method | Path | Auth |
|---|---|---|
| PUT | `/notebooks/:notebookId/assets/:assetId` | NB |
| DELETE | `/notebooks/:notebookId/assets/:assetId` | NB |
| POST | `/notebooks/:notebookId/assets/:assetId/duplicate` | NB |
| POST | `/notebooks/:notebookId/assets/:assetId/regenerate` | NB (regeneration is mocked) |

## Planner  (`/api/planner`)
| Method | Path | Auth |
|---|---|---|
| GET | `/planner/:userId/timetable` | Self |
| POST | `/planner/:userId/timetable` | Self |
| POST | `/planner/:userId/timetable/complete` | Self |
| POST | `/planner/:userId/timetable/adapt` | Self |

## Tests  (`/api/tests`)
| Method | Path | Auth |
|---|---|---|
| GET | `/tests/featured`, `/tests/categories` | Auth |
| POST | `/tests/adaptive/:userId/generate` | Self |
| GET | `/tests/attempts/:userId/incomplete` | Self |
| POST | `/tests/attempts/:attemptId/submit` | Auth |

## Users / Briefing / Questions / Leaderboard / Discussions / Rooms
| Method | Path | Auth |
|---|---|---|
| GET | `/users/:userId/stats` | Self |
| POST | `/users/:userId/xp` | Self |
| GET | `/briefing/:userId/today` | Self |
| GET | `/questions` | Auth |
| GET | `/leaderboard` | Auth |
| GET/POST | `/discussions` | Auth (author = token uid) |
| GET | `/rooms` | Auth |

## Study Groups / Explore  (`/api/study-groups`, `/api/explore`)
| Method | Path | Auth |
|---|---|---|
| GET/POST | `/study-groups`, `/study-groups/:id/members` | Auth |
| GET | `/explore` | Auth |
| POST | `/explore/publish`, `/explore/:id/rate`, `/explore/:id/download` | Auth |

## Companion (CRON)  (`/api/companion`)
| Method | Path | Auth |
|---|---|---|
| POST | `/companion/evaluate` | Cron (`x-cron-secret`) |

## Admin  (`/api/admin/*`) — all **Admin**
`GET` endpoints: `/health`, `/metrics/ai`, `/metrics/costs`, `/system/health`, `/evaluation`, `/curriculum/jobs` (mock), `/knowledge-graph/nodes`, `/vector-db/namespaces`, `/prompts`, `/assets`, `/notebooks`, `/feature-flags` (stub), `/users`, `/security`, `/logs`, `/notifications`, `/backups`, `/settings`.

> Notes: `model` in chat requests is accepted but ignored (backend uses Groq `gpt-oss-20b`). SSE stream events: `{type:'progress'|'chunk'|'citation'|'warning'|'done'|'error'}`, terminated by `data: [DONE]`.
