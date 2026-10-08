import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';

export const runtime = 'nodejs';

const PARTICIPANT_TIMEOUT_SECONDS = 20;

interface CallParticipant {
  id: number;
  username: string;
  profile_photo: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
}

interface CallSession {
  id: string;
  started_by: number;
  started_at: string;
}

interface CallSignal {
  id: number;
  sender_id: number;
  signal_type: 'offer' | 'answer' | 'candidate';
  payload: string;
}

async function getActiveCaller() {
  const session = await getSessionUser();
  if (!session) return null;

  const users = await query<{ id: number; status: string; role: string }[]>(
    'SELECT id, status, role FROM users WHERE id = ? LIMIT 1',
    [session.id]
  );
  const user = users[0];
  if (!user || user.status !== 'ACTIVE' || !['USER', 'ADMIN', 'DEVELOPER'].includes(user.role)) return null;
  return user;
}

async function getParticipants(callId: string) {
  return query<CallParticipant[]>(
    `SELECT u.id, u.username, u.profile_photo, u.role, u.attendance_role
     FROM chat_call_participants p
     INNER JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE'
     WHERE p.session_id = ? AND p.left_at IS NULL
       AND p.last_seen_at >= DATE_SUB(NOW(), INTERVAL ${PARTICIPANT_TIMEOUT_SECONDS} SECOND)
     ORDER BY p.joined_at ASC`,
    [callId]
  );
}

