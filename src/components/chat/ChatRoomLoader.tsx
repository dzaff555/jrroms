'use client';

import dynamic from 'next/dynamic';

const ChatRoom = dynamic(
  () => import('@/components/chat/ChatRoom').then((module) => module.ChatRoom),
  {
    loading: () => (
      <div className="flex h-full min-h-96 items-center justify-center text-sm text-slate-500">
        Memuat chat...
      </div>
    ),
  }
);

export function ChatRoomLoader({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: number;
  currentUserRole: 'USER' | 'ADMIN' | 'DEVELOPER';
}) {
  return <ChatRoom currentUserId={currentUserId} currentUserRole={currentUserRole} />;
}
