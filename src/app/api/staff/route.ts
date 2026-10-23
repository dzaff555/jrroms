import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10));
    const includeAll = searchParams.get('all') === 'true';
    const includePhotos = searchParams.get('includePhotos') !== 'false';
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const offset = (page - 1) * limit;

    const countRows = await query<{ total: number }[]>(
      "SELECT COUNT(*) AS total FROM users WHERE status = 'ACTIVE'"
    );
    const totalStaff = countRows[0]?.total || 0;
    const records = await query<{
      id: number;
      username: string;
      role: 'USER' | 'ADMIN' | 'DEVELOPER';
      attendance_role: string | null;
      profile_photo: string | null;
      has_profile_photo: boolean;
      profile_photo_version: Date | string;
      is_online: number | boolean;
    }[]>(
      `SELECT users.id, users.username, users.role, users.attendance_role,
         ${includePhotos ? 'users.profile_photo' : 'NULL::TEXT'} AS profile_photo,
         users.profile_photo IS NOT NULL AS has_profile_photo,
         users.updated_at AS profile_photo_version,
         CASE WHEN presence.last_seen_at >= CURRENT_TIMESTAMP - INTERVAL 30 SECOND THEN TRUE ELSE FALSE END AS is_online
       FROM users
       LEFT JOIN user_presence AS presence ON presence.user_id = users.id
       WHERE users.status = 'ACTIVE'
       ORDER BY users.username ASC${includeAll ? '' : ' LIMIT ? OFFSET ?'}`,
      includeAll ? [] : [limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: {
        records,
        totalStaff,
        pagination: {
          currentPage: page,
          pageSize: includeAll ? totalStaff : limit,
          totalPages: includeAll ? 1 : Math.ceil(totalStaff / limit) || 1,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat daftar staff.';
    console.error('[Staff Directory Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}