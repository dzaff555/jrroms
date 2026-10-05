import { redirect } from 'next/navigation';
import { getActiveSession } from '@/lib/auth/active-session';

export default async function AttendanceHistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role === 'DEVELOPER') redirect('/developer/tasks');
  if (active.role === 'ADMIN') redirect('/admin/dashboard');

  return children;
}
