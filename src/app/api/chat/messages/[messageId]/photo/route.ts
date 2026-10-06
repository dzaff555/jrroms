import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getChatPhotoPaths, isSupportedChatPhotoType } from '@/lib/storage/chat-photos';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const users = await query<{ role: string; status: string }[]>(
      'SELECT role, status FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    const user = users[0];
    if (!user || user.status !== 'ACTIVE' || !['USER', 'ADMIN', 'DEVELOPER'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Akses chat tidak diizinkan.' }, { status: 403 });
    }

    const { messageId: messageIdParam } = await params;
    if (!/^\d+$/.test(messageIdParam) || !Number.isSafeInteger(Number(messageIdParam))) {
      return NextResponse.json({ success: false, error: 'ID pesan tidak valid.' }, { status: 400 });
    }

    const photos = await query<{
      image_path: string | null;
      image_type: string | null;
      image_data: Buffer | null;
    }[]>(
      `SELECT image_path, image_type, image_data
       FROM staff_admin_chat_messages
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [Number(messageIdParam)]
    );
    const photo = photos[0];
    if (!photo?.image_type || !isSupportedChatPhotoType(photo.image_type)) {
      return NextResponse.json({ success: false, error: 'Foto tidak ditemukan.' }, { status: 404 });
    }

    let bytes: Buffer;
    if (photo.image_data) {
      bytes = photo.image_data;
    } else if (photo.image_path) {
      const { absolutePath } = getChatPhotoPaths(photo.image_path);
      bytes = await readFile(absolutePath);
      await query(
        `UPDATE staff_admin_chat_messages
         SET image_data = ?
         WHERE id = ? AND image_data IS NULL AND deleted_at IS NULL`,
        [bytes, Number(messageIdParam)]
      );
    } else {
      return NextResponse.json({ success: false, error: 'Foto tidak ditemukan.' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': photo.image_type,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[Chat Photo GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat foto chat.' }, { status: 500 });
  }
}
