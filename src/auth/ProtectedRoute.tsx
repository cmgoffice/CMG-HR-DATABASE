import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, UserRole } from './AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireApproved?: boolean;
  requireRoles?: UserRole[];
}

export const ProtectedRoute = ({ 
  children, 
  requireApproved = true, 
  requireRoles 
}: ProtectedRouteProps) => {
  const { firebaseUser, userProfile, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 flex-col gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-600">กำลังตรวจสอบสิทธิ์...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  if (firebaseUser && !userProfile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 flex-col gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-slate-600">กำลังโหลดโปรไฟล์...</p>
      </div>
    );
  }

  if (requireApproved && userProfile?.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (requireApproved && userProfile?.status === 'rejected') {
    return <Navigate to="/login" replace />;
  }

  if (requireRoles && requireRoles.length > 0 && !hasRole(requireRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
