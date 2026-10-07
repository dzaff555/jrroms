'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UserCheck,
  History,
  ClipboardList,
  Upload,
  FileSpreadsheet,
  ChartNoAxesColumn,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  MessageCircle,
  BookOpenText,
} from 'lucide-react';
import { AuthSession } from '@/types';
import { useToast } from '../ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface SidebarStaff {
  id: number;
  username: string;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string;
  profile_photo: string | null;
  is_online: boolean | number;
}

const PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
const SIDEBAR_REFRESH_INTERVAL_MS = 5_000;
const ATTENDANCE_ROLE_ORDER = [
  'Pusat Kendali',
  'PPKA',
  'Masinis Madya',
  'Masinis Muda',
  'Masinis Pertama',
  'CSOT',
  'Security',
  'Magang',
  'PJL',
  'Masa Pendidikan',
  'MASINIS',
  'PKD',
];

function compareStaff(left: SidebarStaff, right: SidebarStaff) {
  const roleOrder = (role: SidebarStaff['role']) =>
    role === 'ADMIN' ? 0 : role === 'DEVELOPER' ? 1 : 2;
  const roleComparison = roleOrder(left.role) - roleOrder(right.role);
  if (roleComparison !== 0) return roleComparison;

  if (left.role === 'USER' && right.role === 'USER') {
    const leftAttendanceOrder = ATTENDANCE_ROLE_ORDER.indexOf(left.attendance_role);
    const rightAttendanceOrder = ATTENDANCE_ROLE_ORDER.indexOf(right.attendance_role);
    const attendanceComparison =
      (leftAttendanceOrder < 0 ? ATTENDANCE_ROLE_ORDER.length : leftAttendanceOrder) -
      (rightAttendanceOrder < 0 ? ATTENDANCE_ROLE_ORDER.length : rightAttendanceOrder);
    if (attendanceComparison !== 0) return attendanceComparison;
  }

  return left.username.localeCompare(right.username, 'id');
}

