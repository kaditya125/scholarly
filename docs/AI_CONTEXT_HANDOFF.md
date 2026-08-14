# SCHOLARLY AI — AI CONTEXT HANDOFF

**Generated:** 2026-08-10
**Repository:** `D:\scholarly` · `https://github.com/kaditya125/scholarly.git`
**Purpose:** Allow a fresh Claude Code session to continue this project with full architectural,
recovery, security and decision context.

> Every claim in this document was verified against the repository at the time of writing.
> Where something could not be verified, it is marked **UNKNOWN** rather than guessed.
> If you are the next Claude session, **jump to the last section first: "NEXT CLAUDE SESSION — START HERE".**

---

## 1. PROJECT OVERVIEW

Scholarly AI is an AI-first EdTech platform for Indian competitive-exam preparation
(NEET, JEE, UPSC, SSC, BPSC, CTET, banking, railways, state PSCs).

Core principle:

```
Student → Scholarly AI → Personalized learning
```

A teacher is an **additional human layer**, never a replacement for the AI layer.

Scale: ~565 backend source files, ~275 frontend source files, 41 frontend pages,
35 mounted API route groups, 89 backend test files.

## 2. TECHNOLOGY STACK

**Frontend** — React 19, TypeScript 5.8, Vite 6, React Router 7, TanStack Query 5,
Tailwind v4, `motion` (Framer 12), recharts/d3/@xyflow/react, react-markdown + KaTeX,
pdfjs-dist, tesseract.js, Firebase Web SDK 12. No Redux/Zustand — Context + React Query.

**Backend** — Node 22, Express 4, TypeScript (CommonJS), Firebase Admin 12 (Firestore),
Pinecone 8, Redis/Upstash, BullMQ, zod, winston, helmet, multer, fluent-ffmpeg. Jest + ts-jest.

**AI** — Gemini via **Vertex AI** (primary), Google embeddings, Cohere rerank,
Google Cloud TTS, Tavily web search, Veo (flagged). Grok-on-Vertex exists but is
`GROK_VERTEX_PROJECT="disabled"`.

## 3. REPOSITORY STRUCTURE

```
D:\scholarly
├── frontend/            React student app (Vite; custom server.ts wrapper)
├── backend-firestore/   Express + Firebase Admin API
├── admin-dashboard/     Separate React ops console (19 pages)
├── shared-ui/           1 shared component (KnowledgeGraphViewer)
├── docs/                ← this file
├── .github/workflows/   backend-ci.yml (currently failing — see §25)
└── ~90 root *.md        phase reports / audits (unindexed, many superseded)
```

**Not a monorepo** — four independent `package.json` files, no workspaces.

## 4. FRONTEND ARCHITECTURE

```
main.tsx → App.tsx → ThemeProvider → AuthProvider → BrowserRouter
  → AppRoutes → ProtectedRoute → AppLayout → <Outlet/> → pages
```

- `pages/` (41), `components/` (26 feature folders), `hooks/{ai,api}`, `lib/api/*` (axios),
  `lib/{AuthContext,ThemeContext,firebase}.tsx`
- All data access via React Query hooks → thin axios modules → `lib/api/client.ts`
  (Firebase ID token attached per request). SSE endpoints use raw `fetch`.
- **`App.tsx:117` has `<Routes key={location.pathname}>`** — this remounts the entire
  layout on every navigation. Known issue; see §26.

## 5. BACKEND ARCHITECTURE

```
server.ts
  bootstrapDI()                       ← MUST run before routes are require()'d
  express.json(50mb) → traceId → cors → helmet → compression → morgan → rateLimit
  /health, /health/live, /health/ready
  app.use('/api', routes)             ← require()'d, not imported (deliberate)
  errorHandler
  listen → startBackgroundWorker() + startMediaWorker()
```

Layering: `routes/` → `controllers/` → `services/` → `repositories/` → Firestore.
Cross-cutting AI in `core/`. Hand-rolled DI (`core/di/container.ts`, `Symbol.for` tokens).

## 6. FIREBASE ARCHITECTURE

Single project `schaolarly`. Firebase Auth + Firestore + Storage.

