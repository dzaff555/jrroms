import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getJakartaDateString, isAttendanceWindowOpen } from '@/lib/utils/date';
import { Attendance } from '@/types';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    const todayDate = getJakartaDateString();

    const records = await query<Attendance[]>(
      'SELECT * FROM attendance WHERE user_id = ? AND attendance_date = ? LIMIT 1',
      [session.id, todayDate]
    );

    const hasAttended = records && records.length > 0;
    const attendance = hasAttended ? records[0] : null;
    const attendanceWindowOpen = isAttendanceWindowOpen();

    return NextResponse.json({
      success: true,
      hasAttended,
      attendanceWindowOpen,
      attendanceWindowMessage: 'Absensi dibuka Jumat–Minggu pukul 05.00–18.00 WIB.',
      todayDate,
      attendance,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mengecek status absensi hari ini.';
    console.error('[Attendance Today Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