export interface SidebarProps {
  user: AuthSession | null;
  collapsed: boolean;
  setCollapsed: (val: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (val: boolean) => void;
}

export function Sidebar({
  user,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) {
  const [staffCount, setStaffCount] = React.useState<number | null>(null);
  const [staffMembers, setStaffMembers] = React.useState<SidebarStaff[]>([]);
  const [unreadChatCount, setUnreadChatCount] = React.useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const isAdmin = user?.role === 'ADMIN';
  const isDeveloper = user?.role === 'DEVELOPER';
  const userId = user?.id;
  const sortedStaffMembers = React.useMemo(
    () => [...staffMembers].sort(compareStaff),
    [staffMembers]
  );
  const refreshStaff = React.useCallback(async () => {
    if (userId === undefined) return;

    try {
      const response = await fetch('/api/staff?all=true', { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setStaffCount(data.data.totalStaff);
        setStaffMembers(data.data.records);
      }
    } catch {
      setStaffCount(null);
    }
  }, [userId]);
  const refreshChatUnread = React.useCallback(async () => {
    if (userId === undefined) return;

    try {
      const response = await fetch('/api/chat/unread', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat jumlah pesan belum dibaca.');
      }
      setUnreadChatCount(Number(result.data?.unread_count || 0));
    } catch (error: unknown) {
      console.error('[Sidebar Chat Unread Error]:', error);
    }
  }, [userId]);
  const isCurrentStaff = (staff: SidebarStaff) =>
    staff.id === user?.id || staff.username === user?.username;

  useAutoRefresh(() => void refreshStaff());
  useAutoRefresh(() => void refreshChatUnread());

  React.useEffect(() => {
    if (userId === undefined) return;

    const timer = window.setTimeout(() => void refreshStaff(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStaff, userId]);

  React.useEffect(() => {
    if (userId === undefined) return;

    const sendPresenceHeartbeat = () => {
      void fetch('/api/presence', { method: 'POST' }).catch((error: unknown) => {
        console.error('[Sidebar Presence Heartbeat Error]:', error);
      });
    };
    const refreshSidebarData = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshStaff();
      void refreshChatUnread();
    };
    sendPresenceHeartbeat();
    refreshSidebarData();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      sendPresenceHeartbeat();
      refreshSidebarData();
    };
    const presenceTimer = window.setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const refreshTimer = window.setInterval(refreshSidebarData, SIDEBAR_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(presenceTimer);
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshChatUnread, refreshStaff, userId]);

  const userNavItems = [
    { label: 'Dasbor', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Absensi Hari Ini', href: '/attendance', icon: UserCheck },
    { label: 'Riwayat Absensi', href: '/attendance/history', icon: History },
    { label: 'Chat Staf', href: '/chat', icon: MessageCircle },
    { label: 'Informasi dan Peraturan', href: '/information', icon: BookOpenText },
  ];

  const adminNavItems = [
    { label: 'Dasbor Admin', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Chat Staf', href: '/admin/chat', icon: MessageCircle },
    { label: 'Tugas Developer', href: '/admin/tasks', icon: ClipboardList },
    { label: 'Laporan Absensi', href: '/admin/reports', icon: FileSpreadsheet },
    { label: 'Statistik Absensi', href: '/admin/attendance-statistics', icon: ChartNoAxesColumn },
    { label: 'Kelola Pengguna', href: '/admin/users', icon: Users },
    { label: 'Pengaturan Sistem', href: '/admin/settings', icon: Settings },
    { label: 'Informasi dan Peraturan', href: '/admin/information', icon: BookOpenText },
  ];

  const developerNavItems = [
    { label: 'Tugas', href: '/developer/tasks', icon: ClipboardList },
    { label: 'Unggah Tugas', href: '/developer/upload', icon: Upload },
    { label: 'Chat Staf', href: '/developer/chat', icon: MessageCircle },
    { label: 'Informasi dan Peraturan', href: '/developer/information', icon: BookOpenText },
  ];

  const navItems = isAdmin ? adminNavItems : isDeveloper ? developerNavItems : userNavItems;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.info('Berhasil Keluar', 'Sampai jumpa kembali!');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Gagal keluar', 'Silakan coba lagi.');
    }
  };

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/admin/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2747] text-white">
      {/* Brand Header */}
      <div className="h-18 flex items-center justify-between gap-1 px-2 border-b border-white/10 shrink-0">
        <Link
          href={isAdmin ? '/admin/dashboard' : isDeveloper ? '/developer/tasks' : '/dashboard'}
          className="flex min-w-0 items-center gap-2 group"
        >
          <div className={`flex h-10 shrink-0 items-center justify-center ${collapsed ? 'w-8' : 'w-16'}`}>
            <img
              src="/jrr-logo.svg"
              alt="JRR"
              className={`object-contain ${collapsed ? 'h-3 w-8' : 'h-4 w-16'}`}
            />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
                <span className="font-extrabold text-xs tracking-tight text-white leading-tight">
                  Operation Managing System - JRR
              </span>
              <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1">
                {isAdmin ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> Portal Administrator
                  </>
                ) : isDeveloper ? (
                  'Portal Developer'
                ) : (
                  'Absensi Pengguna'
                )}
              </span>
            </div>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={collapsed ? 'Perluas bilah sisi' : 'Ciutkan bilah sisi'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5 custom-scrollbar">
        {!collapsed && (
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Menu Utama
          </div>
        )}

        {navItems.map((item) => {
          const active = isActive(item.href);
          const isChatItem = item.label === 'Chat Staf';
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 group ${
                active
                  ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform duration-150 ${
                  active ? 'text-white scale-105' : 'text-slate-400 group-hover:text-white'
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
              {isChatItem && unreadChatCount > 0 && (
                <span
                  aria-label={`${unreadChatCount} pesan belum dibaca`}
                  title={`${unreadChatCount} pesan belum dibaca`}
                  className={`rounded-full bg-emerald-500 text-center text-[10px] font-bold leading-none text-white shadow-sm ${
                    collapsed
                      ? 'absolute right-1 top-1 min-w-4 px-1 py-1'
                      : 'ml-auto min-w-5 px-1.5 py-1'
                  }`}
                >
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </Link>
          );
        })}

        <div className="pt-4">
            <div className={`flex items-center pb-2 ${collapsed ? 'justify-center' : 'justify-between px-3'}`}>
              {!collapsed && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Daftar Staf
                </div>
              )}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-blue-200">
                {staffCount ?? '-'}
              </span>
            </div>
            {sortedStaffMembers.map((staff) => (
              <Link
                key={staff.id}
                href={isAdmin ? `/admin/users/${staff.id}` : `/staff/${staff.id}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? `${staff.username}${isCurrentStaff(staff) ? ' (Anda)' : ''} · ${staff.role === 'ADMIN' ? 'Administrator' : staff.role === 'DEVELOPER' ? 'Developer' : staff.attendance_role} · ${staff.is_online ? 'Online' : 'Offline'}` : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/8 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}
              >
                {staff.profile_photo ? (
                  <ProtectedProfilePhoto
                    src={staff.profile_photo}
                    alt={`Foto profil ${staff.username}`}
                    className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/30 text-xs font-bold text-blue-200">
                    {staff.username.charAt(0).toUpperCase()}
                  </div>
                )}
                {!collapsed && (
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-1">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-white">
                        {staff.username}{isCurrentStaff(staff) ? ' (Anda)' : ''}
                      </span>
                      <span className="truncate text-[11px] text-slate-400">
                        {staff.role === 'ADMIN' ? 'Administrator' : staff.role === 'DEVELOPER' ? 'Developer' : staff.attendance_role}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[10px] font-semibold ${staff.is_online ? 'text-emerald-300' : 'text-slate-500'}`}>
                      {staff.is_online ? 'Online' : 'Offline'}
                    </span>
                  </span>
                )}
              </Link>
            ))}
            {staffMembers.length === 0 && !collapsed && (
              <p className="px-3 py-2 text-xs text-slate-400">Belum ada staf yang aktif.</p>
            )}
        </div>

      </div>

      {/* User Info & Logout Footer */}
      <div className="p-3 border-t border-white/10 bg-black/10 shrink-0">
        {user && (
          <Link
            href={isAdmin ? '/admin/profile' : '/profile'}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? `Profil ${user.username}` : 'Lihat profil akun'}
            className={`mb-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/8 ${collapsed ? 'justify-center px-0' : ''}`}
          >
            {user.profile_photo ? (
              <ProtectedProfilePhoto
                src={user.profile_photo}
                alt={`Foto profil ${user.username}`}
                className="h-9 w-9 shrink-0 rounded-xl border border-blue-300/30 object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-600/30 text-sm font-bold text-blue-200">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            {!collapsed && (
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-sm font-semibold text-white">{user.username}</span>
                <span className="truncate text-xs text-slate-400">
                  {isAdmin ? 'Administrator' : isDeveloper ? 'Developer' : user.attendance_role || 'Staf'}
                </span>
              </div>
            )}
          </Link>
        )}

        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-300 hover:text-white hover:bg-rose-600/20 transition-all cursor-pointer ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Keluar"
        >
          <LogOut className="w-5 h-5 shrink-0 text-rose-400" />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden lg:block fixed inset-y-0 left-0 z-30 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[80vw] shadow-2xl z-10 transform animate-fade-in">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
