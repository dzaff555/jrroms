import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSessionUser, signToken, TOKEN_COOKIE_NAME } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { cookies } from 'next/headers';
import { ATTENDANCE_ROLES, AttendanceRole, AuthSession } from '@/types';

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Belum login atau session telah kedaluwarsa.' },
      { status: 401 }
    );
  }

  const users = await query<{
    username: string;
    email: string | null;
    role: 'USER' | 'ADMIN';
    status: 'ACTIVE' | 'DISABLED';
    attendance_role?: AttendanceRole | null;
    profile_photo?: string | null;
    roblox_username?: string | null;
    discord_username?: string | null;
    profile_completed?: boolean | number | null;
  }[]>(
    `SELECT username, email, role, status, attendance_role, profile_photo,
      roblox_username, discord_username, profile_completed
     FROM users WHERE id = ? LIMIT 1`,
    [session.id]
  );
  const user = users[0];

  if (!user || user.status !== 'ACTIVE') {
    const response = NextResponse.json(
      { success: false, error: 'Akun tidak ditemukan atau sudah dinonaktifkan.' },
      { status: 401 }
    );
    response.cookies.delete(TOKEN_COOKIE_NAME);
    return response;
  }

  const attendanceRole = ATTENDANCE_ROLES.includes(user.attendance_role as AttendanceRole)
    ? user.attendance_role as AttendanceRole
    : 'CSOT';
  const payload: AuthSession = {
    id: session.id,
    username: user.username,
    email: user.email || '',
    role: user.role,
    status: user.status,
    attendance_role: attendanceRole,
    profile_photo: user.profile_photo || null,
    roblox_username: user.roblox_username || null,
    discord_username: user.discord_username || null,
    profile_completed: Boolean(user?.profile_completed),
  };

  const response = NextResponse.json({
    success: true,
    data: payload,
    roleChanged: payload.role !== session.role,
  });

  if (payload.role !== session.role || payload.status !== session.status) {
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
    const decoded = token ? jwt.decode(token) : null;
    const expiration =
      decoded && typeof decoded === 'object' && typeof decoded.exp === 'number'
        ? decoded.exp
        : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const remainingSeconds = Math.max(1, expiration - Math.floor(Date.now() / 1000));

    response.cookies.set({
      name: TOKEN_COOKIE_NAME,
      value: signToken(payload, `${remainingSeconds}s`),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: remainingSeconds,
    });
  }

  return response;
}
