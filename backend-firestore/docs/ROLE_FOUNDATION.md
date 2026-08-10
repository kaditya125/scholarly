# Role Foundation (Phase 0 + Phase 1)

Security hardening and the student/teacher role foundation. No UI, no teacher onboarding,
no dashboards — those are later phases.

---

## 1. Claim model — two claims, not one

```
role         : 'super_admin' | 'admin' | 'moderator' | 'content_manager'
               | 'support' | 'analytics_viewer' | undefined     ← UNCHANGED
productRole  : 'student' | 'teacher' | undefined                 ← NEW
```

**Why two.** A custom claim holds one value. Folding product roles into the existing `role`
claim would make `role: 'admin'` and `role: 'student'` mutually exclusive, so granting a
product role to an administrator would silently revoke their admin access — a privilege
loss with no audit trail — and any student-facing surface gated on role would lock admins
out. The two claims are orthogonal: an account may hold either, both, or neither.

Nothing reads or writes the `role` claim differently than before. `admin/middleware/rbac.middleware.ts`,
`firestore.rules → hasAdminRole()` and `scripts/create_admin.ts` are untouched.

**Authority.** The custom claim is the *only* authority for authorization. `users/{uid}.role`
is a denormalised mirror for queries, display and analytics, and must never drive an access
decision.

## 2. Bootstrap flow

```
POST /api/users/bootstrap   { "role": "student" | "teacher" }

requireAuth → verifyIdToken → req.user.uid        ← identity, never from the body
     ↓
auth.getUser(uid) → existing customClaims
     ↓
productRole already set?
   same role     → 200 { assigned: false }        (idempotent replay)
   different     → 409 RoleConflictError          (no self-escalation)
   admin role    → 403                            (never grantable here)
   invalid       → 400
   none          → setCustomUserClaims({ ...existing, productRole })   ← MERGE
                   → create users/{uid}
                   → 201 { requiresTokenRefresh: true }
```

The body supplies the *desired role only*. A uid in the body is ignored — there is
therefore no way to bootstrap a profile for another account.

## 3. `users/{uid}` canonical profile

Previously never written by production code: every write went to a subcollection
(`profile/`, `memory/`, `sessions/`, `analytics/`, `mastery/`), leaving the parent as a
phantom document (`.exists === false`, invisible to `collection('users')` queries). That is
why the admin dashboard lists users via `auth.listUsers()`.

```jsonc
{
  "uid": "...", "email": "...", "displayName": "...", "photoURL": "...",
  "role": "student",           // mirror of the claim — NOT the authority
  "organizationId": null,      // reserved for a future org model
  "onboardingStatus": "not_started",
  "createdAt": "<serverTimestamp>", "updatedAt": "<serverTimestamp>"
}
```

`role` and `organizationId` are written once at creation and never updated by
`ensureCanonicalProfile`. No credentials, tokens or secrets are stored.

## 4. Authorization model

| Need | Use |
|---|---|
| Any signed-in user | `requireAuth` |
| Path `:userId` is the caller | `requireAuth, enforceSelf('userId')` |
| Product role required | `requireAuth, requireProductRole('teacher')` |
| Admin surface | existing `requireAdmin` / `requireSuperAdmin` (unchanged) |
| Conditional in a controller | `isAdmin(req)` / `hasProductRole(req, role)` |

`requireProductRole` runs **after** `requireAuth` and reuses the already-verified token —
no second `verifyIdToken`. Administrators pass automatically.

## 5. Firestore rules

`users/{uid}` is now a real document, so client writes are restricted **by field** rather
than blocked: `lib/api/avatar.ts` legitimately updates avatar fields from the browser.

```
allow read:   isSelf(userId)
allow create: false                       // backend only
allow update: isSelf(userId) && !affectedKeys().hasAny(
                ['role','organizationId','uid','email','createdAt'])
allow delete: false
```

The Admin SDK bypasses rules, so backend authorization remains the real boundary.

## 6. Token refresh — required in Phase 2

Custom claims only appear in a **newly minted** ID token. After a successful bootstrap the
client MUST call:

```ts
await auth.currentUser.getIdToken(true);
await refreshClaims();            // AuthContext
```

Until then the backend still sees the account as role-less. `bootstrap` returns
`requiresTokenRefresh: true` to make this explicit. `AuthContext.refreshClaims()` exists
now; wiring it to the signup flow is Phase 2.

## 7. Compatibility

**Admins** — unaffected. The `role` claim is read and preserved but never modified; the
bootstrap merge (`{ ...existingClaims, productRole }`) mirrors `create_admin.ts`. Test:
*"PRESERVES an existing admin claim when a product role is added."*

**Existing students** — no mass migration was performed. Accounts predating Phase 1 have no
`productRole` and no `users/{uid}` document. They keep working: nothing yet *requires* a
product role, `GET /users/me` returns `{ exists: false, role: null }` rather than erroring,
and student onboarding (`/onboarding`, `/baseline-assessment`, Digital Twin,
`users/{uid}/profile/onboarding`) is untouched. They acquire a role lazily the first time
bootstrap is called for them.

**Deliberately not done:** no backfill script. Writing a `productRole` claim onto every
existing account is a bulk mutation of live auth state, and it should be an explicit,
reviewed decision — not a side effect of this phase.

## 8. Phase 2 requirements

1. Role-aware `AuthContext` consumers (`role`, `claimsLoading`, `refreshClaims` all exist).
2. Role-aware `ProtectedRoute` — currently gates on auth + profile completeness; needs a
   third state for "authenticated, no product role" → route to role selection.
3. Signup role selection → `POST /users/bootstrap` → `getIdToken(true)` → `refreshClaims()`.
4. Returning-user routing by role.
5. Recovery path for "authenticated but role missing".
