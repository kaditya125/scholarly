# Teacher Ecosystem — Audit & Implementation Proposal

**Status:** PROPOSAL — awaiting approval. **No code modified.**
**Date:** 2026-08-12 · **Branch:** `feature/role-foundation-phase0-2`
**Supersedes the "teachers cannot earn" positioning in `TEACHER_STUDENT_FINAL_ARCHITECTURE.md` §9.**

Legend: ✅ shipped & verified · 🟡 partial · 🔴 absent · ⛔ blocked on an external dependency

---

## A. Current capability matrix

Verified by reading the working tree, not the architecture docs (which are out of date in both
directions — they mark `teacherProfiles` as missing when it shipped, and describe verification
as designed when it does not exist).

| Capability | Evidence | Status |
|---|---|---|
| Firebase Auth, `productRole` claim, `/users/bootstrap` | `middlewares/auth.ts`, Signup.tsx | ✅ |
| `requireAuth` / `requireProductRole` / `enforceSelf` / `isAdmin` | `middlewares/auth.ts:16,36,66,86` | ✅ |
| Firestore rules, deny-by-default | `firestore.rules` | ✅ |
| Teacher profile + `GET\|POST /api/teacher/profile` | `teacher.routes.ts`, `teacherProfile.service.ts` | ✅ |
| `teacherStatus` (4 states, server-controlled) | `types/teacher.ts` | 🟡 no transitions exist |
| Teacher onboarding wizard (8 steps, single route) | `TeacherOnboarding.tsx` | ✅ |
| Peer connections — request/accept/decline/block/follow | `connections.routes.ts` (13 endpoints) | ✅ |
| Razorpay **inbound** — order, verify, signed webhook | `payments.routes.ts`, `payments.service.ts` | ✅ |
| Order records `payments/{orderId}` | `payments.service.ts` | ✅ |
| Notifications (read/mark/archive) | `notifications.routes.ts` | ✅ |
| Storage uploads (multer → Firebase Storage, 25 MB) | `uploads.routes.ts` | ✅ |
| AI: Gemini/OpenAI/Groq, RAG, notebooks, question-gen, TTS podcasts | mounted routes + deps | ✅ |
| Tests: adaptive generation, attempts, submission | `tests.routes.ts` | ✅ **self-scoped only** |
| Analytics | `analytics.routes.ts` | ✅ student-scoped |
| Published assets | `publishedAssets.service.ts` | 🟡 `isPublic: true` hardcoded |
| Study groups | `studyGroup.service.ts` | 🟡 **unusable for enrolment** — see D-1 |
| Teacher AI context / authoring mode | grep: zero hits | 🔴 |
| Classes / batches / enrolment / invitations | grep: zero hits | 🔴 |
| Teacher dashboard | `/teach` is a self-described placeholder | 🔴 |
| Admin teacher review (status transitions) | no endpoint, no admin UI | 🔴 |
| Referral / rewards / entitlements | grep: zero hits | 🔴 |
| **Teacher payouts / KYC / commission / settlement** | grep for payout·kyc·transfer·settlement·route: **zero** | ⛔ |
| **Live video infrastructure** | Twilio is **SMS only** (`env.ts:66` "Twilio SMS") | ⛔ |

### Four pre-existing defects found during the audit

1. **`firestore.rules` study-group rule is dead.** Rules declare `match /study_groups/{doc}`;
   code writes `db.collection('studyGroups')` in three repositories
   (`studyGroup.repository.ts:5`, `groupChannel.repository.ts:13`, `studyCircle.repository.ts:12`).
   The rule never matches, so the collection falls through to deny-all. Fail-closed, but dead and
   misleading.
2. **`connections` has no rule at all** — also deny-all by default, but undocumented.
3. **`studyGroup.addMember(groupId, ownerId, targetUserId, role)`** is a consent-free direct add.
4. **`POST /tests/attempts/:attemptId/submit`** carries no `enforceSelf` or ownership guard in the
   route definition, unlike its siblings. Worth confirming the controller checks it.

---

## B. Reusable infrastructure

Reuse these rather than rebuilding — each already carries the security properties we need.

| Need | Reuse | Why |
|---|---|---|
| Consent handshake for enrolment | **`connection.service` pattern** | Already models request → accept/decline/block with `pending`/`accepted`. Copy the *pattern*, not the collection (D-1). |
| Paid class checkout | **Razorpay `/order` + `/verify` + signed `/webhook`** | Amount is already computed server-side and never trusted from the client. Extend from plan-based to item-based orders. |
| Money record | **`payments/{orderId}`** | Already stores userId, amount, status, provider ids. Extend with an `orderType` discriminator. |
| Class announcements | **notifications service** | Delivery + read state already exist. |
| Resource files | **uploads → Firebase Storage** | 25 MB cap, memory-buffered, already wired. |
| Resource text extraction / indexing | **notebooks pipeline** (pdf-parse, mammoth, tesseract, chunk, embed, Pinecone) | The single most valuable existing asset. Class resources should be notebooks under the hood. |
| Test generation & attempts | **tests / questions / quiz services** | Needs class scoping added, not a rewrite. |
| Teacher AI drafting | **chat + RAG + agents** | Needs a `teacherContext` sibling + new authoring mode. |
| Authorization | **`requireProductRole`** | Already written and applied on `/api/teacher/*`. Extend to `/api/classes/*`. |

