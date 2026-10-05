import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

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
    cm.message, cm.deleted_at, cm.created_at, cm.reply_to_id,
    replied.sender_id AS reply_to_sender_id,
    reply_user.username AS reply_to_username,
    reply_user.role AS reply_to_role,
    reply_user.attendance_role AS reply_to_attendance_role,
    replied.message AS reply_to_message,
    replied.deleted_at AS reply_to_deleted_at
  FROM staff_admin_chat_messages cm
  INNER JOIN users u ON u.id = cm.sender_id
  LEFT JOIN staff_admin_chat_messages replied ON replied.id = cm.reply_to_id
  LEFT JOIN users reply_user ON reply_user.id = replied.sender_id
`;

export async function GET(request: Request) {
  try {
    const access = await getChatUser({ allowDeveloper: true });
    if ('response' in access) return access.response;

    const afterParam = new URL(request.url).searchParams.get('after');
    const deletedAfter = new URL(request.url).searchParams.get('deletedAfter');
    if (deletedAfter !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(deletedAfter)) {
      return NextResponse.json({ success: false, error: 'Parameter sinkronisasi chat tidak valid.' }, { status: 400 });
    }
    let messages: ChatMessage[];
    let clock: { server_time: string }[];

    if (afterParam === null) {
      [messages, clock] = await Promise.all([
        query<ChatMessage[]>(`
          SELECT cm.id, cm.sender_id, u.username, u.real_name,
            CASE WHEN cm.profile_rank = 1 THEN u.profile_photo ELSE NULL END AS profile_photo,
            (cm.profile_rank = 1) AS profile_photo_loaded,
            u.role, u.attendance_role, cm.message, cm.deleted_at, cm.created_at, cm.reply_to_id,
            replied.sender_id AS reply_to_sender_id,
            reply_user.username AS reply_to_username,
            reply_user.role AS reply_to_role,
            reply_user.attendance_role AS reply_to_attendance_role,
            replied.message AS reply_to_message,
            replied.deleted_at AS reply_to_deleted_at
          FROM (
            SELECT recent_messages.*,
              ROW_NUMBER() OVER (PARTITION BY sender_id ORDER BY id DESC) AS profile_rank
            FROM (
              SELECT id, sender_id, message, deleted_at, created_at, reply_to_id
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
        reply_to: message.reply_to_id && message.reply_to_sender_id
          ? {
              id: message.reply_to_id,
              sender_id: message.reply_to_sender_id,
              username: message.reply_to_username,
              role: message.reply_to_role,
              attendance_role: message.reply_to_attendance_role,
              message: message.reply_to_message,
              deleted_at: message.reply_to_deleted_at,
            }
          : null,
      })),
      serverTime: clock[0]?.server_time,
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Format pesan tidak valid.' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null || !('message' in body) || typeof body.message !== 'string') {
      return NextResponse.json({ success: false, error: 'Pesan wajib diisi.' }, { status: 400 });
    }
    const replyToId = 'replyToId' in body ? body.replyToId : null;
    if (replyToId !== null && (
      typeof replyToId !== 'number' || !Number.isSafeInteger(replyToId) || replyToId < 1
    )) {
      return NextResponse.json({ success: false, error: 'Pesan yang dibalas tidak valid.' }, { status: 400 });
    }

    const message = body.message.trim();
    if (!message) {
      return NextResponse.json({ success: false, error: 'Pesan tidak boleh kosong.' }, { status: 400 });
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

    const insert = await query<{ insertId: number }>(
      'INSERT INTO staff_admin_chat_messages (sender_id, reply_to_id, message) VALUES (?, ?, ?)',
      [access.session.id, replyToId, message]
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
        reply_to: sentMessage.reply_to_id && sentMessage.reply_to_sender_id
          ? {
              id: sentMessage.reply_to_id,
              sender_id: sentMessage.reply_to_sender_id,
              username: sentMessage.reply_to_username,
              role: sentMessage.reply_to_role,
              attendance_role: sentMessage.reply_to_attendance_role,
              message: sentMessage.reply_to_message,
              deleted_at: sentMessage.reply_to_deleted_at,
            }
          : null,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('[Chat messages POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengirim pesan.' }, { status: 500 });
  }
}
