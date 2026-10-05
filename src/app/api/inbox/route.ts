import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

interface InboxWarning {
  id: number;
  warning_number: number;
  reason: string;
  warning_date: string;
  warning_time: string;
  read_at: string | null;
  issued_by_username: string | null;
}

interface AttendanceInboxItem {
  id: number;
  username: string;
  attendance_date: string;
  attendance_time: string;
  is_read: boolean;
}

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    if (session.role === 'ADMIN') {
      await query(
        `INSERT IGNORE INTO admin_attendance_inbox (admin_id, read_through_id)
         SELECT ?, COALESCE((SELECT MAX(id) FROM attendance), 0)`,
        [session.id]
      );
      const cursorRows = await query<{ read_through_id: number }[]>(
        'SELECT read_through_id FROM admin_attendance_inbox WHERE admin_id = ?',
        [session.id]
      );
      const readThroughId = Number(cursorRows[0]?.read_through_id || 0);

      const [attendances, unreadRows] = await Promise.all([
        query<AttendanceInboxItem[]>(
          `SELECT a.id, u.username,
             DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
             TIME_FORMAT(a.attendance_time, '%H:%i:%s') AS attendance_time,
             (a.id <= ?) AS is_read
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE u.role = 'USER' AND a.status = 'Hadir'
           ORDER BY a.id DESC
           LIMIT 50`,
          [readThroughId]
        ),
        query<{ total: number }[]>(
          `SELECT COUNT(*) AS total
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE a.id > ? AND u.role = 'USER' AND a.status = 'Hadir'`,
          [readThroughId]
        ),
      ]);

      return NextResponse.json({
        success: true,
        data: { attendances, unreadCount: Number(unreadRows[0]?.total || 0) },
      });
    }

    const [warnings, unreadRows] = await Promise.all([
      query<InboxWarning[]>(
        `SELECT w.id,
           (SELECT COUNT(*) FROM staff_warnings previous
            WHERE previous.user_id = w.user_id
              AND (previous.created_at < w.created_at
                OR (previous.created_at = w.created_at AND previous.id <= w.id))) AS warning_number,
           w.reason,
           DATE_FORMAT(w.created_at, '%Y-%m-%d') AS warning_date,
           DATE_FORMAT(w.created_at, '%H:%i:%s') AS warning_time,
           DATE_FORMAT(w.read_at, '%Y-%m-%d %H:%i:%s') AS read_at,
           issuer.username AS issued_by_username
         FROM staff_warnings w
         LEFT JOIN users issuer ON issuer.id = w.issued_by
         WHERE w.user_id = ?
         ORDER BY w.created_at DESC, w.id DESC
         LIMIT 50`,
        [session.id]
      ),
      query<{ total: number }[]>(
        'SELECT COUNT(*) AS total FROM staff_warnings WHERE user_id = ? AND read_at IS NULL',
        [session.id]
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: { warnings, unreadCount: Number(unreadRows[0]?.total || 0) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memuat inbox.';
    console.error('[Inbox GET Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }
    if (session.role === 'ADMIN') {
      let adminBody: unknown;
      try {
        adminBody = await request.json();
      } catch {
        return NextResponse.json({ success: false, error: 'Permintaan tidak valid.' }, { status: 400 });
      }
      if (typeof adminBody !== 'object' || adminBody === null || !('all' in adminBody) || adminBody.all !== true) {
        return NextResponse.json(
          { success: false, error: 'Permintaan menandai notifikasi tidak valid.' },
          { status: 400 }
        );
      }

      await query(
        `INSERT IGNORE INTO admin_attendance_inbox (admin_id, read_through_id)
         SELECT ?, COALESCE((SELECT MAX(id) FROM attendance), 0)`,
        [session.id]
      );
      await query(
        `UPDATE admin_attendance_inbox
         SET read_through_id = GREATEST(read_through_id, COALESCE((SELECT MAX(id) FROM attendance), 0))
         WHERE admin_id = ?`,
        [session.id]
      );
      return NextResponse.json({ success: true, message: 'Semua notifikasi absensi ditandai sudah dibaca.' });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Permintaan tidak valid.' }, { status: 400 });
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ success: false, error: 'Permintaan tidak valid.' }, { status: 400 });
    }

    if ('all' in body && body.all === true) {
      await query(
        'UPDATE staff_warnings SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
        [session.id]
      );
      return NextResponse.json({ success: true, message: 'Semua pesan ditandai sudah dibaca.' });
    }

    const id = 'id' in body && typeof body.id === 'number' ? body.id : Number.NaN;
    if (!Number.isSafeInteger(id) || id < 1) {
      return NextResponse.json({ success: false, error: 'ID pesan tidak valid.' }, { status: 400 });
    }

    await query(
      'UPDATE staff_warnings SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [id, session.id]
    );
    return NextResponse.json({ success: true, message: 'Pesan ditandai sudah dibaca.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui status pesan.';
    console.error('[Inbox PATCH Error]:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
