'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  Save,
  CalendarClock,
  Hand,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

type AttendanceMode = 'AUTO' | 'MANUAL';

export default function AdminSettingsPage() {
  const toast = useToast();
  // Profile edit states
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('AUTO');
  const [isSavingAttendanceMode, setIsSavingAttendanceMode] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = async (showLoading = true) => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const activeElement = document.activeElement;
        const isEditing = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
        if (data.data.user && (!isEditing || showLoading)) {
          setUsername(data.data.user.username || '');
        }
        if (showLoading && (data.data.attendanceMode === 'AUTO' || data.data.attendanceMode === 'MANUAL')) {
          setAttendanceMode(data.data.attendanceMode);
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useAutoRefresh(() => void loadSettings(false));

  const handleAttendanceModeChange = async (mode: AttendanceMode) => {
    if (mode === attendanceMode || isSavingAttendanceMode) return;

    const previousMode = attendanceMode;
    setAttendanceMode(mode);
    setIsSavingAttendanceMode(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceMode: mode }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan mode absensi.');
      }
      toast.success('Mode Absensi Diperbarui', data.message);
    } catch (error: unknown) {
      setAttendanceMode(previousMode);
      toast.error(
        'Gagal Menyimpan Mode Absensi',
        error instanceof Error ? error.message : 'Koneksi ke server gagal.'
      );
    } finally {
      setIsSavingAttendanceMode(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload: Record<string, string> = { username };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
        payload.confirmNewPassword = confirmNewPassword;
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error('Gagal Menyimpan', data.error || 'Terjadi kesalahan.');
        return;
      }

      toast.success('Pengaturan Disimpan', 'Data akun administrator berhasil diperbarui.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      loadSettings();
    } catch (err: unknown) {
      toast.error('Gagal', err instanceof Error ? err.message : 'Koneksi ke server gagal.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-8 max-w-4xl">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pengaturan Sistem & Akun Admin
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kelola informasi akun dan kata sandi administrator.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Jadwal Absensi</CardTitle>
              <CardDescription>
                Pilih apakah absensi dibuka kapan saja atau mengikuti jadwal otomatis.
              </CardDescription>
            </div>
            <CalendarClock className="w-5 h-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <fieldset disabled={isSavingAttendanceMode} className="space-y-3">
              <legend className="sr-only">Mode absensi</legend>
              <button
                type="button"
                aria-pressed={attendanceMode === 'MANUAL'}
                onClick={() => void handleAttendanceModeChange('MANUAL')}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-wait ${
                  attendanceMode === 'MANUAL'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <Hand className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Manual — buka kapan saja</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Pengguna dapat mengisi absensi tanpa batasan hari atau jam.
                  </span>
                </span>
                {attendanceMode === 'MANUAL' && (
                  <span className="ml-auto text-xs font-bold text-blue-700">Aktif</span>
                )}
              </button>

              <button
                type="button"
                aria-pressed={attendanceMode === 'AUTO'}
                onClick={() => void handleAttendanceModeChange('AUTO')}
                className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-wait ${
                  attendanceMode === 'AUTO'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Otomatis — sesuai jadwal</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Absensi dibuka Jumat, Sabtu, dan Minggu pukul 05.00–18.00 WIB.
                  </span>
                </span>
                {attendanceMode === 'AUTO' && (
                  <span className="ml-auto text-xs font-bold text-blue-700">Aktif</span>
                )}
              </button>
            </fieldset>
            {isSavingAttendanceMode && (
              <p role="status" className="mt-3 text-xs text-slate-500">Menyimpan perubahan mode absensi...</p>
            )}
          </CardContent>
        </Card>

        {/* Admin Account Settings */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profil Akun Administrator</CardTitle>
              <CardDescription>
                Ubah informasi akun masuk atau perbarui kata sandi admin Anda.
              </CardDescription>
            </div>
            <Shield className="w-5 h-5 text-blue-600" />
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <Input
                  label="Nama pengguna admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              {/* Password Change Section */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    Ubah Kata Sandi Administrator (Opsional)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kosongkan jika Anda tidak ingin mengubah kata sandi akun saat ini.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PasswordInput
                    label="Kata Sandi Saat Ini"
                    placeholder="Masukkan kata sandi lama"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />

                  <PasswordInput
                    label="Kata Sandi Baru"
                    placeholder="Minimal 8 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />

                  <PasswordInput
                    label="Konfirmasi Kata Sandi Baru"
                    placeholder="Ulangi kata sandi baru"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSaving}
                  loadingText="Menyimpan..."
                  icon={<Save className="w-4 h-4" />}
                >
                  Simpan Perubahan
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

      </div>
    </>
  );
}
