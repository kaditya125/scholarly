# Scholarly — Onboarding & Referral Implementation Plan

**Status:** VERIFIED PLAN — awaiting authorization. **No source, data, config, or Git state modified.**
**Date:** 2026-08-11
**Supersedes:** parts of `ONBOARDING_REFERRAL_ARCHITECTURE.md` (corrections in §3 and §8)

Legend: ✅ verified in-repo this session · ❌ verified absent · ⚠️ **not confirmed from the
current codebase** — must be checked before relying on it.

---

## ⚠️ TWO CORRECTIONS TO THE PRIOR PROPOSAL

**1. Razorpay secrets were never exposed.** The prior document stated `.env` holds
`RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`. That was inferred from `env.ts` declaring
them — not from the file. Verified: **no `RAZORPAY_*` key exists in `backend-firestore/.env`,
current or historical.** They are `z.string().optional()` in `env.ts:46-48`, and
`payments.service.ts:34` guards on `!!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)`.
**Razorpay is code-complete but unconfigured.** The security blocker is real, but it is not
a payments blocker.

**2. There is no entitlement model to reuse.** `PlanDef` is
`{ id: string; name: string; monthlyINR: number }` (`payments.service.ts:21`) — **pricing only.
No features, no limits, no quotas.** The prior instruction "reuse the existing entitlement
architecture" cannot be followed as written, because entitlements do not exist. The reward
system must *introduce* the entitlement layer. This materially increases Phase 3.

---

## 1. Current architecture

```
Frontend  React 19 · Vite · React Router 7 · TanStack Query · Tailwind v4 (dark:) · motion
Backend   Node 22 · Express 4 · TS (CommonJS) · Firebase Admin · zod · hand-rolled DI
Auth      Firebase Auth; two orthogonal claims: role (admin) + productRole (student|teacher)
Data      Firestore; rules at backend-firestore/firestore.rules
Payments  Razorpay — code complete, UNCONFIGURED
AI        studentContext.service · studentDigitalTwin.service · LearnerProfileBuilder · ContextService
```

---

## 2. Phase 0 findings

| # | Check | Finding |
|---|---|---|
| 1 | Branch / status | `feature/role-foundation-phase0-2`; **2 uncommitted**: `M frontend/src/App.tsx`, `?? docs/ONBOARDING_REFERRAL_ARCHITECTURE.md` ✅ |
| 2 | Recovery state | Clean. No stray recovered files beyond the two above ✅ |
| 3 | App.tsx remount | **CONFIRMED** — `frontend/src/App.tsx:140`: `<Routes location={location} key={location.pathname}>`. Note: line is **140**, not 117 as previously recorded ✅ |
| 4 | Firestore rules | Exist at **`backend-firestore/firestore.rules`** (not repo root). `users/{userId}`: `read: isSelf` · `create: false` · `update: isSelf && !affectedKeys().hasAny([...])` · `delete: false` ✅ |
| 5 | Rules deployed? | ⚠️ **NOT CONFIRMED.** `firebase.json` correctly targets `firestore.rules`, but deployment state cannot be read from the repo. Must run `firebase deploy --only firestore:rules` or check the console |
| 6 | Firebase Auth | `AuthContext` exposes `role`, `adminRole`, `claimsLoading`, `refreshClaims`; claims read via `getIdTokenResult(force)` ✅ |
| 7 | `productRole` | Implemented across 5 files: `types/roles.ts`, `middlewares/auth.ts`, `services/userIdentity.service.ts`, `lib/AuthContext.tsx`, `pages/SelectRole.tsx` ✅ |
| 8 | `teacherStatus` | ❌ **ABSENT** — zero occurrences in backend or frontend. Fully greenfield |
| 9 | Onboarding routes | `/select-role`:148 · `/onboarding`:153 · `/baseline-assessment`:154 · `/baseline-assessment/report`:155 · `/welcome`:156 · `/dashboard`:163 · `/assessment`:186 ✅ |
| 10 | Referral code | ❌ **ABSENT** — no referral service, model, route or UI |
| 11 | Entitlement/billing | `PLANS: Record<string, PlanDef>` with server-side `priceFor()`; amounts in paise; **pricing only, no entitlements** ✅ |
| 12 | Razorpay | Routes `/config`, `/order`, `/verify`, `/subscription`, `/history`, signature-verified `/webhook`; HMAC-SHA256 verify at `payments.service.ts:99-101`. **Unconfigured** ✅ |
| 13 | AI personalization | `services/studentContext.service.ts`, `services/studentDigitalTwin.service.ts`, `types/studentContext.types.ts`, `types/studentDigitalTwin.types.ts`, `core/producer/LearnerProfileBuilder.ts`, `core/workflow/services/ContextService.ts` ✅ |
| — | WhatsApp | `core/whatsapp/` exists: `WhatsAppConversationRouter`, `ReplyBuilder`, `StateMachine`, `SessionManager`, `ConversationContextService` ✅ — **inbound conversational**; outbound-invite capability ⚠️ not traced |

