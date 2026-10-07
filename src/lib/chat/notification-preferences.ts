export const CHAT_NOTIFICATION_PREFERENCE_EVENT = 'jrr-chat-notification-preference-change';
const CHAT_NOTIFICATION_PREFERENCE_KEY = 'jrr-chat-notifications-enabled';
const MUTED_CHAT_SENDERS_STORAGE_PREFIX = 'jrr-muted-chat-senders';

export function getChatNotificationPreference(userId: number) {
  return (
    'Notification' in window &&
    Notification.permission === 'granted' &&
    window.localStorage.getItem(`${CHAT_NOTIFICATION_PREFERENCE_KEY}:${userId}`) === 'true'
  );
}

export function getMutedChatSendersSnapshot(userId: number) {
  return window.localStorage.getItem(`${MUTED_CHAT_SENDERS_STORAGE_PREFIX}:${userId}`) || '[]';
}

export function parseMutedChatSenderIds(snapshot: string) {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  } catch {
    return [];
  }
}

export function setChatNotificationPreference(userId: number, enabled: boolean) {
  window.localStorage.setItem(`jrr-chat-notifications-enabled:${userId}`, String(enabled));
  window.dispatchEvent(new Event(CHAT_NOTIFICATION_PREFERENCE_EVENT));
}

export function setMutedChatSenders(userId: number, senderIds: number[]) {
  window.localStorage.setItem(
    `${MUTED_CHAT_SENDERS_STORAGE_PREFIX}:${userId}`,
    JSON.stringify(senderIds)
  );
  window.dispatchEvent(new Event(CHAT_NOTIFICATION_PREFERENCE_EVENT));
}

export function getChatNotificationIcon(profilePhoto: string | null) {
  if (!profilePhoto) return undefined;
  if (!profilePhoto.startsWith('data:image/') || profilePhoto.length <= 180_000) return profilePhoto;

  return new Promise<string | undefined>((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(undefined);
        return;
      }
      context.drawImage(image, 0, 0, 96, 96);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(undefined);
    image.src = profilePhoto;
  });
}
