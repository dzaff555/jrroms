import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'DEVELOPER') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Developer.' }, { status: 403 });
    }

    const { taskId: taskIdParam } = await params;
    const taskId = Number(taskIdParam);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return NextResponse.json({ success: false, error: 'ID tugas tidak valid.' }, { status: 400 });
    }

    const tasks = await query<{ id: number }[]>(
      'SELECT id FROM developer_tasks WHERE id = ? LIMIT 1',
      [taskId]
    );
    if (!tasks[0]) {
      return NextResponse.json({ success: false, error: 'Tugas tidak ditemukan.' }, { status: 404 });
    }

    await query(
      `DELETE FROM developer_task_files
       WHERE task_id = ? AND developer_id = ? AND status = 'PENDING'`,
      [taskId, active.session.id]
    );

    const [completedFiles, unfinishedFiles] = await Promise.all([
      query<{ total: number }[]>(
        `SELECT COUNT(*) AS total FROM developer_task_files
         WHERE task_id = ? AND developer_id = ? AND status = 'COMPLETE'`,
        [taskId, active.session.id]
      ),
      query<{ total: number }[]>(
        `SELECT COUNT(*) AS total FROM developer_task_files
         WHERE task_id = ? AND developer_id = ? AND status IN ('PENDING', 'UPLOADING')`,
        [taskId, active.session.id]
      ),
    ]);
    if (Number(completedFiles[0]?.total ?? 0) === 0) {
      return NextResponse.json(
        { success: false, error: 'Kirim minimal satu berkas sebelum menyelesaikan tugas.' },
        { status: 400 }
      );
    }
    if (Number(unfinishedFiles[0]?.total ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'Tunggu semua proses unggah selesai sebelum menandai tugas selesai.' },
        { status: 409 }
      );
    }

    await query(
      `INSERT IGNORE INTO developer_task_completions (task_id, developer_id)
       VALUES (?, ?)`,
      [taskId, active.session.id]
    );

    return NextResponse.json({ success: true, message: 'Tugas ditandai selesai. Unggahan berikutnya telah dikunci.' });
  } catch (error: unknown) {
    console.error('[Developer Task Completion Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menyelesaikan tugas.' }, { status: 500 });
  }
}
