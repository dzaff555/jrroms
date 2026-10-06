import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getChatPhotoPaths, isSupportedChatPhotoType, matchesChatPhotoType, MAX_CHAT_PHOTO_SIZE } from '@/lib/storage/chat-photos';

export const runtime = 'nodejs';

async function getChatUserId() {
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
    const userId = await getChatUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan login dengan akun chat aktif.' }, { status: 401 });
    }

    const stickers = await query<{
      id: number;
      image_type: string;
      source_message_id: number | null;
    }[]>(
      `SELECT id, image_type, source_message_id
       FROM chat_favorite_stickers
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [userId]
    );
    return NextResponse.json({
      success: true,
      data: stickers.map((sticker) => ({
        ...sticker,
        media_url: `/api/chat/stickers/${sticker.id}/media`,
      })),
    });
  } catch (error: unknown) {
    console.error('[Chat Favorite Stickers GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat stiker favorit.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getChatUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan login dengan akun chat aktif.' }, { status: 401 });
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
      !('messageId' in body) ||
      typeof body.messageId !== 'number' ||
      !Number.isSafeInteger(body.messageId) ||
      body.messageId < 1
    ) {
      return NextResponse.json({ success: false, error: 'ID stiker tidak valid.' }, { status: 400 });
    }

    const existing = await query<{ id: number }[]>(
      'SELECT id FROM chat_favorite_stickers WHERE user_id = ? AND source_message_id = ? LIMIT 1',
      [userId, body.messageId]
    );
    if (existing[0]) {
      return NextResponse.json({ success: true, alreadySaved: true, id: existing[0].id });
    }

    const messages = await query<{
      image_path: string | null;
      image_type: string | null;
      image_data: Buffer | null;
    }[]>(
      `SELECT image_path, image_type, image_data
       FROM staff_admin_chat_messages
       WHERE id = ? AND is_sticker = TRUE AND deleted_at IS NULL
       LIMIT 1`,
      [body.messageId]
    );
    const sticker = messages[0];
    if (!sticker?.image_type || !isSupportedChatPhotoType(sticker.image_type)) {
      return NextResponse.json({ success: false, error: 'Stiker tidak ditemukan.' }, { status: 404 });
    }

    let imageData: Buffer;
    if (sticker.image_data) {
      imageData = sticker.image_data;
    } else if (sticker.image_path) {
      const { absolutePath } = getChatPhotoPaths(sticker.image_path);
      imageData = await readFile(absolutePath);
    } else {
      return NextResponse.json({ success: false, error: 'Stiker tidak ditemukan.' }, { status: 404 });
    }
    if (
      imageData.byteLength > MAX_CHAT_PHOTO_SIZE ||
      !matchesChatPhotoType(imageData, sticker.image_type)
    ) {
      return NextResponse.json({ success: false, error: 'Data stiker tidak valid.' }, { status: 415 });
    }

    const insert = await query<{ affectedRows: number; insertId: number }>(
      `INSERT IGNORE INTO chat_favorite_stickers (user_id, source_message_id, image_type, image_data)
       VALUES (?, ?, ?, ?)`,
      [userId, body.messageId, sticker.image_type, imageData]
    );
    const savedSticker = insert.affectedRows
      ? [{ id: insert.insertId }]
      : await query<{ id: number }[]>(
          'SELECT id FROM chat_favorite_stickers WHERE user_id = ? AND source_message_id = ? LIMIT 1',
          [userId, body.messageId]
        );
    if (!savedSticker[0]) {
      throw new Error('Favorite sticker insert did not return a row.');
    }

    return NextResponse.json({ success: true, alreadySaved: insert.affectedRows === 0, id: savedSticker[0].id }, {
      status: insert.affectedRows ? 201 : 200,
    });
  } catch (error: unknown) {
    console.error('[Chat Favorite Stickers POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menambahkan stiker ke favorit.' }, { status: 500 });
  }
}
