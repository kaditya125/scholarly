import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { Loader2 } from 'lucide-react';

export const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const checkAdminRole = async () => {
      if (user) {
        // Only these roles may use the Admin Dashboard. The backend enforces the
        // same set on every /api/admin request; this client check is UX only.
        const allowedRoles = ['super_admin', 'admin', 'moderator'];
        // Opt-in dev bypass (default OFF). The backend RBAC is still enforced, so
        // API calls will 403 without a real role even when this is enabled.
        const devBypass = import.meta.env.VITE_ALLOW_DEV_ADMIN === 'true';
        try {
          const idTokenResult = await user.getIdTokenResult(true);
          const role = idTokenResult.claims.role as string;
          if (isMounted) {
            if (devBypass) {
              console.warn('VITE_ALLOW_DEV_ADMIN: bypassing client role gate for', user.email);
              setIsAdmin(true);
            } else {
              setIsAdmin(allowedRoles.includes(role));
            }
          }
        } catch (error) {
          console.error('Error checking admin claims', error);
          if (isMounted) setIsAdmin(devBypass);
        }
      } else {
        if (isMounted) setIsAdmin(false);
      }
      if (isMounted) setCheckingRole(false);
    };

    if (!authLoading) {
      checkAdminRole();
    }

    return () => { isMounted = false; };
  }, [user, authLoading]);

  if (authLoading || checkingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-lg">Verifying Access...</span>
      </div>
    );
  }

  if (!isAdmin) {
    // If logged in but not admin, or not logged in, redirect to login
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
