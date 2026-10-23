import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getJakartaDateString, getLatestAttendanceDays } from '@/lib/utils/date';
import { DashboardStats } from '@/types';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak. Izin Administrator diperlukan.' },
        { status: 403 }
      );
    }

    const todayDate = getJakartaDateString();

    const attendanceDays = getLatestAttendanceDays();
    const trendDates = attendanceDays.map(({ date }) => date);
    const [summaryResult, trendResult] = await Promise.all([
      query<{ total_users: number; attended: number; permission: number }[]>(
        `SELECT
          (SELECT COUNT(*) FROM users WHERE role = 'USER' AND status = 'ACTIVE') AS total_users,
          COUNT(DISTINCT CASE WHEN a.status = 'Hadir' THEN a.user_id END) AS attended,
          COUNT(DISTINCT CASE WHEN a.status = 'Izin' THEN a.user_id END) AS permission
         FROM attendance a
         JOIN users u ON u.id = a.user_id AND u.status = 'ACTIVE'
         WHERE a.attendance_date = ?`,
        [todayDate]
      ),
      query<{ attendance_date: string; count: number }[]>(
        `SELECT DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
           COUNT(DISTINCT user_id) AS count
         FROM attendance a
         WHERE a.status = 'Hadir' AND a.attendance_date IN (${trendDates.map(() => '?').join(', ')})
         GROUP BY a.attendance_date`,
        trendDates
      ),
    ]);
    const totalUsers = Number(summaryResult[0]?.total_users || 0);
    const attendedToday = Number(summaryResult[0]?.attended || 0);
    const permissionToday = Number(summaryResult[0]?.permission || 0);

    // 3. Users with no attendance record today
    const notAttendedToday = Math.max(0, totalUsers - attendedToday - permissionToday);

    // 4. Attendance Rate
    const attendanceRate = totalUsers > 0 ? parseFloat(((attendedToday / totalUsers) * 100).toFixed(1)) : 0;

    // 5. Friday through Sunday attendance window for the current week
    const attendanceCounts = new Map(
      trendResult.map(({ attendance_date, count }) => [String(attendance_date).slice(0, 10), Number(count)])
    );
    const recentDaysTrend = attendanceDays.map(({ day, date }) => ({
      day,
      date,
      count: attendanceCounts.get(date) || 0,
    }));

    const statsData: DashboardStats = {
      totalUsers,
      attendedToday,
      permissionToday,
      notAttendedToday,
      attendanceRate,
      recentDaysTrend,
      statusDistribution: {
        attended: attendedToday,
        permission: permissionToday,
        absent: notAttendedToday,
      },
    };

    return NextResponse.json({
      success: true,
      data: statsData,
    });
  } catch (error: unknown) {
    console.error('[Admin Stats Error]:', error);
    const message = error instanceof Error ? error.message : 'Gagal memuat statistik absensi.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
