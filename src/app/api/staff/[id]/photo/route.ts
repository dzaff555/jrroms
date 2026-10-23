import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

const PROFILE_PHOTO_PATTERN = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i;
const MAX_PROFILE_PHOTO_LENGTH = 3_000_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return Response.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const { id } = await params;
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return Response.json({ success: false, error: 'ID pengguna tidak valid.' }, { status: 400 });
    }

    const users = await query<{ profile_photo: string | null }[]>(
      "SELECT profile_photo FROM users WHERE id = ? AND status = 'ACTIVE' LIMIT 1",
      [userId]
    );
    const photo = users[0]?.profile_photo;
    const match = photo && photo.length <= MAX_PROFILE_PHOTO_LENGTH
      ? PROFILE_PHOTO_PATTERN.exec(photo)
      : null;

    if (!match) {
      return Response.json(
        { success: false, error: 'Foto profil tidak ditemukan.' },
        { status: 404, headers: { 'Cache-Control': 'private, max-age=60' } }
      );
    }

    return new Response(Buffer.from(match[2], 'base64'), {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Type': match[1].toLowerCase(),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[Staff Profile Photo Error]:', error);
    return Response.json(
      { success: false, error: 'Gagal memuat foto profil.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
