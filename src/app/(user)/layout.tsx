import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { AuthSession } from '@/types';

interface UserLayoutSession extends AuthSession {
  profile_photo: string | null;
}

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login');

  const users = await query<UserLayoutSession[]>(
    `SELECT id, username, role, status,
      attendance_role, profile_photo, roblox_username, discord_username,
      profile_completed
     FROM users
     WHERE id = ? AND status = 'ACTIVE'
     LIMIT 1`,
    [session.id]
  );
  const user = users[0];
  if (!user) redirect('/login');
  if (user.role === 'ADMIN') redirect('/admin/dashboard');

  return <AppLayout user={user}>{children}</AppLayout>;
}
