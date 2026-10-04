import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getTaskFilePaths } from '@/lib/storage/task-files';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Admin.' }, { status: 403 });
    }

    const { fileId: fileIdParam } = await params;
    const fileId = Number(fileIdParam);
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      return NextResponse.json({ success: false, error: 'ID file tidak valid.' }, { status: 400 });
    }
    const files = await query<{
      blob_name: string;
      original_name: string;
      content_type: string;
    }[]>(
      `SELECT blob_name, original_name, content_type
       FROM developer_task_files WHERE id = ? AND status = 'COMPLETE' LIMIT 1`,
      [fileId]
    );
    const file = files[0];
    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan.' }, { status: 404 });
    }

    const { absolutePath } = getTaskFilePaths(file.blob_name);
    const metadata = await stat(absolutePath);
    const stream = createReadStream(absolutePath);
    const safeFileName = file.original_name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const contentType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(file.content_type)
      ? file.content_type
      : 'application/octet-stream';

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(metadata.size),
        'Content-Disposition': `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[Admin Task File Download Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menyiapkan tautan unduhan file.' },
      { status: 500 }
    );
  }
}
