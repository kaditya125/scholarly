# Teacher + Student — Final Architecture Contract

**AUTHORITATIVE SPECIFICATION** for Phase 2 implementation.
**READ-ONLY produced.** No code, Firebase, Firestore, auth, payment config, or security rules modified.
**Date:** 2026-08-12 · **Branch:** `feature/role-foundation-phase0-2`

✅ VERIFIED · 🟡 PARTIAL · ⚠️ PROPOSED · 🔴 MISSING

---

## 1. Executive summary

Scholarly is an **AI Learning Ecosystem gated by capabilities**, not a Student-vs-Teacher fork.
The AI is the constant; teachers augment it. Four states must hold: student alone (AI only),
student with teacher (AI + guidance), teacher alone (authors, builds reputation), teacher with
students (classes, analytics, AI-assisted teaching).

**The single governing rule of this contract:**

> **Role never grants access to a person. Only an edge the other party accepted does.**

Everything below exists to make that rule structurally enforced rather than remembered.

### Three findings that shape the design

**🔴 `studyGroup` cannot represent teacher classes.** Its only membership mutation is
`addMember(groupId, ownerId, targetUserId, role)` — a direct add by an admin. No invite, accept,
decline, leave, or remove. Reusing it would let a teacher add any student by UID and gain access
**without consent**.

**✅ The consent handshake already exists** in `connection.service.ts` (request → accept/block,
`pending`/`accepted`). Reuse the **pattern**; do not reuse the collection.

**🟡 Content visibility is binary.** `PublishedAsset.isPublic: boolean`, and `publishAsset()`
hardcodes `isPublic: true`. There is no CLASS_ONLY tier. Separately,
`notebookSharing.shareWithUser(..., role: 'viewer'|'editor')` is a real per-user ACL ✅ — that is
the CLASS_ONLY primitive. Note `generateSecureShareLink` is **explicitly mocked** (comment at
`notebookSharing.service.ts:45-47`) 🔴.

---

## 2. Architecture decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **`connection` ≠ `enrollment`** — assumption **VALIDATED** | Different symmetry (peer vs asymmetric), lifecycle, and access grant. Connection grants collaboration; enrollment grants scoped student-data visibility. Merging them means accepting a peer request leaks learning data |
| D2 | **New `classes`/`classMembers`, modelled on `studyGroup`'s shape** | Copies the proven membership structure without inheriting consent-free `addMember` or overloading a student-facing concept |
| D3 | **`teacherStatus: pending` is generous** | Authors, drafts, uses AI, connects to peers from day one. Gates only student-facing capability |
| D4 | **Capabilities derived server-side per request** | `f(productRole, teacherStatus, edges)`. Never stored, never client-computed |
| D5 | **Teacher AI is a sibling context, not a fork** | One optional prompt parameter + one block builder |
| D6 | **New AI mode for authoring** — do **not** reuse `mode: 'TEACHER'` | That mode means "AI teaches a student". Overloading it makes the AI tutor the teacher |
| D7 | **Extend `isPublic` → `visibility` enum; reuse `notebookSharing` for CLASS_ONLY** | Avoids a second content system |
| D8 | **Referral, connection, enrollment are three separate edges** | A referral must never create access |
| D9 | **Monetization: Models A + B first (inbound only)** | No payouts, no KYC, no ledger |
| D10 | **Future multi-role via `productRole` + capabilities**, not an array | Capabilities already absorb it; no claim migration |

---

## 3. Data model

### Concept classification

| Concept | Category | Store | Status |
|---|---|---|---|
| User | Identity | Firebase Auth + `users/{uid}` | ✅ |
| `productRole` | Identity | Custom claim (authority) | ✅ |
| studentProfile | Profile | `users/{uid}/profile/onboarding` | ✅ |
| teacherProfile | Profile | `teacherProfiles/{uid}` | 🔴 |
| `teacherStatus` | Authorization | `teacherProfiles/{uid}` field | 🔴 |
| capabilities | Authorization | Derived, never stored | 🔴 |
| organization | Identity | — | 🔴 **not in scope** |
| class/cohort | Relationship | `classes/{classId}` | 🔴 |
| enrollment | Relationship | `classMembers/{classId}_{uid}` | 🔴 |
| connection | Relationship | `connections` | ✅ reuse |
| referral | Reward | `referrals/{a}_{b}` | 🔴 |
| invitation | Relationship | embedded as edge `status` | 🔴 |
| publishedContent | Content | `published_assets` | 🟡 extend |
| entitlement | Monetization | `entitlementGrants/{id}` | 🔴 |

