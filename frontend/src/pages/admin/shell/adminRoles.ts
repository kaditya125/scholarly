/**
 * Admin roles, mirroring backend src/types/roles.ts ADMIN_ROLES.
 *
 * Kept as a narrow local mirror rather than importing across the workspace boundary,
 * which is the same pattern AuthContext already uses for ProductRole. If the backend
 * list changes, change it here too — the compile-time union is what stops a typo in a
 * nav entry's `minRole` from silently hiding a page from everyone.
 *
 * ─── THIS FILE GRANTS NOTHING ────────────────────────────────────────────────────────
 * Everything here is presentation. The role is read from the Firebase ID token's custom
 * claims in the browser, where devtools can trivially change it, so it decides only what
 * the UI draws. Authorisation is decided server-side on every admin request by
 * requireRoles() in backend-firestore/src/admin/middleware/rbac.middleware.ts, which
 * verifies the token signature and re-reads the claim.
 *
 * An attacker who edits `adminRole` in memory gets an admin-shaped page whose every
 * request returns 403. That is the intended failure mode (§32).
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

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

/**
 * Roles permitted into the admin area at all.
 *
 * Mirrors the backend's `requireAdmin`, which allows super_admin, admin and moderator.
 * The remaining roles exist in the type union so the authorization architecture is ready
 * for them (§45), but no admin route grants them access yet — adding one means changing
 * the backend first, then this list.
 */
export const ADMIN_AREA_ROLES: readonly AdminRole[] = ['super_admin', 'admin', 'moderator'];

export function canEnterAdminArea(role: unknown): boolean {
  return isAdminRole(role) && ADMIN_AREA_ROLES.includes(role);
}

/** Human label for the role chip in the admin header. */
export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Owner',
  admin: 'Admin',
  moderator: 'Moderator',
  content_manager: 'Content',
  support: 'Support',
  analytics_viewer: 'Analytics',
};
