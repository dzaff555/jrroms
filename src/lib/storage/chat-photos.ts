import { resolveUploadStoragePaths } from '@/lib/storage/upload-paths';
import { MAX_CHAT_PHOTO_SIZE, MAX_CHAT_VIDEO_SIZE } from '@/lib/chat/constants';

export type ChatPhotoType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export type ChatVideoType = 'video/mp4' | 'video/webm';
export type ChatMediaType = ChatPhotoType | ChatVideoType;

export { MAX_CHAT_PHOTO_SIZE, MAX_CHAT_VIDEO_SIZE };

export function getChatPhotoPaths(storageKey: string) {
  if (!/^chat\/\d+\/[0-9a-f-]{36}$/.test(storageKey)) {
    throw new Error('Lokasi foto chat tidak valid.');
  }

  return resolveUploadStoragePaths(storageKey);
}

export function isSupportedChatPhotoType(value: string): value is ChatPhotoType {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/gif' || value === 'image/webp';
}

export function isSupportedChatMediaType(value: string): value is ChatMediaType {
  return isSupportedChatPhotoType(value) || value === 'video/mp4' || value === 'video/webm';
}

export function matchesChatMediaType(bytes: Uint8Array, contentType: ChatMediaType) {
  if (contentType === 'video/mp4') {
    return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp';
  }
  if (contentType === 'video/webm') {
    return bytes.length >= 4 &&
      bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === 'image/gif') {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
}

export function matchesChatPhotoType(bytes: Uint8Array, contentType: ChatPhotoType) {
  return matchesChatMediaType(bytes, contentType);
}
