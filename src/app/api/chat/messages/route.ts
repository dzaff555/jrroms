import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import {
  isSupportedChatMediaType,
  matchesChatMediaType,
  MAX_CHAT_AUDIO_SIZE,
  MAX_CHAT_PHOTO_SIZE,
  MAX_CHAT_VIDEO_SIZE,
  type ChatMediaType,
} from '@/lib/storage/chat-photos';

export const runtime = 'nodejs';

interface ChatAccessUser {
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
  status: 'ACTIVE' | 'DISABLED';
}

interface ChatMessage {
  id: number;
  sender_id: number;
  username: string;
  real_name: string | null;
  profile_photo: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  message: string;
  deleted_at: Date | null;
  created_at: Date;
  reply_to_id: number | null;
  reply_to_sender_id: number | null;
  reply_to_username: string | null;
  reply_to_role: 'USER' | 'ADMIN' | 'DEVELOPER' | null;
  reply_to_attendance_role: string | null;
  reply_to_message: string | null;
  reply_to_deleted_at: Date | null;
  reply_to_image_type: string | null;
  reply_to_has_media: number | boolean;
  reply_to_is_sticker: number | boolean;
  reply_to_is_voice_note: number | boolean;
  reply_to_audio_duration_seconds: number;
  image_path: string | null;
  image_type: string | null;
  has_image: number | boolean;
  is_sticker: number | boolean;
  is_voice_note: number | boolean;
  audio_duration_seconds: number;
  media_url?: string | null;
  media_type?: string | null;
  photo_url?: string | null;
  profile_photo_loaded?: number;
}

async function getChatUser({ allowDeveloper = false }: { allowDeveloper?: boolean } = {}) {
  const session = await getSessionUser();
  if (!session) return { response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };

  const users = await query<ChatAccessUser[]>(
    'SELECT role, status FROM users WHERE id = ? LIMIT 1',
    [session.id]
  );
  const user = users[0];

  if (
    !user ||
    user.status !== 'ACTIVE' ||
    (user.role !== 'USER' && user.role !== 'ADMIN' && !(allowDeveloper && user.role === 'DEVELOPER'))
  ) {
    return { response: NextResponse.json({ success: false, error: 'Akses chat hanya untuk staff dan admin.' }, { status: 403 }) };
  }

  return { session };
}

const chatMessageSelect = `
  SELECT cm.id, cm.sender_id, u.username, u.real_name, u.profile_photo, u.role, u.attendance_role,
    cm.message, cm.image_path, cm.image_type, (cm.image_data IS NOT NULL) AS has_image,
    cm.is_sticker, cm.is_voice_note, cm.audio_duration_seconds,
    cm.deleted_at, cm.created_at, cm.reply_to_id,
    replied.sender_id AS reply_to_sender_id,
    reply_user.username AS reply_to_username,
    reply_user.role AS reply_to_role,
    reply_user.attendance_role AS reply_to_attendance_role,
    replied.message AS reply_to_message,
    replied.deleted_at AS reply_to_deleted_at,
    replied.image_type AS reply_to_image_type,
    (replied.image_data IS NOT NULL OR replied.image_path IS NOT NULL) AS reply_to_has_media,
    replied.is_sticker AS reply_to_is_sticker,
    replied.is_voice_note AS reply_to_is_voice_note,
    replied.audio_duration_seconds AS reply_to_audio_duration_seconds
  FROM staff_admin_chat_messages cm
  INNER JOIN users u ON u.id = cm.sender_id
  LEFT JOIN staff_admin_chat_messages replied ON replied.id = cm.reply_to_id
  LEFT JOIN users reply_user ON reply_user.id = replied.sender_id
`;