**Firestore collections (~60).** Load-bearing:
```
users/{uid}                          ← canonical doc; NEW in Phase 1 (see §19)
users/{uid}/profile/onboarding       StudentProfile — the personalization source of truth
users/{uid}/profile/studentDigitalTwin
users/{uid}/memory/global            never written (see §26)
users/{uid}/sessions/{id}            session memory
users/{uid}/analytics/learning_metrics   never written (see §26)
user_stats/{uid}                     xp/level/streak/weakTopics
notebooks/{id}/{sources,kg_nodes,kg_edges,assets,timeline}
podcasts, podcast_jobs, sessions/*/messages, telemetry, cost_records
```

**Only 6 composite indexes** declared in `firestore.indexes.json` against 68 `.where()`
call sites — others were likely created ad-hoc in the console and are not in the repo.

## 7. AUTHENTICATION ARCHITECTURE

- **Client:** `lib/firebase.ts` — Google, GitHub, email/password, password reset.
  Firebase config now reads `import.meta.env.VITE_FIREBASE_*` (moved off hardcoded values
  in commit `422df0a4`).
- **State:** `lib/AuthContext.tsx` — `onAuthStateChanged`; now also exposes
  `role`, `adminRole`, `claimsLoading`, `refreshClaims()` (Phase 1).
- **Transport:** axios interceptor attaches `getIdToken()`.
- **Server:** `middlewares/auth.ts` — `requireAuth`, `enforceSelf(param)`,
  `requireCronSecret`, and (new) `isAdmin`, `hasProductRole`, `requireProductRole`.
- **Admin:** `admin/middleware/rbac.middleware.ts` — `requireRoles([...])`.

**Email/password auth did not work before this session** — Signin's submit button was a
`<Link to="/dashboard">` and Signup's form only called `preventDefault()`. Both now work.

## 8. AUTHORIZATION ARCHITECTURE

| Need | Mechanism |
|---|---|
| Any signed-in user | `requireAuth` |
| Path `:userId` is the caller | `requireAuth` + `enforceSelf('userId')` |
| Product role | `requireProductRole('teacher')` **(new)** |
| Admin surface | `requireAdmin` / `requireSuperAdmin` (unchanged) |
| In-controller branch | `isAdmin(req)` / `hasProductRole(req, r)` |

Firestore rules are default-deny with owner scoping, but **the Admin SDK bypasses them** —
backend authorization is the real boundary.

## 9. AI ARCHITECTURE

**Live path** (`services/chat.service.ts` → `core/workflow/WorkflowEngine.ts:executeStream`):

```
INTENT_DETECTION (label only — no classifier)
  ├─ mode==='PODCAST' → fast path, returns early
CONTEXT_ENRICHMENT   → StudentContextService.aggregateContext
  ├─ greeting fast path → returns early
MEMORY_RETRIEVAL → GRAPH_RETRIEVAL → RAG_RETRIEVAL
AGENT_EXECUTION      → TeacherAgent (LLM #1, streams as `reasoning` events)
VERIFICATION         → claim check (LLM #2, only with notebook+citations)
ASSET_GENERATION     (label only — no implementation)
ResponseFormatter    → LLM #3, streams the answer
ANALYTICS → MEMORY_UPDATE → done
```

SSE vocabulary: `progress{stage,message}` · `reasoning{content}` · `chunk{content}` ·
`citation` · `warning` · `done{citations,assets,confidenceScore}` · `error`.

**Two full generations per turn** (Teacher drafts → Formatter rewrites). This is a known
cost/latency issue *and* a correctness issue — the formatter has been observed trimming
content and corrupting code fences. Preservation rules were added to its prompt.

**A second, dormant AI architecture exists**: `core/workflow/services/*` and
`core/intelligence/*` (~30 files, tested, unreachable), gated by `config/featureFlags.ts`
flags that default OFF. **Do not enable without explicit approval.**

## 10. RAG ARCHITECTURE

`services/rag/retrieval.service.ts`: embed → Pinecone (topK×4) → ≥0.50 filter → dedupe →
Cohere rerank → weighted re-rank (NCERT 1.5 / GOVERNMENT 1.4 / … / WEB_SEARCH 0.8, plus
exam/subject/freshness multipliers) → second rerank → `sanitizeContext()` (prompt-injection
defence) → cache 10 min.

