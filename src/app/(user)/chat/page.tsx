import { redirect } from 'next/navigation';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { getActiveSession } from '@/lib/auth/active-session';

export default async function ChatPage() {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role !== 'USER') {
    redirect(active.role === 'ADMIN' ? '/admin/chat' : '/developer/chat');
  }

  return <ChatRoom currentUserId={active.session.id} currentUserRole={active.role} />;
}
