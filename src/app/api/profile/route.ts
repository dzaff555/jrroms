import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { ATTENDANCE_ROLES, AttendanceRole } from '@/types';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const rows = await query<{
      id: number;
      username: string;
      role: 'USER' | 'ADMIN' | 'DEVELOPER';
      real_name: string | null;
      attendance_role: string | null;
      profile_photo: string | null;
      roblox_username: string | null;
      discord_username: string | null;
      profile_completed: boolean;
    }[]>(
      'SELECT id, username, role, real_name, attendance_role, profile_photo, roblox_username, discord_username, profile_completed FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );

    const user = rows[0];
    if (!user) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        real_name: user.real_name || '',
        attendance_role: user.attendance_role || 'CSOT',
        profile_photo: user.profile_photo || '',
        roblox_username: user.roblox_username || '',
        discord_username: user.discord_username || '',
        profile_completed: Boolean(user.profile_completed),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data profil.';
    console.error('[Profile GET Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const profile_photo = typeof body.profile_photo === 'string' ? body.profile_photo.trim() : '';

    if (session.role === 'ADMIN') {
      if (profile_photo && (
        profile_photo.length > 3_000_000 ||
        !profile_photo.startsWith('data:image/')
      )) {
        return NextResponse.json(
          { success: false, error: 'Foto profil tidak valid atau ukurannya melebihi batas.' },
          { status: 400 }
        );
      }

      await query('UPDATE users SET profile_photo = ? WHERE id = ?', [profile_photo || null, session.id]);
      return NextResponse.json({
        success: true,
        message: 'Foto profil administrator berhasil diperbarui.',
        data: { profile_photo },
      });
    }

    const roblox_username = typeof body.roblox_username === 'string' ? body.roblox_username.trim() : '';
    const discord_username = typeof body.discord_username === 'string' ? body.discord_username.trim() : '';
    const real_name = typeof body.real_name === 'string' ? body.real_name.trim() : '';

    if (!roblox_username) {
      return NextResponse.json(
        { success: false, error: 'Username Roblox wajib diisi.' },
        { status: 400 }
      );
    }

    if (!discord_username) {
      return NextResponse.json(
        { success: false, error: 'Username Discord wajib diisi.' },
        { status: 400 }
      );
    }

    const userRows = await query<{ attendance_role: string | null; profile_completed: boolean | number }[]>(
      'SELECT attendance_role, profile_completed FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );

    const currentUser = userRows[0];
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });
    }

    if (!real_name) {
      return NextResponse.json(
        { success: false, error: 'Nama asli wajib diisi.' },
        { status: 400 }
      );
    }
    if (real_name.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Nama asli maksimal 100 karakter.' },
        { status: 400 }
      );
    }

    const attendanceRole = ATTENDANCE_ROLES.includes(currentUser.attendance_role as AttendanceRole)
      ? currentUser.attendance_role as AttendanceRole
      : 'CSOT';

    await query(
      `UPDATE users SET profile_photo = ?, attendance_role = ?, roblox_username = ?,
       discord_username = ?, real_name = ?, profile_completed = TRUE WHERE id = ?`,
      [profile_photo || null, attendanceRole, roblox_username, discord_username, real_name, session.id]
    );

    return NextResponse.json({
      success: true,
      message: 'Biodata berhasil disimpan.',
      data: {
        profile_photo,
        attendance_role: attendanceRole,
        roblox_username,
        discord_username,
        profile_completed: true,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan biodata.';
    console.error('[Profile POST Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