**GraphRAG** — `services/rag/graphRetrieval.service.ts`, notebook-scoped, **zero-LLM**,
cached 10 min, fused by prepending a `=== KNOWLEDGE GRAPH CONTEXT ===` block.

**Built but never called:** `rewriteQuery()` (so follow-ups embed pronouns verbatim),
`retrieveCurriculumContext()` (so chat with no notebook does *no* retrieval),
`expansionTerms` (produced, unused).

## 11. STUDENT PERSONALIZATION ARCHITECTURE

```
Onboarding → userProfile.service → users/{uid}/profile/onboarding
                ↓
        StudentContextService.aggregateContext()   ← the AI context authority
                ↓
        buildStudentContextBlock() → buildScholarlySystemPrompt() → provider
```

**CRITICAL — the adaptation loop is open.** Verified by grep:
- `UserMemoryService.updateMemoryFromInteraction()` — **zero callers**
- `IMemoryProvider.updateLearningAnalytics()` — **zero callers**
- `StudentDigitalTwin` is written but **never read by the AI**
- Therefore `getLearningAnalytics()` always returns zero-defaults, and every prompt
  contains `Mastery: 0% | Retention: 0 | Exam Readiness: 0%` for **every** student forever.

The platform is currently **statically personalized**, not adaptive. Closing this loop is
the highest-value non-security work available.

## 12. EXISTING ONBOARDING (DO NOT REBUILD)

`frontend/src/pages/Onboarding.tsx` (~518 lines) + `lib/onboardingOptions.ts`:
9–10 dynamic steps (`welcome → goal → board → [stream] → subjects → level → target →
studyTime → style → language`), per-step autosave, resume, skip.
→ `PUT /api/users/:userId/profile` → `users/{uid}/profile/onboarding`
→ `/baseline-assessment` (adaptive CAT) → `StudentDigitalTwin`.

Onboarding state is a **single boolean** `isComplete` + `onboardedAt`. No state machine.

**Known bug:** `studentDigitalTwin.service.ts:~240` calls `profileService.updateProfile()`,
which does not exist (the method is `saveProfile`). Assessment submission throws after the
twin is written.

## 13. EXISTING DASHBOARD ARCHITECTURE

`/dashboard` → `pages/StudentDashboard.tsx`. `/analytics` renders `pages/Dashboard.tsx`
(not `pages/Analytics.tsx`, which is imported but unrouted). `AppLayout` provides the
sidebar (with a "Recent" chat list) and a top header hidden on `/chat`, `/podcasts`,
`/community`.

## 14. EXISTING MAJOR FEATURES

AI chat · notebooks · content pipeline UI · podcasts + studio · documents/book library ·
scan-and-solve (Vision OCR + chapter-scoped RAG) · tests/quizzes · planner · doubts ·
community (discussions/DMs/connections) · explore · trash · video lessons (Veo-gated) ·
admin dashboard.

**Broken/unwired:** Study Circle and group channels (UI complete, controllers exist,
**mounted nowhere** → 404) · flashcards (`/api/flashcards` never mounted) ·
`pages/Explore.tsx` renders hardcoded `mockAssets` while a working `/api/explore` exists ·
`components/PeerComparisonChart.tsx` renders fabricated peer data.

## 15. PODCAST ARCHITECTURE

Most complete subsystem. `POST /api/podcasts/generate` → sha256 dedupe → BullMQ
`background-jobs` → SourceResolver → PodcastPlanner → ConversationGenerator (6 styles) →
AudioComposer → Google TTS → `media-jobs` `podcast.stitch` → ffmpeg mixing → Firebase
Storage → READY. Frontend streams status via Firestore `onSnapshot`.
AI Director/Producer (~50 files) runs in shadow mode behind flags.

**Hard Redis dependency** — without `REDIS_URL` the API still returns 202 and the podcast
sits at PENDING forever.

## 16. CONTENT PIPELINE ARCHITECTURE

⚠️ **Two pipelines exist. The designed one is not the one that runs.**

- **LIVE:** `POST /notebooks/:id/sources` → `source.controller` → `services/source.service.ts`
  (`FileParserService` → `utils/textChunker` → embeddings → Pinecone → own KG extraction).
