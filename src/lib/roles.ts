import { UserRole, UserProfile } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  chemist: 'Chemist',
  admin: 'Administrator',
  verifier: 'Verifier',
};

/** Normalize role from profile (defaults to client). */
export function effectiveRole(profile?: Pick<UserProfile, 'role'> | null): UserRole {
  const r = profile?.role;
  if (r === 'admin' || r === 'chemist' || r === 'verifier' || r === 'client') return r;
  return 'client';
}

// Where a user lands after signing in, based on their role.
export function roleHome(role?: UserRole | string | null): string {
  switch (effectiveRole(role ? { role: role as UserRole } : null)) {
    case 'admin': return '/admin';
    case 'chemist': return '/lab';
    case 'verifier': return '/verify-portal';
    default: return '/dashboard';
  }
}
