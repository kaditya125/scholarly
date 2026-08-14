# Scholarly AI — Student + Teacher Architecture Review

**Status:** READ-ONLY REVIEW — awaiting approval. **Nothing modified.**
**Date:** 2026-08-11

Legend: ✅ verified in-repo · ❌ verified absent · ⚠️ **NOT VERIFIED — REQUIRES
IMPLEMENTATION/PRODUCT DECISION**

---

## HEADLINE

**Scholarly already contains most of the teacher platform — built for students, under other
names.** The previous audit understated this badly. Three systems are near drop-in reusable:

| Need | Already exists as | Fit |
|---|---|---|
| Class / cohort | `studyGroup.service.ts` — `ownerId`, `members[{userId, role:'admin'\|'member', joinedAt}]`, authorized `addMember` | **Excellent** |
| Teacher↔teacher peers | `connection.service.ts` — request/accept/block lifecycle, `status:'pending'\|'accepted'` | **Excellent** |
| Teacher content authoring | `publishedAssets.service.ts` — `publishAsset(userId, …, subject, exam)` | **Good** |
| Capability rollout | `featureFlag.service.ts` — `scope: global\|user\|beta`, `targetUserIds` | **Partial** |

**The teacher experience is mostly a capability layer over existing systems, not a new platform.**

### ⚠️ THREE NAMING TRAPS — all decoys
1. `core/agents/TeacherAgent.ts` — the **AI teaching persona**, not a user role.
2. `services/verification.service.ts` — **post-ingest content verification** (Storage/Firestore/
   Pinecone artifact repair). **Not** teacher verification.
3. `system_config/prompts/teacher` collection (`admin.controller.ts:100`) — **AI prompt
   versions** for that persona.

Grepping "teacher" returns 77 files and is actively misleading. **Teacher-as-a-user does not exist.**

---

## The 25 questions

