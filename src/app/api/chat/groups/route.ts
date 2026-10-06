import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const groups = await query<{
      id: number;
      name: string;
      description: string | null;
      created_by: number | null;
      created_at: string;
      member_count: number;
      is_member: number;
    }[]>(`
      SELECT g.id, g.name, g.description, g.created_by, g.created_at,
             COUNT(DISTINCT gm.user_id) AS member_count,
             MAX(CASE WHEN gm.user_id = ? THEN 1 ELSE 0 END) AS is_member
      FROM chat_groups g
      LEFT JOIN chat_group_members gm ON gm.group_id = g.id
      GROUP BY g.id, g.name, g.description, g.created_by, g.created_at
      ORDER BY g.created_at ASC
    `, [session.id]);

    return NextResponse.json({
      success: true,
      data: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        created_by: group.created_by,
        created_at: group.created_at,
        member_count: Number(group.member_count || 0),
        is_member: Number(group.is_member || 0) === 1,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat grup chat.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();

    if (!name) {
      return NextResponse.json({ success: false, error: 'Nama grup wajib diisi.' }, { status: 400 });
    }

    const result = await query<{ insertId: number }[]>(
      'INSERT INTO chat_groups (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || null, session.id]
    );

    const groupId = result[0]?.insertId ?? 0;
    if (groupId) {
      await query('INSERT IGNORE INTO chat_group_members (group_id, user_id) VALUES (?, ?)', [groupId, session.id]);
    }

    return NextResponse.json({ success: true, data: { id: groupId, name, description } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal membuat grup chat.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
