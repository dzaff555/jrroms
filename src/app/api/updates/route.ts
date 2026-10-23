import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

const CHANGE_CATEGORIES = ['users', 'attendance', 'warnings', 'adminInbox', 'taskData'] as const;

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const [currentUsers, changeVersions] = await Promise.all([
      query<{ role: 'USER' | 'ADMIN' | 'DEVELOPER'; status: 'ACTIVE' | 'DISABLED' }[]>(
        'SELECT role, status FROM users WHERE id = ? LIMIT 1',
        [session.id]
      ),
      query<{ category: string; version: string }[]>(
        'SELECT category, version::text AS version FROM app_change_versions'
      ),
    ]);
    const currentUser = currentUsers[0];

    if (!currentUser || currentUser.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: 'Akun tidak ditemukan atau sudah dinonaktifkan.' },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const versionsByCategory = new Map(
      changeVersions.map(({ category, version }) => [category, version])
    );
    const version = CHANGE_CATEGORIES
      .map((category) => `${category}:${versionsByCategory.get(category) ?? '0'}`)
      .join(':');

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
