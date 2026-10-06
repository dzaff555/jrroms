import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { isSupportedChatPhotoType } from '@/lib/storage/chat-photos';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stickerId: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
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

    const stickers = await query<{ image_type: string; image_data: Buffer }[]>(
      'SELECT image_type, image_data FROM chat_favorite_stickers WHERE id = ? AND user_id = ? LIMIT 1',
      [Number(stickerIdParam), session.id]
    );
    const sticker = stickers[0];
    if (!sticker || !isSupportedChatPhotoType(sticker.image_type)) {
      return NextResponse.json({ success: false, error: 'Stiker favorit tidak ditemukan.' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(sticker.image_data), {
      headers: {
        'Content-Type': sticker.image_type,
        'Content-Length': String(sticker.image_data.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[Chat Favorite Sticker Media GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat stiker favorit.' }, { status: 500 });
  }
}
