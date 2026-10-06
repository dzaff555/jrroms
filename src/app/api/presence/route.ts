import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const users = await query<{ status: string }[]>(
      'SELECT status FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    if (users[0]?.status !== 'ACTIVE') {
      return NextResponse.json({ success: false, error: 'Akun tidak aktif.' }, { status: 403 });
    }

    await query(
      `INSERT INTO user_presence (user_id, last_seen_at)
       VALUES (?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE last_seen_at = CURRENT_TIMESTAMP`,
      [session.id]
    );
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[User Presence POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui status online.' }, { status: 500 });
  }
}
