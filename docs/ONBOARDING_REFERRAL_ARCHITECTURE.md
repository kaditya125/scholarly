# Scholarly — Onboarding, Referral & Ecosystem Architecture

**Status:** PROPOSAL — awaiting approval. No code has been modified.
**Date:** 2026-08-11
**Governing principle:** Scholarly is an **AI Learning Ecosystem**, not a Student-vs-Teacher
fork. The platform is AI-first; the teacher role *augments* the AI experience, never replaces it.

Evidence rule used throughout: facts marked ✅ were verified against the repository during this
session. Facts marked ⚠️ are **not confirmed from the current codebase** and must be traced
before they are relied on.

---

## 0. The reframe, and why it is load-bearing

Four product states must coexist:

| State | Experience |
|---|---|
| Student without teacher | Learns entirely with AI |
| Student with teacher | AI + human guidance |
| Teacher without students | Authors content, earns, builds reputation |
| Teacher with students | Classes, assignments, analytics, AI-assisted teaching |

A role fork cannot express these — "teacher" alone does not tell you which of the two teacher
states applies. Therefore **`productRole` must not gate features directly.**

```
productRole  (immutable identity claim, backend-authoritative)
teacherStatus (verification lifecycle)
relationships (edges: referral, membership)
        │
        ▼
  CAPABILITIES  ← derived server-side, what the guard actually checks
```

Capability set:

| Capability | Derivation |
|---|---|
| `canLearn` | everyone (the AI is the constant) |
| `canAuthor` | `productRole === 'teacher'` |
| `canMentor` | teacher **and** `teacherStatus === 'verified'` |
| `canManageClass` | `canMentor` **and** owns ≥1 class |
| `canViewChildProgress` | parent (future actor, zero refactor) |

**Consequence that matters most:** `teacherStatus` gates *capability elevation*, not app
access. An unverified teacher still authors and earns — quadrant 3 works on day one, and
onboarding never dead-ends waiting on manual verification.

**Hard rule:** capabilities are derived on the server. The browser may mirror them for UI
only. A client-computed capability is a privilege the browser granted itself.

---

## FIRST TASK — Reference screen → Scholarly mapping

| # | Reference screen | Scholarly equivalent | Existing component | Existing backend | New component | New backend | Data model | Auth dep | Referral dep | AI dep | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sign up (email-first) | Role + account creation | `Signup.tsx`, `AuthShell.tsx` ✅ | `POST /api/users/bootstrap` ✅ | email-first restyle | — | `productRole` claim | Firebase ✅ | reads `?ref=` | — | ✅ exists |
| 2 | Check your email (4-digit) | Firebase email verification | — | Firebase-hosted ✅ | `VerifyEmail.tsx` | — | `emailVerified` in token | Firebase ✅ | `registered→verified` | — | 🟡 UI only |
| 3 | "You've been added to \<org\>" | **CUT** | — | — | — | — | — | — | — | — | ⛔ no org model |
| 4 | Invite your team | Invite peers / educators | `study-groups/GroupDetails.tsx` patterns ✅ | — | `InvitePeers.tsx` | `referral.service`, `referral.controller` | `referrals/{id}`, `referralCodes/{code}` | required | **core** | — | 🔴 greenfield |
| 5 | Setup complete | Setup complete | `WelcomeBriefing.tsx` ✅ | `GET /api/users/me` ✅ | `SetupComplete.tsx` | status aggregate endpoint | `onboardingStatus` ✅ | required | reads status | triggers init | 🟡 partial |
| 6 | Dashboard + welcome modal | Role-aware landing | `App.tsx` guard ✅ | claims ✅ | teacher dashboard | teacher context | `teacherStatus` | ✅ done | — | student ✅ / teacher ❌ | 🟡 student only |

### Why screen 3 is cut
Himalayas matches an employee to a company by email domain. Scholarly has **no organization
model** — `organizationId` exists on the canonical profile ✅ but is always `null` and has no
collection behind it. Building school-matching to fill a screen would invent a domain model to
satisfy a jobs-board layout. Recommend cutting; revisit when institute plans are real.

