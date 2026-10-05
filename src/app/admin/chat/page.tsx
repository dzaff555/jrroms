import { redirect } from 'next/navigation';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { getSessionUser } from '@/lib/auth/auth';

export default async function AdminChatPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') {
    redirect(session.role === 'DEVELOPER' ? '/developer/tasks' : '/dashboard');
  }

  return <ChatRoom currentUserId={session.id} currentUserRole={session.role} />;
}
