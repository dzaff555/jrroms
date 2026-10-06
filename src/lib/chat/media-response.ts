import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import {
  getChatPhotoPaths,
  isSupportedChatMediaType,
} from '@/lib/storage/chat-photos';

function getByteRange(range: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      return null;
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

export async function getChatMedia(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Silakan login terlebih dahulu.' }, { status: 401 });
    }

    const users = await query<{ role: string; status: string }[]>(
      'SELECT role, status FROM users WHERE id = ? LIMIT 1',
      [session.id]
    );
    const user = users[0];
    if (!user || user.status !== 'ACTIVE' || !['USER', 'ADMIN', 'DEVELOPER'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Akses chat tidak diizinkan.' }, { status: 403 });
    }

    const { messageId: messageIdParam } = await params;
    if (!/^\d+$/.test(messageIdParam) || !Number.isSafeInteger(Number(messageIdParam))) {
      return NextResponse.json({ success: false, error: 'ID pesan tidak valid.' }, { status: 400 });
    }

    const mediaRows = await query<{
      image_path: string | null;
      image_type: string | null;
      image_data: Buffer | null;
    }[]>(
      `SELECT image_path, image_type, image_data
       FROM staff_admin_chat_messages
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [Number(messageIdParam)]
    );
    const media = mediaRows[0];
    if (!media?.image_type || !isSupportedChatMediaType(media.image_type)) {
      return NextResponse.json({ success: false, error: 'Lampiran tidak ditemukan.' }, { status: 404 });
    }

    let bytes: Buffer;
    if (media.image_data) {
      bytes = media.image_data;
    } else if (media.image_path) {
      const { absolutePath } = getChatPhotoPaths(media.image_path);
      bytes = await readFile(absolutePath);
      await query(
        `UPDATE staff_admin_chat_messages
         SET image_data = ?
         WHERE id = ? AND image_data IS NULL AND deleted_at IS NULL`,
        [bytes, Number(messageIdParam)]
      );
    } else {
      return NextResponse.json({ success: false, error: 'Lampiran tidak ditemukan.' }, { status: 404 });
    }

    const headers = new Headers({
      'Content-Type': media.image_type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const range = getByteRange(rangeHeader, bytes.byteLength);
      if (!range) {
        headers.set('Content-Range', `bytes */${bytes.byteLength}`);
        return new NextResponse(null, { status: 416, headers });
      }
      const partialBytes = bytes.subarray(range.start, range.end + 1);
      headers.set('Content-Length', String(partialBytes.byteLength));
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
      return new NextResponse(new Uint8Array(partialBytes), { status: 206, headers });
    }

    headers.set('Content-Length', String(bytes.byteLength));
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch (error: unknown) {
    console.error('[Chat Media GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memuat lampiran chat.' }, { status: 500 });
  }
}