---

## 1. Signup architecture

```
/signup?ref=CODE
   │  ref stashed in sessionStorage (never trusted, never sent as a reward claim)
   ▼
Step 1  role select ──────────► component state only
   ▼
Step 2  account creation
   ├── email/password  createUserWithEmailAndPassword ✅
   ├── Google          signInWithPopup ✅
   └── GitHub          signInWithPopup ✅
   ▼
POST /api/users/bootstrap { role, referralCode? }
   ├── identity derived from verified token, NEVER req.body.uid ✅
   ├── 201 assigned · 200 idempotent · 400 invalid · 403 admin requested · 409 conflict ✅
   ├── setCustomUserClaims MERGE — preserves admin `role` ✅
   └── ensureCanonicalProfile → users/{uid} ✅
   ▼
refreshClaims()  ← mandatory; claims only exist in a newly minted token ✅
   ▼
/verify-email
```

One email = one Firebase UID = one `productRole` ✅ (proven: `auth/email-already-exists`, and
`allowDuplicateEmails` absent from project config). First role wins; 409 blocks changes.

**Gap this exposes:** the 409 makes role immutable with **no admin correction path**. A teacher
who misclicks "student" is permanently a student. Needs an admin reassignment endpoint.

---

## 2. Onboarding architecture

```
verified email
   ▼
productRole === 'student' ──► existing wizard (Onboarding.tsx) ✅ REUSE, DO NOT FORK
   │                            dynamic StepKey/StepDef list, lines 15–74 ✅
   │                            → /baseline-assessment → AI context init
   │
productRole === 'teacher' ──► NEW TeacherOnboarding.tsx
   │                            → teacherStatus = 'pending'
   ▼
/invite  (OPTIONAL — skippable)
   ▼
/setup-complete
   ▼
AI personalization init
   ▼
role-aware landing
```

The student wizard already supports conditional steps (the Stream step appears only when the
goal calls for it) ✅. Teacher onboarding should use the same `StepDef` pattern rather than a
second wizard engine.

`onboardingStatus`: `not_started | in_progress | complete` ✅ (already in `roles.ts`).

---

## 3. Referral architecture

**Verified: no referral system exists.** All 4 matches for `referral|inviteCode|invitation` are
study-group and notification code ✅ — unrelated.

```
referralCode ──► referrerUid ──► referredUid ──► qualification ──► reward
   (lookup)       (server)         (token)         (events)        (entitlement)
```

State machine — every transition fires from a **server-side event**, never a client report:

| Transition | Trigger | Guard |
|---|---|---|
| → `invited` | link/code generated | — |
| → `registered` | `bootstrap` with `referralCode` | reject `referrerUid === referredUid` |
| → `verified` | first authed call with `token.email_verified` | — |
| → `onboarding_complete` | `onboardingStatus === 'complete'` | — |
| → `qualified` | onboarding complete **and** not previously qualified | the only state that grants reward |
| → `rewarded` | entitlement written | idempotent, transactional |
| → `rejected` | abuse signal | terminal |

Doc id `${referrerUid}_${referredUid}` makes duplicate referrals **structurally impossible** —
a uniqueness constraint expressed in the key, not enforced by application logic.

### Invitation methods (verified feasibility)

| Method | Status |
|---|---|
| Copy referral link | ✅ buildable now |
| Copy invite code | ✅ buildable now |
| WhatsApp share (`wa.me`) | ✅ buildable now, client-side |
| Native share (`navigator.share`) | ✅ buildable now |
| **Email invitation** | 🔴 **BLOCKED** |

**Email blocker (verified):** `EmailNotificationService.ts:17-46` uses nodemailer and falls back
to an **Ethereal mock inbox** when `SMTP_HOST` is unset — and `SMTP_HOST` is not in `.env` ✅.
A "sent" invite would log success and reach nobody. Ship the four working methods; report the
gap. Do not build a fake email path.

**Not affected:** Firebase sends *verification* email from its own infrastructure, not your
SMTP ✅. Screen 2 is unblocked.

---

## 4. Reward architecture

