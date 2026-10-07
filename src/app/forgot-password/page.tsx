'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [nip, setNip] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Kata sandi baru minimal harus memiliki 8 karakter.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('Kata sandi baru dan konfirmasinya tidak sama.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip, currentPassword, newPassword, confirmNewPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        const message = data.error || 'Gagal mengubah kata sandi.';
        setErrorMessage(message);
        toast.error('Gagal Mengubah Kata Sandi', message);
        return;
      }

      setIsSuccess(true);
      toast.success('Kata Sandi Berhasil Diubah', 'Silakan masuk menggunakan kata sandi baru.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Gagal terhubung ke server.';
      setErrorMessage(message);
      toast.error('Koneksi Gagal', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#F5F8FC]">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-xl p-6 sm:p-8 space-y-6 animate-scale-in">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Halaman Masuk</span>
        </Link>

        {isSuccess ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Kata Sandi Berhasil Diubah</h1>
              <p className="text-sm text-slate-600 mt-2">
                Silakan masuk kembali menggunakan kata sandi baru.
              </p>
            </div>
            <Link href="/login" className="block">
              <Button className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
                Kembali ke Halaman Masuk
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
                <KeyRound className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Lupa Kata Sandi?</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
                Verifikasi akun dengan NIP dan kata sandi saat ini.
              </p>
            </div>

            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="NIP"
                placeholder="Masukkan NIP"
                value={nip}
                onChange={(event) => setNip(event.target.value)}
                autoComplete="off"
                required
                autoFocus
              />
              <PasswordInput
                label="Kata Sandi Saat Ini"
                placeholder="Masukkan kata sandi saat ini"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <PasswordInput
                label="Kata Sandi Baru"
                placeholder="Minimal 8 karakter"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <PasswordInput
                label="Konfirmasi Kata Sandi Baru"
                placeholder="Ulangi kata sandi baru"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={isLoading}
                loadingText="Mengubah Kata Sandi..."
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Simpan Kata Sandi Baru
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
