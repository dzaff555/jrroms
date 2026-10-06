import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return NextResponse.json({ success: false, error: 'ID pengguna tidak valid.' }, { status: 400 });
    }
    if (session.id === userId) {
      return NextResponse.json(
        { success: false, error: 'Anda tidak dapat memberi peringatan pada akun sendiri.' },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Isi peringatan tidak valid.' }, { status: 400 });
    }

    const reason =
      typeof body === 'object' && body !== null && 'reason' in body && typeof body.reason === 'string'
        ? body.reason.trim()
        : '';
    if (!reason || reason.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Alasan wajib diisi dan maksimal 1000 karakter.' },
        { status: 400 }
      );
    }

    const users = await query<{ id: number }[]>(
      "SELECT id FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
      [userId]
    );
    if (!users[0]) {
      return NextResponse.json({ success: false, error: 'Akun aktif tidak ditemukan.' }, { status: 404 });
    }

    await query(
      'INSERT INTO staff_warnings (user_id, issued_by, reason) VALUES (?, ?, ?)',
      [userId, session.id, reason]
    );

    return NextResponse.json(
      { success: true, message: 'Peringatan berhasil dicatat.' },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan peringatan.';
    console.error('[Admin Staff Warning Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