**Verified: Razorpay is fully wired** ✅ — `/config`, `/order`, `/verify`, `/subscription`,
`/history`, plus a signature-verified `/webhook` over the raw body, with `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in env.

**Therefore: reward = entitlement grant. Do not build a wallet.**

```
qualified referral
   ▼
rewardTier(referredRole)          ← server-side table, never client-supplied
   ▼
entitlement grant via existing subscription model
   ▼
audit record on the referral doc
```

Tiering (your decision): teacher→teacher > student→student, because a teacher can bring a
cohort. Tier is a pure function of `referredRole`, resolved server-side.

Candidate grant types — all usage entitlements, none currency: AI credits, podcast generations,
document processing, assessment credits, temporary premium window.

**Still undecided (yours to set):** the concrete grant. "500 AI credits" was illustrative. The
choice changes the entitlement schema, so it should be decided before Phase 3 — not during.

---

## 5. Student architecture

Reuse without forking ✅: `Onboarding.tsx` wizard, `BaselineAssessmentEngine.tsx`,
`WelcomeBriefing.tsx`, the canonical `users/{uid}` profile, and the existing AI context stack.

⚠️ **Not traced this session:** the exact surface of `StudentContextService`, Digital Twin, and
`LearnerProfileBuilder.ts` / `ContextService.ts` / `MemoryService.ts`. 24 files match
`StudentContextService|studentContext` and 9 match `DigitalTwin`, so the system is substantial
and real — but its entry points must be traced before wiring personalization init. Do not
assume a function name.

---

## 6. Teacher architecture

> **⚠️ NAMING TRAP — read before grepping.** `core/agents/TeacherAgent.ts` is *"Scholarly AI's
> Core Teaching Engine"* — an **AI persona** that drafts explanations for students ✅. It is
> **not** teacher-as-a-user. 77 files match "teacher"; the overwhelming majority are
> prompt/persona code. **Teacher-as-a-user does not exist anywhere in the codebase.**

Teacher onboarding is greenfield. Proposed fields: name, subjects, classes taught, board,
exams, qualifications, experience, specialization, bio, teaching interests, goals.

`teacherStatus`: `pending | verified | rejected | suspended`. **Nothing auto-verifies.** New
teachers land `pending` and retain `canAuthor` — they are productive immediately, which is what
makes quadrant 3 real rather than a waiting room.

---

## 7. Teacher/student relationship architecture

**Referral and enrollment are different domain models.** This is the sharpest correctness
requirement in the whole design.

```
REFERRAL (exists at signup)        ENROLLMENT (future)
User A ──ref──► User B             Teacher ──owns──► Class ──enrolls──► Student
symmetric-ish, one-shot            directional, ongoing, revocable
grants entitlements                grants visibility into progress
```

**Hard rule:** no code path in the referral service may write an enrollment edge. A student who
used Teacher D's link is **not** Teacher D's student. Conflating them would leak student
progress data to any teacher whose link was clicked — a privacy breach, not a UX shortcut.

Future shape, prepared but not built: `classes/{classId}` with `ownerUid`, plus
`classMembers/{classId}_{uid}` as the edge. Joining is an explicit accepted action.

---

## 8. Authentication architecture

**ONE sign-in page.** No "sign in as student/teacher" ✅ — already correct.

```
Sign In ──► Firebase ──► UID ──► ID token ──► claims.productRole ──► capabilities ──► app
```

Two orthogonal claims ✅: `role` (admin, unchanged) and `productRole` (student|teacher).
Folding them would make `role:'admin'` and `role:'student'` mutually exclusive and silently
revoke admin access. Verified intact: admin retained `{"role":"super_admin"}` across a
`productRole` write ✅.

`AuthContext` exposes `role`, `adminRole`, `claimsLoading`, `refreshClaims` ✅.

**Known trap:** claims arrive a beat after `user`. Any role branch must wait for
`claimsLoading === false` or it bounces every user on first paint ✅ (already handled in
`ProtectedRoute`).

---

## 9. Routing architecture

```
/                     public
/signup /signin       public  (reads ?ref=)
/select-role          authed, no productRole                    ✅ wired
/verify-email         authed, !emailVerified                    NEW
/onboarding           authed + role + verified                  ✅ exists
/teacher/onboarding   authed + teacher                          NEW
/invite               authed + onboarded          (skippable)   NEW
/setup-complete       authed + onboarded                        NEW
/dashboard            canLearn
/teach                canAuthor                                 NEW
```

All new routes must be added to `ProtectedRoute`'s bypass list, or the profile-incomplete check
will redirect them into `/onboarding` and loop.

⚠️ **Pre-existing defect to fix first:** `App.tsx:117` uses
`<Routes location={location} key={location.pathname}>`, remounting the whole layout on every
navigation. A multi-step flow across routes will lose all in-flight state. Fix before Phase 2.

---

## 10. Firestore data model

```
users/{uid}                       ✅ canonical: role, organizationId, onboardingStatus,
                                     email, displayName, photoURL, createdAt, updatedAt
