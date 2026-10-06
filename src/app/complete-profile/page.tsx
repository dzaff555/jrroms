'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ShieldCheck, UserCircle2, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ProfileForm, ProfileFormValues } from '@/components/profile/ProfileForm';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';
import { AuthSession } from '@/types';
import { useToast } from '@/components/ui/Toast';

export default function CompleteProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingValues, setPendingValues] = useState<ProfileFormValues | null>(null);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();

      if (!data.success) {
        router.replace('/login');
        return;
      }

      const nextUser = data.data as AuthSession;
      setUser(nextUser);

      if (nextUser.profile_completed) {
        router.replace(nextUser.role === 'DEVELOPER' ? '/developer/tasks' : '/dashboard');
      }
    } catch {
      router.replace('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUser();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadUser]);

  const handleFormSubmit = async (values: ProfileFormValues) => {
    setPendingValues(values);
    setIsConfirming(true);
  };

  const handleConfirm = async () => {
    if (!pendingValues) return;

    setIsSubmitting(true);
    try {
      const profileRes = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingValues),
      });

      const profileData = await profileRes.json();
      if (!profileRes.ok || !profileData.success) {
        toast.error('Gagal Simpan Biodata', profileData.error || 'Data biodata gagal disimpan.');
        return;
      }

      toast.success('Biodata Tersimpan', 'Biodata berhasil disimpan. Anda dapat melakukan absensi dari dashboard.');
      setIsConfirming(false);
      router.replace(user?.role === 'DEVELOPER' ? '/developer/tasks' : '/dashboard');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan biodata.';
      toast.error('Gagal', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout user={user} showSidebar={false} showUserMenu={false}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="mt-4 text-sm text-slate-500">Memeriksa data akun...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user} showSidebar={false} showUserMenu={false}>
      <div className="mx-auto max-w-4xl space-y-6 py-2">
        <div className="rounded-3xl bg-gradient-to-r from-[#0F2747] via-[#153D70] to-[#2563EB] p-6 text-white shadow-xl shadow-blue-900/10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <UserCircle2 className="h-6 w-6 text-blue-200" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Selamat Datang</p>
              <h1 className="text-2xl font-extrabold tracking-tight">Lengkapi Biodata</h1>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <ShieldCheck className="h-5 w-5" />
            <p className="text-xs font-medium sm:text-sm">
              Biodata Anda wajib dilengkapi sebelum melakukan absensi hari ini. Role sudah ditentukan oleh admin.
            </p>
          </div>

          <ProfileForm
            initialValues={{
              profile_photo: user?.profile_photo || '',
              attendance_role: user?.attendance_role || 'CSOT',
              roblox_username: user?.roblox_username || '',
              discord_username: user?.discord_username || '',
            }}
            showRealName
            onSubmit={handleFormSubmit}
            isSubmitting={isSubmitting}
            submitLabel="Simpan & Lanjutkan"
          />
        </div>
      </div>

      <Modal
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        title="Konfirmasi Biodata"
        description="Pastikan data berikut benar sebelum disimpan."
        maxWidth="lg"
      >
        {pendingValues && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {pendingValues.profile_photo ? (
                <ProtectedProfilePhoto
                  src={pendingValues.profile_photo}
                  alt="Foto profil preview"
                  className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Akun</p>
                <p className="text-base font-bold text-slate-800">{user?.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nama Asli</p>
                <p className="mt-1 break-words text-sm font-bold text-slate-800">{pendingValues.real_name}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{pendingValues.attendance_role}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username Roblox</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{pendingValues.roblox_username}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username Discord</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{pendingValues.discord_username}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setIsConfirming(false)} icon={<XCircle className="h-4 w-4" />}>
                Periksa Lagi
              </Button>
              <Button variant="primary" onClick={handleConfirm} isLoading={isSubmitting} loadingText="Memproses..." icon={<CheckCircle2 className="h-4 w-4" />}>
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
