import { UserRole, UserProfile } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  client: 'Client',
  chemist: 'Chemist',
  admin: 'Administrator',
  verifier: 'Medical Director',
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
    case 'verifier': return '/medical-director';
    case 'reviewer': return '/admin/submissions';
    default: return '/dashboard';
  }
}

/** Paths that belong exclusively to one staff portal (no cross-section hopping). */
export function isMedicalDirectorPath(path?: string | null): boolean {
  if (!path) return false;
  return path === '/medical-director'
    || path.startsWith('/medical-director/')
    || path === '/verify-portal'
    || path.startsWith('/verify-portal/');
}

/**
 * After sign-in, keep each role inside its own portal.
 * Deep-links into another section are ignored.
 */
export function postAuthDestination(
  role: UserRole,
  requested?: string | null,
): string {
  const home = roleHome(role);
  if (!requested?.startsWith('/')) return home;

  if (role === 'verifier') {
    // Medical Director accounts only ever land in their portal (or a COA they opened).
    if (requested.startsWith('/coa/') || requested.startsWith('/sample/')) return requested;
    return home;
  }

  if (isMedicalDirectorPath(requested)) return home;

  const clientOnlyPaths = [
    '/dashboard', '/dashboard/orders', '/dashboard/coas', '/dashboard/api', '/dashboard/submissions',
  ];
  if (
    role !== 'client'
    && clientOnlyPaths.some(p => requested === p || requested.startsWith(`${p}/`) || requested.startsWith(`${p}?`))
  ) {
    return home;
  }

  return requested;
}
