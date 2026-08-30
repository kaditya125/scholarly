import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, auth, signOut } from '../lib/firebase';
import type { User } from 'firebase/auth';

/** Product roles, mirroring backend src/types/roles.ts. */
export type ProductRole = 'student' | 'teacher';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => void;

  // ── Role foundation (Phase 1) ───────────────────────────────────────────────
  /**
   * Product role from the Firebase ID token's custom claims, or null when the account has
   * none yet (every account created before Phase 1 is in this state).
   *
   * READ-ONLY and for UI purposes only. Every authorization decision is made server-side
   * from the verified token — a role read here can be tampered with in devtools and grants
   * nothing on its own.
   */
  role: ProductRole | null;
  /** Administrative role claim, if any. Same read-only caveat as `role`. */
  adminRole: string | null;
  /** True until the first claim read resolves, so consumers can avoid flashing wrong UI. */
  claimsLoading: boolean;
  /**
   * Re-reads claims, forcing a token refresh. Custom claims only appear in a newly minted
   * ID token, so this MUST be called after the bootstrap endpoint assigns a role —
   * otherwise the app keeps seeing the account as role-less until the token expires.
   */
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: () => {},
  role: null,
  adminRole: null,
  claimsLoading: true,
  refreshClaims: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<ProductRole | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(true);

  /** Reads custom claims off the ID token. `force` mints a fresh token. */
  const readClaims = useCallback(async (u: User | null, force = false) => {
    if (!u) {
      setRole(null);
      setAdminRole(null);
      setClaimsLoading(false);
      return;
    }
    try {
      const res = await u.getIdTokenResult(force);
      const productRole = res.claims?.productRole;
      setRole(productRole === 'student' || productRole === 'teacher' ? productRole : null);
      setAdminRole(typeof res.claims?.role === 'string' ? res.claims.role : null);
    } catch {
      // Non-fatal: the app behaves as role-less, and the backend remains authoritative.
      setRole(null);
      setAdminRole(null);
    } finally {
      setClaimsLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    const initAuth = () => {
      if (isCancelled || unsubscribe) return;
      unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
        setClaimsLoading(true);
        void readClaims(u);
      });
    };

    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    const isPublicRoute =
      pathname === '/' ||
      pathname.startsWith('/about') ||
      pathname.startsWith('/team') ||
      pathname.startsWith('/pricing') ||
      pathname.startsWith('/how-it-works') ||
      pathname.startsWith('/legal') ||
      pathname.startsWith('/terms') ||
      pathname.startsWith('/privacy');

    if (isPublicRoute && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(initAuth, { timeout: 1800 });
      const onInteraction = () => {
        initAuth();
        window.removeEventListener('pointerdown', onInteraction);
        window.removeEventListener('keydown', onInteraction);
        window.removeEventListener('scroll', onInteraction);
      };
      window.addEventListener('pointerdown', onInteraction, { passive: true });
      window.addEventListener('keydown', onInteraction, { passive: true });
      window.addEventListener('scroll', onInteraction, { passive: true });

      return () => {
        isCancelled = true;
        (window as any).cancelIdleCallback(id);
        window.removeEventListener('pointerdown', onInteraction);
        window.removeEventListener('keydown', onInteraction);
        window.removeEventListener('scroll', onInteraction);
        if (unsubscribe) unsubscribe();
      };
    } else {
      initAuth();
      return () => {
        isCancelled = true;
        if (unsubscribe) unsubscribe();
      };
    }
  }, [readClaims]);

  const logout = async () => {
    await signOut(auth);
  };

  const refreshUser = () => {
    // Force a state update with a new reference to the user object
    if (auth.currentUser) {
      setUser({ ...auth.currentUser } as User);
    }
  };

  const refreshClaims = useCallback(async () => {
    setClaimsLoading(true);
    await readClaims(auth.currentUser, true);
  }, [readClaims]);

  return (
    <AuthContext.Provider
      value={{ user, loading, logout, refreshUser, role, adminRole, claimsLoading, refreshClaims }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
