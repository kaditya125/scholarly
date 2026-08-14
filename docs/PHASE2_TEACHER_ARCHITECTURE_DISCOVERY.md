# Phase 2 — Teacher Experience Architecture Discovery

**READ-ONLY.** Nothing modified, created, deleted, staged, or committed.
**Date:** 2026-08-12 · **Branch:** `feature/role-foundation-phase0-2`

Classification: ✅ VERIFIED · 🟡 PARTIALLY VERIFIED · ⚠️ PROPOSED · 🔴 MISSING

---

## 1. Executive summary

Scholarly already owns the hard parts of a teacher platform — membership with in-group roles, a
consent-based relationship handshake, content publishing, feature gating, and a pluggable AI
context pipeline. **The teacher experience is a capability layer over existing systems, not a new
platform.**

Two findings reshape the plan:

**🔴 `studyGroup` has no invitation handshake.** Its only membership mutation is
`addMember(groupId, ownerId, targetUserId, role)` — a **direct add by an existing admin**. There
is no invite, accept, decline, leave, or remove. Using it as-is for teacher→student enrolment
would let a teacher add any student by UID and thereby gain access to them, **without consent**.
That is the single most important gap in this phase.

**✅ The consent handshake already exists — in `connection.service.ts`** (request → accept/block,
`status: 'pending' | 'accepted'`). The pattern is proven in this codebase; it simply lives in the
wrong domain for enrolment. **Reuse the pattern, not the collection.**

**Security posture is a genuine asset.** Every client-facing Firestore rule is
`allow write: if false`, with a default `allow read, write: if false` catch-all. All writes are
backend-mediated through the Admin SDK. New teacher collections therefore inherit deny-by-default.

---

## 2. What already exists

### A. Teacher-as-a-user infrastructure — 🔴 **NONE**
No teacher profile, status, service, controller, route, collection, or UI.

### B. TeacherAgent / AI persona — ✅ exists, **NOT a user role**
`core/agents/TeacherAgent.ts` — *"Scholarly AI's Core Teaching Engine"*, drafts explanations for
students.

### C. Teacher-named prompt/config — ✅ exists, **NOT a user role**
`system_config/prompts/teacher` (`admin.controller.ts:100`) — AI prompt versions.
`verification.service.ts` — **post-ingest content verification**, not teacher verification.
`buildScholarlySystemPrompt({ mode: 'TEACHER' })` — the AI's *persona mode*, not the user's role.

> **⚠️ FOUR NAMING DECOYS.** 77 files match "teacher"; effectively all are A-vs-B confusions.

### Reusable infrastructure — ✅ VERIFIED

| System | Evidence | Teacher use |
|---|---|---|
| `studyGroup.service.ts` | `ownerId`, `memberIds[]`, `members[{userId, role:'admin'\|'member', joinedAt}]`; `addMember` rejects non-admin callers | Class/cohort container |
| `connection.service.ts` | request/accept/block, `pending`/`accepted`, blocks, follows, mutuals | Teacher↔teacher peers **+ the consent pattern for enrolment** |
| `publishedAssets.service.ts` | `publishAsset(userId, userName, assetId, notebookId, subject?, exam?)` | Teacher content publishing |
| `featureFlag.service.ts` | `isEnabled(flag, userId)`, `scope: global\|user\|beta`, `targetUserIds` | Staged teacher rollout |
| `studentContext.service.ts` | `aggregateContext(uid)` → `{profile, memory, analytics, stats}` | Template for teacher context |
| `config/prompts.ts:581-600` | `buildScholarlySystemPrompt({studentContext})` → `buildStudentContextBlock()` | Injection point for a sibling teacher block |
| `userProfile.service.ts` | `users/{uid}/profile/onboarding` (StudentProfile) | Profile-doc pattern |
| `payments.service.ts` | `PlanDef{id,name,monthlyINR}`, `PLANS={pro:499}`, HMAC verify | Subscription rails |
| `middlewares/auth.ts` | `requireAuth`, `enforceSelf`, `isAdmin`, `hasProductRole`, `requireProductRole` | Authorization — **`requireProductRole` used in ZERO routes** 🔴 |
| `firestore.rules` | `isSelf()`, `hasAdminRole()`, all writes `if false`, deny-all catch-all | Deny-by-default baseline |