---

## C. New infrastructure required

| Area | What's needed | Notes |
|---|---|---|
| Verification | State machine + admin transitions + audit trail | Replaces the interim auto-approve. |
| Capabilities | `f(productRole, teacherStatus, edges)` derived per request | Never stored, never client-computed. |
| Classes | `classes` + lifecycle | New collection. |
| Enrolment | `classEnrollments` with composite id + state machine | **The consent gate.** |
| Invitations | `classInvitations` (link/code) | Grants nothing until accepted. |
| Syllabus | Nested topic tree with progress | Can live on the class doc initially. |
| Resources | `classResources` pointing at notebooks/storage | Plus provenance metadata (§21). |
| Class tests | Scope existing tests to a class | Extends, not replaces. |
| Earnings ledger | `teacherEarnings` — append-only | Every entry immutable; reversals are new entries. |
| Payouts | `teacherPayouts` + settlement state machine | ⛔ money-out leg blocked, see G. |
| Financial profile | `teacherPayoutProfiles` | Sensitive; never client-readable. |
| Referrals | `referrals` + `rewardRules` + `entitlementGrants` | Config-as-data, no hardcoded amounts. |
| Live classes | `classSessions` + **provider abstraction** | ⛔ no provider exists, see G. |

---

## D. Data model proposal

```
teacherProfiles/{uid}                      ✅ exists — extend
  + photoURL, location?, teachingMode, intendsToMonetize
  + verification: { state, submittedAt, reviewedAt, reviewedBy, notes }

classes/{classId}                          🔴 new
  ownerUid, title, description, subject, grade, board, exam, language,
  syllabus[], startDate, endDate, schedule, mode, capacity,
  pricing: { type: 'free'|'paid', amountINR, currency },
  status: draft|published|active|completed|archived,
  counts: { enrolled }        // denormalised, backend-only

classEnrollments/{classId}_{uid}           🔴 new — COMPOSITE ID
  state: INVITED|REQUESTED|ACTIVE|LEFT|REMOVED|BLOCKED|REFUNDED
  source: invitation|purchase|request
  orderId?                    // links to payments/{orderId} when paid
  Only ACTIVE grants any data access.

classInvitations/{code}                    🔴 new
  classId, createdBy, expiresAt, maxUses, uses
  Grants NOTHING. Resolving a code only renders a landing view.

classResources/{id}                        🔴 new
  classId, kind, storagePath|notebookId,
  provenance: { createdBy, source: platform_generated|teacher_authored|
                teacher_uploaded|student_created|licensed,
                generatedBy?, publishedBy? }     // §21 — no blanket ownership claim

teacherEarnings/{entryId}                  🔴 new — APPEND-ONLY LEDGER
  teacherUid, classId, orderId, type: sale|commission|tax|refund|adjustment,
  amountPaise (signed), state: pending|eligible|processing|paid|failed|reversed,
  createdAt
  Balance is derived by summing, never stored as a mutable field.

teacherPayouts/{payoutId}                  🔴 new
  teacherUid, entryIds[], grossPaise, deductionsPaise, netPaise,
  state, providerRef, createdAt

teacherPayoutProfiles/{uid}                🔴 new — SENSITIVE
  kycState, providerAccountRef
  ⚠ Store provider references, NOT raw bank/PAN values, wherever the provider allows.

rewardRules/{id} · referrals/{a}_{b} · entitlementGrants/{id}   🔴 new
  Amounts live in rewardRules (config-as-data). Kill switch = active:false.

classSessions/{id}                         🔴 new — ⛔ provider TBD
  classId, scheduledAt, topic, providerRoomRef, recordingRef?, state
```

**Firestore rules for every new collection: `allow write: if false`.** All transitions go through
the Admin SDK. Composite ids (`{classId}_{uid}`, `{referrer}_{referred}`) make duplicates
structurally impossible.

---

## E. API proposal

