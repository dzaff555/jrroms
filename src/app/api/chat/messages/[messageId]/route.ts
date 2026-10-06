import { rm } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getChatPhotoPaths } from '@/lib/storage/chat-photos';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'USER' && active.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses chat hanya untuk staf dan administrator.' }, { status: 403 });
    }

    const { messageId: messageIdParam } = await params;
    if (!/^\d+$/.test(messageIdParam) || !Number.isSafeInteger(Number(messageIdParam))) {
      return NextResponse.json({ success: false, error: 'ID pesan tidak valid.' }, { status: 400 });
    }
    const messageId = Number(messageIdParam);

    const messages = await query<{ sender_id: number; deleted_at: Date | null; image_path: string | null }[]>(
      'SELECT sender_id, deleted_at, image_path FROM staff_admin_chat_messages WHERE id = ? LIMIT 1',
      [messageId]
    );
    const message = messages[0];
    if (!message) {
      return NextResponse.json({ success: false, error: 'Pesan tidak ditemukan.' }, { status: 404 });
    }
    if (message.deleted_at) {
      return NextResponse.json({ success: false, error: 'Pesan sudah dihapus.' }, { status: 404 });
    }
    if (active.role !== 'ADMIN' && message.sender_id !== active.session.id) {
      return NextResponse.json({ success: false, error: 'Anda hanya dapat menghapus pesan sendiri.' }, { status: 403 });
    }

    const result = await query<{ affectedRows: number }>(
      `UPDATE staff_admin_chat_messages
       SET message = '', image_path = NULL, image_type = NULL, image_data = NULL,
           deleted_at = CURRENT_TIMESTAMP(6), deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [active.session.id, messageId]
    );
    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Pesan sudah dihapus.' }, { status: 404 });
    }

    if (message.image_path) {
      const { absolutePath } = getChatPhotoPaths(message.image_path);
      void rm(absolutePath, { force: true }).catch((cleanupError: unknown) => {
        console.error('[Chat Photo Delete Cleanup Error]:', cleanupError);
      });
    }

    return NextResponse.json({ success: true, message: 'Pesan berhasil dihapus untuk semua pengguna.' });
  } catch (error: unknown) {
    console.error('[Chat Message DELETE Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus pesan.' }, { status: 500 });
  }
}