---

## 3. Security findings

### Current state: **clean**
Real `.env` files are **untracked and gitignored** (`.gitignore:2-3` → `.env`, `.env.*`).
Only `.env.example` files are tracked. ✅

### Historical exposure: **REAL**
`backend-firestore/.env` was committed and later removed.

| Commit | Role |
|---|---|
| `3c84ea8c` | Initial commit — `.env` added |
| `1f8083c6` | present |
| `6de4d79e` | present (last commit containing it) |
| `0e9b7289` | `.env` removed |

**The blobs remain reachable in history.** Removal from HEAD does not remove them from the
repository.

| Secret | Location | Tracked now | In history | Populated (len) | Risk | Recommended action |
|---|---|---|---|---|---|---|
| `FIREBASE_PRIVATE_KEY` | backend `.env` | no | **YES** | YES (1732) | **CRITICAL** — service-account private key = full Firebase admin | Rotate key in GCP IAM; delete old key |
| `PINECONE_API_KEY` | backend `.env` | no | **YES** | YES (75) | **HIGH** — vector DB read/write/delete | Rotate |
| `GEMINI_API_KEY` | backend `.env` | no | **YES** | YES (53) | **HIGH** — billable inference | Rotate |
| `GROQ_API_KEY` | backend `.env` | no | **YES** | YES (56) | **HIGH** — billable | Rotate |
| `NVIDIA_API_KEY` | backend `.env` | no | **YES** | YES (70) | **HIGH** — billable | Rotate |
| `COHERE_API_KEY` | backend `.env` | no | **YES** | YES (40) | **HIGH** — billable (rerank) | Rotate |
| `TAVILY_API_KEY` | backend `.env` | no | **YES** | YES (58) | **MEDIUM** — billable search | Rotate |
| `CRON_SECRET` | backend `.env` | no | **YES** | YES (28) | **MEDIUM** — authenticates cron endpoints | Rotate |
| `OPENAI_API_KEY` | backend `.env` | no | **YES** | YES (19) | ⚠️ **length too short for a valid key — likely placeholder.** Verify, rotate if real | Verify then rotate |
| `ANTHROPIC_API_KEY` | backend `.env` | no | **YES** | YES (22) | ⚠️ **length too short for a valid key — likely placeholder.** Verify, rotate if real | Verify then rotate |
| `GOOGLE_APPLICATION_CREDENTIALS` | backend `.env` | no | **YES** | YES (24) | LOW — a filesystem *path*, not a secret | Confirm the file it points at is untracked |
| `RAZORPAY_KEY_ID/_SECRET/_WEBHOOK_SECRET` | — | no | **NO** | **absent** | **NONE — never present** | None. Configure securely when payments go live |
| `VITE_FIREBASE_API_KEY` | `frontend/.env` | no | ⚠️ not checked | YES (39) | LOW — public by design in Firebase web SDK; security comes from rules | No rotation; rely on Firestore rules |
| `admin-dashboard/.env` | on disk | no | ⚠️ not checked | **no secret keys present** | NONE currently | — |
| AWS / ElevenLabs | — | — | — | ❌ not present | N/A | — |

### Blast radius
**⚠️ Repository visibility is NOT CONFIRMED** — `gh` was unavailable/unauthenticated. Remote is
`https://github.com/kaditya125/scholarly.git`.

- **If the repo is or ever was public** → treat all 8 confirmed-real secrets as fully
  compromised. Rotate immediately.
- **If private throughout** → exposure is limited to accounts with repo access, but rotation is
  still the correct action because history is permanent and access lists change.

