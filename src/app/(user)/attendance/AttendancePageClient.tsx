'use client';

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Info,
  XCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatIndonesianDate, formatIndonesianTime } from '@/lib/utils/date';
import { ATTENDANCE_ROLES, Attendance, AuthSession, isAttendanceRole } from '@/types';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function AttendancePage() {
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState<AuthSession | null>(null);
  const [alreadyAttended, setAlreadyAttended] = useState(false);
  const [existingAttendance, setExistingAttendance] = useState<Attendance | null>(null);
  const [todayDateStr, setTodayDateStr] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [attendanceWindowOpen, setAttendanceWindowOpen] = useState(false);
  const [attendanceWindowMessage, setAttendanceWindowMessage] = useState('Absensi dibuka Jumat–Minggu pukul 05.00–18.00 WIB.');

  // Form states
  const [name, setName] = useState('');
  const [attendanceRole, setAttendanceRole] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [robloxUsername, setRobloxUsername] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState<'Hadir' | 'Izin' | ''>('');
  const [attendanceReason, setAttendanceReason] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<Attendance | null>(null);

  // Check today's status & fetch user session
  useEffect(() => {
    const initPage = async () => {
      setIsLoading(true);
      try {
        const meRes = await fetch('/api/auth/me');
        const meData = await meRes.json();
        if (meData.success) {
          const profile = meData.data as AuthSession;
          setUser(profile);
          setName(profile.username || '');
          setAttendanceRole(profile.attendance_role || 'CSOT');
          setDiscordUsername(profile.discord_username || '');
          setRobloxUsername(profile.roblox_username || '');

          if (!profile.profile_completed) {
            router.replace('/complete-profile');
            return;
          }
        } else {
          router.replace('/login');
          return;
        }

        const todayRes = await fetch('/api/attendance/today');
        const todayData = await todayRes.json();
        if (todayData.success) {
          setTodayDateStr(todayData.todayDate);
          setAttendanceWindowOpen(todayData.attendanceWindowOpen);
          setAttendanceWindowMessage(todayData.attendanceWindowMessage);
          if (todayData.hasAttended) {
            setAlreadyAttended(true);
            setExistingAttendance(todayData.attendance);
          }
        }
      } catch (err: unknown) {
        console.error('Error init attendance page:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initPage();

    // Live clock update
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' WIB'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [router]);

  useAutoRefresh(() => {
    void (async () => {
      try {
        const response = await fetch('/api/attendance/today', { cache: 'no-store' });
        const data = await response.json();
        if (!data.success) return;

        setTodayDateStr(data.todayDate);
        setAttendanceWindowOpen(data.attendanceWindowOpen);
        setAttendanceWindowMessage(data.attendanceWindowMessage);
        setAlreadyAttended(data.hasAttended);
        setExistingAttendance(data.attendance);
      } catch (error: unknown) {
        console.error('Failed to refresh attendance status:', error);
      }
    })();
  });

  const submitAttendance = async () => {
    setErrors({});

    const formErrors: { [key: string]: string } = {};
    if (!name.trim()) formErrors.name = 'Nama lengkap wajib diisi.';
    if (!isAttendanceRole(attendanceRole)) {
      formErrors.attendance_role = 'Silakan pilih peran.';
    }
    if (!discordUsername.trim()) formErrors.discordUsername = 'Nama pengguna Discord wajib diisi.';
    if (!robloxUsername.trim()) formErrors.robloxUsername = 'Nama pengguna Roblox wajib diisi.';
    if (!attendanceStatus) formErrors.status = 'Silakan pilih Hadir atau Izin.';
    if (attendanceStatus === 'Izin' && !attendanceReason.trim()) {
      formErrors.attendance_reason = 'Alasan izin wajib diisi.';
    }

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      toast.warning('Form Belum Lengkap', 'Pilih status absensi dan lengkapi data yang wajib diisi.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          attendance_role: attendanceRole,
          discord_username: discordUsername.trim(),
          roblox_username: robloxUsername.trim(),
          status: attendanceStatus,
          attendance_reason: attendanceStatus === 'Izin' ? attendanceReason.trim() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'Gagal menyimpan absensi.';
        toast.error('Absensi Gagal', errorMsg);
        if (data.validationErrors) {
          setErrors(data.validationErrors);
        }
        return;
      }

      setSubmittedData(data.data);
      toast.success(
        'Absensi Berhasil!',
        attendanceStatus === 'Izin' ? 'Izin Anda telah dicatat hari ini.' : 'Kehadiran Anda telah dicatat hari ini.'
      );
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Koneksi ke server gagal.';
      toast.error('Gagal', errText);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitAttendance();
  };

  const handleConfirmAttendance = async () => {
    await submitAttendance();
  };

  return (
    <>
      <div className={`max-w-2xl mx-auto py-4 sm:py-8 space-y-6 ${!isLoading && !alreadyAttended && !submittedData ? 'hidden' : ''}`}>
        {/* Navigation back */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Dasbor</span>
        </Link>

        {isLoading ? (
          <Card className="p-8 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Memeriksa status absensi hari ini...</p>
          </Card>
        ) : submittedData ? (
          /* =======================================================
           * PAGE 10: SUCCESS SCREEN WITH CHECK ANIMATION & DETAILS
           * ======================================================= */
          <Card className="overflow-hidden border-2 border-emerald-200/80 shadow-xl animate-scale-in bg-white">
            <div className="bg-gradient-to-b from-emerald-500/10 to-transparent p-8 sm:p-10 text-center">
              {/* Big Animated Check Icon */}
              <div className="w-20 h-20 rounded-3xl bg-emerald-500 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/30 transform animate-bounce">
                <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Terverifikasi
              </span>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Absensi Berhasil!
              </h2>

              <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
                Absensi kamu untuk hari ini telah tercatat dan tersimpan dengan aman pada sistem database.
              </p>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6 border-t border-slate-100 bg-slate-50/50">
              {/* Summary Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Nama Lengkap
                  </span>
                  <span className="text-sm font-bold text-slate-800 mt-1 block">
                    {submittedData.name}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Tanggal Absen
                  </span>
                  <span className="text-sm font-bold text-slate-800 mt-1 block">
                    {formatIndonesianDate(submittedData.attendance_date)}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Role
                  </span>
                  <span className="text-sm font-bold text-slate-800 mt-1 block">
                    {submittedData.attendance_role}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Nama pengguna Discord
                  </span>
                  <span className="text-sm font-bold text-indigo-600 font-mono mt-1 block">
                    {submittedData.discord_username}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Nama pengguna Roblox
                  </span>
                  <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                    {submittedData.roblox_username}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs sm:col-span-2 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {submittedData.status === 'Izin' ? 'Waktu Pengajuan (WIB)' : 'Waktu Kehadiran (WIB)'}
                    </span>
                    <span className="text-base font-extrabold text-blue-600 mt-0.5 block">
                      {formatIndonesianTime(submittedData.attendance_time)}
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1.5 ${
                    submittedData.status === 'Izin'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    <CheckCircle2 className={`w-4 h-4 ${
                      submittedData.status === 'Izin' ? 'text-amber-600' : 'text-emerald-600'
                    }`} /> {submittedData.status}
                  </span>
                </div>
                {submittedData.status === 'Izin' && submittedData.attendance_reason && (
                  <div className="p-4 rounded-xl bg-white border border-amber-200 shadow-2xs sm:col-span-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Alasan Izin
                    </span>
                    <span className="text-sm font-medium text-slate-800 mt-1 block whitespace-pre-wrap">
                      {submittedData.attendance_reason}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Back Button */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full shadow-md shadow-blue-600/20"
                  onClick={() => router.push('/dashboard')}
                >
                  Kembali ke Dasbor
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : alreadyAttended && existingAttendance ? (
          /* =======================================================
           * ALREADY ATTENDED TODAY NOTICE
           * ======================================================= */
          <Card className="overflow-hidden border-2 border-blue-200 shadow-md">
            <div className="p-8 sm:p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Anda Sudah Melakukan Absensi Hari Ini
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                Setiap akun hanya diperbolehkan melakukan absensi 1 kali dalam satu hari kerja. Data Anda telah tercatat dengan rincian berikut:
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 max-w-md mx-auto text-left text-xs space-y-2.5">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Nama Lengkap:</span>
                  <span className="font-bold text-slate-800">{existingAttendance.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Discord:</span>
                  <span className="font-mono font-semibold text-indigo-600">{existingAttendance.discord_username}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Peran:</span>
                  <span className="font-bold text-slate-800">{existingAttendance.attendance_role}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Roblox:</span>
                  <span className="font-mono font-semibold text-slate-800">{existingAttendance.roblox_username}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold text-slate-800">{existingAttendance.status}</span>
                </div>
                {existingAttendance.status === 'Izin' && (
                  <div className="py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 block">Alasan Izin:</span>
                    <span className="font-medium text-slate-800 block mt-1 whitespace-pre-wrap">
                      {existingAttendance.attendance_reason}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Tanggal:</span>
                  <span className="font-bold text-slate-800">{formatIndonesianDate(existingAttendance.attendance_date)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Jam Absen:</span>
                  <span className="font-bold text-blue-600">{formatIndonesianTime(existingAttendance.attendance_time)}</span>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="primary"
                  onClick={() => router.push('/dashboard')}
                >
                  Kembali ke Dasbor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/attendance/history')}
                >
                  Lihat Riwayat
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          /* =======================================================
           * ATTENDANCE FORM (PAGE 8 & 9)
           * ======================================================= */
          <Card className="overflow-hidden border-slate-200/80 shadow-lg">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-[#0F2747] via-[#16365F] to-[#2563EB] p-6 sm:p-8 text-white">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Sistem Absensi Karyawan
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Form Absensi Hari Ini
                  </h1>
                </div>

                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-6 h-6 text-blue-200" />
                </div>
              </div>

              {/* Automatic Date & Time Display (Asia/Jakarta) */}
              <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-white/10 text-xs">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10">
                  <Calendar className="w-4 h-4 text-blue-300" />
                  <span>{todayDateStr ? formatIndonesianDate(todayDateStr) : 'Hari ini'}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 font-mono font-semibold">
                  <Clock className="w-4 h-4 text-blue-300 animate-pulse" />
                  <span>{currentTimeStr || '00:00:00 WIB'}</span>
                </div>
              </div>
            </div>

            <CardContent className="p-6 sm:p-8 space-y-6">
              {/* Guidance Info Alert */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50/80 border border-blue-200/80 text-blue-900 text-xs sm:text-sm leading-relaxed">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Informasi Penting:</strong> Pastikan data yang Anda masukkan sudah benar dan akurat. Absensi hanya dapat dikirimkan <strong>1 kali</strong> per hari.
                </div>
              </div>

              {/* Form inputs */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Nama Lengkap"
                  placeholder="Masukkan nama lengkap"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  error={errors.name}
                  required
                />

                <div className="space-y-1.5">
                  <label htmlFor="attendance-role" className="block text-xs font-semibold text-slate-700">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="attendance-role"
                    name="attendance_role"
                    value={attendanceRole}
                    onChange={(e) => {
                      setAttendanceRole(e.target.value);
                      if (errors.attendance_role) setErrors((prev) => ({ ...prev, attendance_role: '' }));
                    }}
                    aria-invalid={Boolean(errors.attendance_role)}
                    aria-describedby={errors.attendance_role ? 'attendance-role-error' : undefined}
                    className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                      errors.attendance_role
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                    }`}
                    required
                  >
                    <option value="" disabled>Pilih peran</option>
                    {ATTENDANCE_ROLES.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                    {isAttendanceRole(attendanceRole) && !ATTENDANCE_ROLES.includes(attendanceRole as (typeof ATTENDANCE_ROLES)[number]) && (
                      <option value={attendanceRole}>{attendanceRole}</option>
                    )}
                  </select>
                  {errors.attendance_role && (
                    <p id="attendance-role-error" className="text-xs text-red-600">{errors.attendance_role}</p>
                  )}
                </div>

                <Input
                  label="Nama pengguna Discord"
                  placeholder="Masukkan nama pengguna Discord"
                  value={discordUsername}
                  onChange={(e) => {
                    setDiscordUsername(e.target.value);
                    if (errors.discordUsername)
                      setErrors((prev) => ({ ...prev, discordUsername: '' }));
                  }}
                  error={errors.discordUsername}
                  helperText="Contoh: user_discord atau user#1234"
                  required
                />

                <Input
                  label="Nama pengguna Roblox"
                  placeholder="Masukkan nama pengguna Roblox"
                  value={robloxUsername}
                  onChange={(e) => {
                    setRobloxUsername(e.target.value);
                    if (errors.robloxUsername)
                      setErrors((prev) => ({ ...prev, robloxUsername: '' }));
                  }}
                  error={errors.robloxUsername}
                  helperText="Nama pengguna akun game Roblox Anda"
                  required
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full shadow-md shadow-blue-600/20"
                    isLoading={isSubmitting}
                    loadingText="Memverifikasi & Menyimpan..."
                    icon={<CheckCircle2 className="w-5 h-5" />}
                  >
                    Konfirmasi Kehadiran
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {!isLoading && !alreadyAttended && !submittedData && !attendanceWindowOpen && (
        <div className="mx-auto max-w-2xl py-4 sm:py-8">
          <Card className="border border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-6 text-amber-900">
              <Clock className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-bold">Absensi sedang ditutup</h2>
                <p className="mt-1 text-sm">{attendanceWindowMessage}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        isOpen={!isLoading && !alreadyAttended && !submittedData && attendanceWindowOpen && Boolean(user?.profile_completed)}
        onClose={() => router.push('/dashboard')}
        title="Konfirmasi Absensi"
        description="Periksa biodata Anda sebelum absensi dicatat."
        maxWidth="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nama pengguna</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-800">{name || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Peran</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-800">{attendanceRole || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nama pengguna Roblox</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-800">{robloxUsername || '-'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nama pengguna Discord</p>
              <p className="mt-1 break-words text-sm font-bold text-slate-800">{discordUsername || '-'}</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="attendance-status-confirm" className="block text-xs font-semibold text-slate-700">
                Pilih Status Absensi <span className="text-red-500">*</span>
              </label>
              <select
                id="attendance-status-confirm"
                value={attendanceStatus}
                onChange={(event) => {
                  const value = event.target.value;
                  setAttendanceStatus(value === 'Hadir' || value === 'Izin' ? value : '');
                  if (errors.status) setErrors((previous) => ({ ...previous, status: '' }));
                  if (value !== 'Izin') {
                    setAttendanceReason('');
                    if (errors.attendance_reason) {
                      setErrors((previous) => ({ ...previous, attendance_reason: '' }));
                    }
                  }
                }}
                aria-invalid={Boolean(errors.status)}
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                  errors.status
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                }`}
                required
              >
                <option value="" disabled>Pilih Hadir atau Izin</option>
                <option value="Hadir">Hadir</option>
                <option value="Izin">Izin</option>
              </select>
              {errors.status && <p className="text-xs text-red-600">{errors.status}</p>}
            </div>
            {attendanceStatus === 'Izin' && (
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="attendance-reason-confirm" className="block text-xs font-semibold text-slate-700">
                  Alasan Izin <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="attendance-reason-confirm"
                  value={attendanceReason}
                  onChange={(event) => {
                    setAttendanceReason(event.target.value);
                    if (errors.attendance_reason) {
                      setErrors((previous) => ({ ...previous, attendance_reason: '' }));
                    }
                  }}
                  aria-invalid={Boolean(errors.attendance_reason)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Tuliskan alasan izin"
                  className={`w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                    errors.attendance_reason
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                  }`}
                  required
                />
                {errors.attendance_reason && (
                  <p className="text-xs text-red-600">{errors.attendance_reason}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => router.push('/dashboard')} icon={<XCircle className="h-4 w-4" />}>
              Periksa Lagi
            </Button>
            <Button variant="primary" onClick={handleConfirmAttendance} isLoading={isSubmitting} loadingText="Menyimpan..." icon={<CheckCircle2 className="h-4 w-4" />}>
              Konfirmasi
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
