import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { getSessionUser } from '@/lib/auth/auth';
import { query } from '@/lib/database/db';
import { IssueWarningForm } from '@/components/profile/IssueWarningForm';
import { countWeekendDaysSince, getLastCompletedAttendanceDate } from '@/lib/attendance/stats';
import { formatIndonesianDate, formatIndonesianDateTime } from '@/lib/utils/date';

interface StaffProfile {
  id: number;
  username: string;
  real_name: string | null;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  status: 'ACTIVE' | 'DISABLED';
  attendance_role: string | null;
  profile_photo: string | null;
  roblox_username: string | null;
  discord_username: string | null;
  profile_completed: number | boolean;
  created_at: string;
  joined_at: string;
  attendance_count: number;
  weekend_attendance_count: number;
  warning_count: number;
  last_attendance: string | null;
  last_attendance_status: string | null;
}

interface StaffWarning {
  warning_number: number;
  reason: string;
  warning_date: string;
  warning_time: string;
  issued_by_username: string | null;
}

export default async function AdminStaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionUser();
  if (!session || session.role !== 'ADMIN') redirect('/login');

  const { id } = await params;
  const userId = Number.parseInt(id, 10);
  if (!Number.isInteger(userId)) notFound();

  const attendanceThroughDate = getLastCompletedAttendanceDate();
  const users = await query<StaffProfile[]>(
    `SELECT u.id, u.username, u.real_name, u.role, u.status, u.attendance_role, u.profile_photo,
      u.roblox_username, u.discord_username, u.profile_completed,
      DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i') AS created_at,
      DATE_FORMAT(
        CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00'),
        '%Y-%m-%d %H:%i:%s'
      ) AS joined_at,
      (SELECT COUNT(*) FROM attendance a
       WHERE a.user_id = u.id AND a.status = 'Hadir') AS attendance_count,
      (SELECT COUNT(*) FROM attendance a
       WHERE a.user_id = u.id AND a.status = 'Hadir'
         AND a.attendance_date BETWEEN DATE(
           CONVERT_TZ(u.created_at, @@session.time_zone, '+07:00')
         ) AND ?
         AND DAYOFWEEK(a.attendance_date) IN (1, 6, 7)) AS weekend_attendance_count,
      (SELECT COUNT(*) FROM staff_warnings w WHERE w.user_id = u.id) AS warning_count,
      (SELECT DATE_FORMAT(a.attendance_date, '%Y-%m-%d') FROM attendance a
       WHERE a.user_id = u.id ORDER BY a.attendance_date DESC, a.attendance_time DESC LIMIT 1) AS last_attendance,
      (SELECT a.status FROM attendance a
       WHERE a.user_id = u.id ORDER BY a.attendance_date DESC, a.attendance_time DESC LIMIT 1) AS last_attendance_status
     FROM users u WHERE u.id = ? LIMIT 1`,
    [attendanceThroughDate, userId]
  );
  const staff = users[0];
  if (!staff) notFound();
  const missedAttendanceCount = Math.max(
    0,
    countWeekendDaysSince(staff.joined_at, attendanceThroughDate) - Number(staff.weekend_attendance_count)
  );
  const warnings = await query<StaffWarning[]>(
    `SELECT
       (SELECT COUNT(*) FROM staff_warnings previous
        WHERE previous.user_id = w.user_id
          AND (previous.created_at < w.created_at
            OR (previous.created_at = w.created_at AND previous.id <= w.id))) AS warning_number,
       w.reason, DATE_FORMAT(w.created_at, '%Y-%m-%d') AS warning_date,
       DATE_FORMAT(w.created_at, '%H:%i:%s') AS warning_time,
       issuer.username AS issued_by_username
     FROM staff_warnings w
     LEFT JOIN users issuer ON issuer.id = w.issued_by
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC, w.id DESC
     LIMIT 5`,
    [userId]
  );

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Kelola User
        </Link>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 bg-gradient-to-r from-[#0F2747] to-[#2563EB] p-6 text-white sm:flex-row sm:items-center">
            {staff.profile_photo ? (
              <img
                src={staff.profile_photo}
                alt={`Foto profil ${staff.username}`}
                className="h-24 w-24 rounded-2xl border-2 border-white/70 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-white/40 bg-white/10 text-3xl font-bold">
                {staff.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Profil Staff</p>
              <h1 className="mt-1 text-2xl font-extrabold">{staff.username}</h1>
              <p className="mt-1 text-sm text-blue-100">{staff.attendance_role || 'Role belum ditentukan'}</p>
            </div>
            <span className={`sm:ml-auto rounded-full px-3 py-1 text-xs font-bold ${staff.status === 'ACTIVE' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'}`}>
              {staff.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> Nama Asli
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.real_name || 'Belum diisi'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <ShieldCheck className="h-4 w-4" /> Role Sistem
              </div>
              <p className="mt-2 text-sm font-bold text-slate-800">{staff.role}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> Username Roblox
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.roblox_username || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> Username Discord
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.discord_username || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <CalendarDays className="h-4 w-4" /> Terdaftar Sejak
              </div>
              <p className="mt-2 text-sm font-bold text-slate-800">{staff.created_at}</p>
            </div>
            {staff.role !== 'ADMIN' && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CalendarDays className="h-4 w-4" /> Absensi Terakhir
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-800">
                    {staff.last_attendance
                      ? `${formatIndonesianDate(staff.last_attendance)} · ${staff.last_attendance_status || 'Tercatat'}`
                      : 'Belum Absen'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Total Hadir
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">{Number(staff.attendance_count)}</p>
                  <p className="mt-1 text-xs text-slate-500">kali tercatat hadir</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <XCircle className="h-4 w-4 text-rose-600" /> Tidak Hadir
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">{missedAttendanceCount}</p>
                  <p className="mt-1 text-xs text-slate-500">hari Jumat–Minggu tanpa catatan hadir</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> Peringatan
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-800">{Number(staff.warning_count)}</p>
                  <p className="mt-1 text-xs text-slate-500">kali diperingatkan oleh admin</p>
                </div>
              </>
            )}
          </div>
        </section>

        {staff.role !== 'ADMIN' && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-extrabold text-slate-900">Beri Peringatan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Setiap peringatan akan tersimpan di riwayat profil dan menambah total peringatan.
              </p>
              {staff.status !== 'ACTIVE' ? (
                <p className="mt-4 text-sm text-slate-500">Akun nonaktif tidak dapat diberi peringatan.</p>
              ) : session.id === staff.id ? (
                <p className="mt-4 text-sm text-slate-500">Anda tidak dapat memberi peringatan pada akun sendiri.</p>
              ) : (
                <div className="mt-4">
                  <IssueWarningForm userId={staff.id} />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-extrabold text-slate-900">Riwayat Peringatan</h2>
              {warnings.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Belum ada peringatan.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {warnings.map((warning, index) => (
                    <li key={`${warning.warning_date}-${warning.warning_time}-${index}`} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold text-slate-800">Peringatan - {warning.warning_number}</p>
                      <p className="mt-1 text-sm text-slate-700">{warning.reason}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatIndonesianDateTime(warning.warning_date, warning.warning_time)} · Oleh {warning.issued_by_username || 'Admin'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

      </div>
    </>
  );
}