---

## 3. What can be reused

**Directly:** `connection.service` (peers + handshake pattern), `featureFlag.service`,
`publishedAssets.service`, `payments.service`, the whole auth middleware set, the deny-by-default
rules posture, `AuthShell`/theme, the `Onboarding.tsx` wizard architecture.

**With extension:** `studyGroup.service` (needs an invite/accept lifecycle),
`studentContext.service` (as the template for a sibling), `PLANS` (needs entitlements).

---

## 4. What is genuinely missing 🔴

Teacher profile · `teacherStatus` · teacher AI context · teacher dashboard · **membership consent
handshake** · class/cohort semantics distinct from study groups · capability derivation · applied
role gating · referral · entitlements · payouts/KYC · admin role-correction.

---

## 5. Teacher onboarding design ⚠️

### Existing student pattern — ✅ VERIFIED, and it is the pattern to copy
`Onboarding.tsx`: **single route, internal step state** (`profile`, `index`, `dir`, `phase`,
`genStep`), `steps[]` computed dynamically, `setIndex(i => i+1)` — **never `navigate()`**.
Completion: `updateProfile({...profile, markComplete: true})` → `PUT /users/:userId/profile` →
`navigate('/baseline-assessment')`. Skip writes `sessionStorage['onboarding_skipped']`.
Per Phase 1.5 this is exactly why it is immune to the `key={location.pathname}` remount.

**Teacher wizard must mirror this: one route `/teacher/onboarding`, internal step state, no sub-routes.**

### Field evaluation

| Field | Required? | Store | AI context? | Editable? |
|---|---|---|---|---|
| Display name / photo | Already have | Firebase Auth (existing) | No | Yes |
| Subjects | **Yes** — core routing + AI | `teacherProfiles/{uid}` | **Yes** | Yes |
| Boards | **Yes** | `teacherProfiles` | **Yes** | Yes |
| Classes/grades taught | **Yes** | `teacherProfiles` | **Yes** | Yes |
| Exams | **Yes** | `teacherProfiles` | **Yes** | Yes |
| Languages | **Yes** — student base is multilingual | `teacherProfiles` | **Yes** | Yes |
| Teaching style / pedagogy | **Yes** — differentiates AI output | `teacherProfiles` | **Yes** | Yes |
| Years of experience | Recommended | `teacherProfiles` | Weak | Yes |
| Qualifications | **Defer to verification** | `teacherVerification` (separate) | No | Via review |
| Bio | Recommended (public) | `teacherProfiles.public` | No | Yes |
| Availability | 🔴 Defer — no scheduling exists | — | No | — |
| Location | 🔴 **Do not collect** — no feature needs it; PII without purpose | — | No | — |
| Content-creation prefs | Defer to 2F | `teacherProfiles` | Yes | Yes |

**Minimum viable set: subjects, boards, classes, exams, languages, teaching style.** Everything
else defers. Collecting fields no feature consumes is a privacy liability, not a head start.

---

## 6. Teacher profile design ⚠️

```
teacherProfiles/{uid}          # keyed by the SAME uid — no second identity record
  uid, subjects[], boards[], classesTaught[], exams[], languages[],
  teachingStyle, yearsExperience, bio,
  teacherStatus: 'pending'|'verified'|'rejected'|'suspended',   # server-write only
  onboardingStatus, visibility, createdAt, updatedAt
```

Reuses `users/{uid}` for identity; adds a role-specific sibling. Mirrors how student data already
lives at `users/{uid}/profile/onboarding` rather than in a separate identity record.

### Why these four must stay separate