| # | Question | Answer |
|---|---|---|
| 1 | How is `productRole` stored? | Firebase **custom claim** (authority) + denormalised `role` field on `users/{uid}` (display mirror, explicitly *not* for access decisions — `userIdentity.service.ts:23-25`) ✅ |
| 2 | Where is it read? | `AuthContext.tsx:63-65` via `getIdTokenResult(force)`; backend `middlewares/auth.ts` `tokenClaims()` ✅ |
| 3 | How does AuthContext expose it? | `role`, `adminRole`, `claimsLoading`, `refreshClaims` ✅ |
| 4 | ProtectedRoute behaviour | authLoading→spinner; `!user`→`/signin`; `claimsLoading`→spinner; `!role`→`/select-role`; then profile-completeness bypass list ✅ |
| 5 | Where should role-aware routing live? | **`ProtectedRoute` + a `RoleLanding` element.** Not in `Signin.tsx` — it must apply to deep links and refreshes too |
| 6 | How to separate onboarding? | Reuse the `StepDef` engine in `Onboarding.tsx:15-74`; branch the **step list**, not the wizard ✅ |
| 7 | Reusable student components | `Onboarding.tsx` engine, `AuthShell` + `RoleCard`/`Field`/`SubmitButton`, `WelcomeBriefing.tsx`, `BaselineAssessmentEngine.tsx` ✅ |
| 8 | Hidden teacher model? | ❌ **No.** All three "teacher" hits are AI-persona decoys (above) |
| 9 | Group/cohort infra? | ✅ **YES** — `studyGroup`, `studyCircle`, `groupChannel`, `rooms` services + repositories; collections `studyGroups`, `channels`, `rooms`, `circleChat/Concepts/Knowledge` |
| 10 | Enrollment infra? | 🟡 **Partial** — `studyGroup.addMember()` is membership with in-group roles. No course-enrolment concept |
| 11 | Referral infra? | ❌ **None** |
| 12 | Reward/entitlement infra? | ❌ **None.** `PlanDef = {id, name, monthlyINR}` — pricing only, no features/limits/quotas |
| 13 | Razorpay for teacher monetization? | 🔴 **No.** Single plan `pro` ₹499/mo, 15% yearly. Inbound B2C only — no payouts, revenue share, KYC, or creator ledger. ⚠️ Teacher monetization requires a Razorpay **payouts** product + product decision |
| 14 | Notification/invitation system? | 🟡 `NotificationEngine`, `TemplateEngine`, `notifications`/`notification_preferences`/`notification_analytics` exist ✅, but **no invitation notification types found** ⚠️. Email transport is a **mock** (`EmailNotificationService.ts:17-46`, Ethereal fallback, `SMTP_HOST` unset) |
| 15 | Community/study-circle for teacher groups? | ✅ **YES** — `studyCircle.service.ts` (AI-assisted group learning), `studyGroup`, `groupChannel`, `discussions`, `dm` |
| 16 | AI context reusable for teachers? | ✅ `studentContext.service.ts`, `studentDigitalTwin.service.ts` + `.types.ts`, `LearnerProfileBuilder.ts`, `ContextService.ts`, `MemoryService.ts`. ⚠️ Entry points **not traced** |
| 17 | Firestore collections | ~90 referenced. Relevant: `users`, `userDirectory`, `user_stats`, `studyGroups`, `connections`, `follows`, `channels`, `rooms`, `discussions`, `dmConversations`, `published_assets`, `notebooks`, `assessments`, `quiz_attempts`, `payments`, `notifications`, `system_config` ✅ |
| 18 | Backend services | 49 services ✅ (full list traced) |
| 19 | APIs | 35 route modules ✅ incl. `studyGroups`, `connections`, `discussions`, `dm`, `rooms`, `publishedAssets`, `payments`, `users` |
| 20 | Security rules | `backend-firestore/firestore.rules` — `isSelf()`, `hasAdminRole()`, `users/{uid}` field-protected (`create:false`, `delete:false`, `update` blocks `role`/`organizationId`/…), notebooks owner-gated ✅. ⚠️ **Deployment unconfirmed** |
| 21 | What is role-gated today? | 🔴 **Nothing by product role.** `requireProductRole` exists (`auth.ts:86`) but is used in **ZERO routes**. Only `requireAdmin` is applied (`feedback.routes.ts:13`) |
| 22 | Stay global to students | AI chat/tutor, notebooks, podcasts, assessments, planner, leaderboard, connections, DMs, discussions, study groups/circles |
| 23 | Teacher-only | Course/cohort authoring, class management, enrolled-student analytics, teacher AI assistant, teacher profile, monetization ⚠️, bulk content publishing |
| 24 | Shared | Auth, AI chat, notebooks, podcasts, connections, DMs, discussions, groups, notifications, search, theme |
| 25 | Missing for production teacher | Teacher onboarding, `teacherStatus`, teacher profile/context, role-aware routing, capability derivation, enrolment (distinct from membership), teacher dashboard, applying `requireProductRole`, monetization ⚠️ |

---

## A. Current architecture map

```
Firebase Auth ──claims{ role(admin), productRole(student|teacher) }
      │
AuthContext ── role · adminRole · claimsLoading · refreshClaims        ✅
      │
ProtectedRoute ── authLoading → !user → claimsLoading → !role → profile ✅
      │
      └─ ALL routes land on student surfaces (no role branch)          🔴
Backend
  users.routes → bootstrap ✅ / me ✅          (requireAuth ✅)
  studyGroups · connections · discussions · dm · rooms · publishedAssets
  payments (Razorpay, UNCONFIGURED)
  49 services · 21 repositories · ~90 collections
  requireProductRole defined ✅ — applied nowhere 🔴
```

## B. Existing implementation matrix

