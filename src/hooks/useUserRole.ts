import { useAuth } from '../context/AuthContext';
import { UserRole } from '../lib/types';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export function useUserRole() {
  const { user, profile } = useAuth();
  const profileRole = profile?.role as UserRole | undefined;
  const emailIsAdmin = user?.email
    ? ADMIN_EMAILS.includes(user.email.toLowerCase())
    : false;

  const role: UserRole =
    profileRole === 'admin' || profileRole === 'reviewer'
      ? profileRole
      : emailIsAdmin
        ? 'admin'
        : 'client';

  return {
    role,
    isAdmin: role === 'admin',
    isReviewer: role === 'reviewer',
    isStaff: role === 'admin' || role === 'reviewer',
  };
}
