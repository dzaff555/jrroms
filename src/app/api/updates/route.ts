import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

interface ChangeFingerprint {
  users: string;
  attendance: string;
  warnings: string;
  adminInbox: string;
  taskData: string;
}

const CHANGE_FINGERPRINT_CACHE_TTL_MS = 15_000;
let cachedChangeFingerprint: { version: string; expiresAt: number } | null = null;
let changeFingerprintPromise: Promise<string> | null = null;

async function getChangeFingerprint() {
  if (cachedChangeFingerprint && cachedChangeFingerprint.expiresAt > Date.now()) {
    return cachedChangeFingerprint.version;
  }
  if (changeFingerprintPromise) return changeFingerprintPromise;

  const fingerprintPromise = (async () => {
    const [users, attendance, warnings, adminInbox, taskData] = await Promise.all([
      query<ChangeFingerprint[]>(
        `SELECT COALESCE(md5(string_agg(to_jsonb(u)::text, ',' ORDER BY u.id)), md5('')) AS users
         FROM users u`
      ),
      query<ChangeFingerprint[]>(
        `SELECT COALESCE(md5(string_agg(to_jsonb(a)::text, ',' ORDER BY a.id)), md5('')) AS attendance
         FROM attendance a`
      ),
      query<ChangeFingerprint[]>(
        `SELECT COALESCE(md5(string_agg(to_jsonb(w)::text, ',' ORDER BY w.id)), md5('')) AS warnings
         FROM staff_warnings w`
      ),
      query<ChangeFingerprint[]>(
        `SELECT md5(
           (SELECT COALESCE(string_agg(to_jsonb(i)::text, ',' ORDER BY i.admin_id), '') FROM admin_attendance_inbox i)
           || (SELECT COALESCE(string_agg(to_jsonb(n)::text, ',' ORDER BY n.id), '') FROM admin_inbox_notifications n)
         ) AS adminInbox`
      ),
      query<ChangeFingerprint[]>(
        `SELECT md5(
           (SELECT COALESCE(string_agg(to_jsonb(t)::text, ',' ORDER BY t.id), '') FROM developer_tasks t)
           || (SELECT COALESCE(string_agg(to_jsonb(f)::text, ',' ORDER BY f.id), '') FROM developer_task_files f)
         ) AS taskData`
      ),
    ]);

    const fingerprint = [
      users[0]?.users || '',
      attendance[0]?.attendance || '',
      warnings[0]?.warnings || '',
      adminInbox[0]?.adminInbox || '',
      taskData[0]?.taskData || '',
    ].join(':');
    const version = createHash('sha256').update(fingerprint).digest('hex');
    cachedChangeFingerprint = {
      version,
      expiresAt: Date.now() + CHANGE_FINGERPRINT_CACHE_TTL_MS,
    };
    return version;
  })();
  changeFingerprintPromise = fingerprintPromise;

  try {
    return await fingerprintPromise;
  } finally {
    if (changeFingerprintPromise === fingerprintPromise) changeFingerprintPromise = null;
  }
}

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const currentUsers = await query<{ role: 'USER' | 'ADMIN' | 'DEVELOPER'; status: 'ACTIVE' | 'DISABLED' }[]>(
      'SELECT role, status FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    const currentUser = currentUsers[0];

    if (!currentUser || currentUser.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Akun tidak ditemukan atau sudah dinonaktifkan.' },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const version = await getChangeFingerprint();

    return NextResponse.json(
      { success: true, version, role: currentUser.role },
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