- **DORMANT:** `core/pipeline/orchestrator/ContentPipelineOrchestrator.ts` + ~40 files
  (OCR, understanding, semantic chunking, checkpointing, versioning, lineage, realtime).
  Instantiated by **nothing**.

Consequences: **no OCR runs in production**; no checkpointing/quality validation;
`hooks/usePipelineRealtime.ts` renders a 10-stage tracker with no live data source.

## 17. COMMUNITY / CHAT ARCHITECTURE

`pages/Community.tsx` composes `Chats` + `People`. DMs (11 endpoints) and connections
(15 endpoints) are complete. Study groups have only 3 endpoints. **Group channels and
Study Circle are 404** (see §14). Presence/typing write directly to Firestore from the client.

## 18. DOCUMENT / AI WORKFLOW ARCHITECTURE

Two paths: (a) **book library** — `/api/documents/books/*`, hard-restricted to the shared
`ncert-curriculum` corpus; (b) **scan-and-solve** — `POST /api/scan/solve`, Gemini Vision
OCR → retrieval hard-scoped to one `sourceId` → student context → streamed multimodal
answer. The scan flow is the best-integrated AI feature in the product.

## 19. CURRENT ROLE ARCHITECTURE (Phase 1 — implemented this session)

**Two custom claims, deliberately not one:**

```
role         : super_admin | admin | moderator | content_manager
               | support | analytics_viewer | undefined      ← UNCHANGED
productRole  : student | teacher | undefined                 ← NEW
```

**Why two:** a claim holds one value. Folding product roles into `role` would make
`role:'admin'` and `role:'student'` mutually exclusive, so granting a product role to an
admin would silently revoke admin access. The two are orthogonal.

**Authority:** the custom claim is the *only* authorization authority.
`users/{uid}.role` is a denormalised mirror for queries/display — never for access control.

**Bootstrap** — `POST /api/users/bootstrap { role }`:
`201` assigned · `200` idempotent replay · `400` invalid · `401` unauthenticated ·
`403` admin role requested · `409` different product role already held (no self-escalation).
Identity always from `req.user.uid`; a `uid` in the body is ignored.

**`users/{uid}`** created for the first time (previously a phantom parent doc — `.exists === false`,
invisible to `collection('users')` queries; the admin dashboard used `auth.listUsers()` instead):
`{ uid, email, displayName, photoURL, role, organizationId: null, onboardingStatus, createdAt, updatedAt }`.

**Firestore rules** restrict `users/{uid}` **by field** (not blocked — `lib/api/avatar.ts`
legitimately writes avatar fields): `role/organizationId/uid/email/createdAt` are backend-only.

**Also:** `GET /api/users/me` returns `{exists:false, role:null}` for pre-Phase-1 accounts.

## 20. SECURITY FIXES MADE (Phase 0 — this session)

| Route | Problem | Fix |
|---|---|---|
| `/baseline-assessment` | No auth at all; `userId` from `req.params`. Anyone could read any student's Digital Twin and **overwrite** their assessment (which regenerates the twin and flips the profile complete) | `requireAuth` + `enforceSelf('userId')` on all 4 routes |
| `/planning` | No auth. Ownership check was **self-referential** — `sessionData.userId !== userId` compared client-supplied data to client-supplied data | `requireAuth`; all 4 handlers read `req.user.uid`; `enforceSelf` on `/user/:userId` |
| `/documents` | `requireAuth` commented out ("temporarily…so the frontend can function without a login"); 7 anonymous routes incl. paid `POST .../generate`. Cross-user exposure was *not* a risk (hard-restricted to NCERT corpus) | `requireAuth` restored |
| `/analytics/costs` | No auth; omitting `?userId` returned **system-wide AI spend** | `requireAuth`; scope derived from verified token (admin → any/system, else forced to own uid) |

**Tests added:** `tests/unit/roleFoundation.test.ts` (23) + `tests/unit/routeAuthGuards.test.ts` (8).
All 31 pass. The route-guard test is **source-level on purpose** — the `/documents` gap was a
*commented-out* guard, which no behavioural test can catch.

**Still unresolved:** `requireCronSecret` allows the request when `CRON_SECRET` is unset;
`req.rawBody` is never populated so **both** the WhatsApp and Razorpay webhook HMACs are
structurally broken; `env.APP_SECRET` doesn't exist in the zod schema so the WhatsApp
signature check is unconditionally bypassed; `NODE_ENV` defaults to `'development'`, which
sets `cors:'*'` and disables rate limiting.