### Collections

| Collection | Owner | Read | Write | Delete |
|---|---|---|---|---|
| `users/{uid}` ✅ | self | self, admin | **backend only** | never |
| `users/{uid}/profile/onboarding` ✅ | self | self, admin | backend | never |
| `teacherProfiles/{uid}` 🔴 | self | self, admin; **public subset** if `visibility=public` | backend (`teacherStatus` **admin-only**) | never |
| `classes/{classId}` 🔴 | `ownerUid` | owner, active members | backend | soft only |
| `classMembers/{classId}_{uid}` 🔴 | system | owner, the member | **backend only** | soft only |
| `connections` ✅ | both | participants | backend | — |
| `referrals/{a}_{b}` 🔴 | system | participants | **backend only** | never |
| `referralCodes/{code}` 🔴 | owner | owner | backend | never |
| `entitlementGrants/{id}` 🔴 | subject | subject, admin | **backend only** | never |
| `rewardRules/{id}` 🔴 | platform | backend | **admin only** | — |
| `published_assets` 🟡 | `userId` | per `visibility` | backend | owner (soft) |

**Backend-only, no exceptions:** `teacherStatus`, all membership transitions, all referral
transitions, all entitlement grants. Composite ids (`{classId}_{uid}`, `{referrer}_{referred}`)
make duplicates structurally impossible.

---

## 4. Relationship model

### teacherStatus

| Capability | pending | active | suspended | rejected |
|---|---|---|---|---|
| Create/edit teacher profile | ✅ | ✅ | ✅ read-only | ✅ |
| Use AI (all student-grade features) | ✅ | ✅ | ✅ | ✅ |
| Create private content / drafts | ✅ | ✅ | ✅ read-only | ✅ |
| Publish publicly | ❌ | ✅ | ❌ | ❌ |
| Create a class | ❌ | ✅ | ❌ | ❌ |
| Invite students | ❌ | ✅ | ❌ | ❌ |
| Accept student requests | ❌ | ✅ | ❌ | ❌ |
| Existing classes | — | ✅ | **read-only, students retained** | — |
| Peer connections | ✅ | ✅ | ❌ | ✅ |
| Earn | ❌ | ✅ | ❌ | ❌ |

**Suspension never orphans students** — existing classes become read-only rather than vanishing.
A rejected teacher keeps full student-grade access; they simply are not a teacher.

### Enrollment state machine

```
                    NONE
             ┌───────┴────────┐
  teacher invites        student requests
             ↓                ↓
        INVITED           REQUESTED
        ↓      ↓          ↓        ↓
   accepted declined  accepted  rejected
        ↓      ↓          ↓        ↓
     ACTIVE  DECLINED  ACTIVE   REJECTED
        │
   ┌────┼─────┬──────────┐
  left removed blocked  class archived
   ↓     ↓       ↓          ↓
  LEFT REMOVED BLOCKED  ARCHIVED
```

**Only `ACTIVE` grants data access.** `INVITED`/`REQUESTED` grant nothing — this is what makes an
un-accepted invitation harmless. Terminal states are retained (not deleted) for audit; re-invite
creates a new transition on the same composite id.

**Blocking is symmetric and terminal**: either party may block; blocked pairs cannot be re-invited.

### Why connection ≠ enrollment — **VALIDATED**

| | connection | enrollment |
|---|---|---|
| Symmetry | peer ↔ peer | teacher → student |
| Grants | collaboration | scoped learning-data visibility |
| Container | none | a class |
| Revocation | either | either, plus class archival |

Merging them would mean accepting a peer request silently exposes learning data. **Reject the merge.**

---

## 5. Authorization & privacy model

### What a teacher can see about a student

