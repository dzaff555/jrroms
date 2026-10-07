import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getJakartaDateString, getJakartaTimeString } from '@/lib/utils/date';
import { getCurrentAttendanceAvailability } from '@/lib/attendance/availability';
import { Attendance, AttendanceRole, isAttendanceRole } from '@/types';

export async function POST(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json(
        { success: false, error: 'Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }
    if (active.role === 'DEVELOPER') {
      return NextResponse.json(
        { success: false, error: 'Absensi harian tidak tersedia untuk peran Pengembang.' },
        { status: 403 }
      );
    }
    const { session } = active;

    const availability = await getCurrentAttendanceAvailability();
    if (!availability.isOpen) {
      return NextResponse.json(
        { success: false, error: availability.message },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      attendance_role,
      discord_username,
      roblox_username,
      status,
      attendance_reason,
    } = body;

    // Field validations
    const errors: Record<string, string> = {};
    if (!name || !name.trim()) errors.name = 'Nama lengkap wajib diisi.';
    if (!isAttendanceRole(attendance_role)) errors.attendance_role = 'Silakan pilih peran yang valid.';
    if (!discord_username || !discord_username.trim()) errors.discord_username = 'Nama pengguna Discord wajib diisi.';
    if (!roblox_username || !roblox_username.trim()) errors.roblox_username = 'Nama pengguna Roblox wajib diisi.';
    if (status !== 'Hadir' && status !== 'Izin') errors.status = 'Silakan pilih Hadir atau Izin.';
    const reason = typeof attendance_reason === 'string' ? attendance_reason.trim() : '';
    if (status === 'Izin' && !reason) errors.attendance_reason = 'Alasan izin wajib diisi.';
    if (reason.length > 1000) errors.attendance_reason = 'Alasan izin maksimal 1000 karakter.';

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, error: 'Silakan lengkapi semua field yang dibutuhkan.', validationErrors: errors },
        { status: 400 }
      );
    }

    const todayDate = getJakartaDateString();
    const todayTime = getJakartaTimeString();

    // Check if user already attended today in MySQL
    const existing = await query<Attendance[]>(
      'SELECT id FROM attendance WHERE user_id = ? AND attendance_date = ? LIMIT 1',
      [session.id, todayDate]
    );

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Anda sudah melakukan absensi hari ini. Setiap pengguna hanya dapat absen 1 kali per hari.' },
        { status: 400 }
      );
    }

    // Insert attendance record
    try {
      const result = await query<{ insertId: number }>(
        `INSERT INTO attendance (user_id, name, attendance_role, discord_username, roblox_username, attendance_date, attendance_time, status, attendance_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          name.trim(),
          attendance_role,
          discord_username.trim(),
          roblox_username.trim(),
          todayDate,
          todayTime,
          status,
          status === 'Izin' ? reason : null,
        ]
      );

      const insertedRecord: Attendance = {
        id: result.insertId,
        user_id: session.id,
        name: name.trim(),
        attendance_role: attendance_role as AttendanceRole,
        discord_username: discord_username.trim(),
        roblox_username: roblox_username.trim(),
        attendance_date: todayDate,
        attendance_time: todayTime,
        status,
        attendance_reason: status === 'Izin' ? reason : null,
        created_at: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        message: 'Absensi berhasil dicatat!',
        data: insertedRecord,
      });
    } catch (insertError: unknown) {
      // Catch unique constraint violation (duplicate key on user_id, attendance_date)
      const errorCode = typeof insertError === 'object' && insertError !== null && 'code' in insertError
        ? insertError.code
        : undefined;
      const errorNumber = typeof insertError === 'object' && insertError !== null && 'errno' in insertError
        ? insertError.errno
        : undefined;
      if (errorCode === 'ER_DUP_ENTRY' || errorNumber === 1062) {
        return NextResponse.json(
          { success: false, error: 'Anda sudah melakukan absensi hari ini.' },
          { status: 400 }
        );
      }
      throw insertError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal mencatat absensi.';
    console.error('[Submit Attendance Error]:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
