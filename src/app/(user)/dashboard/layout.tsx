import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { UserRole } from '@/types';

export default async function UserDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const users = await query<{ role: UserRole }[]>(
    "SELECT role FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
    [session.id]
  );
  const user = users[0];
  if (!user) redirect('/login');
  if (user.role === 'ADMIN') redirect('/admin/dashboard');
  if (user.role === 'DEVELOPER') redirect('/developer/tasks');

  return children;
}
