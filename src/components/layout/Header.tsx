'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Menu,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  MailOpen,
  UserCheck,
  Moon,
  Sun,
} from 'lucide-react';
import { AuthSession } from '@/types';
import { formatIndonesianDate, formatIndonesianDateTime, getJakartaTimeString } from '@/lib/utils/date';
import { useToast } from '../ui/Toast';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

interface InboxWarning {
  id: number;
  warning_number: number;
  reason: string;
  warning_date: string;
  warning_time: string;
  read_at: string | null;
  issued_by_username: string | null;
}

interface InboxAttendance {
  id: number;
  username: string;
  attendance_date: string;
  attendance_time: string;
  is_read: boolean;
}

export interface HeaderProps {
  user: AuthSession | null;
  onMenuClick: () => void;
  collapsed: boolean;
  showMenuButton?: boolean;
  showUserMenu?: boolean;
}

export function Header({ user, onMenuClick, collapsed, showMenuButton = true, showUserMenu = true }: HeaderProps) {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [inboxWarnings, setInboxWarnings] = useState<InboxWarning[]>([]);
  const [unreadWarningCount, setUnreadWarningCount] = useState(0);
  const [inboxAttendances, setInboxAttendances] = useState<InboxAttendance[]>([]);
  const [unreadAttendanceCount, setUnreadAttendanceCount] = useState(0);
  const [isInboxLoading, setIsInboxLoading] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [inboxError, setInboxError] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { toggleTheme } = useTheme();
  const isStaff = user?.role === 'USER';

  const refreshInbox = React.useCallback(async () => {
    try {
      const response = await fetch('/api/inbox', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat inbox.');
      }

      if (isStaff) {
        setInboxWarnings(result.data.warnings as InboxWarning[]);
        setUnreadWarningCount(Number(result.data.unreadCount || 0));
      } else if (user?.role === 'ADMIN') {
        setInboxAttendances(result.data.attendances as InboxAttendance[]);
        setUnreadAttendanceCount(Number(result.data.unreadCount || 0));
      }
      setInboxError('');
    } catch (error: unknown) {
      setInboxError(error instanceof Error ? error.message : 'Gagal memuat inbox.');
    }
  }, [isStaff, user]);

  useAutoRefresh(() => void refreshInbox());

  const loadInbox = async () => {
    setIsInboxLoading(true);
    setInboxError('');
    try {
      const response = await fetch('/api/inbox', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat inbox.');
      }

      if (isStaff) {
        setInboxWarnings(result.data.warnings as InboxWarning[]);
        setUnreadWarningCount(Number(result.data.unreadCount || 0));
      } else {
        setInboxAttendances(result.data.attendances as InboxAttendance[]);
        setUnreadAttendanceCount(Number(result.data.unreadCount || 0));
      }
    } catch (error: unknown) {
      setInboxError(error instanceof Error ? error.message : 'Gagal memuat inbox.');
    } finally {
      setIsInboxLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isStaff || user?.role === 'ADMIN') void refreshInbox();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isStaff, refreshInbox, user?.id, user?.role]);

  const toggleInbox = () => {
    const shouldOpen = !notificationsOpen;
    setNotificationsOpen(shouldOpen);
    if (shouldOpen && (isStaff || user?.role === 'ADMIN')) void loadInbox();
  };

  const markWarningRead = async (warningId: number) => {
    const warning = inboxWarnings.find((item) => item.id === warningId);
    if (!warning || warning.read_at || isMarkingRead) return;

    setIsMarkingRead(true);
    try {
      const response = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: warningId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memperbarui status pesan.');
      }

      setInboxWarnings((current) =>
        current.map((item) => item.id === warningId ? { ...item, read_at: new Date().toISOString() } : item)
      );
      setUnreadWarningCount((count) => Math.max(0, count - 1));
    } catch (error: unknown) {
      toast.error('Pesan gagal diperbarui', error instanceof Error ? error.message : 'Silakan coba lagi.');
    } finally {
      setIsMarkingRead(false);
    }
  };

  const markAllInboxRead = async () => {
    const unreadCount = isStaff ? unreadWarningCount : unreadAttendanceCount;
    if (unreadCount === 0 || isMarkingRead) return;

    setIsMarkingRead(true);
    try {
      const response = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memperbarui status pesan.');
      }

      const readAt = new Date().toISOString();
      if (isStaff) {
        setInboxWarnings((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
        setUnreadWarningCount(0);
      } else {
        setInboxAttendances((current) => current.map((item) => ({ ...item, is_read: true })));
        setUnreadAttendanceCount(0);
      }
    } catch (error: unknown) {
      toast.error('Pesan gagal diperbarui', error instanceof Error ? error.message : 'Silakan coba lagi.');
    } finally {
      setIsMarkingRead(false);
    }
  };

  // Update clock every second (WIB)
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(getJakartaTimeString(new Date()) + ' WIB');
      setCurrentDate(formatIndonesianDate(new Date()));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.info('Berhasil Logout', 'Sampai jumpa kembali!');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Gagal logout', 'Silakan coba lagi');
    }
  };

  // Compute breadcrumb title
  const getPageTitle = () => {
    if (pathname.startsWith('/admin/profile')) return 'Profil / Biodata';
    if (pathname.startsWith('/admin/attendance-statistics')) return 'Attendance Statistics';
    if (pathname.startsWith('/admin/reports')) return 'Laporan Absensi';
    if (pathname.startsWith('/admin/users')) return 'Manajemen User';
    if (pathname.startsWith('/admin/settings')) return 'Pengaturan Sistem';
    if (pathname.startsWith('/admin/dashboard')) return 'Dashboard Admin';
    if (pathname.startsWith('/attendance/history')) return 'Riwayat Absensi';
    if (pathname.startsWith('/attendance')) return 'Form Absensi Hari Ini';
    if (pathname.startsWith('/dashboard')) return 'Dashboard Staff';
    return 'Daily Attendance';
  };

  return (
    <header className="sticky top-0 z-20 h-18 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between transition-all">
      {/* Left: Mobile Hamburger & Breadcrumb */}
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Buka menu navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider hidden sm:block">
            Sistem Absensi
          </span>
          <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* Right: Clock & User Profile */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Live Jakarta Time Pill */}
        <div className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>{currentDate || 'Memuat tanggal...'}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 font-semibold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>{currentTime || '00:00:00 WIB'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-xl p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          aria-label="Ganti mode terang atau gelap"
          title="Ganti mode terang atau gelap"
        >
          <Moon className="h-5 w-5 dark:hidden" />
          <Sun className="hidden h-5 w-5 dark:block" />
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleInbox}
            className="relative p-2.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label={isStaff
              ? `Buka inbox, ${unreadWarningCount} pesan belum dibaca`
              : user?.role === 'ADMIN'
                ? `Buka inbox, ${unreadAttendanceCount} notifikasi absensi belum dibaca`
                : 'Lihat notifikasi'}
            aria-expanded={notificationsOpen}
          >
            <Bell className="w-5 h-5" />
            {(isStaff ? unreadWarningCount : user?.role === 'ADMIN' ? unreadAttendanceCount : 0) > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                {(isStaff ? unreadWarningCount : unreadAttendanceCount) > 9
                  ? '9+'
                  : isStaff ? unreadWarningCount : unreadAttendanceCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-100 bg-white py-3 shadow-xl animate-scale-in">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <span className="text-sm font-bold text-slate-800">
                  {isStaff ? 'Inbox Peringatan' : user?.role === 'ADMIN' ? 'Inbox Absensi' : 'Notifikasi'}
                </span>
                {(isStaff ? unreadWarningCount : user?.role === 'ADMIN' ? unreadAttendanceCount : 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllInboxRead()}
                    disabled={isMarkingRead}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    Tandai semua dibaca
                  </button>
                )}
              </div>
              <div className="max-h-[min(65vh,28rem)] overflow-y-auto p-2">
                {isStaff || user?.role === 'ADMIN' ? (
                  isInboxLoading ? (
                    <p className="p-4 text-center text-xs text-slate-500">Memuat pesan...</p>
                  ) : inboxError ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-rose-600">{inboxError}</p>
                      <button
                        type="button"
                        onClick={() => void loadInbox()}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Coba lagi
                      </button>
                    </div>
                  ) : isStaff && inboxWarnings.length === 0 ? (
                    <div className="p-5 text-center">
                      <MailOpen className="mx-auto h-6 w-6 text-slate-300" />
                      <p className="mt-2 text-xs text-slate-500">Inbox belum memiliki pesan peringatan.</p>
                    </div>
                  ) : isStaff ? (
                    <div className="space-y-1">
                      {inboxWarnings.map((warning) => (
                        <button
                          key={warning.id}
                          type="button"
                          onClick={() => void markWarningRead(warning.id)}
                          disabled={isMarkingRead}
                          className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-amber-50 disabled:cursor-default ${
                            warning.read_at ? 'bg-white' : 'bg-amber-50/70'
                          }`}
                        >
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            warning.read_at ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                          }`}>
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-800">
                                Peringatan - {warning.warning_number}
                              </span>
                              {!warning.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                            </span>
                            <span className="mt-1 block whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600">
                              {warning.reason}
                            </span>
                            <span className="mt-1.5 block text-[10px] text-slate-400">
                              Oleh {warning.issued_by_username || 'Admin'} · {formatIndonesianDateTime(warning.warning_date, warning.warning_time)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : inboxAttendances.length === 0 ? (
                    <div className="p-5 text-center">
                      <MailOpen className="mx-auto h-6 w-6 text-slate-300" />
                      <p className="mt-2 text-xs text-slate-500">Belum ada user yang baru absen.</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {inboxAttendances.map((attendance) => (
                        <div
                          key={attendance.id}
                          className={`flex items-start gap-3 rounded-xl p-3 ${
                            attendance.is_read ? 'bg-white' : 'bg-blue-50/70'
                          }`}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                            <UserCheck className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-slate-800">
                              {attendance.username} telah absen
                              {!attendance.is_read && (
                                <span className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-600" />
                              )}
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-600">
                              Pada jam {attendance.attendance_time.slice(0, 5)} WIB
                            </span>
                            <span className="mt-1 block text-[10px] text-slate-400">
                              {formatIndonesianDate(attendance.attendance_date)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex items-start gap-3 p-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Sistem Absensi Aktif</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                        Waktu absensi hari ini menggunakan zona waktu Asia/Jakarta (WIB).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        {showUserMenu && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200/60"
            >
              {user?.profile_photo ? (
                <img
                  src={user.profile_photo}
                  alt={`Foto profil ${user.username}`}
                  className="h-8 w-8 rounded-xl border border-slate-200 object-cover shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {user?.username || 'Pengguna'}
                </span>
                <span className="text-[10px] font-medium text-slate-500 capitalize">
                  {user?.role === 'ADMIN' ? 'Administrator' : user?.attendance_role || 'User'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-scale-in">
              <div className="px-4 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-bold text-slate-800">{user?.username}</p>
              </div>

              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin/settings"
                  onClick={() => setProfileDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Pengaturan Admin</span>
                </Link>
              )}

              {user && (
                <Link
                  href={user.role === 'ADMIN' ? '/admin/profile' : '/profile'}
                  onClick={() => setProfileDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>Profil / Biodata</span>
                </Link>
              )}

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Logout</span>
              </button>
            </div>
          )}
          </div>
        )}
      </div>
    </header>
  );
}
