import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export const runtime = 'nodejs';

async function getActiveUserId() {
  const session = await getSessionUser();
  if (!session) return null;

  const users = await query<{ status: string; role: string }[]>(
    'SELECT status, role FROM users WHERE id = ? LIMIT 1',
    [session.id]
  );
  const user = users[0];
  return user?.status === 'ACTIVE' && ['USER', 'ADMIN', 'DEVELOPER'].includes(user.role)
    ? session.id
    : null;
}

export async function GET() {
  try {
    const userId = await getActiveUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun aktif.' }, { status: 401 });
    }

    await query(
      `INSERT IGNORE INTO chat_user_chat_reads (user_id, last_read_message_id)
       SELECT ?, COALESCE(MAX(id), 0) FROM staff_admin_chat_messages WHERE TRUE`,
      [userId]
    );
    const unreadRows = await query<{ unread_count: number }[]>(
      `SELECT COUNT(*) AS unread_count
       FROM staff_admin_chat_messages message
       INNER JOIN chat_user_chat_reads read_state ON read_state.user_id = ?
       WHERE message.id > read_state.last_read_message_id
         AND message.sender_id <> ?
         AND message.deleted_at IS NULL`,
      [userId, userId]
    );

    return NextResponse.json({
      success: true,
      data: { unread_count: Number(unreadRows[0]?.unread_count || 0) },
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: unknown) {
    console.error('[Chat Unread GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat jumlah pesan belum dibaca.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getActiveUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun aktif.' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 });
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      !('lastReadMessageId' in body) ||
      typeof body.lastReadMessageId !== 'number' ||
      !Number.isSafeInteger(body.lastReadMessageId) ||
      body.lastReadMessageId < 0
    ) {
      return NextResponse.json({ success: false, error: 'ID pesan terakhir tidak valid.' }, { status: 400 });
    }

    const latestRows = await query<{ latest_message_id: number }[]>(
      'SELECT COALESCE(MAX(id), 0) AS latest_message_id FROM staff_admin_chat_messages'
    );
    const lastReadMessageId = Math.min(body.lastReadMessageId, Number(latestRows[0]?.latest_message_id || 0));
    await query(
      `INSERT INTO chat_user_chat_reads (user_id, last_read_message_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
      [userId, lastReadMessageId]
    );
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Chat Unread POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui status pesan terbaca.' }, { status: 500 });
  }
}