```
CLASSES     POST   /api/classes                       (teacher, owner)
            GET    /api/classes/mine                  (teacher)
            GET    /api/classes/:id                   (owner | ACTIVE member | public if published)
            PATCH  /api/classes/:id                   (owner, draft-only for pricing)
            POST   /api/classes/:id/publish|archive

INVITES     POST   /api/classes/:id/invitations       (teacher) → code + link
            GET    /api/invitations/:code             (public, read-only preview)
            POST   /api/invitations/:code/accept      (student — free classes only)

ENROLMENT   POST   /api/classes/:id/requests          (student)
            POST   /api/enrollments/:id/accept|reject (teacher)
            POST   /api/enrollments/:id/leave|remove

PURCHASE    POST   /api/classes/:id/order             (student) → Razorpay order
            (verification + enrolment happen in the existing signed webhook, never client-side)

RESOURCES   POST   /api/classes/:id/resources         (teacher)
            GET    /api/classes/:id/resources         (ACTIVE member | owner)

TESTS       POST   /api/classes/:id/tests             (teacher)
            GET    /api/classes/:id/tests/:tid/results (owner, class-scoped aggregate)

COMMS       POST   /api/classes/:id/announcements     (teacher)

EARNINGS    GET    /api/teacher/earnings              (self only)
            GET    /api/teacher/payouts               (self only)

ADMIN       POST   /api/admin/teacher/:uid/status     (admin only — verification transitions)
```

Every teacher route: `requireAuth` → `requireProductRole('teacher')` → capability → ownership.
**No endpoint enumerates students. No endpoint accepts an amount, a commission or a payout state.**

---

## F. Security model

The governing rule is unchanged and must stay structurally enforced:

> **Role never grants access to a person. Only an edge the other party accepted does.**

| Relationship | Teacher can see |
|---|---|
| Any student | **Nothing.** No enumeration endpoint exists. |
| Invited / requested | Display name only. No academic data. |
| **ACTIVE in my class** | Name, attendance, work assigned *by me*, test results *for my class*, topic mastery *for my syllabus* |
| Left / removed | Access ends immediately; prior submitted work frozen |

**Never visible at any level:** private AI conversations, notebooks outside the class, other
classes, platform-wide analytics, contact details, payment methods.

Hard invariants:
- Teachers cannot write `teacherStatus`, any enrolment state, any ledger entry, any payout state,
  or any commission value. All are Admin-SDK only.
- Class analytics aggregate **only over ACTIVE edges** — never a platform-wide query. This is the
  one place where an implementation slip becomes a privacy breach rather than a bug.
- `submitTestAttempt` ownership must be confirmed before class tests ship (defect 4).

---

## G. Payment & earning flow — and the two hard blockers

### The flow (money in)

```
Student → POST /api/classes/:id/order
  → server computes amount FROM THE CLASS DOC (never from the request)
  → Razorpay order created, recorded in payments/{orderId} with orderType:'class_purchase'
  → student pays in Razorpay's window
  → signed webhook arrives
  → [transaction] enrolment → ACTIVE, ledger entries written:
        + sale        (gross)
        − commission  (from config)
        − taxes/fees  (from config)
  → student gets access
```

Money-in is genuinely achievable by extending what exists. **This is the part I recommend
building.**

### ⛔ Blocker 1 — payouts are not a code problem

There is no payout code because Razorpay payouts are a **different product**: RazorpayX (or Route
for marketplace splits), with separate onboarding, separate credentials, and a business-entity
prerequisite. Before a single line is useful you need:

- a registered legal entity with PAN
- RazorpayX / Route approval on that entity
- a decision on **whether Scholarly is the principal or the agent** in the sale — this single
  choice determines GST treatment, invoicing obligations and TDS handling, and it is a question
  for your CA, not something I should assume
- a written commission and refund policy

**What I can build without any of that:** the full earnings ledger, commission/tax calculation
driven by config, and the settlement state machine (`pending → eligible → processing → paid`).
That is real, auditable work and it de-risks everything downstream. The final `processing → paid`
call is the only step that needs the provider.

**⚠ Important consequence:** if you sell classes before payouts work, you are holding money owed
to teachers. That is a payable and must be disclosed to teachers up front with a stated payout
start date. I would not ship paid classes silently ahead of the payout rail.

### ⛔ Blocker 2 — there is no video infrastructure

Twilio in this repo is **SMS only** (`env.ts:66`). There is no Agora, LiveKit, 100ms, Daily, Zoom
or Jitsi integration anywhere. Live classes therefore need a provider decision (cost, recording,
India latency, student device support) followed by an abstraction layer so the product is not
welded to one vendor. This is the single most expensive item in the whole plan and I have
sequenced it last.

---

## H / I / J. Key flows

**Teacher onboarding** — extend the existing single-route wizard. Add photo, location (optional),
teaching mode, and "do you intend to run paid batches?" (which routes them toward the payout
profile later). Do not add KYC fields until payouts are real.