**Determining visibility is the single highest-value next action.** Everything else depends on it.

### Additional finding: `node_modules` is committed
**19,499 tracked files under `node_modules/`.** Not a secret leak, but it bloats history, makes
`git ls-files` unusable for auditing, and means any future secret-scanning has to filter it.
Recommend removing from tracking (behaviour-neutral) — **requires approval**.

### Recommended sequence — **none executed, all require explicit authorization**
1. Determine repo visibility.
2. Rotate the 8 confirmed-real credentials at their providers; verify the app with new values.
3. Decide on history rewrite. **Note:** purging blobs requires `filter-repo`/BFG + force-push —
   destructive, and force-push is on your prohibited list. **Rotation alone neutralises the
   risk without touching history, and is the recommended path.**
4. Untrack `node_modules`.

---

## 4. Student onboarding flow

Reuse without forking ✅ — `Onboarding.tsx` already implements a dynamic `StepKey`/`StepDef`
wizard with conditional steps.

```
verified → /onboarding (class, board, exam, subjects, goals, prefs)
         → /baseline-assessment → report
         → AI init: studentContext.service + studentDigitalTwin.service
         → /invite (skippable) → /setup-complete → /dashboard
```

---

## 5. Teacher onboarding flow

Greenfield (`teacherStatus` absent ❌). Shares the `StepDef` engine; role-specific steps only.

```
verified → /teacher/onboarding (subjects, board, exams, quals, experience,
                                specialization, bio, interests, goals)
         → teacherProfiles/{uid} created, teacherStatus = 'pending'
         → /invite (skippable) → /setup-complete → /teach
```

**Per your decision: `pending` never blocks entry.** A pending teacher retains `canAuthor` and
uses Scholarly immediately. Verification gates `canMentor`, not access.

> **⚠️ NAMING TRAP:** `core/agents/TeacherAgent.ts` is the **AI teaching persona**, not a user
> role. 77 files match "teacher"; nearly all are prompt/persona code. Do not mistake it for
> teacher-as-a-user.

---

## 6. Referral flow

```
/signup?ref=CODE
   └─ code → sessionStorage (never trusted; never carries a reward amount)
POST /api/users/bootstrap { role, referralCode? }
   └─ server: code → referrerUid; reject self-referral; create referrals doc @ 'registered'
email verified            → 'verified'
onboardingStatus complete → 'onboarding_complete' → 'qualified'
qualified                 → grant entitlements to BOTH parties → 'rewarded'
```

Invite methods — **verified feasibility**:

| Method | Status |
|---|---|
| Copy referral link / code | ✅ buildable now |
| WhatsApp share (`wa.me` deep link) | ✅ buildable now, client-side |
| Native share (`navigator.share`) | ✅ buildable now |
| Outbound WhatsApp via existing infra | ⚠️ inbound router exists; outbound-send **not traced** |
| **Email invitation** | 🔴 **BLOCKED** — `EmailNotificationService.ts:17-46` falls back to an Ethereal **mock** inbox when `SMTP_HOST` is unset, and it is unset. A "sent" invite reaches nobody |

Ship the four working methods. Surface the email gap honestly — never a button that silently fails.
**Firebase verification email is unaffected** — Firebase sends it from its own infrastructure ✅.

---

## 7. Referral qualification state machine

```
invited → registered → verified → onboarding_complete → qualified → rewarded
                                                          └──────→ rejected
```

| Transition | Server trigger | Guard |
|---|---|---|
| → `registered` | `bootstrap` with code | `referrerUid !== referredUid` |
| → `verified` | first authed call with `token.email_verified` | — |
| → `onboarding_complete` | `onboardingStatus === 'complete'` | — |
| → `qualified` | above, once | idempotent |
| → `rewarded` | entitlement granted | Firestore transaction |
| → `rejected` | abuse signal | terminal |

Every transition is server-derived. The client never reports its own status.

---

## 8. Reward / entitlement architecture

**Per your decision: configurable abstraction, nothing hardcoded.**

Because no entitlement model exists (§ correction 2), introduce one — additive, alongside `PLANS`:

