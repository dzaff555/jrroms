'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AuthSession } from '@/types';
import {
  CHAT_NOTIFICATION_PREFERENCE_EVENT,
  getChatNotificationIcon,
  getChatNotificationPreference,
  getMutedChatSendersSnapshot,
  parseMutedChatSenderIds,
} from '@/lib/chat/notification-preferences';

interface ChatNotificationMessage {
  id: number;
  sender_id: number;
  username: string;
  profile_photo: string | null;
  message: string;
  media_type: string | null;
  is_sticker: boolean;
  is_voice_note: boolean;
  audio_duration_seconds: number;
}

interface ChatNotificationResponse {
  success: boolean;
  data?: ChatNotificationMessage[];
  error?: string;
}

function subscribeToNotificationPreference(userId: number, onChange: () => void) {
  const handleStorageChange = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === `jrr-chat-notifications-enabled:${userId}` ||
      event.key === `jrr-muted-chat-senders:${userId}`
    ) {
      onChange();
    }
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener(CHAT_NOTIFICATION_PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener(CHAT_NOTIFICATION_PREFERENCE_EVENT, onChange);
  };
}

function getMessagePreview(message: ChatNotificationMessage) {
  if (message.message.trim()) return message.message.trim().slice(0, 180);
  if (message.is_sticker) return 'Stiker';
  if (message.media_type?.startsWith('image/')) return 'Foto';
  if (message.media_type?.startsWith('video/')) return 'Video';
  if (message.media_type?.startsWith('audio/')) {
    const seconds = Math.max(0, message.audio_duration_seconds || 0);
    const duration = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    return message.is_voice_note ? `Pesan Suara (${duration})` : `Audio (${duration})`;
  }
  return 'Pesan';
}

function getChatPath(role: AuthSession['role']) {
  if (role === 'ADMIN') return '/admin/chat';
  if (role === 'DEVELOPER') return '/developer/chat';
  return '/chat';
}

export function ChatNotificationWatcher({ user }: { user: AuthSession | null }) {
  const pathname = usePathname();
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToNotificationPreference(user?.id ?? 0, onChange),
    [user?.id]
  );

  const notificationsEnabled = useSyncExternalStore(
    subscribe,
    () => user ? getChatNotificationPreference(user.id) : false,
    () => false
  );

  useEffect(() => {
    if (
      !user ||
      !notificationsEnabled ||
      pathname === '/chat' ||
      pathname === '/admin/chat' ||
      pathname === '/developer/chat' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    const controller = new AbortController();
    let cursor: number | null = null;
    let isPolling = false;
    let hasEstablishedBaseline = false;

    const loadMessages = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const url = cursor === null
          ? '/api/chat/messages'
          : `/api/chat/messages?after=${cursor}`;
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as ChatNotificationResponse;
        if (!response.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error(result.error || 'Gagal memeriksa pesan chat baru.');
        }

        const isInitialLoad = !hasEstablishedBaseline;
        hasEstablishedBaseline = true;
        const mutedSenderIds = parseMutedChatSenderIds(getMutedChatSendersSnapshot(user.id));
        for (const message of result.data) {
          if (cursor === null || message.id > cursor) {
            cursor = Math.max(cursor ?? 0, message.id);
            if (
              !isInitialLoad &&
              message.sender_id !== user.id &&
              !mutedSenderIds.includes(message.sender_id)
            ) {
              const registration = await navigator.serviceWorker.ready;
              const chatPath = getChatPath(user.role);
              const icon = await getChatNotificationIcon(message.profile_photo);
              await registration.showNotification('Chat Staf & Admin', {
                body: `${message.username}: ${getMessagePreview(message)}`,
                ...(icon ? { icon } : {}),
                tag: `staff-admin-chat-${message.id}`,
                data: { url: chatPath },
              });
            }
          }
        }
      } catch (pollError: unknown) {
        if (!(pollError instanceof DOMException && pollError.name === 'AbortError')) {
          console.error('[Chat Device Notification Poll Error]:', pollError);
        }
      } finally {
        isPolling = false;
      }
    };

    void loadMessages();
    const intervalId = window.setInterval(() => void loadMessages(), 4000);
    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [notificationsEnabled, pathname, user]);

  return null;
}