**Verification** — replace the interim auto-approve with a real state machine
(`draft → pending → under_review → approved | rejected | suspended`), an admin transition endpoint,
and an audit trail. Keep auto-approve available **behind an explicit config flag** for development,
clearly named so it can never be mistaken for genuine verification. The UI must not say "Verified"
unless `approved` was reached through a real review.

**Student enrolment** — invitation and purchase are the only two paths to `ACTIVE`. A referral is
neither. Opening an invite link renders a preview and nothing else.

---

## K. Implementation phases

Reordered from your list on evidence. Enforcement precedes UI; consent precedes data access;
external dependencies are pushed late.

| Phase | Scope | Depends on | Risk |
|---|---|---|---|
| **3A** | Verification state machine + admin transitions + audit | — | Low |
| **3B** | Capabilities layer; apply `requireProductRole` to new namespaces; **fix the `study_groups` rule name** | 3A | Low |
| **3C** | Teacher workspace shell + real dashboard data | 3B | Low |
| **3D** | Classes CRUD, draft → published, syllabus | 3B | Medium |
| **3E** | Invitations + enrolment handshake (**the consent gate**) | 3D | **High** |
| **3F** | Resources (on the notebooks pipeline) + provenance metadata | 3D | Medium |
| **3G** | Class-scoped tests + class-scoped analytics | 3E | **High** (privacy) |
| **3H** | Announcements + class discussion | 3E | Low |
| **3I** | Paid classes: item orders + **earnings ledger accrual** | 3E | **High** (money) |
| **3J** | Payout profile + settlement state machine | 3I | ⛔ external |
| **3K** | Payout execution | 3J | ⛔ external |
| **3L** | Referral + entitlements | 3B | Medium |
| **3M** | Live classes (provider decision → abstraction → sessions) | 3D | ⛔ external |
| **3N** | Landing page updated **per phase**, not upfront | rolling | Low |

---

## L. Risks & dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| Consent-free enrolment leaks student data | **Critical** | 3E handshake lands before any data-access feature (3G) |
| Class analytics querying platform-wide | **Critical** | Edge-scoped aggregation + an explicit test that a non-enrolled student is invisible |
| Selling classes before payouts exist | **High** | Disclose a payout start date; do not ship 3I without it |
| GST/TDS treatment assumed rather than confirmed | **High** | Principal-vs-agent decision from your CA before 3I |
| Ledger mutated instead of appended | **High** | Append-only by construction; balance derived, never stored |
| Teacher UI before enforcement | **Medium** | 3B precedes 3C |
| Live-class vendor lock-in | **Medium** | Abstraction layer, never direct SDK calls in features |
| Reward amounts hardcoded | **Medium** | `rewardRules` config-as-data from day one |
| `productRole` immutable with no admin fix | **Medium** | Admin role-change endpoint in 3A |

---

## M. Files to modify / create (phases 3A–3E only)

Later phases intentionally not enumerated — they should be planned against the code as it exists
when they start, not guessed at now.

**Modify**
```
backend-firestore/src/services/teacherProfile.service.ts   verification state machine
backend-firestore/src/types/teacher.ts                     verification + new profile fields
backend-firestore/src/routes/teacher.routes.ts             earnings/classes sub-routes
backend-firestore/src/routes/index.ts                      mount /classes, /enrollments, /admin/teacher
backend-firestore/firestore.rules                          new collections (deny-write) + FIX study_groups name
frontend/src/pages/TeacherOnboarding.tsx                   new fields
frontend/src/pages/TeacherLanding.tsx                      replaced by the workspace
frontend/src/App.tsx                                       teacher routes
frontend/src/components/landing/teacherPageData.ts         status updates per phase
docs/TEACHER_STUDENT_FINAL_ARCHITECTURE.md                 §9 business-model correction
```

**Create**
```
backend-firestore/src/types/{class,enrollment,earnings}.ts
backend-firestore/src/services/{class,enrollment,invitation,capability}.service.ts
backend-firestore/src/controllers/{class,enrollment}.controller.ts
backend-firestore/src/routes/{classes,enrollments}.routes.ts
backend-firestore/src/config/monetization.ts               commission/tax config-as-data
frontend/src/pages/teacher/{Dashboard,Classes,ClassDetail,Students}.tsx
frontend/src/lib/api/classes.ts
```

---

## Open decisions I need from you

1. **Principal or agent?** Determines GST/TDS/invoicing. Needed before 3I. (CA question.)
2. **Commission percentage**, and whether it varies by class type.
3. **Refund policy for classes** — full window, pro-rata by sessions attended, or none after start?
4. **Live-class provider** — or defer 3M entirely.
5. **Verification criteria** — what is actually checked, and by whom?
6. **Do we sell classes before payouts work?** (I recommend no.)
