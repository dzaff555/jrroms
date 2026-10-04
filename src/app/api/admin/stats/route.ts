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

    // 1. Total Active Users
    const totalUsersResult = await query<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM users WHERE role IN ('USER', 'DEVELOPER') AND status = 'ACTIVE'"
    );
    const totalUsers = totalUsersResult[0]?.count || 0;

    // 2. Total Attended Today
    const attendedResult = await query<{ count: number }[]>(
      'SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE attendance_date = ?',
      [todayDate]
    );
    const attendedToday = attendedResult[0]?.count || 0;

    // 3. Absent Today
    const notAttendedToday = Math.max(0, totalUsers - attendedToday);

    // 4. Attendance Rate
    const attendanceRate = totalUsers > 0 ? parseFloat(((attendedToday / totalUsers) * 100).toFixed(1)) : 0;

    // 5. Friday through Sunday attendance window for the current week
    const attendanceDays = getLatestAttendanceDays();
    const recentDaysTrend = await Promise.all(
      attendanceDays.map(async (d) => {
        const countRes = await query<{ count: number }[]>(
          'SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE attendance_date = ?',
          [d.date]
        );
        return {
          day: d.day,
          date: d.date,
          count: countRes[0]?.count || 0,
        };
      })
    );

    const statsData: DashboardStats = {
      totalUsers,
      attendedToday,
      notAttendedToday,
      attendanceRate,
      recentDaysTrend,
      statusDistribution: {
        attended: attendedToday,
        absent: notAttendedToday,
      },
    };

    return NextResponse.json({
      success: true,
      data: statsData,
    });
  } catch (error: any) {
    console.error('[Admin Stats Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat statistik absensi.' },
      { status: 500 }
    );
  }
}
