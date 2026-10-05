'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, ArrowRight, UserCheck, Lock } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const toast = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password) {
      setErrorMessage('Harap masukkan username dan password Anda.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const err = data.error || 'ID atau password salah.';
        setErrorMessage(err);
        toast.error('Login Gagal', err);
        return;
      }

      toast.success(
        'Login Berhasil!',
        `Selamat datang kembali, ${data.data.user.username}. Mengalihkan...`
      );

      // Redirect according to role
      const redirectUrl = data.data.redirectUrl || '/dashboard';
      window.location.assign(redirectUrl);
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'Gagal terhubung ke server.';
      setErrorMessage(errText);
      toast.error('Koneksi Gagal', errText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#F5F8FC]">
      {/* Left side: Premium Branding & Illustration (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#0F2747] via-[#122B4F] to-[#1E3A8A] p-12 flex-col justify-between relative overflow-hidden text-white">
        <Image
          src="/login-train-background.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F2747]/75 via-[#122B4F]/70 to-[#1E3A8A]/75" />

        {/* Decorative ambient background glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl pointer-events-none z-10" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none z-10" />

        {/* Brand Header */}
        <div className="flex items-center gap-3 relative z-20">
          <Image
            src="/jrr-logo.svg"
            alt="JRR"
            width={58}
            height={20}
            className="h-5 w-[58px] shrink-0 object-contain"
          />
          <div className="max-w-[190px]">
            <span className="font-extrabold text-sm tracking-tight block leading-tight">Operation Managing System - JRR</span>
            <span className="text-xs text-blue-300 font-medium">JRR Operations</span>
          </div>
        </div>

        {/* Center Presentation */}
        <div className="max-w-md my-auto relative z-20 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-blue-200">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Sistem Absensi Harian Terintegrasi (WIB)
          </div>

          <h2 className="text-4xl font-extrabold tracking-tight leading-tight text-white">
            Luangkan waktu anda untuk absen kehadiran di JRR
          </h2>

          {/* Feature highlights */}
          <div className="pt-4 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <UserCheck className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-sm font-bold">1 Kali Absen</div>
              <div className="text-xs text-slate-400 mt-0.5">Validasi ketat per hari</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <Lock className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="text-sm font-bold">Aman & Terenkripsi</div>
              <div className="text-xs text-slate-400 mt-0.5">JWT & Bcrypt Hashing</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-400 relative z-20">
          &copy; {new Date().getFullYear()} Operation Managing System - JRR. Hak cipta dilindungi.
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="relative isolate w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16 overflow-hidden">
        <Image
          src="/login-train-background.png"
          alt=""
          fill
          sizes="(max-width: 1023px) 100vw, 0px"
          className="object-cover opacity-45 lg:hidden"
        />
        <div className="absolute inset-0 bg-white/85 dark:bg-[#0d1117]/75 lg:hidden" />
        <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile Brand Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <Image
              src="/jrr-logo.svg"
              alt="JRR"
              width={58}
              height={20}
              className="h-5 w-[58px] shrink-0 object-contain brightness-0 dark:brightness-100"
            />
            <span className="max-w-[190px] font-bold text-sm leading-tight text-slate-900">
              Operation Managing System - JRR
            </span>
          </div>

          {/* Headings */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Masuk untuk melanjutkan ke sistem absensi.
            </p>
          </div>

          {/* Inline Error Alert */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium animate-fade-in">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="ID / Username atau Email"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />

            <div className="space-y-1">
              <PasswordInput
                label="Password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600 font-medium">Remember me</span>
                </label>

                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  Lupa password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              loadingText="Memproses..."
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Login
            </Button>
          </form>

          {/* Registration disabled */}
        </div>
      </div>
    </div>
  );
}
