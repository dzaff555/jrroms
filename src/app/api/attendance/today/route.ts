import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { getJakartaDateString } from '@/lib/utils/date';
import { getCurrentAttendanceAvailability } from '@/lib/attendance/availability';
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
    const availability = await getCurrentAttendanceAvailability();

    return NextResponse.json({
      success: true,
      hasAttended,
      attendanceWindowOpen: availability.isOpen,
      attendanceWindowMessage: availability.message,
      attendanceMode: availability.mode,
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