## 21. GIT RECOVERY HISTORY

```
2026-07-04/07   Milestones 1–8 (squashed same-day), knowledge-graph work
2026-07-08      8c4103ce  docs: README                    ← rollback TARGET
2026-08-09 03:42  8c41f3d4  chore: stage current frontend state  ← RECOVERY POINT
                            (~184 frontend files, ~40,777 lines)
2026-08-09 03:56  reset → 8c4103ce      (the accidental destructive reset)
2026-08-09 04:07  reset → 8c41f3d4      (recovery)
2026-08-09 16:06  6de4d79e  chore: complete project recovery   (595 files, pushed)
2026-08-10 21:14  422df0a4  security: Firebase config → env vars; UI polish
2026-08-10 21:16  d1de0683  merge: feature/role-foundation → main
```

Backend was largely untracked during the reset and therefore survived on disk.
Backup exists and was verified present: **`D:\scholarly_RECOVERY_BACKUP_2026-08-09`**.

**`package.json` was never updated during recovery** — six packages are imported but
undeclared (see §25).

## 22–24. CURRENT GIT STATE / WORKING TREE / BRANCH SITUATION

```
Branch:   main            (⚠️ see note below)
HEAD:     d1de0683        merge: feature/role-foundation -> main
Remote:   origin  https://github.com/kaditya125/scholarly.git
Sync:     0 ahead / 0 behind origin/main
Branches: main · feature/role-foundation (422df0a4)
          remotes: origin/main, origin/feature/role-foundation, origin/master (8c4103ce, stale)
```

**⚠️ Branch note.** A `feature/role-foundation` branch was created for the Phase 0/1 work,
but partway through, an **external process** (not Claude) committed the then-uncommitted UI
work as `422df0a4`, checked out `main`, and merged. The Phase 0/1 changes therefore ended up
**uncommitted on `main`**. Nothing was lost. Moving them to a clean branch is recommended.

**Uncommitted working tree — 16 files, all from Phase 0/1 (§32).**

## 25. CURRENT KNOWN ERRORS

**Typecheck baselines (pre-existing, do not "fix" wholesale):**
- Backend `npx tsc --noEmit` → **126 errors**
- Frontend `npx tsc --noEmit` → **96 errors**
- Phase 0/1 introduced **zero** new errors in either.

**Build:** `npm ci` **cannot produce a working backend build.** Six packages are imported
but undeclared in `backend-firestore/package.json`: `bullmq`, `cockatiel`, `razorpay`,
`nodemailer`, `@google-cloud/storage`, `jsonwebtoken`. The Dockerfile and CI both run
`npm ci` → both fail.

**Tests:** `backend-firestore/package.json` has **no `"test"` script**, yet
`.github/workflows/backend-ci.yml` runs `npm test`. CI cannot pass.
- `tests/unit/chatController.test.ts` — fails to compile (references
  `ChatController.handleFeedback`, which lives in `FeedbackController`). Pre-existing.
- `tests/unit/auth.middleware.test.ts` — 1 env-leaky failure; passes with `CRON_SECRET=""`.
- `tests/unit/workflowEngineOrchestration.test.ts` — written against the *dormant*
  architecture; fails with `Dependency not found for token: Symbol(IMemoryProvider)`.

**Runtime:** `dev` scripts use `tsx` with **no watch** — backend changes require a manual
restart. Long-running Vite dev servers (>24h) have dropped their file watcher and stopped
picking up new files; restart when changes don't appear.

## 26. CURRENT KNOWN GAPS

1. **Personalization loop open** (§11) — highest-value non-security item.
2. **Content pipeline unwired** (§16) — no OCR in production.
3. **Digital Twin never read** by the AI.
4. **`App.tsx:117` `<Routes key={location.pathname}>`** remounts the whole layout on every
   navigation (resets sidebar state, refetches chat sessions). `Layout.tsx` already has its
   own `AnimatePresence`, so the outer key is redundant for transitions.
