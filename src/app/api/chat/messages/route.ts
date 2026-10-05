import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

interface ChatAccessUser {
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
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
}

async function getChatUser() {
  const session = await getSessionUser();
  if (!session) return { response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };

  const users = await query<ChatAccessUser[]>(
    'SELECT role, status FROM users WHERE id = ? LIMIT 1',
    [session.id]
  );
  const user = users[0];

  if (!user || user.status !== 'ACTIVE' || (user.role !== 'USER' && user.role !== 'ADMIN')) {
    return { response: NextResponse.json({ success: false, error: 'Akses chat hanya untuk staff dan admin.' }, { status: 403 }) };
  }

  return { session };
}

const chatMessageSelect = `
  SELECT cm.id, cm.sender_id, u.username, u.real_name, u.profile_photo, u.role,
    cm.message, cm.deleted_at, cm.created_at
  FROM staff_admin_chat_messages cm
  INNER JOIN users u ON u.id = cm.sender_id
`;

export async function GET(request: Request) {
  try {
    const access = await getChatUser();
    if ('response' in access) return access.response;

    const afterParam = new URL(request.url).searchParams.get('after');
    const deletedAfter = new URL(request.url).searchParams.get('deletedAfter');
    if (deletedAfter !== null && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(deletedAfter)) {
      return NextResponse.json({ success: false, error: 'Parameter sinkronisasi chat tidak valid.' }, { status: 400 });
    }
    const clock = await query<{ server_time: string }[]>(
      "SELECT DATE_FORMAT(CURRENT_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') AS server_time"
    );
    let messages: ChatMessage[];

    if (afterParam === null) {
      messages = await query<ChatMessage[]>(`
        SELECT cm.id, cm.sender_id, u.username, u.real_name, u.profile_photo, u.role,
          cm.message, cm.deleted_at, cm.created_at
        FROM (
          SELECT id, sender_id, message, deleted_at, created_at
          FROM staff_admin_chat_messages
          ORDER BY id DESC
          LIMIT 100
        ) cm
        INNER JOIN users u ON u.id = cm.sender_id
        ORDER BY cm.id ASC
      `);
    } else {
      if (!/^\d+$/.test(afterParam) || !Number.isSafeInteger(Number(afterParam))) {
        return NextResponse.json({ success: false, error: 'Parameter pesan tidak valid.' }, { status: 400 });
      }

      const recentMessages = await query<ChatMessage[]>(
        `${chatMessageSelect} WHERE cm.id > ? ORDER BY cm.id ASC LIMIT 100`,
        [Number(afterParam)]
      );
      const deletedMessages = deletedAfter
        ? await query<ChatMessage[]>(
            `${chatMessageSelect} WHERE cm.deleted_at >= ? ORDER BY cm.deleted_at ASC, cm.id ASC`,
            [deletedAfter]
          )
        : [];
      messages = Array.from(
        new Map([...recentMessages, ...deletedMessages].map((message) => [message.id, message])).values()
      ).sort((left, right) => left.id - right.id);
    }

    return NextResponse.json({
      success: true,
      data: messages,
      serverTime: clock[0]?.server_time,
    });
  } catch (error: unknown) {
    console.error('[Chat messages GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat pesan chat.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getChatUser();
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

    const message = body.message.trim();
    if (!message) {
      return NextResponse.json({ success: false, error: 'Pesan tidak boleh kosong.' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Pesan maksimal 2000 karakter.' }, { status: 400 });
    }

    const insert = await query<{ insertId: number }>(
      'INSERT INTO staff_admin_chat_messages (sender_id, message) VALUES (?, ?)',
      [access.session.id, message]
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

    return NextResponse.json({ success: true, data: messages[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('[Chat messages POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengirim pesan.' }, { status: 500 });
  }
}
