import { rm } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getTaskFilePaths } from '@/lib/storage/task-files';

const TASK_CATEGORIES = ['MODELLING', 'SCRIPTING'] as const;

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function authorizeAdmin() {
  const active = await getActiveSession();
  if (!active) {
    return { response: NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 }) };
  }
  if (active.role !== 'ADMIN') {
    return { response: NextResponse.json({ success: false, error: 'Akses hanya untuk administrator.' }, { status: 403 }) };
  }
  return { response: null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { response } = await authorizeAdmin();
    if (response) return response;

    const { taskId: taskIdParam } = await params;
    const taskId = Number(taskIdParam);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return NextResponse.json({ success: false, error: 'ID tugas tidak valid.' }, { status: 400 });
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
      return NextResponse.json({ success: false, error: 'Status kewajiban unggah berkas tidak valid.' }, { status: 400 });
    }

    const result = await query<{ affectedRows: number }>(
      `UPDATE developer_tasks
       SET title = ?, description = ?, category = ?, file_required = ?, starts_on = ?, ends_on = ?
       WHERE id = ?`,
      [title, description, category, fileRequired, startsOn, endsOn, taskId]
    );
    if (result.affectedRows === 0) {
      const existing = await query<{ id: number }[]>(
        'SELECT id FROM developer_tasks WHERE id = ? LIMIT 1',
        [taskId]
      );
      if (!existing[0]) {
        return NextResponse.json({ success: false, error: 'Tugas tidak ditemukan.' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true, message: 'Tugas berhasil diperbarui.' });
  } catch (error: unknown) {
    console.error('[Admin Task PATCH Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui tugas Developer.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { response } = await authorizeAdmin();
    if (response) return response;

    const { taskId: taskIdParam } = await params;
    const taskId = Number(taskIdParam);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return NextResponse.json({ success: false, error: 'ID tugas tidak valid.' }, { status: 400 });
    }

    const files = await query<{ blob_name: string }[]>(
      'SELECT blob_name FROM developer_task_files WHERE task_id = ?',
      [taskId]
    );
    const result = await query<{ affectedRows: number }>(
      'DELETE FROM developer_tasks WHERE id = ?',
      [taskId]
    );
    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Tugas tidak ditemukan.' }, { status: 404 });
    }

    const cleanupResults = await Promise.allSettled(
      files.map(async ({ blob_name }) => {
        const { absolutePath, temporaryPath } = getTaskFilePaths(blob_name);
        await Promise.all([
          rm(absolutePath, { force: true }),
          rm(temporaryPath, { force: true }),
        ]);
      })
    );
    const cleanupErrors = cleanupResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (cleanupErrors.length > 0) {
      console.error('[Admin Task File Cleanup Error]:', cleanupErrors);
    }

    return NextResponse.json({
      success: true,
      message: 'Tugas dan semua kiriman Developer terkait berhasil dihapus.',
      cleanupWarning: cleanupErrors.length > 0,
    });
  } catch (error: unknown) {
    console.error('[Admin Task DELETE Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus tugas Developer.' }, { status: 500 });
  }
}