| Concept | Lives in | Changes | Collapsing it breaks |
|---|---|---|---|
| `productRole` | Custom claim | Never (immutable) | Claims need a token refresh; a mutable status in a claim goes stale |
| `teacherStatus` | Firestore | Often (review outcomes) | Would force token refresh on every admin action |
| capabilities | Derived per request | Continuously | Cannot be a stored field — depends on relationships |
| relationships | Edge documents | Per enrolment | Access must be per-student, never per-role |

Collapsing any pair produces the failure this architecture exists to prevent: **role implying
access.**

---

## 7. Teacher AI context design ⚠️

Existing pipeline — ✅ VERIFIED:
```
studentContext.aggregateContext(uid) → {profile, memory, analytics, stats}
   → buildScholarlySystemPrompt({ studentContext }) → buildStudentContextBlock()
```

Proposed **sibling, not a fork**:
```
teacherContext.aggregateContext(uid) → {profile, subjects, boards, style, publishedStats}
   → buildScholarlySystemPrompt({ teacherContext }) → buildTeacherContextBlock()
```

One optional parameter and one block builder. The retrieval/agent/streaming pipeline is untouched.

> ⚠️ `mode: 'TEACHER'` already exists and means *"the AI acts as a teacher toward a student."* A
> teacher-as-user needs a **different** mode (authoring assistance). Do not overload it.

---

## 8. Teacher → student relationship ⚠️

**Access derives from an edge, never from a role.**

```
classes/{classId}              ownerUid, title, subject, board, exam, visibility
classMembers/{classId}_{uid}   role, status:'invited'|'active'|'removed', invitedBy, joinedAt
```

| Operation | Authorization boundary | Status |
|---|---|---|
| Create class | `productRole === teacher` | ⚠️ |
| Invite student | owns class | ⚠️ |
| **Student accepts** | **the student only** | 🔴 **no handshake exists** |
| Remove student | owns class | ⚠️ |
| Assign content | owns class + member `active` | ⚠️ |
| **See progress** | **`active` membership only, scoped to class work** | ⚠️ |
| Communicate | `active` membership | 🟡 `dm.service` exists |
| Create assessment | `productRole === teacher` | 🟡 `questions`/`tests` exist |
| See results | `active` membership, that assessment only | ⚠️ |

**What grants a teacher access to a student: an `active` classMembers edge the student
affirmatively accepted. Nothing else — not role, not referral, not connection.**

---

## 9. Teacher → teacher relationship ⚠️

**Reuse `connection.service.ts` as-is** ✅ — request/accept/block is already implemented and
tested in production paths. Add a type discriminator if needed. **Do not build a second social
graph.** A teacher connection grants collaboration only: no student access, no class membership,
no content ownership, no financial rights.

---

## 10. Referral architecture ⚠️ (🔴 nothing exists today)

```
referralCodes/{code}                    ownerUid, active
referrals/{referrerUid}_{referredUid}   composite id ⇒ duplicates structurally impossible
invited → registered → verified → onboarding_complete → qualified → rewarded
```
Every transition server-derived. Reward only at `qualified`. Self-referral rejected at bootstrap.
**A referral never creates a connection or an enrolment.**

---

## 11. Class/cohort architecture ⚠️

Two viable paths:

**(a) Extend `studyGroup`** — reuses the container, but study groups are peer-symmetric and
teacher classes are asymmetric; the semantics diverge and both get muddier.
**(b) New `classes` collection modelled on `studyGroup`'s proven shape (recommended)** — copies
the working membership structure without overloading an existing student-facing concept.

Either way the invite/accept lifecycle must be **built** — it does not exist in `studyGroup`.

---

## 12. Authorization model

| Resource | Student | Teacher | Admin |
|---|---|---|---|
| Own profile | RW self ✅ | RW self ⚠️ | R ✅ |
| Own content | RW owner ✅ | RW owner ✅ | R ✅ |
| Student progress | self only ✅ | **only via `active` edge** ⚠️ | ✅ |
| Teacher content | R if published ✅ | RW owner ⚠️ | ✅ |
| Class | R if member ⚠️ | RW owner ⚠️ | ✅ |
| Class members | R if member ⚠️ | R owner ⚠️ | ✅ |
| Peer connection | ✅ existing | ✅ reuse | ✅ |
| Referral | R own ⚠️ | R own ⚠️ | ✅ |
| Payments | R own ✅ | R own ✅ | ✅ |
| Admin | ✗ ✅ | ✗ ✅ | ✅ |