| Capability | Status | Evidence |
|---|---|---|
| Firebase auth (Google/GitHub/password) | ✅ | `firebase.ts:34-35`, `Signup.tsx:93` |
| `productRole` claim + bootstrap | ✅ | `userIdentity.service.ts:94` |
| Claims refresh | ✅ | `AuthContext.tsx:98-100` |
| Missing-role recovery | ✅ | `App.tsx:45-53`, `SelectRole.tsx` |
| Student onboarding | ✅ | `Onboarding.tsx` |
| Group/cohort membership + in-group roles | ✅ | `studyGroup.service.ts:11-40` |
| Peer relationship lifecycle | ✅ | `connection.service.ts` |
| Content publishing | ✅ | `publishedAssets.service.ts` |
| Feature-flag gating | ✅ | `featureFlag.service.ts:31-55` |
| AI student context / Digital Twin | ✅ | `studentContext.service.ts`, `studentDigitalTwin.service.ts` |
| Payments (inbound) | 🟡 | code complete, **unconfigured** |
| Signup 409 handling | 🟡 | backend ✅ `controller:56`; UI swallows `Signup.tsx:61-64` |
| Product-role gating applied | 🔴 | zero routes |
| Teacher onboarding / profile / status / dashboard | 🔴 | absent |
| Role-aware routing | 🔴 | absent |
| Referral / rewards / entitlements | 🔴 | absent |
| Enrolment (course-level) | 🔴 | absent |
| Teacher monetization | 🔴 ⚠️ | product decision |

## C. Student flow
```
Signup → student → Google/email ✅ → bootstrap ✅ → refreshClaims ✅
→ /verify-email (NEW) → /onboarding ✅ → baseline ✅ → AI context init ✅
→ /invite (NEW, skippable) → /setup-complete (NEW) → /dashboard ✅
```

## D. Teacher flow
```
Signup → teacher → Google/email ✅ → bootstrap ✅ (claim correct)
→ /verify-email (NEW) → /teacher/onboarding (NEW: subjects, expertise,
  experience, pedagogy, target levels, qualifications) → teacherProfiles/{uid},
  teacherStatus='pending' (NEW) → teacher AI context (NEW)
→ /invite (NEW) → /setup-complete (NEW) → /teach (NEW)
```
**Today a teacher gets a correct claim and is then asked their exam target** — `Signup.tsx:64`
sends every role to `/onboarding`.

## E. Authentication flow
One sign-in page ✅. `signInWithPopup` for both signup and signin — Firebase has no separate
"sign up with Google".

> **⚠️ FRAGILE, LOAD-BEARING:** role selection survives OAuth **only because `signInWithPopup`
> keeps the SPA mounted**. Switching to `signInWithRedirect` unmounts the component and silently
> loses the role. Needs a code comment.

## F. Role detection flow
```
onAuthStateChanged → readClaims(u) → getIdTokenResult(force)
  → claims.productRole validated to 'student'|'teacher' else null ✅
  → claimsLoading=false
```
Correctly refuses to trust arbitrary claim values.

## G. Role-aware routing design

Belongs in `ProtectedRoute` + a `RoleLanding` element — **not** `Signin.tsx`, which only covers
the login transition and misses deep links and refreshes.

```tsx
// after claimsLoading resolves and role exists
<Route path="/dashboard" element={<RoleLanding
  student={<StudentDashboard/>} teacher={<Navigate to="/teach" replace/>} />} />
```
Guards must check **capabilities**, not roles (§O).

## H. Student–teacher relationship model

**Enrolment ≠ referral ≠ connection.** Three distinct edges.

```
classes/{classId}              ownerUid, title, subject, exam, visibility
classMembers/{classId}_{uid}   role:'teacher'|'student', status:'invited'|'active', joinedAt
```
Reuse the `studyGroup` shape ✅ (`ownerId` + `members[{userId, role, joinedAt}]` + authorized
`addMember`) — it is already the right model with the right authorization check.

**Hard rule:** a teacher accesses student data **only** through an `active` enrolment edge.
Referral must never create one.

## I. Teacher-to-teacher invitation model
**Reuse `connection.service.ts` verbatim** ✅ — it already implements request → accept/block with
`status:'pending'|'accepted'`, mutuals and follow state. Teacher peers = a connection with a
type discriminator. **Do not build a second social graph.**

## J. Student referral model
Greenfield. `referralCodes/{code}` → `referrals/{referrerUid}_{referredUid}` (id enforces
uniqueness structurally).
```
invited → registered → verified → onboarding_complete → qualified → rewarded
```
Every transition server-derived. Reward only at `qualified`.

