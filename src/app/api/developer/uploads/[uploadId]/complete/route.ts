import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/auth/active-session';
import { query } from '@/lib/database/db';
import { getPrivateContainer } from '@/lib/storage/azure-blob';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 1_000_000_000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const active = await getActiveSession();
    if (!active) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }
    if (active.role !== 'DEVELOPER') {
      return NextResponse.json({ success: false, error: 'Akses hanya untuk Developer.' }, { status: 403 });
    }

    const { uploadId: uploadIdParam } = await params;
    const uploadId = Number(uploadIdParam);
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) {
      return NextResponse.json({ success: false, error: 'ID upload tidak valid.' }, { status: 400 });
    }
    const files = await query<{
      blob_name: string;
      byte_size: number;
      status: 'PENDING' | 'COMPLETE';
    }[]>(
      `SELECT blob_name, byte_size, status FROM developer_task_files
       WHERE id = ? AND developer_id = ? LIMIT 1`,
      [uploadId, active.session.id]
    );
    const file = files[0];
    if (!file) {
      return NextResponse.json({ success: false, error: 'File upload tidak ditemukan.' }, { status: 404 });
    }
    if (file.status === 'COMPLETE') {
      return NextResponse.json({ success: true, message: 'File sudah tersimpan.' });
    }

    const container = await getPrivateContainer();
    const blob = container.getBlockBlobClient(file.blob_name);
    const properties = await blob.getProperties();
    if (
      !Number.isSafeInteger(Number(file.byte_size)) ||
      Number(file.byte_size) > MAX_FILE_SIZE ||
      properties.contentLength !== Number(file.byte_size)
    ) {
      await blob.deleteIfExists();
      return NextResponse.json(
        { success: false, error: 'Ukuran file yang diunggah tidak sesuai atau melebihi 1 GB.' },
        { status: 400 }
      );
    }

    await query(
      `UPDATE developer_task_files
       SET status = 'COMPLETE', uploaded_at = CURRENT_TIMESTAMP
       WHERE id = ? AND developer_id = ? AND status = 'PENDING'`,
      [uploadId, active.session.id]
    );

    return NextResponse.json({ success: true, message: 'File berhasil diunggah.' });
  } catch (error: unknown) {
    console.error('[Developer Task Upload Complete Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal memverifikasi file di Azure Blob Storage.' },
      { status: 500 }
    );
  }
}
