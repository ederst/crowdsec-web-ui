import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../lib/basePath';
import type { MeResponse, UserRole, WithChildren } from '../types';
import { AuthContext } from './auth-context';

const ROLE_ORDER: UserRole[] = ['viewer', 'operator', 'admin'];

// ponytail: role check duplicated from server/rbac.ts — no shared runtime bundle,
// keeping it inline avoids a shared-bundle refactor for two lines
function roleAtLeast(role: UserRole | null | undefined, min: UserRole): boolean {
  if (!role) return false;
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);
}

export function AuthProvider({ children }: WithChildren) {
  const [rbacEnabled, setRbacEnabled] = useState(false);
  const [currentUser, setCurrentUser] = useState<MeResponse['user']>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/me'));
      // 401 is a valid response (rbac enabled, no identity) — parse body regardless
      const data: MeResponse = await res.json();
      setRbacEnabled(data.rbac_enabled);
      setCurrentUser(data.user);
    } catch {
      // network error — leave loading=false, rbacEnabled=false (fail open)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMe(); }, [fetchMe]);

  const can = useCallback((minRole: UserRole): boolean => {
    if (!rbacEnabled) return true;
    return roleAtLeast(currentUser?.role, minRole);
  }, [rbacEnabled, currentUser]);

  return (
    <AuthContext.Provider value={{ rbacEnabled, currentUser, loading, can }}>
      {children}
    </AuthContext.Provider>
  );
}
