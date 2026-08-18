import { Request, Response, NextFunction } from 'express';
import { PRODUCT_ROLE_CLAIM, ProductRole, isProductRole } from '../types/roles';
import { normalizeTeacherStatus, TeacherStatus } from '../types/teacher';
import {
  Capability,
  CapabilityInput,
  CapabilitySet,
  deriveCapabilities,
} from '../types/capabilities';
import { teacherProfileService } from '../services/teacherProfile.service';

/**
 * Capability enforcement. MUST run after `requireAuth`.
 *
 * ── Why admins do NOT bypass this ─────────────────────────────────────────────────────
 * `requireProductRole` lets administrators through, because an admin inspecting a teacher
 * surface should not be blocked by the absence of a product role. `requireCapability`
 * deliberately does the opposite for approval-gated capabilities.
 *
 * The reason is that a capability gate does not protect a *view* — it protects a state
 * transition. `createClass` means "bring a class into existence, owned by the caller"; `earn`
 * means "accrue money to the caller". Letting an admin bypass those would let an unapproved
 * account create classes and accrue balances simply because it also holds an admin claim. An
 * administrator who needs to act on someone else's behalf should use an admin endpoint that
 * names the subject explicitly and writes an audit entry — not inherit the subject's powers.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────────────────
 * Deriving capabilities needs `teacherStatus`, which lives in Firestore rather than the token
 * (by design — a claim would serve a stale value after an admin suspended someone). That is one
 * document read per guarded request, and only for callers whose `productRole` is `teacher`;
 * students never trigger it. The result is memoised on the request object so a route with
 * several capability checks reads once.
 */

/** Where the per-request memo lives. Not a public contract — read it through `loadCapabilities`. */
const MEMO = '__sadhyaCapabilities';

function productRoleOf(req: Request): ProductRole | null {
  const claims = (req.user || {}) as unknown as Record<string, any>;
  const raw = claims[PRODUCT_ROLE_CLAIM];
  return isProductRole(raw) ? raw : null;
}

/**
 * Resolves the inputs the derivation needs.
 *
 * Only reads Firestore when the caller is actually a teacher. A missing profile yields a null
 * status, which the derivation treats as "not approved" — so a teacher mid-onboarding can edit
 * their profile but cannot yet create a class.
 */
async function resolveInput(req: Request): Promise<CapabilityInput> {
  const productRole = productRoleOf(req);
  if (productRole !== 'teacher') return { productRole, teacherStatus: null };

  const uid = req.user?.uid;
  if (!uid) return { productRole, teacherStatus: null };

  const profile = await teacherProfileService.get(uid);
  const teacherStatus: TeacherStatus | null = profile
    ? normalizeTeacherStatus(profile.teacherStatus)
    : null;
  return { productRole, teacherStatus };
}

/**
 * The caller's capability set, memoised for the lifetime of the request.
 *
 * Safe to call from a controller as well as from middleware — it is the same computation the
 * gate performed, so a handler never has to re-implement a rule in order to branch on it.
 */
export async function loadCapabilities(req: Request): Promise<CapabilitySet> {
  const cached = (req as any)[MEMO] as CapabilitySet | undefined;
  if (cached) return cached;

  const set = deriveCapabilities(await resolveInput(req));
  (req as any)[MEMO] = set;
  return set;
}

/**
 * Gate a route on one capability.
 *
 * Returns 401 without an authenticated caller, 403 when the capability is absent. The 403 body
 * names the capability and the caller's current teacher status so the client can render a useful
 * message ("your account is awaiting review") rather than a bare refusal — neither value is
 * sensitive, and both are already visible to the caller through their own profile.
 */
export const requireCapability = (capability: Capability) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const input = await resolveInput(req);
      const set = deriveCapabilities(input);
      (req as any)[MEMO] = set;

      if (!set[capability]) {
        return res.status(403).json({
          error: `Forbidden: this action requires the "${capability}" capability.`,
          capability,
          teacherStatus: input.teacherStatus,
        });
      }
      next();
    } catch {
      // A failed status lookup must never fail open.
      return res.status(403).json({ error: 'Forbidden: could not verify your permissions.' });
    }
  };
};
