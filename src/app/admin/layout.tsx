import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { AuthSession } from '@/types';

interface AdminLayoutUser extends AuthSession {
  profile_photo: string | null;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const users = await query<AdminLayoutUser[]>(
    `SELECT id, username, role, status, attendance_role,
      profile_photo, roblox_username, discord_username, profile_completed
     FROM users
     WHERE id = ? AND status = 'ACTIVE'
     LIMIT 1`,
    [session.id]
  );
  const admin = users[0];
  if (!admin) redirect('/login');

  return (
    <AppLayout user={admin}>
      {admin.role === session.role ? children : null}
    </AppLayout>
  );
}
