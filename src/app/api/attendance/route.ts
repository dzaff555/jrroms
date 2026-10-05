import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getJakartaDateString, getJakartaTimeString, isAttendanceWindowOpen } from '@/lib/utils/date';
import { ATTENDANCE_ROLES, Attendance, AttendanceRole } from '@/types';

export async function POST(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }
    if (active.role === 'DEVELOPER') {
      return NextResponse.json(
        { success: false, error: 'Absensi harian tidak tersedia untuk role Developer.' },
        { status: 403 }
      );
    }
    const { session } = active;

    if (!isAttendanceWindowOpen()) {
      return NextResponse.json(
        { success: false, error: 'Absensi hanya dibuka Jumat sampai Minggu pukul 05.00–18.00 WIB.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, attendance_role, discord_username, roblox_username } = body;

    // Field validations
    const errors: Record<string, string> = {};
    if (!name || !name.trim()) errors.name = 'Nama lengkap wajib diisi.';
    if (!ATTENDANCE_ROLES.includes(attendance_role)) errors.attendance_role = 'Silakan pilih role yang valid.';
    if (!discord_username || !discord_username.trim()) errors.discord_username = 'Username Discord wajib diisi.';
    if (!roblox_username || !roblox_username.trim()) errors.roblox_username = 'Username Roblox wajib diisi.';

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
        `INSERT INTO attendance (user_id, name, attendance_role, discord_username, roblox_username, attendance_date, attendance_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          name.trim(),
          attendance_role,
          discord_username.trim(),
          roblox_username.trim(),
          todayDate,
          todayTime,
          'Hadir',
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
        status: 'Hadir',
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
