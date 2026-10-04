import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export default async function HomePage() {
  const session = await getSessionUser();

  if (!session) {
    redirect('/login');
  }

  const users = await query<{ role: 'USER' | 'ADMIN' | 'DEVELOPER'; status: 'ACTIVE' | 'DISABLED' }[]>(
    'SELECT role, status FROM users WHERE id = ? LIMIT 1',
    [session.id]
  );
  const user = users[0];

  if (!user || user.status !== 'ACTIVE') redirect('/login');
  if (user.role === 'ADMIN') {
    redirect('/admin/dashboard');
  }
  if (user.role === 'DEVELOPER') redirect('/developer/tasks');

  redirect('/dashboard');
}
