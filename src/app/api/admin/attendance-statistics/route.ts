import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { resolveAttendanceDateRange } from '@/lib/admin/attendance-report';
import { getJakartaDateString } from '@/lib/utils/date';
import { countWeekendDaysSince, getDateAfter, getLastCompletedAttendanceDate } from '@/lib/attendance/stats';
import { isAttendanceRole } from '@/types';

interface AttendanceStatisticsRecord {
  id: number;
  username: string;
  attendance_role: string;
  profile_photo: string | null;
  absence_reset_date: string | null;
  created_at: string;
  attended_days: number;
  permission_days: number;
  completed_attended_days: number;
}

async function requireAdmin() {
  const session = await getSessionUser();
  return session?.role === 'ADMIN';
}

export async function GET(request: Request) {
  try {
    if (!await requireAdmin()) {
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
        DATE_FORMAT(u.absence_reset_date, '%Y-%m-%d') AS absence_reset_date,
        DATE_FORMAT(
          CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00'),
          '%Y-%m-%d %H:%i:%s'
        ) AS created_at,
        COUNT(DISTINCT CASE WHEN a.status = 'Hadir' THEN a.attendance_date END) AS attended_days,
        COUNT(DISTINCT CASE WHEN a.status = 'Izin' THEN a.attendance_date END) AS permission_days,
        COUNT(DISTINCT CASE
          WHEN a.attendance_date <= ?
            AND DAYOFWEEK(a.attendance_date) IN (1, 6, 7)
            AND (u.absence_reset_date IS NULL OR a.attendance_date > u.absence_reset_date)
          THEN a.attendance_date
        END) AS completed_attended_days
      FROM users u
      LEFT JOIN attendance a
        ON a.user_id = u.id
        AND a.attendance_date >= GREATEST(
          ?,
          DATE(CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00'))
        )
        AND a.attendance_date <= ?
      WHERE ${whereSql}
      GROUP BY u.id, u.username, u.attendance_role, u.profile_photo, u.absence_reset_date, u.created_at
      ORDER BY u.username ASC
      LIMIT ? OFFSET ?`,
      [effectiveEndDate, startDate, attendanceEndDate, ...userParams, limit, offset]
    );

    const effectiveDays = records.map((record) => {
      const resetDate = record.absence_reset_date || '';
      const resetStartDate = resetDate ? getDateAfter(resetDate) : startDate;
      const effectiveStartDate = resetStartDate > startDate ? resetStartDate : startDate;
      const expectedDays =
        effectiveStartDate <= effectiveEndDate
          ? countWeekendDaysSince(record.created_at, effectiveEndDate, effectiveStartDate)
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

export async function POST(request: Request) {
  try {
    if (!await requireAdmin()) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null
    ) {
      return NextResponse.json(
        { success: false, error: 'Permintaan reset tidak valid.' },
        { status: 400 }
      );
    }

    if ('resetAll' in body && body.resetAll === true) {
      await query(
        "UPDATE users SET absence_reset_date = ? WHERE role = 'USER'",
        [getJakartaDateString()]
      );

      return NextResponse.json({
        success: true,
        message: 'Jumlah tidak hadir direset untuk seluruh akun pengguna.',
      });
    }

    if (!('userIds' in body) || !Array.isArray(body.userIds)) {
      return NextResponse.json(
        { success: false, error: 'Daftar akun untuk reset tidak valid.' },
        { status: 400 }
      );
    }

    const userIds: unknown[] = body.userIds;
    if (
      userIds.length === 0 ||
      userIds.length > 100 ||
      userIds.some((userId) => !Number.isSafeInteger(userId) || Number(userId) <= 0)
    ) {
      return NextResponse.json(
        { success: false, error: 'Pilih antara 1 sampai 100 akun yang valid.' },
        { status: 400 }
      );
    }
    const uniqueUserIds = [...new Set(userIds.map((userId) => Number(userId)))];
    if (uniqueUserIds.length !== userIds.length) {
      return NextResponse.json(
        { success: false, error: 'Daftar akun berisi pilihan ganda.' },
        { status: 400 }
      );
    }

    const placeholders = uniqueUserIds.map(() => '?').join(', ');
    const users = await query<{ id: number }[]>(
      `SELECT id FROM users WHERE role = 'USER' AND status = 'ACTIVE' AND id IN (${placeholders})`,
      uniqueUserIds
    );
    if (users.length !== uniqueUserIds.length) {
      return NextResponse.json(
        { success: false, error: 'Sebagian akun tidak ditemukan atau tidak aktif. Muat ulang daftar akun lalu coba lagi.' },
        { status: 404 }
      );
    }

    await query(
      `UPDATE users SET absence_reset_date = ? WHERE role = 'USER' AND id IN (${placeholders})`,
      [getJakartaDateString(), ...uniqueUserIds]
    );

    return NextResponse.json({
      success: true,
      message: `Jumlah tidak hadir direset untuk ${uniqueUserIds.length} akun.`,
    });
  } catch (error: unknown) {
    console.error('[Admin Attendance Reset Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mereset jumlah tidak hadir.' },
      { status: 500 }
    );
  }
}
