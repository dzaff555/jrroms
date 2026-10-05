import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { hashPassword } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { ATTENDANCE_ROLES, AttendanceRole } from '@/types';

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role')?.trim() || 'ALL';
    const attendanceRole = searchParams.get('attendanceRole')?.trim() || 'ALL';
    const status = searchParams.get('status')?.trim() || 'ALL';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    const whereConditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (search) {
      whereConditions.push('(u.username LIKE ? OR u.attendance_role LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    if (role && role !== 'ALL') {
      whereConditions.push('u.role = ?');
      params.push(role);
    }

    if (ATTENDANCE_ROLES.includes(attendanceRole as AttendanceRole)) {
      whereConditions.push('u.attendance_role = ?');
      params.push(attendanceRole);
    }

    if (status && status !== 'ALL') {
      whereConditions.push('u.status = ?');
      params.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    // Total count
    const countSql = `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`;
    const countResult = await query<{ total: number }[]>(countSql, params);
    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    // Fetch users with last attendance date
    const dataSql = `
      SELECT 
        u.id, 
        u.username, 
        u.role, 
        u.status, 
        u.attendance_role,
        u.profile_photo,
        DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i') as created_at,
        (
          SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') 
          FROM attendance 
          WHERE user_id = u.id 
          ORDER BY attendance_date DESC 
          LIMIT 1
        ) as last_attendance
      FROM users u
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const records = await query<{
      id: number;
      username: string;
      role: 'USER' | 'ADMIN' | 'DEVELOPER';
      status: 'ACTIVE' | 'DISABLED';
      attendance_role: string;
      profile_photo: string | null;
      created_at: string;
      last_attendance: string | null;
    }[]>(dataSql, [...params, limit, offset]);

    return NextResponse.json({
      success: true,
      data: {
        records,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          pageSize: limit,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data pengguna.';
    console.error('[Admin Users Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const realName = typeof body.real_name === 'string' ? body.real_name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role === undefined ? 'USER' : body.role;
    const attendanceRole = typeof body.attendance_role === 'string' ? body.attendance_role : '';

    if (username.length < 3) {
      return NextResponse.json({ success: false, error: 'Username minimal 3 karakter.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password minimal 8 karakter.' }, { status: 400 });
    }
    if (realName.length > 100) {
      return NextResponse.json({ success: false, error: 'Nama asli maksimal 100 karakter.' }, { status: 400 });
    }
    if (role !== 'USER' && role !== 'DEVELOPER' && role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Role sistem tidak valid.' }, { status: 400 });
    }
    if (role === 'USER' && !ATTENDANCE_ROLES.includes(attendanceRole as AttendanceRole)) {
      return NextResponse.json({ success: false, error: 'Role absensi tidak valid.' }, { status: 400 });
    }
    const storedAttendanceRole = role === 'USER' ? attendanceRole : 'CSOT';

    const existing = await query<{ id: number }[]>(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'Username sudah digunakan.' }, { status: 409 });
    }

    const result = await query<{ insertId: number }>(
      `INSERT INTO users (username, real_name, email, password, role, status, attendance_role, profile_completed)
       VALUES (?, ?, NULL, ?, ?, 'ACTIVE', ?, FALSE)`,
      [username, realName || null, await hashPassword(password), role, storedAttendanceRole]
    );

    return NextResponse.json({
      success: true,
      message: 'Akun berhasil dibuat.',
      data: { id: result.insertId, username, role, attendance_role: role === 'USER' ? attendanceRole : null },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat akun.';
    console.error('[Admin User Create Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