5. **NotificationWorker never started** in `server.ts` — 2 of 4 BullMQ queues have no consumer.
6. **Study Circle / group channels / flashcards → 404.**
7. **Only 6 Firestore composite indexes** for 68 query sites.
8. Three separate weak-topic stores; only the one the AI *doesn't* read has a writer.
9. Single-instance assumptions: in-memory rate limiter, in-memory telemetry cost attribution
   (sliced by array index), podcast ffmpeg on local disk.

## 27. PHASE 2 PLAN (NOT IMPLEMENTED)

```
Role-aware ProtectedRoute (3rd state: authenticated + no productRole → role selection)
        ↓
Signup role selection UI (Student / Teacher cards)
        ↓
POST /api/users/bootstrap  → getIdToken(true) → refreshClaims()
        ↓
New-user routing by role  ·  Returning-user routing  ·  Missing-role recovery
```

`AuthContext` already exposes `role`, `adminRole`, `claimsLoading`, `refreshClaims()` —
the backend and context are ready; only UI + routing remain.

## 28. FUTURE TEACHER ARCHITECTURE (DO NOT BUILD YET)

```
Create account → Choose Teacher → Basic profile → Subjects → Grades → Board/exams
→ Qualifications → Experience → Specialization → Teacher profile → Verification → Dashboard
```

**Registration ≠ verification.** Statuses: `Registered → Pending Verification → Verified →
Certified/Trusted`. Publishing/selling permissions gated **separately** from role.

## 29. FUTURE STUDENT/TEACHER RELATIONSHIP (DO NOT BUILD YET)

**Not** `Student → Teacher`. The model is:

```
Teacher → Learning Space / Course / Batch ← Student
```

```
Teacher Rahul
  ├── JEE Physics 2027   → Student A, Student B
  ├── Class 12 Physics   → Student C
  └── Free Physics Community

Student
  ├── Physics    → Teacher A
  ├── Chemistry  → Teacher B
  └── Mathematics→ Teacher C
```

The student's account and AI profile are **independent of any teacher**. Leaving a
course must never delete learning history or the AI profile.
`users/{uid}.organizationId` already exists (nullable) so this is a backfill, not a migration.

## 30. IMPORTANT PRODUCT DECISIONS

- AI-first: the AI layer serves students directly; teachers are additive.
- One authentication system, one user identity, role-specific profiles/context/experience.
- Shared AI infrastructure with role-specific **context** — never separate AI engines.
- Shared routing (`/dashboard` role-aware) — **not** `/student/*` + `/teacher/*`.
- Product roles are `student` / `teacher` (**not** `educator`), despite the `TeacherAgent`
  AI-agent naming collision. The agent is **not** to be renamed in current phases.
- Theme system already supports `system | light | dark` — **do not rebuild it.**

## 31. DO **NOT** IMPLEMENT YET

Teacher marketplace · teacher payments/subscriptions/commissions/payouts · public teacher
discovery · ratings · teacher messaging · marketplace search · course commerce ·
teacher onboarding UI · teacher dashboard · teacher/student relationship system ·
learning spaces · enabling any dormant feature flag · switching to the dormant AI or
pipeline architecture.

## 32. FILES CHANGED IN THIS CLAUDE SESSION

**Phase 0/1 — uncommitted on `main` (16):**

*Modified (10)*
```
backend-firestore/firestore.rules                        users/{uid} field-level rules
backend-firestore/src/middlewares/auth.ts                isAdmin, hasProductRole, requireProductRole
backend-firestore/src/routes/baselineAssessment.routes.ts requireAuth + enforceSelf
backend-firestore/src/routes/planning.routes.ts           requireAuth + enforceSelf
backend-firestore/src/routes/documents.routes.ts          requireAuth restored
backend-firestore/src/routes/analytics.routes.ts          requireAuth
backend-firestore/src/routes/users.routes.ts              mounts /bootstrap and /me
backend-firestore/src/controllers/planning.controller.ts  identity from req.user.uid
backend-firestore/src/controllers/analytics.controller.ts scope by verified role
frontend/src/lib/AuthContext.tsx                          role/adminRole/claimsLoading/refreshClaims
```

*Created (6)*
```
backend-firestore/src/types/roles.ts
backend-firestore/src/services/userIdentity.service.ts
backend-firestore/src/controllers/userIdentity.controller.ts
backend-firestore/tests/unit/roleFoundation.test.ts
backend-firestore/tests/unit/routeAuthGuards.test.ts
backend-firestore/docs/ROLE_FOUNDATION.md
```

