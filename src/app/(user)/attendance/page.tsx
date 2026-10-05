import { redirect } from 'next/navigation';
import { getActiveSession } from '@/lib/auth/active-session';
import AttendancePageClient from './AttendancePageClient';

export default async function AttendancePage() {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role === 'DEVELOPER') redirect('/developer/tasks');
  if (active.role === 'ADMIN') redirect('/admin/dashboard');

  return <AttendancePageClient />;
}
