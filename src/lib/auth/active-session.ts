import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { UserRole } from '@/types';

export async function getActiveSession() {
  const session = await getSessionUser();
  if (!session) return null;

  const users = await query<{ role: UserRole }[]>(
    "SELECT role FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
    [session.id]
  );
  if (!users[0]) return null;

  return { session, role: users[0].role };
}