### Missing authorization rules 🔴
`requireProductRole` applied nowhere · no teacher-only routes exist · no rules for
`teacherProfiles`/`classes`/`classMembers`/`referrals`/`entitlements` · no ownership check for
class resources · no `teacherStatus`-gated capability check · no admin role-correction endpoint.

### 🔴 Latent defect found
`firestore.rules:109` declares `match /study_groups/{doc}`, but the code writes
`collection('studyGroups')` (camelCase). **The rule never matches**; `studyGroups` falls through
to the deny-all catch-all. Fail-closed, so not a vulnerability — but the rule is dead code and
misleading. `connections` has no rule at all (also deny-all). Both are currently safe only
because all access is backend-mediated.

---

## 13. Capability model ⚠️

```
capabilities = f(productRole, teacherStatus, relationships)   # server-derived, per request
```

| Capability | Derivation |
|---|---|
| `canLearn` | everyone |
| `canAuthor` | teacher — **including `pending`** |
| `canCreateClass` | teacher + `verified` |
| `canMentor` | teacher + `verified` |
| `canViewStudent(uid)` | **`active` classMembers edge only** |

`pending` never blocks access — it gates elevation. A pending teacher authors, drafts, and
connects from day one.

---

## 14. Monetization possibilities ⚠️

| Model | Pays | Receives | Scholarly earns | Exists | Missing |
|---|---|---|---|---|---|
| 1 Teacher subscription | Teacher | Scholarly | Full | ✅ rails (`PLANS`) | Teacher tier, entitlements |
| 2 Student→teacher paid class | Student | Teacher (minus fee) | Commission | 🟡 inbound only | **Payouts, KYC, ledger, refunds, GST** |
| 3 Platform commission | Student | Split | % | 🔴 | Split-settlement |
| 4 Content marketplace | Student | Teacher | % | 🟡 `publishedAssets` | Pricing, licensing, payouts |
| 5 Premium teacher AI | Teacher | Scholarly | Full | ✅ rails | Entitlement metering |
| 6 Institutional plans | Institute | Scholarly | Full | 🔴 | Org model (absent) |

**Models 1 and 5 need no new payment infrastructure** — same inbound Razorpay flow, new plan +
entitlements. **Models 2–4 require Razorpay Payouts, KYC, a ledger, refunds and tax handling** —
a compliance programme, not a feature. Recommend 1/5 first if monetization is wanted early.

---

## 15. Data model

**Reuse:** `users/{uid}` ✅ · `users/{uid}/profile/onboarding` ✅ · `connections` ✅ ·
`published_assets` ✅ · `notebooks` ✅ · `payments` ✅ · `notifications` ✅
**New (justified):** `teacherProfiles/{uid}` · `classes/{classId}` ·
`classMembers/{classId}_{uid}` · `referralCodes/{code}` · `referrals/{a}_{b}` ·
`entitlementGrants/{id}` · `rewardRules/{id}`
**Rejected:** separate teacher identity record (use the same uid) · second social graph (reuse
`connections`) · second wallet (extend entitlements) · `Assignment` as a new root entity until
`tests`/`questions` reuse is traced.

---

## 16. Security risks

1. 🔴 Enrolment without consent if `studyGroup.addMember` is reused as-is — **highest risk in this phase**
2. 🔴 `requireProductRole` unused — role gating is theoretical
3. 🔴 Rules/collection name mismatch (`study_groups` vs `studyGroups`)
4. ⚠️ Rules deployment still unconfirmed
5. ⚠️ Teacher-scoped data access has no rules yet
6. ⚠️ No admin role-correction path
7. ⚠️ Leaked credentials in Git history (prior audit, still open)

## 17. Privacy risks

