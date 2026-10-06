import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ stickerId: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    const users = await query<{ status: string; role: string }[]>(
      'SELECT status, role FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    if (users[0]?.status !== 'ACTIVE' || !['USER', 'ADMIN', 'DEVELOPER'].includes(users[0].role)) {
      return NextResponse.json({ success: false, error: 'Akses chat tidak diizinkan.' }, { status: 403 });
    }

    const { stickerId: stickerIdParam } = await params;
    if (!/^\d+$/.test(stickerIdParam) || !Number.isSafeInteger(Number(stickerIdParam))) {
      return NextResponse.json({ success: false, error: 'ID stiker tidak valid.' }, { status: 400 });
    }

    const result = await query<{ affectedRows: number }>(
      'DELETE FROM chat_favorite_stickers WHERE id = ? AND user_id = ?',
      [Number(stickerIdParam), session.id]
    );
    if (!result.affectedRows) {
      return NextResponse.json({ success: false, error: 'Stiker favorit tidak ditemukan.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[Chat Favorite Sticker DELETE Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus stiker favorit.' }, { status: 500 });
  }
}