| Student relationship | Visible |
|---|---|
| 1 · Any student | **Nothing.** Not name, not existence. No enumeration endpoint |
| 2 · Connected (peer) | Public profile only — same as any user |
| 3 · Requested enrollment | Display name + the fields the student chose to include in the request. Nothing else |
| 4 · Accepted / 5 · In class | Name, avatar, **class-scoped** progress, assignment/assessment results **for that class**, participation |
| 6 · Left class | **Access ends immediately.** Retains only prior submitted work for that class, frozen; no ongoing progress |

**Never visible at any level:** private AI conversations, notebooks outside the class, private
study history, personal contact details, other classes, platform-wide analytics.

### What a student sees about a teacher
Public profile (name, subjects, boards, bio, `teacherStatus` badge), class content, class
announcements. Never: teacher earnings, other classes, other students' data, private drafts.

### Authorization matrix

| Resource | Student | Teacher | Admin |
|---|---|---|---|
| Own profile | RW self | RW self | R |
| Teacher profile | R public | RW own (**not** `teacherStatus`) | RW |
| Own content | RW | RW | R |
| Class | R if `ACTIVE` | RW if owner | RW |
| Class members | R if `ACTIVE` | R if owner | RW |
| Student progress | self | **`ACTIVE` edge, class-scoped only** | R |
| Connection | RW own | RW own | R |
| Referral | R own | R own | RW |
| Entitlement | R own | R own | RW |
| Payments | R own | R own | R |

### Where `requireProductRole` applies 🔴 (currently zero routes)

**Apply** to the entire `/api/teacher/*` and `/api/classes/*` namespaces —
`requireAuth` → `requireProductRole('teacher')` → capability check → ownership check.

**Do not apply** to shared surfaces: chat, notebooks, podcasts, connections, discussions, search,
notifications, payments. Teachers are learners too; gating shared features would contradict the
ecosystem model.

**Frontend role detection is never authorization.** The ID token verified server-side is the only
authority.

---

## 6. AI model

Existing ✅: `studentContext.aggregateContext(uid)` → `{profile, memory, analytics, stats}` →
`buildScholarlySystemPrompt({ studentContext })` → `buildStudentContextBlock()`.

Proposed ⚠️ — sibling, not a fork:
```
teacherContext.aggregateContext(uid) → { profile, subjects, boards, classesTaught,
                                          exams, languages, teachingStyle, publishedStats }
   → buildScholarlySystemPrompt({ teacherContext }) → buildTeacherContextBlock()
```

**New mode required.** `mode: 'TEACHER'` already means *AI-teaches-a-student*. Authoring needs a
distinct mode (e.g. `AUTHORING`) or the assistant will tutor the teacher instead of helping them
build.

| Teacher AI feature | Reuses | New |
|---|---|---|
| Content generation | RAG, agents, streaming ✅ | teacher context block |
| Lesson planning | planner ✅ | teacher-scoped prompt |
| Question generation | `questions.service` ✅ | class targeting |
| Assessment generation | `tests`/`baselineAssessment` ✅ | authoring entry |
| Class analytics | `analytics` 🟡 | **edge-scoped aggregation** |
| Student feedback | AI pipeline ✅ | class-scoped input |

**Class analytics must aggregate over `ACTIVE` edges only** — never a platform-wide query. This is
the single place where an implementation slip silently becomes a privacy breach.

---

## 7. Content model

```
visibility: 'PRIVATE' | 'CLASS_ONLY' | 'PUBLIC'
```

| Level | Mechanism | Status |
|---|---|---|
| PRIVATE | notebook ownership | ✅ exists |
| CLASS_ONLY | `notebookSharing.shareWithUser(..., 'viewer')` driven by `ACTIVE` edges | 🟡 reuse |
| PUBLIC | `published_assets.isPublic` | 🟡 extend to enum |

`publishAsset()` currently hardcodes `isPublic: true` — publishing means public, full stop.
Migration: keep `isPublic` as a derived mirror (`visibility === 'PUBLIC'`) so existing queries
(`where('isPublic','==',true)`) keep working. Additive, no backfill risk.

**Unpublish** = flip visibility; never delete.
🔴 **`generateSecureShareLink` is mocked** — do not build class sharing on it until real.

---

## 8. Referral / reward model

```
referral click → registration → attribution → qualification → reward
        (separate from)
teacher invitation → student acceptance → enrollment
```

