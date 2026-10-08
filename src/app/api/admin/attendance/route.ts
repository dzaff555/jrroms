import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getJakartaDateString } from '@/lib/utils/date';

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
    const status = searchParams.get('status')?.trim() || 'ALL';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    const todayDate = getJakartaDateString();

    // Query active users and left join today's attendance
    let baseSql = `
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.attendance_date = ?
      WHERE u.role = 'USER' AND u.status = 'ACTIVE'
    `;
    const params: any[] = [todayDate];

    if (search) {
      baseSql += ' AND (u.username LIKE ? OR a.name LIKE ? OR a.discord_username LIKE ? OR a.roblox_username LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (status === 'HADIR') {
      baseSql += " AND a.status = 'Hadir'";
    } else if (status === 'IZIN') {
      baseSql += " AND a.status = 'Izin'";
    } else if (status === 'BELUM_ABSEN') {
      baseSql += ' AND a.id IS NULL';
    }

    // Total items
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const countResult = await query<{ total: number }[]>(countSql, params);
    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    // Fetch data
    const dataSql = `
      SELECT 
        u.id as user_id,
        u.username,
        u.profile_photo,
        COALESCE(a.name, u.username) as name,
        COALESCE(a.discord_username, '-') as discord_username,
        COALESCE(a.roblox_username, '-') as roblox_username,
        ? as attendance_date,
        COALESCE(a.attendance_time, '-') as attendance_time,
        CASE WHEN a.id IS NOT NULL THEN a.status ELSE 'Belum Absen' END as status,
        a.attendance_reason,
        a.id as attendance_id
      ${baseSql}
      ORDER BY (CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END), a.attendance_time DESC, u.username ASC
      LIMIT ? OFFSET ?
    `;

    const records = await query<any[]>(dataSql, [todayDate, ...params, limit, offset]);

    return NextResponse.json({
      success: true,
      data: {
        records,
        todayDate,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          pageSize: limit,
        },
      },
    });
  } catch (error: any) {
    console.error('[Admin Attendance Monitoring Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat monitoring data absensi.' },
      { status: 500 }
    );
  }
}
