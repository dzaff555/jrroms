'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#F5F8FC]">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-5 animate-scale-in">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Akses Ditolak (403)</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
            Maaf, Anda tidak memiliki izin administrator untuk mengakses halaman yang dituju. Silakan kembali ke dasbor akun Anda.
          </p>
        </div>

        <div className="pt-2">
          <Link href="/dashboard">
            <Button variant="primary" className="w-full" icon={<ArrowLeft className="w-4 h-4" />}>
              Kembali ke Dasbor Karyawan
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
