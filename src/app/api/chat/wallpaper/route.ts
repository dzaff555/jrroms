import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import {
  isSupportedChatPhotoType,
  matchesChatPhotoType,
  MAX_CHAT_PHOTO_SIZE,
} from '@/lib/storage/chat-photos';

export const runtime = 'nodejs';

async function getActiveChatUserId() {
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
    const userId = await getActiveChatUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun chat aktif.' }, { status: 401 });
    }

    const wallpapers = await query<{ user_id: number }[]>(
      'SELECT user_id FROM chat_user_wallpapers WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return NextResponse.json({
      success: true,
      data: wallpapers[0]
        ? { media_url: `/api/chat/wallpaper/media?v=${randomUUID()}` }
        : { media_url: null },
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: unknown) {
    console.error('[Chat Wallpaper GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat wallpaper chat.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getActiveChatUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun chat aktif.' }, { status: 401 });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_CHAT_PHOTO_SIZE + 65_536) {
      return NextResponse.json({ success: false, error: 'Ukuran wallpaper maksimal 5 MB.' }, { status: 413 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ success: false, error: 'Format berkas wallpaper tidak valid.' }, { status: 400 });
    }

    const attachment = form.get('wallpaper');
    if (!attachment || typeof attachment === 'string') {
      return NextResponse.json({ success: false, error: 'Pilih gambar wallpaper terlebih dahulu.' }, { status: 400 });
    }
    if (attachment.size < 1 || attachment.size > MAX_CHAT_PHOTO_SIZE) {
      return NextResponse.json({ success: false, error: 'Ukuran wallpaper maksimal 5 MB.' }, { status: 413 });
    }
    if (!isSupportedChatPhotoType(attachment.type)) {
      return NextResponse.json({ success: false, error: 'Format wallpaper harus JPEG, PNG, GIF, atau WebP.' }, { status: 415 });
    }

    const imageData = Buffer.from(await attachment.arrayBuffer());
    const imageType = attachment.type;
    if (!matchesChatPhotoType(imageData, imageType)) {
      return NextResponse.json({ success: false, error: 'Isi gambar tidak sesuai dengan format wallpaper.' }, { status: 415 });
    }

    await query(
      `INSERT INTO chat_user_wallpapers (user_id, image_type, image_data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE image_type = VALUES(image_type), image_data = VALUES(image_data),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, imageType, imageData]
    );
    return NextResponse.json({
      success: true,
      data: { media_url: `/api/chat/wallpaper/media?v=${randomUUID()}` },
    });
  } catch (error: unknown) {
    console.error('[Chat Wallpaper POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyimpan wallpaper chat.' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const userId = await getActiveChatUserId();
    if (userId === null) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun chat aktif.' }, { status: 401 });
    }

    await query('DELETE FROM chat_user_wallpapers WHERE user_id = ?', [userId]);
    return NextResponse.json({ success: true, data: { media_url: null } });
  } catch (error: unknown) {
    console.error('[Chat Wallpaper DELETE Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus wallpaper chat.' }, { status: 500 });
  }
}
