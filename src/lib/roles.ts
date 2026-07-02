import { UserRole, UserProfile } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  chemist: 'Chemist',
  admin: 'Administrator',
  verifier: 'Verifier',
  reviewer: 'Reviewer',
};

/** Normalize role from profile (defaults to client). */
export function effectiveRole(profile?: Pick<UserProfile, 'role'> | null): UserRole {
  const r = profile?.role;
  if (r === 'admin' || r === 'chemist' || r === 'verifier' || r === 'client' || r === 'reviewer') return r;
  return 'client';
}

export function roleHome(role?: UserRole | string | null): string {
  switch (effectiveRole(role ? { role: role as UserRole } : null)) {
    case 'admin': return '/admin';
    case 'chemist': return '/lab';
    case 'verifier': return '/verify-portal';
    case 'reviewer': return '/admin/submissions';
    default: return '/dashboard';
  }
}
