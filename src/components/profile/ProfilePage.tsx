'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, UserCircle2, ShieldCheck } from 'lucide-react';
import { ProfileForm, ProfileFormValues } from '@/components/profile/ProfileForm';
import { AuthSession } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AuthSession | null>(null);
  const [realName, setRealName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useAutoRefresh(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await response.json();
        if (!data.success) return;

        setUser(data.data);
        if (data.data.role !== 'ADMIN') {
          const profileResponse = await fetch('/api/profile', { cache: 'no-store' });
          const profileData = await profileResponse.json();
          if (profileResponse.ok && profileData.success) {
            setRealName(profileData.data.real_name || '');
          }
        }
      } catch (error: unknown) {
        console.error('Failed to refresh profile:', error);
      }
    })();
  });

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.success) {
          router.replace('/login');
          return;
        }
        setUser(data.data);

        if (data.data.role !== 'ADMIN') {
          const profileRes = await fetch('/api/profile');
          const profileData = await profileRes.json();
          if (!profileRes.ok || !profileData.success) {
            throw new Error(profileData.error || 'Nama asli tidak dapat dimuat.');
          }
          setRealName(profileData.data.real_name || '');
        }
      } catch (error: unknown) {
        console.error('Failed to load profile:', error);
        router.replace('/login');
      } finally {
        setIsLoading(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [router]);

  const handleSubmit = async (values: ProfileFormValues) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal Menyimpan', data.error || 'Tidak dapat memperbarui biodata.');
        return;
      }

      toast.success('Biodata Diperbarui', 'Perubahan profil berhasil disimpan.');
      if (user?.role === 'ADMIN') {
        router.refresh();
      } else {
        router.push('/dashboard');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan profil.';
      toast.error('Gagal', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsChangingPassword(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        toast.error('Gagal Mengubah Password', data.error || 'Tidak dapat mengubah password.');
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Password Berhasil Diubah', 'Gunakan password baru saat login berikutnya.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat mengubah password.';
      toast.error('Gagal Mengubah Password', message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="mt-4 text-sm text-slate-500">Memuat profil Anda...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6 py-2">
        <div className="rounded-3xl bg-gradient-to-r from-slate-800 via-slate-900 to-blue-900 p-6 text-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <UserCircle2 className="h-6 w-6 text-blue-200" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Profil</p>
              <h1 className="text-2xl font-extrabold tracking-tight">Biodata Pengguna</h1>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
            <ShieldCheck className="h-5 w-5" />
            <p className="text-xs font-medium sm:text-sm">
              {user?.role === 'ADMIN'
                ? 'Di halaman ini Anda hanya dapat mengubah foto profil akun administrator.'
                : 'Nama asli, foto profil, username Roblox, dan username Discord dapat diubah. Nama asli hanya terlihat oleh Anda dan administrator; role tetap otomatis.'}
            </p>
          </div>

          <ProfileForm
            initialValues={{
              profile_photo: user?.profile_photo || '',
              attendance_role: user?.attendance_role || 'CSOT',
              roblox_username: user?.roblox_username || '',
              discord_username: user?.discord_username || '',
              real_name: realName,
            }}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitLabel="Simpan Perubahan"
            showRole={user?.role !== 'ADMIN'}
            photoOnly={user?.role === 'ADMIN'}
            showRealName={user?.role !== 'ADMIN'}
          />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Ganti Password
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Masukkan password saat ini, lalu password baru dan konfirmasinya.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <PasswordInput
              label="Password Saat Ini"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordInput
                label="Password Baru"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <PasswordInput
                label="Konfirmasi Password Baru"
                autoComplete="new-password"
                minLength={8}
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                required
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={isChangingPassword} loadingText="Menyimpan...">
                Simpan Password Baru
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