```ts
// config — data, not business logic
interface RewardRule {
  id: string;
  trigger: 'referral_qualified';
  audience: 'referrer' | 'referred';
  referredRole?: ProductRole;      // enables teacher > student tiering
  grants: EntitlementGrant[];
  active: boolean;
}
interface EntitlementGrant {
  type: string;                    // 'ai_credits' | 'podcast_generations' | ...
  amount: number;
  expiresInDays?: number;
}
```

- Referral code **never** references a specific reward. It emits `referral_qualified`; the rule
  engine resolves grants.
- Changing the amount = editing config. No architectural change. Satisfies your requirement.
- `ai_credits` is simply the first registered `type`.
- Tiering by `referredRole` is a rule-table lookup, not a branch in referral logic.
- Both parties may be granted, **only** at `qualified`.

**Consumption is out of scope for Phase 3.** Granting credits does not make anything meter them.
Metering is a separate, larger piece of work — do not conflate.

---

## 9. Teacher verification architecture

```
teacherStatus: pending | verified | rejected | suspended     (server-write only)
```

| Status | canAuthor | canMentor | App access |
|---|---|---|---|
| pending | ✅ | ❌ | ✅ full |
| verified | ✅ | ✅ | ✅ full |
| rejected | ✅ | ❌ | ✅ full |
| suspended | ❌ | ❌ | limited |

Admin-only transition endpoint, guarded by `isAdmin` ✅ (exists). Every change audited.

---

## 10. Student/teacher relationship architecture

**Kept entirely separate from referral — this is a correctness requirement, not a preference.**

```
REFERRAL    User A ──ref──► User B          one-shot, grants entitlements
ENROLMENT   Teacher ──owns──► Class ──enrols──► Student   ongoing, revocable, grants visibility
```

**Hard rule:** no code path in the referral domain may write an enrolment edge. A student who
used Teacher A's link is **not** Teacher A's student. Conflating them would expose that
student's progress data to any teacher whose link was clicked — a privacy breach. Enforced by
an explicit test (§21).

Future, prepared but not built: `classes/{classId}` (`ownerUid`), `classMembers/{classId}_{uid}`.
Joining is always an explicit accepted action.

---

## 11. Routing architecture

```
/signup /signin        public (reads ?ref=)
/select-role           authed, no productRole              ✅ wired
/verify-email          authed, !emailVerified              NEW
/onboarding            authed + student + verified         ✅ exists
/teacher/onboarding    authed + teacher + verified         NEW
/invite                authed + onboarded (skippable)      NEW
/setup-complete        authed + onboarded                  NEW
/dashboard             canLearn                            ✅ exists
/teach                 canAuthor                           NEW
```

All new routes must be added to `ProtectedRoute`'s bypass list or the profile-incomplete check
will loop them into `/onboarding`.

**⚠️ Blocking defect:** `App.tsx:140` remounts the entire tree on every navigation
(`key={location.pathname}`). A multi-route onboarding flow **will** lose in-flight state.
Fix before any multi-step work.

---

## 12. Firestore schema

```
users/{uid}                            ✅ role, organizationId, onboardingStatus, email,
                                          displayName, photoURL, createdAt, updatedAt
teacherProfiles/{uid}                  NEW  subjects, board, exams, quals, experience,
                                            specialization, bio, teacherStatus, updatedAt
referralCodes/{code}                   NEW  ownerUid, active, createdAt
referrals/{referrerUid}_{referredUid}  NEW  id enforces uniqueness structurally
rewardRules/{ruleId}                   NEW  config-as-data (§8)
entitlementGrants/{grantId}            NEW  uid, source, sourceRef, type, amount, expiresAt
classes/{classId}                      FUTURE
classMembers/{classId}_{uid}           FUTURE
```

`referrals` is a **root** collection — read from both sides.

---

## 13. Firebase Auth claims

```
role         : admin roles only — UNCHANGED, never overwritten
productRole  : student | teacher — immutable once set (409)
```

Verified: `admin@scholarly.ai` retained `{"role":"super_admin"}` across a `productRole` write ✅.

`teacherStatus` **stays in Firestore, not in claims** — it changes over time, and claims require
a token refresh to propagate. Capabilities are derived per-request server-side.

**Known trap:** claims lag `user` by a beat. Any role branch must wait for
`claimsLoading === false` ✅ (already handled).

**Gap:** `productRole` is immutable with **no admin correction path**. A teacher who misclicks
"student" is stuck. Needs an admin reassignment endpoint.

