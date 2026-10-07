import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { resolveAttendanceDateRange } from '@/lib/admin/attendance-report';
import { getJakartaDateString } from '@/lib/utils/date';
import { countWeekendDaysSince, getLastCompletedAttendanceDate } from '@/lib/attendance/stats';
import { isAttendanceRole } from '@/types';

interface AttendanceStatisticsRecord {
  id: number;
  username: string;
  attendance_role: string;
  profile_photo: string | null;
  created_at: string;
  attended_days: number;
  permission_days: number;
  completed_attended_days: number;
}

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
    const { startDate, endDate } = resolveAttendanceDateRange(
      searchParams.get('startDate') || undefined,
      searchParams.get('endDate') || undefined
    );
    const attendanceRole = searchParams.get('attendanceRole')?.trim() || 'ALL';
    const search = searchParams.get('search')?.trim() || '';
    const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = 15;
    const offset = (page - 1) * limit;

    if (
      attendanceRole !== 'ALL' &&
      !isAttendanceRole(attendanceRole)
    ) {
      return NextResponse.json(
        { success: false, error: 'Filter peran absensi tidak valid.' },
        { status: 400 }
      );
    }

    const conditions = ["u.role = 'USER'", "u.status = 'ACTIVE'"];
    const userParams: unknown[] = [];
    if (attendanceRole !== 'ALL') {
      conditions.push('u.attendance_role = ?');
      userParams.push(attendanceRole);
    }
    if (search) {
      conditions.push('(u.username LIKE ? OR u.attendance_role LIKE ?)');
      const term = `%${search}%`;
      userParams.push(term, term);
    }
    const whereSql = conditions.join(' AND ');
    const countResult = await query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
      userParams
    );
    const totalItems = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const today = getJakartaDateString();
    const lastCompletedDate = getLastCompletedAttendanceDate();
    const effectiveEndDate = endDate < lastCompletedDate ? endDate : lastCompletedDate;
    const attendanceEndDate = endDate < today ? endDate : today;
    const records = await query<AttendanceStatisticsRecord[]>(
      `SELECT
        u.id,
        u.username,
        u.attendance_role,
        u.profile_photo,
        DATE_FORMAT(
          CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00'),
          '%Y-%m-%d %H:%i:%s'
        ) AS created_at,
        COUNT(DISTINCT CASE WHEN a.status = 'Hadir' THEN a.attendance_date END) AS attended_days,
        COUNT(DISTINCT CASE WHEN a.status = 'Izin' THEN a.attendance_date END) AS permission_days,
        COUNT(DISTINCT CASE WHEN a.attendance_date <= ? THEN a.attendance_date END) AS completed_attended_days
      FROM users u
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.attendance_date >= GREATEST(
          ?,
          DATE(CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00'))
        )
        AND a.attendance_date <= ?
        AND DAYOFWEEK(a.attendance_date) IN (1, 6, 7)
      WHERE ${whereSql}
      GROUP BY u.id, u.username, u.attendance_role, u.profile_photo, u.created_at
      ORDER BY u.username ASC
      LIMIT ? OFFSET ?`,
      [effectiveEndDate, startDate, attendanceEndDate, ...userParams, limit, offset]
    );

    const effectiveDays = records.map((record) => {
      const expectedDays =
        startDate <= effectiveEndDate
          ? countWeekendDaysSince(record.created_at, effectiveEndDate, startDate)
          : 0;
      const completedAttendedDays = Math.min(
        Number(record.completed_attended_days || 0),
        expectedDays
      );

      return {
        ...record,
        attended_days: Number(record.attended_days || 0),
        permission_days: Number(record.permission_days || 0),
        absent_days: Math.max(0, expectedDays - completedAttendedDays),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        records: effectiveDays,
        dateRange: { startDate, endDate },
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          pageSize: limit,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    console.error('[Admin Attendance Statistics Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memuat statistik absensi.' },
      { status: 500 }
    );
  }
}