State machine: `invited → registered → verified → onboarding_complete → qualified → rewarded`,
plus terminal `rejected`. **Reward only at `qualified`.** Every transition server-derived.

### Entitlement abstraction (config-as-data)
```ts
RewardRule { id, trigger:'referral_qualified', audience:'referrer'|'referred',
             referredRole?, grants: EntitlementGrant[], active }
EntitlementGrant { type, amount, expiresInDays? }
```
Amounts live in config, never in referral logic. Kill-switch = `active:false`. Teacher→teacher
tiering is a rule-table lookup on `referredRole`, not a branch in code. **No second wallet** —
grants extend the existing subscription/entitlement surface.

### Anti-abuse

| Attack | Defence |
|---|---|
| Self-referral | `referrerUid === referredUid` rejected at bootstrap |
| Duplicate | composite doc id |
| Repeated claim | transactional status transition |
| Client manipulation | amount never accepted from client |
| Fake accounts | qualification needs verified email **+** completed onboarding |
| Link-click farming | `invited` grants nothing |
| Referral loops | A→B→A blocked by pair uniqueness + acyclic check |
| Account farming | rate-limit per referrer; anomaly review |
| Same payment method | ⚠️ only detectable once payments exist — defer |
| Multiple devices | ⚠️ device fingerprinting **not recommended** (privacy cost > benefit) |

The real defence is that qualification requires completing onboarding — a genuine per-account cost.

---

## 9. Monetization model

| Model | Complexity | Benefit | Compliance | Fraud | Razorpay needs | Payouts/KYC |
|---|---|---|---|---|---|---|
| **A** Student subscription | Low ✅ exists | Direct | Low | Low | Current | **No** |
| **B** Teacher Pro | Low ✅ rails | Direct | Low | Low | Current + plan | **No** |
| C Student→teacher direct | High | Indirect | **GST, invoicing** | Medium | Payouts | **Yes** |
| D Platform collects, pays teacher | **Very high** | High | **KYC, AML, tax** | High | Payouts + Route | **Yes** |
| E Teacher earns from subs | Medium | High | Rev-share accounting | Medium | Payouts | **Yes** |

**Recommendation: A + B for first release.** Both run on the existing inbound Razorpay flow
(`/order`, `/verify`, signature-verified `/webhook`) with a new plan and entitlements. Zero payout
infrastructure, zero KYC, zero ledger.

### Business model
1. **Student subscription + Teacher Pro + premium AI tools** ← recommended
2. Marketplace commission — highest ceiling, requires the full payouts/KYC programme
3. Institutional/B2B — needs an org model that does not exist

Model 1 monetizes both sides with infrastructure already built, and does not gate the growth loop
behind compliance work.

---

## 10. Onboarding flows

**Student** ✅ (unchanged): signup → role → auth → `productRole` → `/onboarding` → baseline →
digital twin → `/dashboard`

**Teacher** ⚠️: signup → role → auth → `productRole` → `/teacher/onboarding` (subjects, boards,
classes taught, exams, languages, teaching style) → `teacherProfiles/{uid}` +
`teacherStatus:'pending'` → teacher context init → `/teach`

**Constraint (Phase 1.5):** one route, **internal step state**, no sub-routes — mirroring
`Onboarding.tsx`, which is why it is immune to `key={location.pathname}`.

**Field discipline:** six fields only. Location and availability are **not collected** — no
feature consumes them, and unused PII is a liability. Qualifications belong to verification, not
onboarding.

---

## 11. Sign-in & security model

**One sign-in page. No role selector.** ✅ already true.
```
Google | Email/password | GitHub → Firebase → UID → ID token → productRole → role-aware landing
```
All three providers behave identically — the role is a property of the account, not the method.

> **⚠️ LOAD-BEARING:** signup role selection survives OAuth **only because `signInWithPopup` keeps
> the SPA mounted**. `signInWithRedirect` would unmount the component and silently turn every
> teacher signup into a role-less account. Documented in `Signup.tsx`; must persist the role
> outside component state before any change.

### Firestore rules strategy
Deny-by-default is already the posture ✅ — every client rule is `allow write: if false` with a
catch-all `allow read, write: if false`. **All sensitive relationship writes stay backend-mediated
via Admin SDK.**

