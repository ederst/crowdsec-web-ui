import type { UserRole, CurrentUser } from '../shared/contracts';
import type { CrowdsecDatabase } from './database';

const ROLE_ORDER: UserRole[] = ['viewer', 'operator', 'admin'];

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}

export function extractUserEmail(headers: Headers): string | null {
  // ponytail: X-Forwarded-Email is what oauth2-proxy sets via --pass-user-headers=true;
  // x-auth-user is never set by oauth2-proxy and would always be null (PoC bug fix)
  return headers.get('x-forwarded-email')?.trim().toLowerCase() || null;
}

export function resolveCurrentUser(
  email: string,
  database: CrowdsecDatabase,
  adminEmail: string,
): CurrentUser {
  if (adminEmail && email === adminEmail && !database.getUserRole(email)) {
    database.setUserRole(email, 'admin');
  }
  const role = (database.getUserRole(email) as UserRole | null) ?? 'viewer';
  return { email, role };
}

export function makeRequireRole(
  database: CrowdsecDatabase,
  config: { rbacEnabled: boolean; rbacAdminEmail: string },
) {
  return function requireRole(min: UserRole) {
    return async function (context: any, next: any): Promise<Response | void> {
      if (!config.rbacEnabled) {
        return next();
      }

      const email = extractUserEmail(context.req.raw.headers);
      if (!email) {
        return context.json({ error: 'Authentication required' }, 401);
      }

      const user = resolveCurrentUser(email, database, config.rbacAdminEmail);
      if (!roleAtLeast(user.role, min)) {
        return context.json({ error: 'Insufficient permissions' }, 403);
      }

      context.set('currentUser', user);
      return next();
    };
  };
}
