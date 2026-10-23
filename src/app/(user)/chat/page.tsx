import { redirect } from 'next/navigation';
import { ChatRoomLoader } from '@/components/chat/ChatRoomLoader';
import { getActiveSession } from '@/lib/auth/active-session';

export default async function ChatPage() {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role !== 'USER') {
    redirect(active.role === 'ADMIN' ? '/admin/chat' : '/developer/chat');
  }

  return <ChatRoomLoader currentUserId={active.session.id} currentUserRole={active.role} />;
}
