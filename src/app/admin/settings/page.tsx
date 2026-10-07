'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Hand,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

type AttendanceMode = 'AUTO' | 'MANUAL';

export default function AdminSettingsPage() {
  const toast = useToast();
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('AUTO');
  const [isSavingAttendanceMode, setIsSavingAttendanceMode] = useState(false);

  const loadSettings = useCallback(async (showLoading = true) => {
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && (data.data.attendanceMode === 'AUTO' || data.data.attendanceMode === 'MANUAL')) {
        if (showLoading || !isSavingAttendanceMode) {
          setAttendanceMode(data.data.attendanceMode);
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, [isSavingAttendanceMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

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

  return (
    <>
      <div className="space-y-8 max-w-4xl">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Pengaturan Sistem
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Atur mode dan jadwal ketersediaan absensi.
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

      </div>
    </>
  );
}
