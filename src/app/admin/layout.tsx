import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { AuthSession } from '@/types';
import { DatabaseUnavailable } from '@/components/ui/DatabaseUnavailable';

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

  let users: AdminLayoutUser[];
  try {
    users = await query<AdminLayoutUser[]>(
      `SELECT id, username, role, status, attendance_role,
        profile_photo, roblox_username, discord_username, profile_completed
       FROM users
       WHERE id = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [session.id]
    );
  } catch (error) {
    console.error('[Admin Layout] Failed to load the administrator session from PostgreSQL.', error);
    return <DatabaseUnavailable />;
  }
  const admin = users[0];
  if (!admin) redirect('/login');
  if (admin.role !== 'ADMIN') {
    redirect(admin.role === 'DEVELOPER' ? '/developer/tasks' : '/dashboard');
  }

  return (
    <AppLayout user={admin}>
      {children}
    </AppLayout>
  );
}
