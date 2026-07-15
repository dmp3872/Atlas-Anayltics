import { UserRole, UserProfile } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  chemist: 'Chemist',
  admin: 'Administrator',
  verifier: 'Verifier',
  reviewer: 'Reviewer',
};

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

/** Normalize role from profile (defaults to client). */
export function effectiveRole(profile?: Pick<UserProfile, 'role'> | null): UserRole {
  const r = profile?.role;
  if (r === 'admin' || r === 'chemist' || r === 'verifier' || r === 'client' || r === 'reviewer') return r;
  return 'client';
}

/**
 * Resolve the role used for routing/access.
 * DB role wins; if still client, VITE_ADMIN_EMAILS can elevate to admin.
 */
export function resolveUserRole(
  profile?: Pick<UserProfile, 'role'> | null,
  email?: string | null,
): UserRole {
  const profileRole = effectiveRole(profile);
  if (profileRole !== 'client') return profileRole;
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return 'admin';
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
