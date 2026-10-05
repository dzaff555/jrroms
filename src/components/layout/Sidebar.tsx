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
} from 'lucide-react';
import { AuthSession } from '@/types';
import { useToast } from '../ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

interface SidebarStaff {
  id: number;
  username: string;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string;
  profile_photo: string | null;
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
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const isAdmin = user?.role === 'ADMIN';
  const isDeveloper = user?.role === 'DEVELOPER';
  const userId = user?.id;
  const refreshStaff = React.useCallback(async () => {
    if (userId === undefined) return;

    try {
      const response = await fetch('/api/staff?limit=8', { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        setStaffCount(data.data.totalStaff);
        setStaffMembers(data.data.records);
      }
    } catch {
      setStaffCount(null);
    }
  }, [userId]);
  const isCurrentStaff = (staff: SidebarStaff) =>
    staff.id === user?.id || staff.username === user?.username;

  useAutoRefresh(() => void refreshStaff());

  React.useEffect(() => {
    if (userId === undefined) return;

    const timer = window.setTimeout(() => void refreshStaff(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStaff, userId]);

  const userNavItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: "Today's Attendance", href: '/attendance', icon: UserCheck },
    { label: 'Attendance History', href: '/attendance/history', icon: History },
    { label: 'Chat Staff', href: '/chat', icon: MessageCircle },
  ];

  const adminNavItems = [
    { label: 'Admin Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Chat Staff', href: '/admin/chat', icon: MessageCircle },
    { label: 'Tugas Developer', href: '/admin/tasks', icon: ClipboardList },
    { label: 'Attendance Reports', href: '/admin/reports', icon: FileSpreadsheet },
    { label: 'Attendance Statistics', href: '/admin/attendance-statistics', icon: ChartNoAxesColumn },
    { label: 'Manage Users', href: '/admin/users', icon: Users },
    { label: 'System Settings', href: '/admin/settings', icon: Settings },
  ];

  const developerNavItems = [
    { label: 'Tugas', href: '/developer/tasks', icon: ClipboardList },
    { label: 'Upload Tugas', href: '/developer/upload', icon: Upload },
  ];

  const navItems = isAdmin ? adminNavItems : isDeveloper ? developerNavItems : userNavItems;

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
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> Admin Portal
                  </>
                ) : isDeveloper ? (
                  'Developer Portal'
                ) : (
                  'User Attendance'
                )}
              </span>
            </div>
          )}
        </Link>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1.5 custom-scrollbar">
        {!collapsed && (
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Main Menu
          </div>
        )}

        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 group ${
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
            </Link>
          );
        })}

        <div className="pt-4">
            <div className={`flex items-center pb-2 ${collapsed ? 'justify-center' : 'justify-between px-3'}`}>
              {!collapsed && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Staff List
                </div>
              )}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-blue-200">
                {staffCount ?? '-'}
              </span>
            </div>
            {staffMembers.map((staff) => (
              <Link
                key={staff.id}
                href={isAdmin ? `/admin/users/${staff.id}` : `/staff/${staff.id}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? `${staff.username}${isCurrentStaff(staff) ? ' (You)' : ''} · ${staff.role === 'ADMIN' ? 'Administrator' : staff.role === 'DEVELOPER' ? 'Developer' : staff.attendance_role}` : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/8 hover:text-white ${collapsed ? 'justify-center px-0' : ''}`}
              >
                {staff.profile_photo ? (
                  <img
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
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-white">
                      {staff.username}{isCurrentStaff(staff) ? ' (You)' : ''}
                    </span>
                    <span className="truncate text-[11px] text-slate-400">
                      {staff.role === 'ADMIN' ? 'Administrator' : staff.role === 'DEVELOPER' ? 'Developer' : staff.attendance_role}
                    </span>
                  </span>
                )}
              </Link>
            ))}
            {staffMembers.length === 0 && !collapsed && (
              <p className="px-3 py-2 text-xs text-slate-400">No active staff yet.</p>
            )}
            {!collapsed && staffCount !== null && staffCount > staffMembers.length && (
              <Link
                href="/staff"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-xs font-semibold text-blue-300 hover:text-white"
              >
                View all staff
              </Link>
            )}
        </div>

      </div>

      {/* User Info & Logout Footer */}
      <div className="p-3 border-t border-white/10 bg-black/10 shrink-0">
        {user && (
          <Link
            href={isAdmin ? '/admin/profile' : '/profile'}
            onClick={() => setMobileOpen(false)}
            title={collapsed ? `${user.username} profile` : 'View account profile'}
            className={`mb-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/8 ${collapsed ? 'justify-center px-0' : ''}`}
          >
            {user.profile_photo ? (
              <img
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
                  {isAdmin ? 'Administrator' : isDeveloper ? 'Developer' : user.attendance_role || 'Staff'}
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
          title="Log out"
        >
          <LogOut className="w-5 h-5 shrink-0 text-rose-400" />
          {!collapsed && <span>Logout</span>}
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
