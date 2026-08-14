# Phase 1 — Role-Aware Routing & Teacher Entry Point

**Date:** 2026-08-12 · **Branch:** `feature/role-foundation-phase0-2` · **Not committed, not staged.**

Scope: make the app distinguish student and teacher accounts and route them correctly, without
touching the existing student platform. No teacher platform was built.

---

## 1. What was changed

**Modified (2)**

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Student-profile gate scoped to `role === 'student'`; `/teacher/onboarding` route + bypass entry; `/dashboard` wrapped in `RoleLanding` |
| `frontend/src/pages/Signup.tsx` | Bootstrap failures now stop the flow with typed messages; role-aware destination; `signInWithPopup` dependency documented |

**Created (2)**

| File | Purpose |
|---|---|
| `frontend/src/components/RoleLanding.tsx` | Resolves one route to the right experience per `productRole` |
| `frontend/src/pages/TeacherOnboarding.tsx` | Honest teacher entry placeholder |

**Unchanged:** `AuthContext`, `SelectRole`, `firebase.ts`, `Onboarding`, `StudentDashboard`, all
backend files, `firestore.rules`, all env/config.

---

## 2. Why App.tsx needed modification

`useProfile()` fetches the **student** learning profile. `ProtectedRoute` gated every non-bypass
route on `!profile?.isComplete`, so a teacher — who never has a student profile — was redirected
into the student onboarding wizard on **every route, permanently**. The claim said `teacher`;
the router disagreed.

The gate is now scoped:

```tsx
if (!isBypassRoute && role === 'student') {
  if (profileLoading) return <spinner/>;
  if (!profile?.isComplete && sessionStorage.getItem('onboarding_skipped') !== 'true') {
    return <Navigate to="/onboarding" replace />;
  }
}
```

`profileLoading` is scoped the same way deliberately. That query uses `refetchInterval: 5000`, and
for a teacher it never settles — an unscoped wait would have produced intermittent spinners on
every route.

**Not touched:** the `authLoading` gate, `!user` → `/signin`, the `claimsLoading` gate, and
`!role` → `/select-role`. All verified correct and left alone.

---

## 3. Student routing

```
signup(student) → bootstrap → refreshClaims → /onboarding
  → baseline assessment → welcome → /dashboard → RoleLanding → <StudentDashboard/>
```

Behaviourally identical to before. `RoleLanding` renders the **existing** component — the
dashboard is neither duplicated nor rewritten, and `/dashboard` keeps its URL.

---

## 4. Teacher routing

```
signup(teacher) → bootstrap → refreshClaims → /teacher/onboarding
/dashboard (teacher) → RoleLanding → redirect → /teacher/onboarding
```

`/teacher/onboarding` is in `bypassRoutes` so the student-profile gate cannot pull it back to
`/onboarding`. Teachers never enter the student wizard by any path.

---

## 5. Missing-role routing

Unchanged, and still the correct behaviour: `ProtectedRoute` sends `role === null` to
`/select-role` once `claimsLoading` is false. `RoleLanding` repeats this as defence in depth for
any future caller mounted outside that guard. **A missing role is never treated as student.**

---

## 6. Why sign-in needs no role selector

The role belongs to the Firebase account, not the sign-in attempt:

```
Firebase auth → UID → ID token → productRole claim → role-aware landing
```

`Signin.tsx` is unchanged and still navigates to `from || '/dashboard'`. `RoleLanding` at
`/dashboard` does the branching, so it applies equally to deep links and hard refreshes — which a
login-transition handler would never see. Asking again at sign-in would also invite a client-side
answer to contradict the server's claim.

---

## 7. Why `signInWithPopup` must be preserved

The selected role lives in React state during signup. `signInWithPopup` keeps the SPA mounted, so
that state survives the OAuth round trip. `signInWithRedirect` unmounts the component — `role`
would be lost and **every teacher signup would silently become a role-less account**.

This dependency is invisible at the call site, so it is now commented there. Changing it requires
persisting the role outside component state first.

---

## 8. What remains for Phase 2

1. Real teacher onboarding wizard → `teacherProfiles/{uid}`
2. `teacherStatus` (`pending|verified|rejected|suspended`) — pending must never block access
3. Server-derived capabilities; apply `requireProductRole` to genuinely teacher-only routes
4. Teacher AI context (after tracing the student context entry points)
5. Teacher dashboard, replacing the placeholder
6. Admin `productRole` reassignment — currently a role mistake is unfixable
7. `App.tsx:140` `key={location.pathname}` remount — must be fixed before multi-step onboarding

---

## 9. Assumptions

- `useProfile()` degrading to `profile === undefined` for teachers is acceptable (verified: the
  query errors, it does not throw).
- Teachers may reach shared surfaces (`/chat`, `/notebooks`, `/groups`). Only the student
  *onboarding gate* is role-scoped; shared features stay shared, per the ecosystem model.
- The 409 message says the user is *now signed in* to the existing account, because Firebase
  auth genuinely succeeded before the conflict was detected.

---

## 10. Risks discovered

| Risk | Severity | Note |
|---|---|---|
| `signInWithPopup` dependency invisible | MEDIUM | Now commented; still one edit from breaking |
| `useProfile` polls every 5s for teachers | LOW | Wasted requests; no longer user-visible |
| `App.tsx:140` remount | HIGH (Phase 2) | Blocks multi-step onboarding |
| No admin role-correction path | MEDIUM | 409 is now clearly surfaced, but unfixable by support |
| Teacher-only endpoint authorization untestable | INFO | Zero teacher-only endpoints exist; nothing was invented to satisfy a test |

---

## Verification

- `tsc --noEmit`: **96 errors — exactly the pre-existing baseline**, zero in changed/created files
- `npm run build`: **exit 0**, built in 4m25s
- Static route tracing: all 10 scenarios traced (see implementation report)