export async function GET(request: Request) {
  try {
    const user = await getActiveCaller();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun aktif.' }, { status: 401 });
    }

    const searchParams = new URL(request.url).searchParams;
    const callId = searchParams.get('callId');

    if (!callId) {
      const activeCalls = await query<CallSession[]>(
        'SELECT id, started_by, started_at FROM chat_call_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
      );
      const call = activeCalls[0];
      if (!call) return NextResponse.json({ success: true, data: { call: null } });

      const restoreCallId = searchParams.get('restoreCallId');
      if (restoreCallId === call.id) {
        await query(
          `UPDATE chat_call_participants
           SET last_seen_at = NOW()
           WHERE session_id = ? AND user_id = ? AND left_at IS NULL`,
          [call.id, user.id]
        );
      }

      const participants = await getParticipants(call.id);
      if (participants.length === 0) {
        await query('UPDATE chat_call_sessions SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL', [call.id]);
        return NextResponse.json({ success: true, data: { call: null } });
      }

      return NextResponse.json({
        success: true,
        data: { call: { ...call, participants } },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (!/^[0-9a-f-]{36}$/i.test(callId)) {
      return NextResponse.json({ success: false, error: 'ID panggilan tidak valid.' }, { status: 400 });
    }
    const after = searchParams.get('after') || '0';
    if (!/^\d+$/.test(after) || !Number.isSafeInteger(Number(after))) {
      return NextResponse.json({ success: false, error: 'Posisi sinyal tidak valid.' }, { status: 400 });
    }

    const membership = await query<{ ended_at: Date | null; left_at: Date | null }[]>(
      `SELECT s.ended_at, p.left_at FROM chat_call_sessions s
       INNER JOIN chat_call_participants p ON p.session_id = s.id
       WHERE s.id = ? AND p.user_id = ? LIMIT 1`,
      [callId, user.id]
    );
    if (!membership[0]) {
      return NextResponse.json({ success: false, error: 'Anda tidak tergabung dalam panggilan ini.' }, { status: 403 });
    }
    if (membership[0].ended_at !== null || membership[0].left_at !== null) {
      return NextResponse.json({
        success: true,
        data: { ended: true, participants: [], signals: [] },
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await query(
      'UPDATE chat_call_participants SET last_seen_at = NOW() WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [callId, user.id]
    );
    const [participants, signals] = await Promise.all([
      getParticipants(callId),
      query<CallSignal[]>(
        `SELECT id, sender_id, signal_type, payload FROM chat_call_signals
         WHERE session_id = ? AND target_id = ? AND id > ? ORDER BY id ASC LIMIT 100`,
        [callId, user.id, Number(after)]
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ended: membership[0].ended_at !== null,
        participants,
        signals: signals.map((signal) => ({
          id: Number(signal.id),
          sender_id: signal.sender_id,
          type: signal.signal_type,
          payload: JSON.parse(signal.payload),
        })),
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    console.error('[Chat Call GET Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memeriksa status panggilan.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getActiveCaller();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Silakan masuk dengan akun aktif.' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Format permintaan tidak valid.' }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null || !('action' in body) || typeof body.action !== 'string') {
      return NextResponse.json({ success: false, error: 'Aksi panggilan tidak valid.' }, { status: 400 });
    }
    const input = body as Record<string, unknown>;

    if (input.action === 'start') {
      await query(
        'DELETE FROM chat_call_sessions WHERE ended_at IS NOT NULL AND ended_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
      );
      const existingCalls = await query<CallSession[]>(
        'SELECT id, started_by, started_at FROM chat_call_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1'
      );
      const call = existingCalls[0] || { id: randomUUID(), started_by: user.id, started_at: new Date().toISOString() };
      if (!existingCalls[0]) {
        await query('INSERT INTO chat_call_sessions (id, started_by) VALUES (?, ?)', [call.id, user.id]);
      }
      await query(
        `INSERT INTO chat_call_participants (session_id, user_id, last_seen_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE left_at = NULL, last_seen_at = NOW()`,
        [call.id, user.id]
      );
      return NextResponse.json({ success: true, data: { call } });
    }

    if (input.action === 'join' || input.action === 'leave') {
      if (typeof input.callId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.callId)) {
        return NextResponse.json({ success: false, error: 'ID panggilan tidak valid.' }, { status: 400 });
      }
      const callId = input.callId;
      if (input.action === 'join') {
        const calls = await query<{ id: string }[]>(
          'SELECT id FROM chat_call_sessions WHERE id = ? AND ended_at IS NULL LIMIT 1',
          [callId]
        );
        if (!calls[0]) {
          return NextResponse.json({ success: false, error: 'Panggilan ini sudah berakhir.' }, { status: 410 });
        }
        await query(
          `INSERT INTO chat_call_participants (session_id, user_id, last_seen_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE left_at = NULL, last_seen_at = NOW()`,
          [callId, user.id]
        );
      } else {
        await query(
          'UPDATE chat_call_participants SET left_at = NOW() WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
          [callId, user.id]
        );
        const participants = await getParticipants(callId);
        if (participants.length === 0) {
          await query(
            'UPDATE chat_call_sessions SET ended_at = NOW() WHERE id = ? AND ended_at IS NULL',
            [callId]
          );
        }
      }
      return NextResponse.json({ success: true });
    }

    if (input.action === 'signal') {
      if (
        typeof input.callId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(input.callId) ||
        !Number.isSafeInteger(input.targetId) ||
        typeof input.targetId !== 'number' ||
        input.targetId === user.id ||
        !['offer', 'answer', 'candidate'].includes(String(input.type)) ||
        typeof input.payload !== 'object' ||
        input.payload === null
      ) {
        return NextResponse.json({ success: false, error: 'Sinyal panggilan tidak valid.' }, { status: 400 });
      }
      const payload = JSON.stringify(input.payload);
      if (payload.length > 65_536) {
        return NextResponse.json({ success: false, error: 'Ukuran sinyal panggilan terlalu besar.' }, { status: 413 });
      }
      const membership = await query<{ user_id: number }[]>(
        `SELECT p.user_id FROM chat_call_participants p
         INNER JOIN chat_call_sessions s ON s.id = p.session_id AND s.ended_at IS NULL
         WHERE p.session_id = ? AND p.user_id IN (?, ?) AND p.left_at IS NULL
           AND p.last_seen_at >= DATE_SUB(NOW(), INTERVAL ${PARTICIPANT_TIMEOUT_SECONDS} SECOND)`,
        [input.callId, user.id, input.targetId]
      );
      if (membership.length !== 2) {
        return NextResponse.json({ success: false, error: 'Penerima tidak aktif dalam panggilan ini.' }, { status: 403 });
      }
      await query(
        'INSERT INTO chat_call_signals (session_id, sender_id, target_id, signal_type, payload) VALUES (?, ?, ?, ?, ?)',
        [input.callId, user.id, input.targetId, input.type, payload]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Aksi panggilan tidak didukung.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[Chat Call POST Error]:', error);
    return NextResponse.json({ success: false, error: 'Gagal memperbarui panggilan.' }, { status: 500 });
  }
}