---

## 14. Backend authorization

Existing ✅: `requireAuth`, `enforceSelf`, `tokenClaims`, `isAdmin`, `hasProductRole`,
`requireProductRole`.

New: `deriveCapabilities(uid)` — server-side, from `productRole` + `teacherStatus` + relationships.
Guards check **capabilities**, not roles. The browser may mirror them for UI only.

Identity always from the verified token. `req.body.uid` / `userId` / `role` are never proof ✅.

---

## 15. AI personalization

Reuse, never duplicate ✅: `studentContext.service.ts`, `studentDigitalTwin.service.ts`,
`studentContext.types.ts`, `studentDigitalTwin.types.ts`, `LearnerProfileBuilder.ts`,
`ContextService.ts`.

⚠️ **Exact initialisation entry points not traced.** Trace before wiring — do not assume a
function name.

Teacher context: only if the existing architecture supports it. Not a parallel system.

---

## 16. Dark / light theme

Every new screen supports both, using existing Tailwind v4 `dark:` tokens ✅. No independent
theme tokens. ⚠️ The theme **toggle mechanism** was not traced — confirm before adding surfaces.

---

## 17. Template → Scholarly UI mapping

| Reference screen | Scholarly | Status |
|---|---|---|
| Sign up (email-first) | `Signup.tsx` + `AuthShell` | ✅ restyle only |
| Check your email (4-digit) | `VerifyEmail.tsx` — Firebase state, **no OTP** | NEW |
| "You've been added to \<org\>" | **REMOVED per your decision** | ⛔ |
| Invite your team | `InvitePeers.tsx`, role-specific copy, skippable | NEW |
| Setup complete | `SetupComplete.tsx` — real backend state | NEW |
| Dashboard + welcome modal | `/dashboard` ✅ · `/teach` NEW | partial |

Visual language reproduced (layout, spacing, type hierarchy, progress dots, cards, right-side
panel, CTA hierarchy). Concepts replaced with Scholarly's.

---

## 18. API contracts

```
POST /api/users/bootstrap        { role, referralCode? }   ✅ exists, extend
GET  /api/users/me                                         ✅ exists
GET  /api/users/capabilities     → derived capability set          NEW
POST /api/teacher/profile        { ...teacher fields }             NEW
GET  /api/teacher/profile                                          NEW
POST /api/admin/teacher/:uid/status  { status }   admin-only       NEW
POST /api/admin/users/:uid/product-role { role }  admin-only       NEW
GET  /api/referral/me            → { code, link, stats }           NEW
GET  /api/referral/list          → caller's referrals              NEW
GET  /api/onboarding/status      → aggregate for SetupComplete     NEW
```

No endpoint accepts a reward amount. Ever.

---

## 19. Security rules

```
referrals, referralCodes, entitlementGrants, rewardRules : server-write only;
                                                           client reads own records only
teacherProfiles/{uid} : read isSelf|admin; update isSelf but NOT teacherStatus (affectedKeys)
users/{uid}           : unchanged ✅
```

⚠️ Rules deployment is **unconfirmed** (§2.5). New collections must ship with rules **in the
same change**, and deployment must be verified — an undeployed rule is not a rule.

---

## 20. Anti-abuse

| Attack | Defence |
|---|---|
| Self-referral | reject `referrerUid === referredUid` at bootstrap |
| Duplicate referral | doc id `${referrer}_{referred}` — structurally impossible |
| Repeated reward claim | status transition inside a Firestore transaction |
| Reward manipulation | amount never from client; resolved from `rewardRules` |
| Fake accounts | qualification needs verified email **and** completed onboarding |
| Link-click farming | `invited` grants nothing |
| Invite spam | rate-limit per referrer per window |
| Privilege escalation | `bootstrap` rejects admin roles (403) ✅ |

Core property: **reward requires completed onboarding** — real per-account cost, not cheaply automated.

---

## 21. Testing strategy

**Unit** — referral state machine, all transitions incl. illegal; self-referral rejection;
reward-rule resolution incl. role tiering; capability truth table; `bootstrapProductRole`
idempotency/409; claim merge preserves admin `role`.

**Integration** — signup with `?ref=`; qualification only after onboarding; double-qualify grants
exactly once; **referral never writes an enrolment edge** (explicit privacy test).

