'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  Save,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function AdminSettingsPage() {
  const toast = useToast();
  // Profile edit states
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const activeElement = document.activeElement;
        const isEditing = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
        if (data.data.user && (!isEditing || showLoading)) {
          setUsername(data.data.user.username || '');
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useAutoRefresh(() => void loadSettings(false));

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
    } catch (err: any) {
      toast.error('Gagal', err.message || 'Koneksi ke server gagal.');
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