## K. Reward / entitlement model
No entitlement layer exists — it must be **introduced**, config-as-data:
```ts
RewardRule { id, trigger:'referral_qualified', audience:'referrer'|'referred',
             referredRole?, grants: EntitlementGrant[], active }
EntitlementGrant { type, amount, expiresInDays? }
```
Amounts are config, never code. Kill-switch = `active:false`.
**Granting ≠ metering** — consumption enforcement is separate, larger work.

## L. AI context model
Reuse ✅ `studentContext.service.ts`, `studentDigitalTwin.service.ts`, `LearnerProfileBuilder`,
`ContextService`, `MemoryService`. Teacher context = a **sibling** service reusing the same
primitives (subjects, expertise, pedagogy, target levels, courses, metrics).
⚠️ Initialisation entry points **not traced** — trace before wiring; do not assume names.

## M. Firestore data model (additions only)
```
teacherProfiles/{uid}                  NEW
classes/{classId}                      NEW
classMembers/{classId}_{uid}           NEW
referralCodes/{code}                   NEW
referrals/{referrerUid}_{referredUid}  NEW
rewardRules/{ruleId}                   NEW
entitlementGrants/{grantId}            NEW
```
No existing document shape changes.

## N. API model
```
GET  /api/users/capabilities                    NEW
POST /api/teacher/profile · GET                 NEW
POST /api/admin/teacher/:uid/status             NEW (admin)
POST /api/admin/users/:uid/product-role         NEW (admin — fixes the immutable-role dead end)
GET  /api/referral/me · /list                   NEW
POST /api/classes · /:id/invite · /:id/join     NEW
GET  /api/onboarding/status                     NEW
```
No endpoint ever accepts a reward amount.

## O. Security model
```
productRole (claim)  +  teacherStatus (Firestore)  +  edges  ──►  capabilities (server-derived)
```
| Capability | Derivation |
|---|---|
| `canLearn` | everyone |
| `canAuthor` | teacher (**including `pending`**) |
| `canMentor` | teacher + `verified` |
| `canManageClass` | `canMentor` + owns class |
| `canViewStudent(uid)` | **active enrolment edge only** |

`teacherStatus` stays in Firestore, not claims — it changes over time and claims need a token
refresh. Server-write only. Browser may mirror capabilities for UI only.

## P. Missing features
Teacher onboarding · `teacherStatus` · teacher profile + AI context · teacher dashboard ·
role-aware routing · capability derivation · applying `requireProductRole` · enrolment ·
referral · entitlements · 409 surfacing · admin role reassignment · teacher monetization ⚠️

## Q. Risks

| # | Risk | Severity |
|---|---|---|
| 1 | Leaked secrets in Git history (8 live credentials; repo visibility **unknown**) | **CRITICAL** |
| 2 | `App.tsx:140` `key={location.pathname}` remounts everything — breaks multi-step flows | **HIGH** |
| 3 | Three "teacher" naming decoys mislead contributors | **HIGH** |
| 4 | `requireProductRole` unused — role gating is theoretical | **HIGH** |
| 5 | Referral→enrolment conflation = student-data privacy breach | **HIGH** |
| 6 | Firestore rules deployment unconfirmed | **HIGH** |
| 7 | `signInWithPopup` dependency is invisible and load-bearing | **MEDIUM** |
| 8 | No entitlement layer — rewards larger than scoped | **MEDIUM** |
| 9 | Immutable `productRole`, no admin fix | **MEDIUM** |
| 10 | Teacher monetization needs payouts + KYC ⚠️ | **MEDIUM** |
| 11 | Email transport is a mock | **MEDIUM** |
| 12 | Teachers currently pushed through student onboarding | **MEDIUM** |

## R. Recommended phases
```
0  SECURITY: repo visibility → rotate 8 credentials
0b App.tsx:140 remount fix · deploy + verify Firestore rules
1  Signup 409 surfacing (small, user-visible, fixes a live bug)
2  Capability derivation + role-aware routing + apply requireProductRole
3  Teacher onboarding + teacherProfiles + teacherStatus + /teach
4  Teacher AI context (after tracing student context)
5  /verify-email
6  Referral core (no rewards)
7  Entitlement layer + reward rules
8  /invite (link · code · WhatsApp · native share)  [email blocked]
9  /setup-complete
10 Classes/enrolment on the studyGroup pattern
11 Monetization ⚠️
```
Phases 2–4 and 6–7 are independent.

