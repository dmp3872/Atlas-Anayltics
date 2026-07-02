import { useAuth } from '../context/AuthContext';
import { UserRole } from '../lib/types';
import { effectiveRole } from '../lib/roles';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export function useUserRole() {
  const { user, profile } = useAuth();
  const emailIsAdmin = user?.email
    ? ADMIN_EMAILS.includes(user.email.toLowerCase())
    : false;

  const profileRole = effectiveRole(profile);
  const role: UserRole = profileRole === 'client' && emailIsAdmin ? 'admin' : profileRole;

  return {
    role,
    isAdmin: role === 'admin',
    isReviewer: role === 'reviewer',
    isChemist: role === 'chemist',
    isVerifier: role === 'verifier',
    isStaff: role === 'admin' || role === 'reviewer' || role === 'chemist' || role === 'verifier',
  };
}
