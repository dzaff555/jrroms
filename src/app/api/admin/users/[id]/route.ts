import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser, hashPassword } from '@/lib/auth/auth';
import { getDbPool, query } from '@/lib/database/db';
import { isAttendanceRole } from '@/types';

export async function GET(
  _request: Request,
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
    const userId = Number.parseInt(id, 10);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ success: false, error: 'ID pengguna tidak valid.' }, { status: 400 });
    }

    const users = await query<{
      id: number;
      username: string;
      real_name: string | null;
      nip: string | null;
      role: 'USER' | 'ADMIN' | 'DEVELOPER';
      status: 'ACTIVE' | 'DISABLED';
      created_at: string;
      attendance_role: string | null;
      profile_photo: string | null;
      roblox_username: string | null;
      discord_username: string | null;
      last_attendance: string | null;
      last_attendance_status: string | null;
    }[]>(
      `SELECT id, username, real_name, nip, role, status,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at,
        attendance_role, profile_photo, roblox_username, discord_username,
        (SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') FROM attendance
         WHERE user_id = users.id ORDER BY attendance_date DESC, attendance_time DESC LIMIT 1) AS last_attendance,
        (SELECT status FROM attendance
         WHERE user_id = users.id ORDER BY attendance_date DESC, attendance_time DESC LIMIT 1) AS last_attendance_status
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (!users[0]) {
      return NextResponse.json({ success: false, error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: users[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat detail pengguna.';
    console.error('[Admin User Detail Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
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

    const resolvedParams = await params;
    const targetUserId = parseInt(resolvedParams.id, 10);

    if (isNaN(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'ID pengguna tidak valid.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { role, status, attendance_role: attendanceRole, nip } = body;

    if (nip !== undefined && nip !== null && typeof nip !== 'string') {
      return NextResponse.json({ success: false, error: 'NIP tidak valid.' }, { status: 400 });
    }
    if (typeof nip === 'string' && nip.trim().length > 50) {
      return NextResponse.json({ success: false, error: 'NIP maksimal 50 karakter.' }, { status: 400 });
    }

    if (
      attendanceRole !== undefined &&
      !isAttendanceRole(attendanceRole)
    ) {
      return NextResponse.json({ success: false, error: 'Peran absensi tidak valid.' }, { status: 400 });
    }

    // Prevent admin from disabling or demoting their own logged-in account
    if (session.id === targetUserId) {
      if (status === 'DISABLED') {
        return NextResponse.json(
          { success: false, error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' },
          { status: 400 }
        );
      }
      if (role !== undefined && role !== 'ADMIN') {
        return NextResponse.json(
          { success: false, error: 'Anda tidak dapat mencabut hak akses administrator akun Anda sendiri.' },
          { status: 400 }
        );
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (role && (role === 'USER' || role === 'ADMIN' || role === 'DEVELOPER')) {
      updates.push('role = ?');
      values.push(role);
    }

    if (status && (status === 'ACTIVE' || status === 'DISABLED')) {
      updates.push('status = ?');
      values.push(status);
    }

    if (attendanceRole !== undefined) {
      updates.push('attendance_role = ?');
      values.push(attendanceRole);
    }

    if (nip !== undefined) {
      updates.push('nip = ?');
      values.push(typeof nip === 'string' && nip.trim() ? nip.trim() : null);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada perubahan yang dikirim.' },
        { status: 400 }
      );
    }

    values.push(targetUserId);

    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    return NextResponse.json({
      success: true,
      message: 'Data pengguna berhasil diperbarui.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui data pengguna.';
    console.error('[Update User Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: Request,
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
    const userId = Number.parseInt(id, 10);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ success: false, error: 'ID pengguna tidak valid.' }, { status: 400 });
    }

    const temporaryPassword = randomBytes(18).toString('base64url');
    const result = await query<{ affectedRows: number }>(
      'UPDATE users SET password = ? WHERE id = ?',
      [await hashPassword(temporaryPassword), userId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Pengguna tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, data: { temporaryPassword } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat kata sandi baru.';
    console.error('[Admin Password Reset Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
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
    const userId = Number.parseInt(id, 10);
    if (!Number.isInteger(userId)) {
      return NextResponse.json({ success: false, error: 'ID pengguna tidak valid.' }, { status: 400 });
    }
    if (session.id === userId) {
      return NextResponse.json(
        { success: false, error: 'Anda tidak dapat menghapus akun yang sedang digunakan.' },
        { status: 400 }
      );
    }

    const connection = await getDbPool().getConnection();
    try {
      await connection.beginTransaction();

      const [userRows] = await connection.query(
        'SELECT id FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );
      if (!Array.isArray(userRows) || userRows.length === 0) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: 'Pengguna tidak ditemukan.' }, { status: 404 });
      }

      await connection.query('UPDATE staff_warnings SET issued_by = NULL WHERE issued_by = ?', [userId]);
      await connection.query('UPDATE staff_admin_chat_messages SET deleted_by = NULL WHERE deleted_by = ?', [userId]);
      await connection.query('UPDATE developer_tasks SET created_by = NULL WHERE created_by = ?', [userId]);

      await connection.query('DELETE FROM developer_task_files WHERE developer_id = ?', [userId]);
      await connection.query('DELETE FROM developer_task_completions WHERE developer_id = ?', [userId]);
      await connection.query('DELETE FROM chat_favorite_stickers WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM chat_user_wallpapers WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM chat_user_chat_reads WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM user_presence WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM admin_inbox_notifications WHERE admin_id = ?', [userId]);
      await connection.query('DELETE FROM admin_attendance_inbox WHERE admin_id = ?', [userId]);
      await connection.query('DELETE FROM staff_warnings WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM attendance WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM staff_admin_chat_messages WHERE sender_id = ?', [userId]);

      const [deleteResult] = await connection.query(
        'DELETE FROM users WHERE id = ?',
        [userId]
      );
      if (!('affectedRows' in deleteResult) || deleteResult.affectedRows !== 1) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: 'Pengguna tidak ditemukan.' }, { status: 404 });
      }

      await connection.commit();
    } catch (deleteError: unknown) {
      await connection.rollback();
      throw deleteError;
    } finally {
      connection.release();
    }

    return NextResponse.json({ success: true, message: 'Akun dan riwayat absensinya berhasil dihapus.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus akun.';
    console.error('[Admin User Delete Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
