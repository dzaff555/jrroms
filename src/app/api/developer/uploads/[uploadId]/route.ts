import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getTaskFilePaths, MAX_TASK_FILE_SIZE } from '@/lib/storage/task-files';

export const runtime = 'nodejs';

class InvalidUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  let temporaryPath: string | null = null;
  let permanentPath: string | null = null;
  let claimedUploadId: number | null = null;
  let developerId: number | null = null;
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan masuk terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'DEVELOPER') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Developer.' }, { status: 403 });
    }

    const { uploadId: uploadIdParam } = await params;
    const uploadId = Number(uploadIdParam);
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) {
      return NextResponse.json({ success: false, error: 'ID unggahan tidak valid.' }, { status: 400 });
    }
    const files = await query<{
      blob_name: string;
      byte_size: number;
      status: 'PENDING' | 'UPLOADING' | 'COMPLETE';
      task_id: number;
      task_title: string;
      developer_username: string;
      original_name: string;
    }[]>(
      `SELECT f.blob_name, f.byte_size, f.status, f.task_id, f.original_name,
         t.title AS task_title, u.username AS developer_username
       FROM developer_task_files f
       JOIN developer_tasks t ON t.id = f.task_id
       JOIN users u ON u.id = f.developer_id
       WHERE f.id = ? AND f.developer_id = ? LIMIT 1`,
      [uploadId, active.session.id]
    );
    const file = files[0];
    if (!file) {
      return NextResponse.json({ success: false, error: 'Unggahan berkas tidak ditemukan.' }, { status: 404 });
    }
    if (file.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'Unggahan ini sudah dimulai atau sudah selesai.' }, { status: 409 });
    }
    const completedTasks = await query<{ task_id: number }[]>(
      `SELECT task_id FROM developer_task_completions
       WHERE task_id = ? AND developer_id = ? LIMIT 1`,
      [file.task_id, active.session.id]
    );
    if (completedTasks[0]) {
      return NextResponse.json(
        { success: false, error: 'Tugas ini sudah selesai. Unggahan baru tidak dapat diproses.' },
        { status: 409 }
      );
    }

    const expectedSize = Number(file.byte_size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_TASK_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Ukuran berkas tidak valid atau melebihi 1 GB.' },
        { status: 400 }
      );
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) !== expectedSize) {
      return NextResponse.json({ success: false, error: 'Ukuran berkas yang dikirim tidak sesuai.' }, { status: 400 });
    }
    if (!request.body) {
      return NextResponse.json({ success: false, error: 'Isi berkas tidak ditemukan.' }, { status: 400 });
    }

    const { absolutePath, temporaryPath: tempPath } = getTaskFilePaths(file.blob_name);
    temporaryPath = tempPath;
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const claim = await query<{ affectedRows: number }>(
      `UPDATE developer_task_files SET status = 'UPLOADING'
       WHERE id = ? AND developer_id = ? AND status = 'PENDING'`,
      [uploadId, active.session.id]
    );
    if (claim.affectedRows === 0) {
      return NextResponse.json({ success: false, error: 'Unggahan ini sudah dimulai atau sudah selesai.' }, { status: 409 });
    }
    claimedUploadId = uploadId;
    developerId = active.session.id;

    let receivedBytes = 0;
    const sizeGuard = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.byteLength;
        if (receivedBytes > expectedSize || receivedBytes > MAX_TASK_FILE_SIZE) {
          callback(new InvalidUploadError('Ukuran berkas melebihi ukuran yang diizinkan.', 413));
          return;
        }
        callback(null, buffer);
      },
    });

    await pipeline(
      Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>),
      sizeGuard,
      createWriteStream(tempPath, { flags: 'wx' })
    );

    if (receivedBytes !== expectedSize) {
      throw new InvalidUploadError('Unggahan tidak lengkap. Ukuran berkas yang diterima tidak sesuai.', 400);
    }

    await rename(tempPath, absolutePath);
    temporaryPath = null;
    permanentPath = absolutePath;

    const update = await query<{ affectedRows: number }>(
      `UPDATE developer_task_files
       SET status = 'COMPLETE', uploaded_at = CURRENT_TIMESTAMP
       WHERE id = ? AND developer_id = ? AND status = 'UPLOADING'`,
      [uploadId, active.session.id]
    );
    if (update.affectedRows === 0) {
      await rm(absolutePath, { force: true });
      permanentPath = null;
      return NextResponse.json({ success: false, error: 'Status unggahan sudah berubah. Silakan muat ulang.' }, { status: 409 });
    }
    permanentPath = null;
    claimedUploadId = null;
    await query(
      `INSERT IGNORE INTO admin_inbox_notifications
        (admin_id, event_key, title, message)
       SELECT id, ?, 'Project Quest telah diunggah',
         CONCAT(?, ' telah mengunggah project untuk quest "', ?, '" (file: "', ?, '").')
       FROM users
       WHERE role = 'ADMIN'`,
      [`developer-upload:${uploadId}`, file.developer_username, file.task_title, file.original_name]
    );

    return NextResponse.json({ success: true, message: 'Berkas berhasil diunggah ke aplikasi.' });
  } catch (error: unknown) {
    if (temporaryPath) {
      await rm(temporaryPath, { force: true }).catch((cleanupError: unknown) => {
        console.error('[Developer Task Partial Upload Cleanup Error]:', cleanupError);
      });
    }
    if (permanentPath) {
      await rm(permanentPath, { force: true }).catch((cleanupError: unknown) => {
        console.error('[Developer Task Upload Cleanup Error]:', cleanupError);
      });
    }
    if (claimedUploadId !== null && developerId !== null) {
      await query(
        `UPDATE developer_task_files SET status = 'PENDING'
         WHERE id = ? AND developer_id = ? AND status = 'UPLOADING'`,
        [claimedUploadId, developerId]
      ).catch((resetError: unknown) => {
        console.error('[Developer Task Upload Reset Error]:', resetError);
      });
    }
    console.error('[Developer Task Upload Complete Error]:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Gagal menyimpan berkas tugas.' },
      { status: error instanceof InvalidUploadError ? error.status : 500 }
    );
  }
}