## S. File-by-file plan

**Modify (surgical)**
| File | Change |
|---|---|
| `frontend/src/pages/Signup.tsx` | Surface 409 — copy the pattern from `SelectRole.tsx:53-58`. Add a `signInWithPopup` comment |
| `frontend/src/App.tsx` | Remove `key={location.pathname}`; add role-aware routes + bypass entries |
| `frontend/src/lib/AuthContext.tsx` | Expose `capabilities` (server-fetched) |
| `backend-firestore/src/types/roles.ts` | Add `TEACHER_STATUSES` |
| `backend-firestore/src/routes/*.ts` | Apply `requireProductRole` where warranted |
| `backend-firestore/firestore.rules` | Rules for new collections |

**Create**
`pages/TeacherOnboarding.tsx` · `pages/TeacherDashboard.tsx` · `pages/VerifyEmail.tsx` ·
`pages/InvitePeers.tsx` · `pages/SetupComplete.tsx` · `components/RoleLanding.tsx` ·
`services/teacherProfile.service.ts` · `services/teacherContext.service.ts` ·
`services/referral.service.ts` · `services/entitlement.service.ts` ·
`services/capabilities.service.ts` · matching controllers/routes · admin endpoints

**Do NOT touch** — verified correct
`userIdentity.service.ts` · `userIdentity.controller.ts` · `middlewares/auth.ts` ·
`firebase.ts` · `SelectRole.tsx` · `AuthShell.tsx` · `Onboarding.tsx` engine ·
`studyGroup.service.ts` · `connection.service.ts` · `payments.service.ts`

---

## Final answers

**1 · Production-ready:** Firebase auth (3 providers), `productRole` bootstrap with full backend
authority, claims refresh, missing-role recovery, student onboarding + baseline + AI context,
group/cohort membership, connection lifecycle, content publishing, feature flags, dark/light auth UI.

**2 · Partially implemented:** 409 handling (backend ✅ / UI ✗), payments (code ✅ / unconfigured),
enrolment (group membership ✅ / course enrolment ✗), notifications (engine ✅ / invitations ✗ /
email mocked).

**3 · Missing:** everything teacher-as-user, role-aware routing, capability enforcement,
referral, entitlements, enrolment edges.

**4 · Reuse:** `studyGroup` → classes · `connection` → teacher peers · `publishedAssets` →
teacher content · `featureFlag` → rollout · `Onboarding` engine → teacher wizard · `AuthShell` →
all new screens · student AI context → teacher context pattern.

**5 · Do NOT rebuild:** the entire identity/bootstrap layer, `SelectRole.tsx`, `AuthShell`,
Firebase provider wiring, `studyGroup`, `connection`, `payments`.

**6 · First:** security (visibility → rotate) → `App.tsx:140` → deploy rules → Signup 409 →
capabilities + role-aware routing → teacher onboarding.

**7 · Later:** referral, entitlements, invites, setup-complete, classes, monetization.

**8 · Biggest risks:** leaked credentials with unknown blast radius; the remount defect;
role-gating that exists but is never applied; referral↔enrolment conflation.

**9 · Recommended final architecture**
```
              Firebase Auth (one sign-in, 3 providers)
                            │
                    productRole claim
                            │
                 CAPABILITIES (server-derived from
                 role + teacherStatus + edges)
                     /              \
              canLearn            canAuthor/canMentor
                 │                        │
        Student surfaces          Teacher surfaces
                 └────────┬───────────────┘
                   SHARED CORE
        AI chat · notebooks · podcasts · connections ·
        groups · discussions · DMs · notifications · search

     EDGES (never conflated):
       referral    A → B          → entitlements
       connection  A ↔ B          → peer/collaboration
       enrolment   Teacher→Class→Student → scoped data access
```
One platform, one auth, one AI core, one social graph. Roles select **capabilities**, not a
separate application. This is what makes parents and institutes additive later rather than a rewrite.

**STOP — awaiting approval. Nothing modified.**
