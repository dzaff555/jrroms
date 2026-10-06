import { NextResponse } from 'next/server';
import { query, testConnection } from '@/lib/database/db';
import { comparePassword, signToken, TOKEN_COOKIE_NAME } from '@/lib/auth/auth';
import { User, AuthSession, AttendanceRole, isAttendanceRole } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, rememberMe } = body;

    // Check connection first
    const connCheck = await testConnection();
    if (!connCheck.connected) {
      const configError = connCheck.error?.startsWith('Production requires DATABASE_URL')
        ? connCheck.error
        : connCheck.error?.startsWith('Production MySQL is configured to use localhost')
          ? connCheck.error
          : 'Koneksi database MySQL gagal. Periksa DATABASE_URL dan pastikan memakai Railway public host dan port di environment Production Vercel.';

      return NextResponse.json(
        {
          success: false,
          error: configError,
        },
        { status: 503 }
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Nama pengguna dan kata sandi wajib diisi.' },
        { status: 400 }
      );
    }

    // Query user by username or email
    const users = await query<User[]>(
      'SELECT id, username, email, password, role, status FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username.trim(), username.trim()]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ID atau kata sandi salah.' },
        { status: 401 }
      );
    }

    const user = users[0];

    // Check account status
    if (user.status === 'DISABLED') {
      return NextResponse.json(
        { success: false, error: 'Akun Anda telah dinonaktifkan oleh Administrator.' },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password || '');
    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, error: 'ID atau kata sandi salah.' },
        { status: 401 }
      );
    }

    // Create session payload
    let profileData: {
      attendance_role?: string | null;
      profile_completed?: boolean | number | string | null;
    } = {};

    try {
      const profileRows = await query<{
        attendance_role?: string | null;
        profile_completed?: number | boolean | null;
      }[]>(
        'SELECT attendance_role, profile_completed FROM users WHERE id = ? LIMIT 1',
        [user.id]
      );

      if (profileRows && profileRows.length > 0) {
        profileData = profileRows[0];
      }
    } catch {
      profileData = {};
    }

    const normalizedAttendanceRole: AttendanceRole = isAttendanceRole(profileData.attendance_role)
      ? profileData.attendance_role
      : 'CSOT';

    const profileCompleted =
      profileData.profile_completed === true ||
      profileData.profile_completed === 1 ||
      profileData.profile_completed === '1';

    const sessionPayload: AuthSession = {
      id: user.id,
      username: user.username,
      email: user.email || '',
      role: user.role,
      status: user.status,
      attendance_role: normalizedAttendanceRole,
      profile_completed: profileCompleted,
    };

    const expiresIn = rememberMe ? '30d' : '7d';
    const token = signToken(sessionPayload, expiresIn);

    const redirectUrl = user.role === 'ADMIN'
      ? '/admin/dashboard'
      : !profileCompleted
        ? '/complete-profile'
        : user.role === 'DEVELOPER'
          ? '/developer/tasks'
          : '/dashboard';

    const response = NextResponse.json({
      success: true,
      message: 'Berhasil masuk!',
      data: {
        user: sessionPayload,
        redirectUrl,
      },
    });

    // Set secure cookie
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60;
    response.cookies.set({
      name: TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });

    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan pada server saat proses masuk.';
    console.error('[Login API Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
