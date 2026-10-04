import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

interface ChangeFingerprint {
  users: string;
  attendance: string;
  warnings: string;
  adminInbox: string;
}

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [users, attendance, warnings, adminInbox] = await Promise.all([
      query<ChangeFingerprint[]>(
        `SELECT CONCAT_WS(':', COUNT(*), COALESCE(MAX(id), 0),
           COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, username, COALESCE(real_name, ''),
             role, status, COALESCE(attendance_role, ''), COALESCE(CRC32(profile_photo), 0),
             COALESCE(roblox_username, ''), COALESCE(discord_username, ''),
             profile_completed, COALESCE(DATE_FORMAT(updated_at, '%Y%m%d%H%i%s.%f'), '')))), 0)
         ) AS users
         FROM users`
      ),
      query<ChangeFingerprint[]>(
        `SELECT CONCAT_WS(':', COUNT(*), COALESCE(MAX(id), 0),
           COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, user_id, name, attendance_role,
             discord_username, roblox_username, attendance_date, attendance_time, status))), 0)
         ) AS attendance
         FROM attendance`
      ),
      query<ChangeFingerprint[]>(
        `SELECT CONCAT_WS(':', COUNT(*), COALESCE(MAX(id), 0),
           COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', id, user_id, COALESCE(issued_by, 0),
             reason, COALESCE(DATE_FORMAT(read_at, '%Y%m%d%H%i%s.%f'), '')))), 0)
         ) AS warnings
         FROM staff_warnings`
      ),
      query<ChangeFingerprint[]>(
        `SELECT CONCAT_WS(':', COUNT(*),
           COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', admin_id, read_through_id))), 0)
         ) AS adminInbox
         FROM admin_attendance_inbox`
      ),
    ]);

    const fingerprint = [
      users[0]?.users || '',
      attendance[0]?.attendance || '',
      warnings[0]?.warnings || '',
      adminInbox[0]?.adminInbox || '',
    ].join(':');
    const version = createHash('sha256').update(fingerprint).digest('hex');

    return NextResponse.json(
      { success: true, version },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    console.error('[Updates Check Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memeriksa perubahan data.' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
