import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { createDownloadUrl } from '@/lib/storage/azure-blob';

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

    const url = await createDownloadUrl(file.blob_name, file.original_name, file.content_type);
    return NextResponse.json(
      { success: true, data: { url } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    console.error('[Admin Task File Download Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal menyiapkan tautan unduhan file.' },
      { status: 500 }
    );
  }
}
