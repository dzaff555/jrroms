import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const users = await query<{ status: string; role: string }[]>(
      'SELECT status, role FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    const user = users[0];
    if (user?.status !== 'ACTIVE' || !['USER', 'ADMIN', 'DEVELOPER'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Akun tidak memiliki akses ke chat.' }, { status: 403 });
    }

    const wallpapers = await query<{ image_type: string; image_data: Buffer }[]>(
      'SELECT image_type, image_data FROM chat_user_wallpapers WHERE user_id = ? LIMIT 1',
      [session.id]
    );
    const wallpaper = wallpapers[0];
    if (!wallpaper) {
      return NextResponse.json({ success: false, error: 'Wallpaper tidak ditemukan.' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(wallpaper.image_data), {
      headers: {
        'Content-Type': wallpaper.image_type,
        'Content-Length': String(wallpaper.image_data.length),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[Chat Wallpaper Media Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat wallpaper chat.' }, { status: 500 });
  }
}
