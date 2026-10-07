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
      "SELECT COUNT(*) as count FROM users WHERE role = 'USER' AND status = 'ACTIVE'"
    );
    const totalUsers = totalUsersResult[0]?.count || 0;

    // 2. Total Attended Today
    const attendanceResult = await query<{ attended: number; permission: number }[]>(
      `SELECT
        COUNT(DISTINCT CASE WHEN status = 'Hadir' THEN user_id END) AS attended,
        COUNT(DISTINCT CASE WHEN status = 'Izin' THEN user_id END) AS permission
       FROM attendance
       WHERE attendance_date = ?`,
      [todayDate]
    );
    const attendedToday = Number(attendanceResult[0]?.attended || 0);
    const permissionToday = Number(attendanceResult[0]?.permission || 0);

    // 3. Users with no attendance record today
    const notAttendedToday = Math.max(0, totalUsers - attendedToday - permissionToday);

    // 4. Attendance Rate
    const attendanceRate = totalUsers > 0 ? parseFloat(((attendedToday / totalUsers) * 100).toFixed(1)) : 0;

    // 5. Friday through Sunday attendance window for the current week
    const attendanceDays = getLatestAttendanceDays();
    const recentDaysTrend = await Promise.all(
      attendanceDays.map(async (d) => {
        const countRes = await query<{ count: number }[]>(
          "SELECT COUNT(DISTINCT user_id) as count FROM attendance WHERE attendance_date = ? AND status = 'Hadir'",
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
  } catch (error: any) {
    console.error('[Admin Stats Error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal memuat statistik absensi.' },
      { status: 500 }
    );
  }
}
