import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getJakartaDateString } from '@/lib/utils/date';

interface DeveloperTaskRecord {
  id: number;
  title: string;
  description: string;
  category: 'MODELLING' | 'SCRIPTING';
  file_required: boolean | number;
  starts_on: string;
  ends_on: string;
  created_at: string;
  is_completed: boolean | number;
}

interface DeveloperTaskFileRecord {
  id: number;
  task_id: number;
  original_name: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
}

export async function GET(request: Request) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'DEVELOPER') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Developer.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (search) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      values.push(`%${search}%`, `%${search}%`);
    }
    if (category === 'MODELLING' || category === 'SCRIPTING') {
      conditions.push('category = ?');
      values.push(category);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [tasks, files] = await Promise.all([
      query<DeveloperTaskRecord[]>(
        `SELECT t.id, t.title, t.description, t.category, t.file_required,
          DATE_FORMAT(t.starts_on, '%Y-%m-%d') AS starts_on,
          DATE_FORMAT(t.ends_on, '%Y-%m-%d') AS ends_on,
          DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          EXISTS (
            SELECT 1 FROM developer_task_completions c
            WHERE c.task_id = t.id AND c.developer_id = ?
          ) AS is_completed
         FROM developer_tasks t ${where}
         ORDER BY t.starts_on DESC, t.id DESC`,
        [active.session.id, ...values]
      ),
      query<DeveloperTaskFileRecord[]>(
        `SELECT id, task_id, original_name, content_type, byte_size,
          DATE_FORMAT(uploaded_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at
         FROM developer_task_files
         WHERE developer_id = ? AND status = 'COMPLETE'
         ORDER BY uploaded_at DESC, id DESC`,
        [active.session.id]
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        today: getJakartaDateString(),
        tasks: tasks.map((task) => ({
          ...task,
          file_required: Boolean(task.file_required),
          is_completed: Boolean(task.is_completed),
          files: files.filter((file) => file.task_id === task.id),
        })),
      },
    });
  } catch (error: unknown) {
    console.error('[Developer Tasks GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat tugas Developer.' }, { status: 500 });
  }
}