**Earlier this session — now committed in `422df0a4` / `d1de0683`:** chat UI rebuild
(`AssistantReply.tsx`, `ReasoningTimeline`, `MarkdownMessage`, `Chat.tsx`), auth pages
(`AuthShell.tsx`, `Signin`, `Signup` — real email/password + reset), `Layout.tsx` nav/header,
`index.css` typography, mermaid removal, `prompts.ts` language rule, `TeacherAgent.executeStream`,
`WorkflowEngine` reasoning events + watchdog.

## 33. SENSITIVE FILES

🔴 **`backend-firestore/.env` and `admin-dashboard/.env` are STILL GIT-TRACKED and pushed to
GitHub.** Verified at time of writing via `git ls-files`. `.gitignore` lists `.env` but that
has no effect on already-tracked files.

Exposed key names: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`,
`NVIDIA_API_KEY`, `PINECONE_API_KEY`, `COHERE_API_KEY`, `TAVILY_API_KEY`,
`FIREBASE_PRIVATE_KEY`, `REDIS_URL`, `CRON_SECRET`.

**Repository visibility: UNKNOWN.** Verify first — if public, treat all keys as compromised.
`frontend/.env` is *not* tracked (config moved to `VITE_*` in `422df0a4`).
`backend-firestore/secrets/vertex-sa.json` is correctly gitignored.

Also: `frontend/public/` is statically served and contains stray PDFs with personal-looking
filenames and a `Claude Setup.exe`.

## 34. RECOMMENDED NEXT STEPS (priority order)

1. **Verify repo visibility; rotate the exposed credentials; untrack the two `.env` files.**
2. Move the 16 uncommitted Phase 0/1 files onto a clean branch and commit.
3. Deploy the Firestore rules (`firebase deploy --only firestore:rules`) — the Phase 1 rules
   are written but **not deployed**.
4. Phase 2: role-aware ProtectedRoute → signup role selection → bootstrap + token refresh.
5. Reconcile `package.json` (six undeclared deps) + add a `test` script → unblock CI/Docker.
6. Close the personalization loop (§11).
7. Fix `studentDigitalTwin.service.ts` `updateProfile` → `saveProfile`.

## 35. COMMANDS THE NEXT SESSION MAY SAFELY RUN

```bash
git status --short
git log --oneline -20
git branch -a -v
git diff --stat
git show --stat <sha>
```
```bash
cd backend-firestore && npx tsc --noEmit          # expect ~126 errors (baseline)
cd frontend && npx tsc --noEmit                   # expect ~96 errors (baseline)
```
```bash
cd backend-firestore && CRON_SECRET="" npx jest tests/unit/roleFoundation.test.ts
cd backend-firestore && npx jest tests/unit/routeAuthGuards.test.ts
```
```bash
cd backend-firestore && npx kill-port 8080 && npm run dev   # backend has NO watch mode
cd frontend && npx kill-port 3000 && npm run dev
```

## 36. THINGS THE NEXT SESSION MUST **NOT** DO

```
git reset / git reset --hard
git clean -fd
git checkout -- .   /   git restore .
git branch -D
git push --force
git rebase / history rewrite
```
Also: do not delete files to "clean up" · do not remove features that merely look unused ·
do not revert or stage the user's unrelated work · do not enable dormant feature flags ·
do not switch to the dormant AI/pipeline architectures · do not modify `package.json`
without approval · do not rebuild the theme system · do not rename `TeacherAgent`.

---

# 🚨 NEXT CLAUDE SESSION — START HERE

## What this project is

**Scholarly AI** (`D:\scholarly`) — an AI-first EdTech platform for Indian competitive-exam
prep. React 19 + Vite frontend, Express + TypeScript backend, Firebase Auth + Firestore,
Pinecone RAG, Gemini via Vertex AI. Four separate npm packages (frontend, backend-firestore,
admin-dashboard, shared-ui) — **not** a workspace monorepo.

## What happened to it

On **2026-08-09** a VS Code Copilot operation ran `git reset --hard 8c4103ce`, destroying
~5 weeks of work. Recovery commit **`8c41f3d4`** ("chore: stage current frontend state")
restored ~184 frontend files / ~40,777 lines. The backend was largely untracked and survived
on disk. A backup exists at **`D:\scholarly_RECOVERY_BACKUP_2026-08-09`** (verified present).

**Because of this history, destructive Git operations are forbidden without explicit,
exact-command authorization from the user.** See §36.

## What has already been fixed

**Phase 0 — security hardening (4 authorization gaps closed):**
`/baseline-assessment` (full IDOR on assessments + Digital Twins) · `/planning`
(self-referential ownership check) · `/documents` (`requireAuth` commented out) ·
`/analytics/costs` (system-wide spend exposed anonymously). 31 tests added, all passing.

**Phase 1 — role foundation:** two-claim model (`role` = admin, unchanged; `productRole` =
student|teacher, new) · `POST /api/users/bootstrap` (server-authoritative, idempotent,
no self-escalation, admin claims preserved) · canonical `users/{uid}` document created for
the first time · `requireProductRole` middleware · field-level Firestore rules ·
`AuthContext` exposes `role` + `refreshClaims()`.

**Earlier in the same session (now committed):** real email/password auth + password reset
(both were previously non-functional), chat UI rebuild with streaming reasoning, auth page
redesign, mermaid removal, AI language-mirroring rule.

## What must not be touched

Destructive Git commands · the user's unrelated committed work · dormant feature flags ·
`core/workflow/services/*` and `core/intelligence/*` (dormant AI architecture) ·
`core/pipeline/*` (dormant content pipeline) · `package.json` · the theme system ·
`TeacherAgent`'s name · admin RBAC (`role` claim, `requireRoles`, `create_admin.ts`).

## Current objective

**Phase 2 — role-aware routing and signup role selection.** The backend and AuthContext are
ready; only UI and routing remain:

1. `ProtectedRoute` gains a third state: authenticated **and** no `productRole` → role selection.
2. Signup role-selection UI (Student / Teacher cards).
3. Wire selection → `POST /api/users/bootstrap` → `getIdToken(true)` → `refreshClaims()`.
4. New-user routing by role; returning-user routing; missing-role recovery path.

## What to audit FIRST (before writing any code)

1. `git status --short` and `git branch --show-current` — **16 Phase 0/1 files are
   uncommitted on `main`.** Ask the user whether to move them to a branch first.
2. `frontend/src/App.tsx` — `ProtectedRoute` (~lines 58–111) and the route table.
3. `frontend/src/lib/AuthContext.tsx` — `role`, `claimsLoading`, `refreshClaims` already exist.
4. `backend-firestore/src/types/roles.ts` + `services/userIdentity.service.ts` — the contract.
5. `backend-firestore/docs/ROLE_FOUNDATION.md` — the detailed Phase 1 note.
6. `frontend/src/pages/{Signin,Signup}.tsx` + `components/auth/AuthShell.tsx` — already
   rebuilt as a split-screen shell with working auth. **Extend, do not rebuild.**

**Never assume a feature is missing because it isn't visible in the UI.** This codebase has
repeatedly turned out to contain complete implementations that were simply unmounted
(Study Circle, group channels, the entire content pipeline, `ReasoningTimeline`,
`.font-answer`). Always grep frontend, backend, routes, services, types and Firestore first.

## What NOT to implement yet

Teacher onboarding · teacher dashboard · learning spaces / courses / batches ·
teacher–student relationships · teacher verification · marketplace, payments, subscriptions,
payouts, ratings, discovery · landing-page redesign · theme changes.

## Working agreement with this user

- Follow **READ → TRACE → IDENTIFY EXISTING → EXPLAIN CURRENT FLOW → PROPOSE → WAIT FOR
  APPROVAL → IMPLEMENT → TEST → REPORT.** Do not jump to code.
- Verify with evidence (grep, typecheck, tests, SSE capture) rather than reasoning from
  assumption. When the user says "don't guess, check" — instrument and capture.
- Report typecheck as *delta against the baseline* (backend 126 / frontend 96), never as an
  absolute count.
- Say "Not confirmed from the current codebase" rather than inferring.
- Backend has **no watch mode** — tell the user to restart it after backend changes.
  Frontend hot-reloads, but restart Vite if a long-running dev server stops picking up new files.