**Source-level guards** — extend `tests/unit/routeAuthGuards.test.ts` ✅ so every new route
declares `requireAuth`. This pattern exists because the original `/documents` gap was a
*commented-out* guard, which runtime tests cannot catch.

**Rules tests** — client writes to `referrals`, `entitlementGrants`, `teacherStatus` must fail.

**Manual** — light/dark on every screen; hard-refresh mid-flow; skip-invite reaches the app.

**Regression** — `admin@scholarly.ai` / `Rc21X5zW87NMm44FliY3RTamJ503` retains
`{"role":"super_admin"}` after any claims work.

**Baselines** — backend 126, frontend 96 pre-existing type errors ✅. Report **deltas**, never absolutes.

---

## 22. Migration strategy

Existing accounts: 2 (`admin@scholarly.ai`, one student) — migration cost is effectively zero now,
which is an argument for doing this before real users arrive.

- Accounts without `productRole` → `/select-role` ✅ already handled.
- No backfill needed for `referrals` (none exist).
- `referralCodes` generated lazily on first visit to `/invite`.
- `teacherProfiles` created only at teacher onboarding.
- All new collections are additive. **No existing document shape changes.**

---

## 23. Rollback strategy

Each phase is independently revertable because all changes are additive:

| Phase | Rollback |
|---|---|
| 0 (remount fix) | revert one line |
| 1 (verify email) | remove route + guard; no data written |
| 2 (referral core) | stop writing `referrals`; docs are inert |
| 3 (rewards) | deactivate all `rewardRules` (`active: false`) — **no code change, no revoke needed** |
| 4 (invite UI) | remove route; codes inert |
| 5 (setup complete) | route to `/dashboard` directly |
| 6 (teacher) | hide `/teach`; `teacherProfiles` inert |

The reward kill-switch is config-level by design — the highest-risk surface is the fastest to disable.

Git: work on a branch off `feature/role-foundation-phase0-2`. **No history rewriting, no force-push.**

---

## 24. Risks and gaps

| # | Risk | Severity |
|---|---|---|
| 1 | **Repo visibility unknown** — determines whether 8 live secrets are public | **CRITICAL** |
| 2 | `FIREBASE_PRIVATE_KEY` in history = full admin access if exposed | **CRITICAL** |
| 3 | Firestore rules deployment unconfirmed — new collections may be unprotected | **HIGH** |
| 4 | `App.tsx:140` remount breaks multi-step state | **HIGH** |
| 5 | Rewards before anti-abuse = self-service credit faucet; phase order not negotiable | **HIGH** |
| 6 | Referral→enrolment conflation = privacy breach | **HIGH** |
| 7 | **No entitlement model exists** — Phase 3 is larger than previously scoped | **MEDIUM** |
| 8 | Granting credits ≠ metering them; consumption is separate work | **MEDIUM** |
| 9 | `TeacherAgent` naming collision misleads contributors | **MEDIUM** |
| 10 | Immutable `productRole`, no admin fix → support burden | **MEDIUM** |
| 11 | Email invites blocked (mock SMTP) | **MEDIUM** |
| 12 | 19,499 `node_modules` files tracked | **LOW** |
| 13 | Claims latency locks users out if `claimsLoading` skipped | **LOW** (handled) |

### Unverified — trace before relying on
- AI context initialisation entry points (§15)
- Theme toggle mechanism (§16)
- Outbound WhatsApp send capability (§6)
- `frontend/.env` and `admin-dashboard/.env` history
- Whether `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` were real or placeholders (§3)

---

## Recommended order

```
SECURITY  →  determine repo visibility  →  rotate  →  (decide on history)
PHASE 0   →  App.tsx:140 fix  ·  deploy + verify Firestore rules
PHASE 1   →  /verify-email
PHASE 2   →  referral core, NO rewards
PHASE 3   →  reward rule engine + entitlement grants
PHASE 4   →  /invite (skippable)
PHASE 5   →  /setup-complete
PHASE 6   →  teacher onboarding + teacherStatus + admin verification
PHASE 7   →  capability derivation + /teach
PHASE 8   →  classes / enrolment
```

Phases 2 and 6 are independent and may run in parallel.

**STOP — awaiting explicit authorization. Nothing has been modified.**
