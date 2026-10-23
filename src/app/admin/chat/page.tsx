import { redirect } from 'next/navigation';
import { ChatRoomLoader } from '@/components/chat/ChatRoomLoader';
import { getActiveSession } from '@/lib/auth/active-session';

export default async function AdminChatPage() {
  const active = await getActiveSession();
  if (!active) redirect('/login');
  if (active.role !== 'ADMIN') {
    redirect(active.role === 'DEVELOPER' ? '/developer/chat' : '/chat');
  }

  return <ChatRoomLoader currentUserId={active.session.id} currentUserRole={active.role} />;
}
