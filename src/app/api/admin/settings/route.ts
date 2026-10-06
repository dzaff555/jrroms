import { NextResponse } from 'next/server';
import { getSessionUser, comparePassword, hashPassword } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { User } from '@/types';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const users = await query<Pick<User, 'id' | 'username' | 'role' | 'status' | 'created_at'>[]>(
      'SELECT id, username, role, status, created_at FROM users WHERE id = ?',
      [session.id]
    );

    return NextResponse.json({
      success: true,
      data: {
        user: users[0] || null,
      },
    });
  } catch (error: any) {
    console.error('[Admin Settings GET Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat pengaturan.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, currentPassword, newPassword, confirmNewPassword } = body;

    const users = await query<User[]>(
      'SELECT id, password FROM users WHERE id = ?',
      [session.id]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Pengguna tidak ditemukan.' },
        { status: 404 }
      );
    }

    const user = users[0];

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Kata sandi saat ini wajib diisi untuk mengubah kata sandi.' },
          { status: 400 }
        );
      }

      const isValid = await comparePassword(currentPassword, user.password || '');
      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Kata sandi saat ini yang Anda masukkan salah.' },
          { status: 400 }
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { success: false, error: 'Kata sandi baru harus terdiri dari minimal 8 karakter.' },
          { status: 400 }
        );
      }

      if (newPassword !== confirmNewPassword) {
        return NextResponse.json(
          { success: false, error: 'Kata sandi baru dan konfirmasinya tidak cocok.' },
          { status: 400 }
        );
      }

      const hashedPassword = await hashPassword(newPassword);
      await query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, session.id]);
    }

    // If updating the username
    const updates: string[] = [];
    const values: any[] = [];

    if (username && username.trim() !== '') {
      // Check if username taken by another user
      const existingUser = await query<User[]>(
        'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
        [username.trim(), session.id]
      );
      if (existingUser.length > 0) {
        return NextResponse.json(
          { success: false, error: 'Nama pengguna sudah digunakan oleh pengguna lain.' },
          { status: 409 }
        );
      }
      updates.push('username = ?');
      values.push(username.trim());
    }

    if (updates.length > 0) {
      values.push(session.id);
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    return NextResponse.json({
      success: true,
      message: 'Pengaturan akun administrator berhasil diperbarui.',
    });
  } catch (error: any) {
    console.error('[Admin Settings PUT Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memperbarui pengaturan admin.' },
      { status: 500 }
    );
  }
}
