import { useEffect, useState } from 'react';
import { fetchUserRoles, patchUserRole } from '../lib/api';
import { useAuth } from '../contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import type { UserRole, UserRoleEntry } from '../types';

const ROLES: UserRole[] = ['viewer', 'operator', 'admin'];

export function UserRoles() {
  const { can } = useAuth();
  const [users, setUsers] = useState<UserRoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ponytail: per-row saving state via email key; no global spinner
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    fetchUserRoles()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(email: string, role: UserRole) {
    setSaving((prev) => ({ ...prev, [email]: true }));
    try {
      const updated = await patchUserRole(email, role);
      setUsers((prev) => prev.map((u) => u.email === updated.email ? updated : u));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSaving((prev) => ({ ...prev, [email]: false }));
    }
  }

  if (!can('admin')) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Access denied. Admin role required.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Management</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-gray-500">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No users have logged in yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((user) => (
                  <tr key={user.email}>
                    <td className="px-4 py-3 font-mono text-gray-900 dark:text-gray-100">{user.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        disabled={saving[user.email]}
                        onChange={(e) => void handleRoleChange(user.email, e.target.value as UserRole)}
                        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
