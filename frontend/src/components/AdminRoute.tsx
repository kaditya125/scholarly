import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

interface AdminRouteProps {
  requiredRole?: string;
  children?: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ requiredRole = 'ADMIN', children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  // Mocking RBAC logic for the prototype
  // Assuming the user is an admin for this demo if they are logged in.
  // In a real application, this would verify a token claim or DB record.
  const role = 'ADMIN'; 

  if (role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
