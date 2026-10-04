import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { createUploadUrl } from '@/lib/storage/azure-blob';
import { getJakartaDateString } from '@/lib/utils/date';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 1_000_000_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'DEVELOPER') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Developer.' }, { status: 403 });
    }

    const { taskId: taskIdParam } = await params;
    const taskId = Number(taskIdParam);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return NextResponse.json({ success: false, error: 'ID tugas tidak valid.' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Data file tidak valid.' }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ success: false, error: 'Data file tidak valid.' }, { status: 400 });
    }

    const data = body as Record<string, unknown>;
    const originalName =
      typeof data.fileName === 'string'
        ? data.fileName.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()?.trim() || ''
        : '';
    const byteSize = data.byteSize;
    const contentType =
      typeof data.contentType === 'string' && data.contentType.length <= 255
        ? data.contentType
        : 'application/octet-stream';

    if (!originalName || originalName.length > 255) {
      return NextResponse.json({ success: false, error: 'Nama file tidak valid atau melebihi 255 karakter.' }, { status: 400 });
    }
    if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Ukuran maksimal setiap file adalah 1 GB.' }, { status: 400 });
    }

    const today = getJakartaDateString();
    const tasks = await query<{ id: number }[]>(
      `SELECT id FROM developer_tasks
       WHERE id = ? AND starts_on <= ? AND ends_on >= ?
       LIMIT 1`,
      [taskId, today, today]
    );
    if (!tasks[0]) {
      return NextResponse.json(
        { success: false, error: 'Tugas belum dimulai atau sudah melewati tanggal akhir.' },
        { status: 403 }
      );
    }

    const blobName = `tasks/${taskId}/${active.session.id}/${randomUUID()}`;
    const { url } = await createUploadUrl(blobName);
    const result = await query<{ insertId: number }>(
      `INSERT INTO developer_task_files
        (task_id, developer_id, blob_name, original_name, content_type, byte_size, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        taskId,
        active.session.id,
        blobName,
        originalName,
        contentType || 'application/octet-stream',
        byteSize,
      ]
    );

    return NextResponse.json(
      { success: true, data: { uploadId: result.insertId, uploadUrl: url } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    console.error('[Developer Task Upload URL Error]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Gagal menyiapkan upload file.' },
      { status: 500 }
    );
  }
}
