import { useAuth } from '../context/AuthContext';
import { UserRole } from '../lib/types';
import { resolveUserRole } from '../lib/roles';

export function useUserRole() {
  const { user, profile } = useAuth();
  const role: UserRole = resolveUserRole(profile, user?.email);

  return {
    role,
    isAdmin: role === 'admin',
    isReviewer: role === 'reviewer',
    isChemist: role === 'chemist',
    isVerifier: role === 'verifier',
    isStaff: role === 'admin' || role === 'reviewer' || role === 'chemist' || role === 'verifier',
  };
}
