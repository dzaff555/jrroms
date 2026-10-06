import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { query } from '@/lib/database/db';
import { countWeekendDaysSince, getLastCompletedAttendanceDate } from '@/lib/attendance/stats';
import { formatIndonesianDate } from '@/lib/utils/date';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface StaffProfile {
  id: number;
  username: string;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
  nip: string | null;
  profile_photo: string | null;
  roblox_username: string | null;
  discord_username: string | null;
  joined_at: string;
  attendance_count: number;
  weekend_attendance_count: number;
  warning_count: number;
  last_attendance: string | null;
  last_attendance_status: string | null;
}

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staffId = Number.parseInt(id, 10);
  if (!Number.isInteger(staffId)) notFound();

  const attendanceThroughDate = getLastCompletedAttendanceDate();
  const staffRows = await query<StaffProfile[]>(
    `SELECT u.id, u.username, u.role, u.attendance_role, u.nip, u.profile_photo,
      u.roblox_username, u.discord_username,
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
     FROM users u WHERE u.id = ? AND u.status = 'ACTIVE' LIMIT 1`,
    [attendanceThroughDate, staffId]
  );
  const staff = staffRows[0];
  if (!staff) notFound();
  const missedAttendanceCount = Math.max(
    0,
    countWeekendDaysSince(staff.joined_at, attendanceThroughDate) - Number(staff.weekend_attendance_count)
  );

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/staff" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar Staf
        </Link>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 bg-gradient-to-r from-[#0F2747] to-[#2563EB] p-6 text-white sm:flex-row sm:items-center">
            {staff.profile_photo ? (
              <ProtectedProfilePhoto
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
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Profil Staf</p>
              <h1 className="mt-1 text-2xl font-extrabold">{staff.username}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-blue-100">
                {staff.role === 'ADMIN' && <ShieldCheck className="h-4 w-4" />}
                {staff.role === 'ADMIN'
                  ? 'Administrator'
                  : staff.role === 'DEVELOPER'
                    ? 'Pengembang'
                    : staff.attendance_role || 'Peran belum ditentukan'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> NIP
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.nip || 'Belum ditetapkan'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> Nama pengguna Roblox
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.roblox_username || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UserRound className="h-4 w-4" /> Nama pengguna Discord
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-800">{staff.discord_username || '-'}</p>
            </div>
            {staff.role === 'USER' && (
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
              </>
            )}
            {staff.role !== 'ADMIN' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Peringatan
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-800">{Number(staff.warning_count)}</p>
                <p className="mt-1 text-xs text-slate-500">kali diperingatkan oleh admin</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}