teacherProfiles/{uid}             NEW  subjects, board, exams, quals, bio, teacherStatus
referralCodes/{code}              NEW  ownerUid, createdAt, active   (code → uid lookup)
referrals/{referrerUid}_{referredUid}  NEW  full record, id enforces uniqueness
entitlementGrants/{grantId}       NEW  uid, source:'referral', refId, type, amount, grantedAt
classes/{classId}                 FUTURE
classMembers/{classId}_{uid}      FUTURE
```

`referrals` is a **root collection**, not a subcollection — it is read from both sides.

---

## 11. Security model

- Identity from the verified token only. `req.body.uid` / `userId` / `role` are never proof ✅.
- `users/{uid}` field-level rules already block client writes to `role`, `organizationId`,
  `uid`, `email`, `createdAt` ✅.
- `referrals`, `referralCodes`, `entitlementGrants`: **server-write only**, client read limited
  to own records. A client-writable referral doc is a self-service reward button.
- `teacherStatus` server-write only. Client-writable = self-verification.
- Reward amounts resolved server-side from a tier table. Never read from the request.
- ⚠️ **Firestore rules from Phase 1 are written but NOT deployed** — `firebase deploy --only
  firestore:rules` still outstanding. New collections must ship with rules in the same change.

### Standing CRITICAL issue
`backend-firestore/.env` and `admin-dashboard/.env` are git-tracked and pushed with live
credentials — including the Razorpay secrets this design now depends on. Rotation and repo
visibility remain unresolved and must be handled before any deployment.

---

## 12. Anti-abuse model

| Attack | Defence |
|---|---|
| Self-referral | reject `referrerUid === referredUid` at bootstrap |
| Duplicate referral | doc id `${referrer}_{referred}` — structurally impossible |
| Repeated reward claim | `rewardStatus` transition inside a Firestore transaction |
| Reward manipulation | amount never read from client; server tier table |
| Fake accounts | qualification requires verified email **and** completed onboarding |
| Farming via link clicks | `invited` grants nothing; only `qualified` pays |
| Invite spam | rate-limit per referrer per window (email path blocked anyway) |
| Privilege escalation | `bootstrap` rejects admin roles (403) ✅ |

The single most important property: **reward is gated on completed onboarding**, which costs an
attacker real effort per fake account and cannot be automated cheaply.

---

## 13. Existing reusable code

`AuthShell.tsx` (+ `Field`, `SubmitButton`, `ProviderButton`, `GoogleMark`, `AuthError`,
`FlourishLink`, `RoleCard`) ✅ · `Onboarding.tsx` step engine ✅ · `BaselineAssessmentEngine.tsx` ✅ ·
`WelcomeBriefing.tsx` ✅ · `AuthContext` claims plumbing ✅ · `userIdentity.service.ts` ✅ ·
`middlewares/auth.ts` (`requireAuth`, `enforceSelf`, `tokenClaims`, `isAdmin`,
`hasProductRole`, `requireProductRole`) ✅ · `roles.ts` ✅ · payments/Razorpay stack ✅ ·
`study-groups/GroupDetails.tsx` invite patterns ✅ · Tailwind v4 `dark:` theming ✅ · `motion`
transitions ✅.

**Theme:** reuse existing `dark:` tokens. ⚠️ The theme *toggle* mechanism was not traced this
session — confirm before adding new surfaces.

---

## 14. Missing functionality

**Frontend:** `VerifyEmail.tsx`, `TeacherOnboarding.tsx`, `InvitePeers.tsx`,
`SetupComplete.tsx`, teacher dashboard, shared step-progress indicator.

**Backend:** referral service + controller + routes, code generation, qualification event hooks,
entitlement grant service, teacher profile CRUD, admin role-reassignment, admin teacher
verification, capability derivation helper.

**Infrastructure:** SMTP transport (blocks email invites), Firestore rules deployment,
`.env` credential rotation.

---

## 15. Implementation phases

| Phase | Scope | Depends on |
|---|---|---|
| **0** | Fix `App.tsx:117` remount; deploy Firestore rules | — |
| **1** | `VerifyEmail.tsx` + verification gating | Phase 0 |
| **2** | Referral schema, code generation, `bootstrap` accepts `referralCode`, state machine to `qualified` — **no rewards yet** | Phase 1 |
| **3** | Entitlement grant on `qualified`, reward tiers | Phase 2 + **reward decision** |
| **4** | `InvitePeers.tsx` (link/code/WhatsApp/native), skippable | Phase 2 |
| **5** | `SetupComplete.tsx` from real backend state | Phases 1–4 |
| **6** | Teacher onboarding + `teacherStatus` + admin verification | Phase 0 |
| **7** | Capability derivation; teacher dashboard | Phase 6 |
| **8** | Classes/enrollment | Phase 7 |

Phases 2 and 6 are independent and can run in parallel.

---

## 16. Risks

1. **`TeacherAgent` naming collision** — highest risk of wrong work. Any contributor grepping
   "teacher" will find an AI persona and conclude teacher support exists.
2. **Rewards before anti-abuse** — shipping Phase 3 before Phase 2's state machine is a
   self-service credit faucet. Order is not negotiable.
3. **Referral→enrollment conflation** — a privacy breach, not a bug. Needs an explicit test.
4. **`App.tsx:117` remount** — will silently break multi-step state.
5. **Undeployed Firestore rules** — new collections default to whatever is live now.
6. **Leaked `.env`** — now includes the Razorpay secrets this design depends on.
7. **Immutable role with no admin fix** — support burden from day one.
8. **Claims latency** — any new role branch that skips `claimsLoading` locks users out.
9. **Email invite gap** — must be visibly absent, never a button that silently fails.
10. **Typecheck baselines** — backend 126, frontend 96 pre-existing errors ✅. Report deltas,
    never absolutes.

---

## 17. Testing strategy

**Unit** — referral state machine (every transition + illegal ones); self-referral rejection;
reward tier resolution; capability derivation truth table; `bootstrapProductRole` idempotency
and 409; claim merge preserves admin `role`.

**Integration** — full signup with `?ref=`; qualification only after onboarding completes;
double-qualify attempts grant exactly once (transactional); referral never writes an enrollment
edge.

**Source-level guard tests** — extend the existing `routeAuthGuards.test.ts` pattern ✅ to assert
every new route declares `requireAuth`. This pattern was chosen because the original
`/documents` gap was a *commented-out* guard, which a runtime test cannot catch.

**Rules tests** — client writes to `referrals`, `entitlementGrants`, `teacherStatus` must fail.

**Manual** — light/dark on every new screen; hard-refresh mid-flow (no redirect flicker);
skip-invite path reaches the app.

**Regression guard** — `admin@scholarly.ai` / `Rc21X5zW87NMm44FliY3RTamJ503` retains
`{"role":"super_admin"}` after any claims work. Verified intact today ✅.

---

## Open decisions (blocking)

1. **What a qualified referral grants**, concretely — gates Phase 3.
2. **Teacher onboarding: same phase as student, or after?** Greenfield, roughly doubles the work.
3. **Confirm screen 3 is cut** (recommended) or define an organization model.

**STOP — awaiting approval. No code modified.**
