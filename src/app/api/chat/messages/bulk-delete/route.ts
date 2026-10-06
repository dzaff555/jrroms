import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';

interface ChatMessageOwner {
  id: number;
  sender_id: number;
  deleted_at: Date | null;
}

export async function POST(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'USER' && active.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses chat hanya untuk staff dan admin.' }, { status: 403 });
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
      !('ids' in body) ||
      !Array.isArray(body.ids) ||
      body.ids.length === 0 ||
      body.ids.length > 100 ||
      !body.ids.every((id) => Number.isSafeInteger(id) && id > 0)
    ) {
      return NextResponse.json({ success: false, error: 'Daftar ID pesan tidak valid.' }, { status: 400 });
    }

    const messageIds = [...new Set(body.ids as number[])];
    if (messageIds.length !== body.ids.length) {
      return NextResponse.json({ success: false, error: 'Daftar ID pesan tidak boleh duplikat.' }, { status: 400 });
    }

    const placeholders = messageIds.map(() => '?').join(', ');
    const messages = await query<ChatMessageOwner[]>(
      `SELECT id, sender_id, deleted_at
       FROM staff_admin_chat_messages
       WHERE id IN (${placeholders})`,
      messageIds
    );
    if (
      messages.length !== messageIds.length ||
      messages.some((message) =>
        message.deleted_at !== null ||
        (active.role !== 'ADMIN' && message.sender_id !== active.session.id)
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'Sebagian pesan tidak ditemukan, sudah dihapus, atau tidak dapat Anda hapus.' },
        { status: 403 }
      );
    }

    const ownershipCondition = active.role === 'ADMIN' ? '' : ' AND sender_id = ?';
    const parameters = active.role === 'ADMIN'
      ? [active.session.id, ...messageIds]
      : [active.session.id, ...messageIds, active.session.id];
    const result = await query<{ affectedRows: number }>(
      `UPDATE staff_admin_chat_messages
       SET message = '', deleted_at = CURRENT_TIMESTAMP(6), deleted_by = ?
       WHERE id IN (${placeholders}) AND deleted_at IS NULL${ownershipCondition}`,
      parameters
    );

    if (result.affectedRows !== messageIds.length) {
      return NextResponse.json(
        { success: false, error: 'Tidak semua pesan dapat dihapus. Muat ulang chat lalu coba lagi.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.affectedRows,
      message: `${result.affectedRows} pesan berhasil dihapus untuk semua pengguna.`,
    });
  } catch (error: unknown) {
    console.error('[Chat Bulk Message DELETE Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus pesan.' }, { status: 500 });
  }
}