export async function GET(request: Request) {
  try {
    const access = await getChatUser({ allowDeveloper: true });
    if ('response' in access) return access.response;

    const searchParams = new URL(request.url).searchParams;
    const searchParam = searchParams.get('search');
    const aroundParam = searchParams.get('around');
    const afterParam = searchParams.get('after');
    const deletedAfter = searchParams.get('deletedAfter');
    if (searchParam !== null && (searchParam.trim().length < 1 || searchParam.length > 200)) {
      return NextResponse.json({ success: false, error: 'Kata pencarian harus berisi 1 hingga 200 karakter.' }, { status: 400 });
    }
    if (deletedAfter !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(deletedAfter)) {
      return NextResponse.json({ success: false, error: 'Parameter sinkronisasi chat tidak valid.' }, { status: 400 });
    }
    let messages: ChatMessage[];
    let clock: { server_time: string }[];
    let searchTotal: number | null = null;

    if (aroundParam !== null) {
      if (!/^\d+$/.test(aroundParam) || !Number.isSafeInteger(Number(aroundParam)) || Number(aroundParam) < 1) {
        return NextResponse.json({ success: false, error: 'ID pesan tidak valid.' }, { status: 400 });
      }
      const targetId = Number(aroundParam);
      const [before, after] = await Promise.all([
        query<ChatMessage[]>(
          `${chatMessageSelect} WHERE cm.id < ? ORDER BY cm.id DESC LIMIT 50`,
          [targetId]
        ),
        query<ChatMessage[]>(
          `${chatMessageSelect} WHERE cm.id >= ? ORDER BY cm.id ASC LIMIT 51`,
          [targetId]
        ),
      ]);
      if (!after.some((message) => message.id === targetId)) {
        return NextResponse.json({ success: false, error: 'Pesan tidak ditemukan.' }, { status: 404 });
      }
      messages = [...before.reverse(), ...after];
      clock = await query<{ server_time: string }[]>(
        "SELECT DATE_FORMAT(CURRENT_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS server_time"
      );
    } else if (searchParam !== null) {
      const term = searchParam.trim();
      const [matches, count, serverClock] = await Promise.all([
        query<ChatMessage[]>(
          `${chatMessageSelect}
           WHERE cm.deleted_at IS NULL AND LOCATE(LOWER(?), LOWER(COALESCE(cm.message, ''))) > 0
           ORDER BY cm.id DESC
           LIMIT 101`,
          [term]
        ),
        query<{ total: number }[]>(
          `SELECT COUNT(*) AS total FROM staff_admin_chat_messages cm
           WHERE cm.deleted_at IS NULL AND LOCATE(LOWER(?), LOWER(COALESCE(cm.message, ''))) > 0`,
          [term]
        ),
        query<{ server_time: string }[]>(
          "SELECT DATE_FORMAT(CURRENT_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS server_time"
        ),
      ]);
      messages = matches.slice(0, 100).reverse();
      searchTotal = Number(count[0]?.total || 0);
      clock = serverClock;
    } else if (afterParam === null) {
      [messages, clock] = await Promise.all([
        query<ChatMessage[]>(`
          SELECT cm.id, cm.sender_id, u.username, u.real_name,
            CASE WHEN cm.profile_rank = 1 THEN u.profile_photo ELSE NULL END AS profile_photo,
            (cm.profile_rank = 1) AS profile_photo_loaded,
            u.role, u.attendance_role, cm.message, cm.image_path, cm.image_type, cm.is_sticker,
            cm.is_voice_note, cm.audio_duration_seconds,
            cm.has_image,
            cm.deleted_at, cm.created_at, cm.reply_to_id,
            replied.sender_id AS reply_to_sender_id,
            reply_user.username AS reply_to_username,
            reply_user.role AS reply_to_role,
            reply_user.attendance_role AS reply_to_attendance_role,
            replied.message AS reply_to_message,
            replied.deleted_at AS reply_to_deleted_at,
            replied.image_type AS reply_to_image_type,
            (replied.image_data IS NOT NULL OR replied.image_path IS NOT NULL) AS reply_to_has_media,
            replied.is_sticker AS reply_to_is_sticker,
            replied.is_voice_note AS reply_to_is_voice_note,
            replied.audio_duration_seconds AS reply_to_audio_duration_seconds
          FROM (
            SELECT recent_messages.*,
              ROW_NUMBER() OVER (PARTITION BY sender_id ORDER BY id DESC) AS profile_rank
            FROM (
              SELECT id, sender_id, message, image_path, image_type, is_sticker,
                is_voice_note, audio_duration_seconds,
                (image_data IS NOT NULL) AS has_image, deleted_at, created_at, reply_to_id
              FROM staff_admin_chat_messages
              ORDER BY id DESC
              LIMIT 100
            ) recent_messages
          ) cm
          INNER JOIN users u ON u.id = cm.sender_id
          LEFT JOIN staff_admin_chat_messages replied ON replied.id = cm.reply_to_id
          LEFT JOIN users reply_user ON reply_user.id = replied.sender_id
          ORDER BY cm.id ASC
        `),
        query<{ server_time: string }[]>(
          "SELECT DATE_FORMAT(CURRENT_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS server_time"
        ),
      ]);
    } else {
      if (!/^\d+$/.test(afterParam) || !Number.isSafeInteger(Number(afterParam))) {
        return NextResponse.json({ success: false, error: 'Parameter pesan tidak valid.' }, { status: 400 });
      }

      const [recentMessages, deletedMessages, serverClock] = await Promise.all([
        query<ChatMessage[]>(
          `${chatMessageSelect} WHERE cm.id > ? ORDER BY cm.id ASC LIMIT 100`,
          [Number(afterParam)]
        ),
        deletedAfter
          ? query<ChatMessage[]>(
              `${chatMessageSelect} WHERE cm.deleted_at >= ? ORDER BY cm.deleted_at ASC, cm.id ASC`,
              [deletedAfter]
            )
          : Promise.resolve([] as ChatMessage[]),
        query<{ server_time: string }[]>(
          "SELECT DATE_FORMAT(CURRENT_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS server_time"
        ),
      ]);
      clock = serverClock;
      messages = Array.from(
        new Map([...recentMessages, ...deletedMessages].map((message) => [message.id, message])).values()
      ).sort((left, right) => left.id - right.id);
    }

    return NextResponse.json({
      success: true,
      data: messages.map((message) => ({
        ...message,
        is_sticker: Boolean(message.is_sticker),
        media_url: message.has_image || message.image_path ? `/api/chat/messages/${message.id}/media` : null,
        media_type: message.image_type,
        photo_url: message.image_type?.startsWith('image/')
          ? `/api/chat/messages/${message.id}/media`
          : null,
        image_path: undefined,
        image_type: undefined,
        reply_to: message.reply_to_id && message.reply_to_sender_id
          ? {
              id: message.reply_to_id,
              sender_id: message.reply_to_sender_id,
              username: message.reply_to_username,
              role: message.reply_to_role,
              attendance_role: message.reply_to_attendance_role,
              message: message.reply_to_message,
              deleted_at: message.reply_to_deleted_at,
              media_url: message.reply_to_has_media
                ? `/api/chat/messages/${message.reply_to_id}/media`
                : null,
              media_type: message.reply_to_image_type,
              is_sticker: Boolean(message.reply_to_is_sticker),
              is_voice_note: Boolean(message.reply_to_is_voice_note),
              audio_duration_seconds: message.reply_to_audio_duration_seconds,
            }
          : null,
      })),
      serverTime: clock[0]?.server_time,
      ...(searchTotal === null ? {} : { searchTotal }),
    });
  } catch (error: unknown) {
    console.error('[Chat messages GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat pesan chat.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getChatUser({ allowDeveloper: true });
    if ('response' in access) return access.response;

    let message: string;
    let replyToId: number | null;
    let stickerId: number | null = null;
    let isSticker = false;
    let isVoiceNote = false;
    let audioDurationSeconds = 0;
    let favoriteImageType: ChatMediaType | null = null;
    let favoriteImageData: Buffer | null = null;
    let attachmentFile: File | null = null;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > MAX_CHAT_VIDEO_SIZE + 65_536) {
        return NextResponse.json({ success: false, error: 'Ukuran lampiran melebihi batas maksimum.' }, { status: 413 });
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return NextResponse.json({ success: false, error: 'Format pesan atau lampiran tidak valid.' }, { status: 400 });
      }

      const formMessage = form.get('message');
      const formReplyToId = form.get('replyToId');
      const formAttachment = form.get('attachment') ?? form.get('photo');
      const formIsSticker = form.get('isSticker');
      const formIsVoiceNote = form.get('isVoiceNote');
      const formAudioDuration = form.get('audioDurationSeconds');
      if (typeof formMessage !== 'string') {
        return NextResponse.json({ success: false, error: 'Format pesan tidak valid.' }, { status: 400 });
      }
      message = formMessage.trim();
      isSticker = formIsSticker === 'true';
      isVoiceNote = formIsVoiceNote === 'true';
      audioDurationSeconds = formAudioDuration === null || formAudioDuration === ''
        ? 0
        : /^\d+$/.test(formAudioDuration.toString()) && Number.isSafeInteger(Number(formAudioDuration))
          ? Number(formAudioDuration)
          : Number.NaN;
      replyToId = formReplyToId === null || formReplyToId === ''
        ? null
        : /^\d+$/.test(formReplyToId.toString()) && Number.isSafeInteger(Number(formReplyToId))
          ? Number(formReplyToId)
          : Number.NaN;
      if (formAttachment !== null) {
        if (typeof formAttachment === 'string') {
          return NextResponse.json({ success: false, error: 'Format lampiran tidak valid.' }, { status: 400 });
        }
        attachmentFile = formAttachment;
      }
    } else {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ success: false, error: 'Format pesan tidak valid.' }, { status: 400 });
      }
      if (typeof body !== 'object' || body === null) {
        return NextResponse.json({ success: false, error: 'Pesan wajib diisi.' }, { status: 400 });
      }
      const bodyMessage = 'message' in body ? body.message : '';
      if (typeof bodyMessage !== 'string') {
        return NextResponse.json({ success: false, error: 'Format pesan tidak valid.' }, { status: 400 });
      }
      const bodyReplyToId = 'replyToId' in body ? body.replyToId : null;
      replyToId = bodyReplyToId === null ? null : typeof bodyReplyToId === 'number' ? bodyReplyToId : Number.NaN;
      const bodyIsVoiceNote = 'isVoiceNote' in body ? body.isVoiceNote : false;
      isVoiceNote = typeof bodyIsVoiceNote === 'boolean' ? bodyIsVoiceNote : false;
      const bodyAudioDuration = 'audioDurationSeconds' in body ? body.audioDurationSeconds : 0;
      audioDurationSeconds = typeof bodyAudioDuration === 'number' && Number.isSafeInteger(bodyAudioDuration)
        ? bodyAudioDuration
        : Number.NaN;
      message = bodyMessage.trim();
      if ('stickerId' in body) {
        stickerId = typeof body.stickerId === 'number' && Number.isSafeInteger(body.stickerId)
          ? body.stickerId
          : Number.NaN;
      }
    }

    if (stickerId !== null) {
      if (!Number.isSafeInteger(stickerId) || stickerId < 1 || attachmentFile || message) {
        return NextResponse.json({ success: false, error: 'Stiker yang dikirim tidak valid.' }, { status: 400 });
      }
      const favorites = await query<{ image_type: string; image_data: Buffer }[]>(
        'SELECT image_type, image_data FROM chat_favorite_stickers WHERE id = ? AND user_id = ? LIMIT 1',
        [stickerId, access.session.id]
      );
      const favorite = favorites[0];
      if (!favorite || !isSupportedChatMediaType(favorite.image_type) || !favorite.image_type.startsWith('image/')) {
        return NextResponse.json({ success: false, error: 'Stiker favorit tidak ditemukan.' }, { status: 404 });
      }
      favoriteImageType = favorite.image_type;
      favoriteImageData = favorite.image_data;
      isSticker = true;
    }

    if (replyToId !== null && (!Number.isSafeInteger(replyToId) || replyToId < 1)) {
      return NextResponse.json({ success: false, error: 'Pesan yang dibalas tidak valid.' }, { status: 400 });
    }
    if (!message && !attachmentFile && stickerId === null) {
      return NextResponse.json({ success: false, error: 'Pesan atau lampiran wajib diisi.' }, { status: 400 });
    }
    const isAudioAttachment = attachmentFile?.type.startsWith('audio/') ?? false;
    if (
      !Number.isSafeInteger(audioDurationSeconds) ||
      audioDurationSeconds < 0 ||
      audioDurationSeconds > 86_400 ||
      ((isVoiceNote || audioDurationSeconds > 0) && !isAudioAttachment)
    ) {
      return NextResponse.json({ success: false, error: 'Informasi durasi audio tidak valid.' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Pesan maksimal 2000 karakter.' }, { status: 400 });
    }

    if (replyToId !== null) {
      const repliedMessages = await query<{ id: number }[]>(
        'SELECT id FROM staff_admin_chat_messages WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [replyToId]
      );
      if (!repliedMessages[0]) {
        return NextResponse.json({ success: false, error: 'Pesan yang dibalas sudah tidak tersedia.' }, { status: 404 });
      }
    }

    let imageType: ChatMediaType | null = stickerId === null ? null : favoriteImageType;
    let imageData: Buffer | null = stickerId === null ? null : favoriteImageData;
    if (attachmentFile) {
      const isVideo = attachmentFile.type.startsWith('video/');
      const isAudio = attachmentFile.type.startsWith('audio/');
      const maxSize = isVideo
        ? MAX_CHAT_VIDEO_SIZE
        : isAudio
          ? MAX_CHAT_AUDIO_SIZE
          : MAX_CHAT_PHOTO_SIZE;
      if (attachmentFile.size < 1 || attachmentFile.size > maxSize) {
        return NextResponse.json({
          success: false,
          error: isVideo
            ? 'Ukuran video maksimal 15 MB.'
            : isAudio
              ? 'Ukuran audio maksimal 15 MB.'
              : 'Ukuran foto maksimal 5 MB.',
        }, { status: 413 });
      }
      if (!isSupportedChatMediaType(attachmentFile.type)) {
        return NextResponse.json({ success: false, error: 'Format lampiran tidak didukung.' }, { status: 415 });
      }
      if (isSticker && !attachmentFile.type.startsWith('image/')) {
        return NextResponse.json({ success: false, error: 'Stiker harus berupa gambar.' }, { status: 415 });
      }
      imageType = attachmentFile.type;
      imageData = Buffer.from(await attachmentFile.arrayBuffer());
      if (!matchesChatMediaType(imageData, imageType)) {
        return NextResponse.json({ success: false, error: 'Isi file tidak sesuai dengan format lampiran.' }, { status: 415 });
      }
    }
    if (isSticker && (!imageType?.startsWith('image/') || !imageData)) {
      return NextResponse.json({ success: false, error: 'Stiker harus berupa gambar yang valid.' }, { status: 415 });
    }

    const insert = await query<{ insertId: number }>(
      'INSERT INTO staff_admin_chat_messages (sender_id, reply_to_id, message, image_path, image_type, image_data, is_sticker, is_voice_note, audio_duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [access.session.id, replyToId, message, null, imageType, imageData, isSticker, isVoiceNote, isAudioAttachment ? audioDurationSeconds : 0]
    );
    const messageId = insert.insertId;
    if (!messageId) {
      throw new Error('Chat message insert did not return an id.');
    }
    const messages = await query<ChatMessage[]>(
      `${chatMessageSelect} WHERE cm.id = ? LIMIT 1`,
      [messageId]
    );
    if (!messages[0]) {
      throw new Error('Inserted chat message could not be loaded.');
    }

    const sentMessage = messages[0];
    return NextResponse.json({
      success: true,
      data: {
        ...sentMessage,
        is_sticker: Boolean(sentMessage.is_sticker),
        media_url: sentMessage.has_image || sentMessage.image_path
          ? `/api/chat/messages/${sentMessage.id}/media`
          : null,
        media_type: sentMessage.image_type,
        photo_url: sentMessage.image_type?.startsWith('image/')
          ? `/api/chat/messages/${sentMessage.id}/media`
          : null,
        image_path: undefined,
        image_type: undefined,
        reply_to: sentMessage.reply_to_id && sentMessage.reply_to_sender_id
          ? {
              id: sentMessage.reply_to_id,
              sender_id: sentMessage.reply_to_sender_id,
              username: sentMessage.reply_to_username,
              role: sentMessage.reply_to_role,
              attendance_role: sentMessage.reply_to_attendance_role,
              message: sentMessage.reply_to_message,
              deleted_at: sentMessage.reply_to_deleted_at,
              media_url: sentMessage.reply_to_has_media
                ? `/api/chat/messages/${sentMessage.reply_to_id}/media`
                : null,
              media_type: sentMessage.reply_to_image_type,
              is_sticker: Boolean(sentMessage.reply_to_is_sticker),
              is_voice_note: Boolean(sentMessage.reply_to_is_voice_note),
              audio_duration_seconds: sentMessage.reply_to_audio_duration_seconds,
            }
          : null,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('[Chat messages POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengirim pesan.' }, { status: 500 });
  }
}