🔴 **Fix required:** `firestore.rules:109` declares `match /study_groups/{doc}` but the code writes
`collection('studyGroups')`. The rule never matches; the collection falls to deny-all. Fail-closed,
but dead and misleading. `connections` has no rule at all. **Correct the name and add explicit
deny-with-comment rules** so the intent is legible.

---

## 12. API plan (proposed, not implemented)

```
IDENTITY      POST /users/bootstrap ✅      GET /users/me ✅      GET /users/capabilities 🔴
PROFILE       POST|GET /teacher/profile     GET /teacher/profile/:uid (public subset)
              POST /admin/teacher/:uid/status          (admin)
              POST /admin/users/:uid/product-role      (admin — fixes the immutable-role dead end)
CLASSES       POST /classes   GET /classes/:id   PATCH /classes/:id   POST /classes/:id/archive
ENROLLMENT    POST /classes/:id/invitations           (teacher)
              POST /enrollments/:id/accept|decline     (student)
              POST /classes/:id/requests               (student)
              POST /requests/:id/accept|reject         (teacher)
              POST /enrollments/:id/leave|remove|block
CONNECTION    reuse existing /connections ✅
CONTENT       POST /teacher/content   PATCH /teacher/content/:id/visibility
              POST /teacher/content/:id/share-to-class
ANALYTICS     GET /classes/:id/analytics               (owner, edge-scoped)
REWARDS       GET /referral/me   GET /referral/list   GET /entitlements/me
```
Every teacher route: `requireAuth` → `requireProductRole('teacher')` → capability → ownership.
No endpoint accepts a reward amount. No endpoint enumerates students.

---

## 13. Phase roadmap (reordered on evidence)

```
2A  Teacher onboarding + teacherProfiles + teacherStatus + rules      ← self-contained
2B  Teacher AI context (sibling service, new AUTHORING mode)
2C  Capabilities + APPLY requireProductRole + rules fix               ← BEFORE any teacher UI
2D  Teacher dashboard (replaces placeholder)
2E  Classes + membership WITH invite/accept handshake                 ← consent gate
2F  Student invitation/enrollment UI
2G  Content visibility enum + class sharing
2H  Peer connections (reuse connection.service)
2I  Referral + entitlements
2J  Monetization (A + B only)
```

**Changed from your candidate order:** 2C moved ahead of the dashboard — shipping teacher UI
before enforcement means the first teacher-only endpoint ships unguarded. 2E explicitly carries
the consent handshake, since it gates every later data-access feature. 2G depends on 2E (a class
must exist before CLASS_ONLY means anything).

**Dependencies:** 2B←2A · 2C←2A · 2D←2C · 2E←2C · 2F←2E · 2G←2E · 2I←2C · 2J←2I. Independent: 2H.

---

## 14. Testing matrix

**Auth** — student Google signup · teacher Google signup · email/password both roles · GitHub ·
existing student signin · existing teacher signin · role-less account → `/select-role` ·
duplicate role attempt → 409 surfaced · claims-loading (no dashboard flash)

**Authorization** — student → teacher API = **403** · teacher → teacher API = 200 ·
unauthenticated = **401** · teacher reads non-enrolled student = **403** ·
**teacher enumerates students = no endpoint exists** · pending teacher creates class = 403 ·
pending teacher authors = 200 · suspended teacher's class = read-only, students retained

**Relationships** — invite/accept/decline/request/reject/leave/remove/block · re-invite after
block = rejected · access ends on leave · `INVITED` grants no data

**Referral** — self-referral rejected · duplicate rejected · loop A→B→A rejected ·
reward only at `qualified` · **referral never creates an enrollment or connection** (explicit
privacy test) · double-qualify grants once

**Content** — PRIVATE invisible to class · CLASS_ONLY visible only to `ACTIVE` · PUBLIC visible to
all · unpublish revokes · leaving revokes CLASS_ONLY

**Regression** — student dashboard, onboarding, baseline, AI, community, groups, admin auth,
`admin@scholarly.ai` retains `{"role":"super_admin"}`

**Rules** — client writes to `teacherProfiles.teacherStatus`, `classMembers`, `referrals`,
`entitlementGrants` all **fail**

