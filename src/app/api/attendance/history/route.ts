import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { Attendance } from '@/types';

export async function GET(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json(
        { success: false, error: 'Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }
    if (active.role !== 'USER') {
      return NextResponse.json(
        { success: false, error: 'Riwayat absensi tidak tersedia untuk peran ini.' },
        { status: 403 }
      );
    }
    const { session } = active;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const date = searchParams.get('date')?.trim() || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [session.id];

    if (search) {
      whereClause += ' AND (name LIKE ? OR discord_username LIKE ? OR roblox_username LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (date) {
      whereClause += ' AND attendance_date = ?';
      params.push(date);
    }

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM attendance ${whereClause}`;
    const countResult = await query<{ total: number }[]>(countSql, params);
    const totalItems = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalItems / limit) || 1;

    // Fetch data paginated
    const dataSql = `
      SELECT id, user_id, name, attendance_role, discord_username, roblox_username, 
             DATE_FORMAT(attendance_date, '%Y-%m-%d') as attendance_date, 
             attendance_time, status, attendance_reason, created_at
      FROM attendance 
      ${whereClause} 
      ORDER BY attendance_date DESC, attendance_time DESC 
      LIMIT ? OFFSET ?
    `;

    const records = await query<Attendance[]>(dataSql, [...params, limit, offset]);

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
  } catch (error: any) {
    console.error('[Attendance History Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal mengambil data riwayat absensi.' },
      { status: 500 }
    );
  }
}
