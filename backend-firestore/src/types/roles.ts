/**
 * Sadhya AI — role model.
 *
 * ── Why TWO claims rather than one ────────────────────────────────────────────
 * The existing admin RBAC (admin/middleware/rbac.middleware.ts, firestore.rules
 * `hasAdminRole()`, scripts/create_admin.ts) reads a single custom claim: `role`.
 *
 * Product roles could not be folded into that same claim without destroying
 * information. A claim holds one value, so `role: 'admin'` and `role: 'student'` are
 * mutually exclusive — meaning:
 *   - an administrator would cease to have a product role, and any student-facing
 *     surface gated on it would lock them out; and
 *   - granting a product role to an existing admin would silently revoke their admin
 *     access, which is a privilege *loss* with no audit trail.
 *
 * So product role lives in its own claim, `productRole`, and the admin `role` claim is
 * left exactly as it is. The two are orthogonal: an account may hold either, both, or
 * neither. This is strictly additive — no existing claim is read, written or migrated
 * differently than before.
 *
 *     role         : 'super_admin' | 'admin' | ... | undefined   (unchanged, admin RBAC)
 *     productRole  : 'student' | 'teacher' | undefined           (new, product surface)
 *
 * ── Authority ─────────────────────────────────────────────────────────────────
 * The custom claim is the ONLY authority for authorization. The mirrored `role` field on
 * users/{uid} exists for queries, display and analytics, and must never be consulted for
 * an access decision.
 */

/** Roles a user may hold on the product surface. Assignable via bootstrap. */
export const PRODUCT_ROLES = ['student', 'teacher'] as const;
export type ProductRole = (typeof PRODUCT_ROLES)[number];

/**
 * Administrative roles. Unchanged from admin/middleware/rbac.middleware.ts — duplicated
 * here only as a rejection list so the public bootstrap endpoint can refuse them. These
 * remain grantable exclusively through the existing admin mechanism (scripts/create_admin.ts).
 */
export const ADMIN_ROLES = [
  'super_admin',
  'admin',
  'moderator',
  'content_manager',
  'support',
  'analytics_viewer',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Name of the custom claim carrying the product role. */
export const PRODUCT_ROLE_CLAIM = 'productRole';

export function isProductRole(value: unknown): value is ProductRole {
  return typeof value === 'string' && (PRODUCT_ROLES as readonly string[]).includes(value);
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** Onboarding lifecycle. `isComplete` on the student profile remains the existing
 *  source of truth for the student wizard; this mirrors coarse state onto users/{uid}
 *  so it is queryable without reading a subcollection. */
export const ONBOARDING_STATUSES = ['not_started', 'in_progress', 'complete'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