**Baselines** — backend 126, frontend 96 pre-existing type errors. Report deltas.

---

## 15. Gap analysis & risks

| Component | Status |
|---|---|
| Firebase Auth, productRole, bootstrap, claims | **EXISTS** ✅ |
| Role-aware routing (Phase 1) | **EXISTS** ✅ |
| `connection.service` (peers + handshake pattern) | **REUSABLE** ✅ |
| `featureFlag`, `payments`, auth middleware, rules posture | **REUSABLE** ✅ |
| `Onboarding.tsx` wizard architecture | **REUSABLE** ✅ |
| AI context pipeline | **EXTEND** 🟡 |
| `published_assets` visibility | **EXTEND** 🟡 |
| `notebookSharing` (CLASS_ONLY) | **EXTEND** 🟡 |
| `studyGroup` as classes | **BLOCKED** 🔴 — consent-free `addMember` |
| `generateSecureShareLink` | **BLOCKED** 🔴 — mocked |
| teacherProfile, teacherStatus, capabilities, classes, enrollment, referral, entitlements | **NEW** 🔴 |
| `requireProductRole` applied | **NEW** 🔴 — zero routes today |
| Org/institute model | **NEW** 🔴 — out of scope |
| Payouts / KYC | **BLOCKED** 🔴 — compliance programme |

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Consent-free enrollment | **CRITICAL** | Handshake in 2E before any access feature |
| Teacher UI before enforcement | **HIGH** | 2C precedes 2D |
| Class analytics querying platform-wide | **HIGH** | Edge-scoped aggregation + explicit test |
| Referral→enrollment conflation | **HIGH** | Separate domains + privacy test |
| Rules undeployed / name mismatch | **HIGH** | Fix + verify deployment in 2A |
| Leaked credentials in Git history | **CRITICAL (open)** | Rotate — unrelated to this phase but still open |
| `signInWithPopup` fragility | **MEDIUM** | Documented; persist role before any OAuth change |
| Monetization compliance underestimated | **MEDIUM** | A + B only |
| Immutable `productRole`, no admin fix | **MEDIUM** | Admin endpoint in 2C |

---

## 16. Open product decisions

**D-1 · Discovery model — ✅ RESOLVED 2026-08-12: HYBRID**
Public teacher profile → student requests → teacher accepts, alongside teacher-initiated invites.
Consent required in both directions. Request→accept reuses the invitation state machine (§4), so
it adds no new machinery.
*Consequences for 2A:* `teacherProfiles/{uid}` ships with a `visibility` field and a defined
**public subset** (name, subjects, boards, bio, `teacherStatus` badge — never contact details or
student lists). The `REQUESTED` branch of the enrolment state machine is in scope for 2E.

**D-2 · `pending` teacher scope — ✅ RESOLVED 2026-08-12: AUTHOR ONLY**
Pending teachers get profile, drafts, AI, and peer connections immediately. They cannot create
classes, invite students, or publish publicly until `active`.
*Consequences for 2A:* `teacherStatus` defaults to `'pending'` on profile creation and is
**admin-write-only**. The capability table in §4 is normative — 2C derives `canAuthor` from
`productRole === 'teacher'` alone, and `canCreateClass`/`canMentor` from
`teacherStatus === 'active'`. Verification never blocks platform access.

**D-3 · What does verification actually check, and who performs it?**
No recommendation — this is policy, not architecture. It determines whether 2A ships with a manual
admin queue or an automated path. **Blocks nothing in 2A** if the answer is "manual for now."

**D-4 · Reward currency for referrals**
AI credits · premium days · generation quota · subscription discount.
**Recommend AI credits** — meters the cost you actually incur and needs no billing change.
*Note: granting is not metering; consumption enforcement is separate work.*

**D-5 · Is monetization in scope this year?**
Determines whether 2J is ever reached, and whether teacher Pro should be designed into 2A's
profile schema now rather than retrofitted.

**D-6 · Class content licensing** — when a teacher publishes PUBLIC content, who owns it and can
it be used to train/ground platform AI? **Must be answered before 2G ships**, not after.

---

**STOP — awaiting explicit approval. Nothing modified.**
