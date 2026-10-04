'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { formatIndonesianDate, formatIndonesianTime } from '@/lib/utils/date';
import { Attendance, AuthSession } from '@/types';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function UserDashboardPage() {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string>('');
  const [profileRole, setProfileRole] = useState<string>('CSOT');
  const [robloxUsername, setRobloxUsername] = useState<string>('');
  const [discordUsername, setDiscordUsername] = useState<string>('');
  const [hasAttended, setHasAttended] = useState<boolean>(false);
  const [attendanceWindowOpen, setAttendanceWindowOpen] = useState(false);
  const [attendanceWindowMessage, setAttendanceWindowMessage] = useState('Absensi dibuka Jumat–Minggu pukul 05.00–18.00 WIB.');
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [todayDateStr, setTodayDateStr] = useState<string>('');
  const [recentRecords, setRecentRecords] = useState<Attendance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = React.useRef(false);

  const fetchDashboardData = React.useCallback(async (showLoading = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoading) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [meRes, todayRes, historyRes] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }),
        fetch('/api/attendance/today', { cache: 'no-store' }),
        fetch('/api/attendance/history?limit=5', { cache: 'no-store' }),
      ]);
      const [meData, todayData, historyData] = await Promise.all([
        meRes.json(),
        todayRes.json(),
        historyRes.json(),
      ]);

      if (meData.success) {
        const sessionUser = meData.data as AuthSession & {
          profile_photo?: string | null;
          roblox_username?: string | null;
          discord_username?: string | null;
          attendance_role?: string;
          profile_completed?: boolean;
        };
        setUser(sessionUser);
        setProfilePhoto(sessionUser.profile_photo || '');
        setProfileRole(sessionUser.attendance_role || 'CSOT');
        setRobloxUsername(sessionUser.roblox_username || '');
        setDiscordUsername(sessionUser.discord_username || '');
      }

      if (todayData.success) {
        setHasAttended(todayData.hasAttended);
        setAttendanceWindowOpen(todayData.attendanceWindowOpen);
        setAttendanceWindowMessage(todayData.attendanceWindowMessage);
        setTodayAttendance(todayData.attendance);
        setTodayDateStr(todayData.todayDate);
      }

      if (historyData.success) {
        setRecentRecords(historyData.data.records || []);
      }
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data dashboard.';
      setError(message);
    } finally {
      if (showLoading) setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDashboardData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchDashboardData]);

  useAutoRefresh(() => void fetchDashboardData(false));

  return (
    <>
      <div className="space-y-6 sm:space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F2747] via-[#16365F] to-[#2563EB] p-6 sm:p-8 md:p-10 text-white shadow-xl shadow-blue-900/10">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-blue-200">
              <Calendar className="w-3.5 h-3.5 text-blue-300" />
              {todayDateStr ? formatIndonesianDate(todayDateStr) : 'WIB Timezone'}
            </div>

            <div className="flex items-center gap-4 pt-1">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt="Foto profil"
                  className="h-14 w-14 rounded-full border-2 border-white/60 object-cover shadow-lg"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/60 bg-white/10 text-xl font-bold text-white">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                  Selamat datang kembali,{' '}
                  <span className="text-blue-300">{user?.username || 'Karyawan'}</span>!
                </h1>
              </div>
            </div>

            <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed">
              {hasAttended
                ? 'Terima kasih, Anda telah mengisi kehadiran untuk hari ini. Tetap semangat menjalankan aktivitas!'
                : 'Jangan lupa untuk melakukan absensi kehadiran Anda hari ini sebelum batas waktu berakhir.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border border-slate-200/80 shadow-sm">
            <CardHeader className="bg-slate-50/80">
              <CardTitle className="text-base">Informasi Profil</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Username</p>
                  <p className="mt-1 text-base font-bold text-slate-800">{user?.username || '-'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Role</p>
                  <p className="mt-1 text-base font-bold text-slate-800">{profileRole}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Username Roblox</p>
                  <p className="mt-1 text-base font-bold text-slate-800 font-mono">{robloxUsername || '-'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Username Discord</p>
                  <p className="mt-1 text-base font-bold text-slate-800 font-mono">{discordUsername || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border border-slate-200/80 shadow-sm">
            <CardHeader className="bg-slate-50/80">
              <CardTitle className="text-base">Status Absen Hari Ini</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-medium text-slate-700">Status</span>
                <Badge variant={hasAttended ? 'success' : 'danger'} dot>
                  {hasAttended ? 'Sudah Absen' : 'Belum Absen'}
                </Badge>
              </div>
              {!hasAttended && attendanceWindowOpen && (
                <div className="mt-4">
                  <Link href="/attendance">
                    <Button variant="primary" className="w-full">Absen Hari Ini</Button>
                  </Link>
                </div>
              )}
              {!hasAttended && !attendanceWindowOpen && (
                <p className="mt-4 text-xs leading-relaxed text-slate-500">{attendanceWindowMessage}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-xs sm:text-sm font-medium">{error}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchDashboardData()}>
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Today's Status Main Card */}
        {isLoading ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        ) : (
          <Card className="overflow-hidden border-2 border-slate-200/80 shadow-md">
            <CardHeader className="attendance-status-header bg-gradient-to-r from-slate-50 to-blue-50/30">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                  Status Kehadiran
                </span>
                <CardTitle className="text-xl sm:text-2xl mt-0.5">Absen Hari Ini</CardTitle>
                <CardDescription>
                  {attendanceWindowMessage}
                </CardDescription>
              </div>

              <Badge
                variant={hasAttended ? 'success' : 'danger'}
                dot
                className="text-xs sm:text-sm px-3 py-1.5"
              >
                {hasAttended ? 'Sudah Absen' : 'Belum Absen'}
              </Badge>
            </CardHeader>

            <CardContent className="p-6 sm:p-8">
              {hasAttended && todayAttendance ? (
                /* Already Attended State */
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold">Kehadiran Hari Ini Telah Terverifikasi</h4>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Data absensi Anda telah disimpan di database server.
                      </p>
                    </div>
                  </div>

                  {/* Attendance Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Tanggal Absen</span>
                      <span className="text-sm font-bold text-slate-800 mt-1 block">
                        {formatIndonesianDate(todayAttendance.attendance_date)}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Jam Absen (WIB)</span>
                      <span className="text-sm font-bold text-blue-700 mt-1 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-blue-600" />
                        {formatIndonesianTime(todayAttendance.attendance_time)}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Nama Lengkap</span>
                      <span className="text-sm font-bold text-slate-800 mt-1 block truncate">
                        {todayAttendance.name}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Username Discord</span>
                      <span className="text-sm font-bold text-indigo-700 mt-1 block truncate font-mono">
                        {todayAttendance.discord_username}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Username Roblox</span>
                      <span className="text-sm font-bold text-slate-800 mt-1 block truncate font-mono">
                        {todayAttendance.roblox_username}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-xs text-slate-500 font-medium block">Status</span>
                      <span className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Hadir
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Not Attended State */
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-4 animate-fade-in">
                  <div className="space-y-2 text-center sm:text-left">
                    <div className="inline-flex items-center gap-2 text-amber-600 text-xs font-bold uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4" /> Belum Tercatat Hari Ini
                    </div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                      Siap Mengisi Absensi Kehadiran?
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-lg leading-relaxed">
                      Pastikan informasi Nama Lengkap, Discord, dan Roblox yang Anda masukkan telah sesuai sebelum melakukan konfirmasi.
                    </p>
                  </div>

                  {attendanceWindowOpen ? <Link href="/attendance">
                    <Button
                      variant="primary"
                      size="lg"
                      className="px-8 py-4 text-base font-bold shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transform hover:-translate-y-0.5"
                      icon={<UserCheck className="w-5 h-5" />}
                    >
                      ABSEN HARI INI
                    </Button>
                  </Link> : (
                    <div className="flex max-w-xs items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>{attendanceWindowMessage}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Attendance Records Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Riwayat Absensi Terakhir
              </h2>
              <p className="text-xs text-slate-500">
                5 catatan absensi terakhir Anda
              </p>
            </div>
            <Link
              href="/attendance/history"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 group"
            >
              <span>Lihat Semua Riwayat</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada data riwayat absensi sebelumnya.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">Nama</th>
                      <th className="py-3 px-4">Discord</th>
                      <th className="py-3 px-4">Roblox</th>
                      <th className="py-3 px-4">Jam</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {formatIndonesianDate(r.attendance_date)}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{r.name}</td>
                        <td className="py-3 px-4 font-mono text-indigo-600">{r.discord_username}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{r.roblox_username}</td>
                        <td className="py-3 px-4 font-semibold text-blue-600 whitespace-nowrap">
                          {formatIndonesianTime(r.attendance_time)}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="success" dot>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
