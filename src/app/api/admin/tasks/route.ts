import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';

const TASK_CATEGORIES = ['MODELLING', 'SCRIPTING'] as const;

interface TaskRecord {
  id: number;
  title: string;
  description: string;
  category: (typeof TASK_CATEGORIES)[number];
  file_required: boolean | number;
  starts_on: string;
  ends_on: string;
  created_at: string;
  created_by_username: string | null;
}

interface TaskFileRecord {
  id: number;
  task_id: number;
  developer_username: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
}

export async function GET() {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Admin.' }, { status: 403 });
    }

    const tasks = await query<TaskRecord[]>(
      `SELECT t.id, t.title, t.description, t.category, t.file_required,
        DATE_FORMAT(t.starts_on, '%Y-%m-%d') AS starts_on,
        DATE_FORMAT(t.ends_on, '%Y-%m-%d') AS ends_on,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        u.username AS created_by_username
       FROM developer_tasks t
       LEFT JOIN users u ON u.id = t.created_by
       ORDER BY t.created_at DESC, t.id DESC`
    );
    const files = await query<TaskFileRecord[]>(
      `SELECT f.id, f.task_id, u.username AS developer_username, f.original_name,
        f.content_type, f.byte_size,
        DATE_FORMAT(f.uploaded_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at
       FROM developer_task_files f
       JOIN users u ON u.id = f.developer_id
       WHERE f.status = 'COMPLETE'
       ORDER BY f.uploaded_at DESC, f.id DESC`
    );

    return NextResponse.json({
      success: true,
      data: tasks.map((task) => ({
        ...task,
        file_required: Boolean(task.file_required),
        files: files.filter((file) => file.task_id === task.id),
      })),
    });
  } catch (error: unknown) {
    console.error('[Admin Tasks GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat tugas developer.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Admin.' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Format data tugas tidak valid.' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ success: false, error: 'Format data tugas tidak valid.' }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const category = data.category;
    const startsOn = typeof data.startsOn === 'string' ? data.startsOn : '';
    const endsOn = typeof data.endsOn === 'string' ? data.endsOn : '';
    const fileRequired = data.fileRequired;
    const isValidDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };

    if (!title || title.length > 180 || !description || description.length > 10000) {
      return NextResponse.json(
        { success: false, error: 'Judul wajib diisi (maksimal 180 karakter) dan deskripsi wajib diisi (maksimal 10.000 karakter).' },
        { status: 400 }
      );
    }
    if (typeof category !== 'string' || !TASK_CATEGORIES.includes(category as (typeof TASK_CATEGORIES)[number])) {
      return NextResponse.json({ success: false, error: 'Pilih tag Modelling atau Scripting.' }, { status: 400 });
    }
    if (!isValidDate(startsOn) || !isValidDate(endsOn) || startsOn > endsOn) {
      return NextResponse.json({ success: false, error: 'Rentang tanggal tugas tidak valid.' }, { status: 400 });
    }
    if (typeof fileRequired !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Status kewajiban upload file tidak valid.' }, { status: 400 });
    }

    const result = await query<{ insertId: number }>(
      `INSERT INTO developer_tasks
        (title, description, category, file_required, starts_on, ends_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, category, fileRequired, startsOn, endsOn, active.session.id]
    );

    return NextResponse.json(
      { success: true, message: 'Tugas berhasil dibuat.', data: { id: result.insertId } },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[Admin Tasks POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal membuat tugas developer.' }, { status: 500 });
  }
}
