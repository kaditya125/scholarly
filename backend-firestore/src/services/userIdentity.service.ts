import * as admin from 'firebase-admin';
import { db, auth } from '../config/firebase';
import {
  PRODUCT_ROLE_CLAIM,
  ProductRole,
  OnboardingStatus,
  isProductRole,
} from '../types/roles';
import { logger } from '../utils/logger';

/**
 * UserIdentityService — owns the canonical `users/{uid}` document and product-role
 * assignment.
 *
 * ── Context ───────────────────────────────────────────────────────────────────
 * Before this, `users/{uid}` was never written by production code. Every write went to a
 * SUBcollection (users/{uid}/profile, /memory, /sessions, /analytics, /mastery), which in
 * Firestore leaves the parent as a phantom document: `.exists === false`, invisible to
 * `collection('users')` queries. That is why the admin dashboard lists users via
 * `auth.listUsers()` rather than Firestore. This service materialises that record.
 *
 * ── Authority ─────────────────────────────────────────────────────────────────
 * The `productRole` CUSTOM CLAIM is the authorization authority. The `role` field written
 * onto users/{uid} is a denormalised mirror for queries, display and analytics, and must
 * never be used for an access decision.
 */

export interface BootstrapResult {
  uid: string;
  role: ProductRole;
  /** True when this call assigned the role; false when it was already set to the same value. */
  assigned: boolean;
  /** True when the users/{uid} document was created by this call. */
  profileCreated: boolean;
  /**
   * Always true when `assigned` is true. The client MUST call getIdToken(true) afterwards:
   * custom claims only appear in a freshly minted ID token, so until the token is
   * refreshed the backend will still see the account as having no product role.
   */
  requiresTokenRefresh: boolean;
}

export class RoleConflictError extends Error {
  constructor(public readonly current: ProductRole, public readonly requested: ProductRole) {
    super(`Account already has the product role "${current}"; cannot change it to "${requested}".`);
    this.name = 'RoleConflictError';
  }
}

export class UserIdentityService {
  private readonly usersCollection = 'users';

  /** Canonical profile document for a uid, or null when it has never been materialised. */
  async getCanonicalProfile(uid: string): Promise<Record<string, any> | null> {
    const snap = await db.collection(this.usersCollection).doc(uid).get();
    return snap.exists ? (snap.data() as Record<string, any>) : null;
  }

  /**
   * Assigns a product role to an account that does not yet have one, and materialises the
   * canonical profile.
   *
   * Security properties:
   *  - `uid` comes from the caller, but every call site passes the verified token's uid.
   *    No client-supplied uid ever reaches this method.
   *  - A product role can only be assigned when NONE exists. Re-requesting the SAME role is
   *    idempotent; requesting a DIFFERENT one throws RoleConflictError. That is what stops a
   *    student self-escalating to teacher by replaying bootstrap.
   *  - Administrative roles are rejected upstream by the controller and are never writable
   *    through this path; the existing `role` claim is read and preserved, never modified.
   */
  async bootstrapProductRole(uid: string, requestedRole: ProductRole): Promise<BootstrapResult> {
    if (!isProductRole(requestedRole)) {
      // Defence in depth — the controller validates first.
      throw new Error(`Invalid product role: ${String(requestedRole)}`);
    }

    const userRecord = await auth.getUser(uid);
    const existingClaims = userRecord.customClaims || {};
    const currentRole = existingClaims[PRODUCT_ROLE_CLAIM];

    if (isProductRole(currentRole)) {
      if (currentRole !== requestedRole) {
        throw new RoleConflictError(currentRole, requestedRole);
      }
      // Idempotent replay: role already correct. Still repair the profile document in case
      // a previous run set the claim but failed before the Firestore write.
      const profileCreated = await this.ensureCanonicalProfile(uid, currentRole, userRecord);
      return { uid, role: currentRole, assigned: false, profileCreated, requiresTokenRefresh: false };
    }

    // MERGE, never replace: an administrator bootstrapping a product role must keep their
    // existing `role` claim. This mirrors scripts/create_admin.ts, which merges the same way.
    await auth.setCustomUserClaims(uid, { ...existingClaims, [PRODUCT_ROLE_CLAIM]: requestedRole });

    const profileCreated = await this.ensureCanonicalProfile(uid, requestedRole, userRecord);

    logger.info('[UserIdentity] Product role assigned', {
      uid,
      role: requestedRole,
      preservedAdminRole: existingClaims.role ?? null,
    });

    return { uid, role: requestedRole, assigned: true, profileCreated, requiresTokenRefresh: true };
  }

  /**
   * Creates users/{uid} if absent; otherwise refreshes only the display fields.
   *
   * `role` and `organizationId` are written ONCE at creation and never updated here, so a
   * later call can never mutate them. Identity fields come from the Firebase Auth record,
   * not from any request body.
   */
  private async ensureCanonicalProfile(
    uid: string,
    role: ProductRole,
    userRecord: admin.auth.UserRecord
  ): Promise<boolean> {
    const ref = db.collection(this.usersCollection).doc(uid);
    const snap = await ref.get();
    const now = admin.firestore.FieldValue.serverTimestamp();

    if (snap.exists) {
      await ref.set(
        {
          email: userRecord.email ?? null,
          displayName: userRecord.displayName ?? null,
          photoURL: userRecord.photoURL ?? null,
          updatedAt: now,
        },
        { merge: true }
      );
      return false;
    }

    const onboardingStatus: OnboardingStatus = 'not_started';
    await ref.set({
      uid,
      email: userRecord.email ?? null,
      displayName: userRecord.displayName ?? null,
      photoURL: userRecord.photoURL ?? null,
      // Denormalised mirror of the custom claim. NOT the authorization authority.
      role,
      // Reserved for a future organisation/institution model. Present from day one so
      // adding multi-tenancy later is a backfill, not a schema migration.
      organizationId: null,
      onboardingStatus,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }
}

export const userIdentityService = new UserIdentityService();