1. 🔴 Role-implies-access — a teacher must never enumerate students
2. 🔴 Referral↔enrolment conflation would expose student data to any link-clicker's teacher
3. ⚠️ Progress visibility must be class-scoped, not account-wide
4. ⚠️ Public teacher profiles must not leak student lists
5. ⚠️ Collecting location/availability with no consuming feature — recommend not collecting

---

## 18. Implementation phases (reordered on evidence)

```
2A  Teacher onboarding wizard (internal step state) + teacherProfiles + teacherStatus
2B  Teacher AI context (sibling service + prompt block)
2C  Capability derivation + APPLY requireProductRole + rules for new collections   ← moved earlier
2D  Teacher dashboard (replaces placeholder)
2E  Classes + membership WITH invite/accept handshake                              ← consent first
2F  Student invitation/enrolment UI
2G  Teacher AI authoring workspace
2H  Peer connections (reuse connection.service)
2I  Referral + entitlements
2J  Monetization (models 1/5 only)
```

**2C moved before dashboards:** shipping teacher UI before enforcement means the first
teacher-only endpoint is unguarded. **2E carries the consent handshake** — it is the gate for
every later data-access feature.

## 19. Dependencies

2B→2A · 2C→2A · 2D→2C · 2E→2C · 2F→2E · 2G→2B · 2I→2C · 2J→2I
Independent: 2H.

## 20. Risks

| Risk | Severity |
|---|---|
| Consent-free enrolment | **CRITICAL** |
| Shipping teacher UI before enforcement | **HIGH** |
| Naming decoys misleading contributors | **HIGH** |
| Rules undeployed / name mismatch | **HIGH** |
| Monetization compliance underestimated | **MEDIUM** |
| Over-collecting onboarding fields | **MEDIUM** |
| `signInWithPopup` fragility (Phase 1) | **MEDIUM** |

## 21. Recommended next step

**Phase 2A — teacher onboarding wizard**, mirroring `Onboarding.tsx` exactly: one route, internal
step state, six fields (subjects, boards, classes, exams, languages, teaching style), writing
`teacherProfiles/{uid}` with `teacherStatus: 'pending'`, plus Firestore rules **in the same
change**. Self-contained, no new authorization surface, replaces the placeholder with something real.

---

## A. SAFE TO REUSE ✅
`connection.service` · `featureFlag.service` · `publishedAssets.service` · `payments.service` ·
`requireAuth`/`enforceSelf`/`isAdmin`/`requireProductRole` · deny-by-default rules posture ·
`AuthShell` + theme · `Onboarding.tsx` wizard architecture · `buildScholarlySystemPrompt`
injection point · `users/{uid}` identity

## B. MUST BUILD 🔴
Teacher onboarding wizard · `teacherProfiles` + `teacherStatus` · teacher AI context sibling ·
**membership invite/accept handshake** · `classes`/`classMembers` · capability derivation ·
rules for all new collections · referral + entitlements · teacher dashboard

## C. DO NOT BUILD / DUPLICATE ⛔
Second identity record · second social graph · second wallet · second AI context pipeline ·
second auth system · sub-routed teacher wizard · marketplace (not yet) · payouts/KYC (not yet) ·
org/institute model (no basis)

## D. DECISIONS REQUIRED FROM PRODUCT OWNER
1. **Discovery model** — A (open), B (invite-only), or hybrid. *Recommend hybrid: public teacher
   profile → student requests → teacher accepts → edge created. Preserves consent both ways.*
2. **Classes: extend `studyGroup` or new `classes` collection?** *Recommend new, modelled on it.*
3. **Does `teacherStatus: pending` allow class creation?** *Recommend no — author yes, students no.*
4. **Reward currency** for referrals.
5. **Is monetization in scope at all this year?** Determines whether 2J is ever reached.
6. **Teacher verification evidence** — what is actually checked, and by whom.

## E. RECOMMENDED NEXT IMPLEMENTATION PHASE
**Phase 2A**, gated on decisions 2 and 3.

**STOP — awaiting approval. Nothing modified.**
