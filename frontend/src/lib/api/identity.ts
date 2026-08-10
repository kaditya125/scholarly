import { api } from './client';

export type ProductRole = 'student' | 'teacher';

export interface BootstrapResult {
  uid: string;
  role: ProductRole;
  assigned: boolean;
  profileCreated: boolean;
  requiresTokenRefresh: boolean;
}

/**
 * Assigns the account's product role, server-side.
 *
 * The role in this payload is a *request*, not an assertion — the backend derives identity
 * from the verified Firebase token and refuses to change a role that already exists
 * (409), so this cannot be used to self-escalate. See backend
 * controllers/userIdentity.controller.ts.
 *
 * The caller MUST refresh the ID token afterwards (AuthContext.refreshClaims), because
 * custom claims only appear in a newly minted token.
 */
export const identityApi = {
  async bootstrap(role: ProductRole): Promise<BootstrapResult> {
    const res = await api.post('/users/bootstrap', { role });
    return res.data;
  },

  /** The caller's canonical profile. `{ exists: false }` for pre-Phase-1 accounts. */
  async me(): Promise<any> {
    const res = await api.get('/users/me');
    return res.data;
  },
};
