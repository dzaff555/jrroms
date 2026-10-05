import { redirect } from 'next/navigation';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { getActiveSession } from '@/lib/auth/active-session';

export default async function DeveloperChatPage() {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role !== 'DEVELOPER') {
    redirect(active.role === 'ADMIN' ? '/admin/chat' : '/chat');
  }

  return <ChatRoom currentUserId={active.session.id} currentUserRole={active.role} />;
}
