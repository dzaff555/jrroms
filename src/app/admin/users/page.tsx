'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  UserCheck,
  UserX,
  Edit2,
  Eye,
  KeyRound,
  Trash2,
  Copy,
  UserPlus,
  BriefcaseBusiness,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatIndonesianDate } from '@/lib/utils/date';
import { ATTENDANCE_ROLES, AuthSession, AttendanceRole, UserRole, UserStatus } from '@/types';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

interface AdminUser {
  id: number;
  username: string;
  real_name?: string | null;
  role: UserRole;
  status: UserStatus;
  created_at?: string;
  last_attendance?: string | null;
  attendance_role?: string | null;
  profile_photo?: string | null;
  roblox_username?: string | null;
  discord_username?: string | null;
  last_attendance_status?: string | null;
}

export default function AdminUsersPage() {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);

  // Filters & pagination
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [attendanceRoleFilter, setAttendanceRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [viewUser, setViewUser] = useState<AdminUser | null>(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('USER');
  const [editAttendanceUser, setEditAttendanceUser] = useState<AdminUser | null>(null);
  const [editAttendanceRole, setEditAttendanceRole] = useState<AttendanceRole>('CSOT');
  const [confirmToggleUser, setConfirmToggleUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{ username: string; password: string } | null>(null);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRealName, setNewRealName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newSystemRole, setNewSystemRole] = useState<'USER' | 'DEVELOPER'>('USER');
  const [newAttendanceRole, setNewAttendanceRole] = useState<AttendanceRole>('CSOT');
  const [isUpdating, setIsUpdating] = useState(false);
  const isFetchingUsersRef = React.useRef(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setCurrentUser(data.data);
      });
  }, []);

  const fetchUsers = useCallback(async (showLoading = true) => {
    if (isFetchingUsersRef.current) return;
    isFetchingUsersRef.current = true;
    if (showLoading) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (search) params.set('search', search);
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (attendanceRoleFilter !== 'ALL') params.set('attendanceRole', attendanceRoleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        const updatedUsers = (data.data.records || []) as AdminUser[];
        setUsers(updatedUsers);
        setViewUser((current) =>
          current
            ? updatedUsers.find((updatedUser) => updatedUser.id === current.id) || current
            : null
        );
        setTotalPages(data.data.pagination.totalPages || 1);
        setTotalItems(data.data.pagination.totalItems || 0);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      if (showLoading) setIsLoading(false);
      isFetchingUsersRef.current = false;
    }
  }, [attendanceRoleFilter, currentPage, roleFilter, search, statusFilter]);

  useAutoRefresh(() => void fetchUsers(false));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchUsers();
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsUpdating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          real_name: newRealName,
          password: newPassword,
          role: newSystemRole,
          attendance_role: newAttendanceRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal Membuat Akun', data.error || 'Akun tidak dapat dibuat.');
        return;
      }

      toast.success('Akun Dibuat', `Akun @${newUsername.trim()} berhasil dibuat.`);
      setIsCreateUserOpen(false);
      setNewUsername('');
      setNewRealName('');
      setNewPassword('');
      setNewSystemRole('USER');
      setNewAttendanceRole('CSOT');
      setCurrentPage(1);
      if (currentPage === 1) await fetchUsers();
    } catch (error: unknown) {
      toast.error('Gagal Membuat Akun', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleViewUser = async (user: AdminUser) => {
    setViewUser(user);
    setIsLoadingUserDetails(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal Memuat Detail', data.error || 'Detail akun tidak dapat dimuat.');
        setViewUser(null);
        return;
      }
      setViewUser(data.data as AdminUser);
    } catch {
      toast.error('Gagal Memuat Detail', 'Terjadi kesalahan saat memuat detail akun.');
      setViewUser(null);
    } finally {
      setIsLoadingUserDetails(false);
    }
  };

  // Toggle user active / disabled
  const handleToggleStatus = async () => {
    if (!confirmToggleUser) return;
    setIsUpdating(true);

    const newStatus = confirmToggleUser.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';

    try {
      const res = await fetch(`/api/admin/users/${confirmToggleUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error('Gagal', data.error || 'Gagal memperbarui status user.');
        return;
      }

      toast.success(
        'Berhasil',
        `Akun @${confirmToggleUser.username} kini berstatus ${newStatus}.`
      );
      setConfirmToggleUser(null);
      fetchUsers();
    } catch (err: unknown) {
      toast.error('Gagal', err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Update user role
  const handleUpdateRole = async () => {
    if (!editUser) return;
    setIsUpdating(true);

    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error('Gagal', data.error || 'Gagal mengubah role user.');
        return;
      }

      toast.success(
        'Role Diperbarui',
        `Role @${editUser.username} berhasil diubah menjadi ${editRole}.`
      );
      setEditUser(null);
      fetchUsers();
    } catch (err: unknown) {
      toast.error('Gagal', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateAttendanceRole = async () => {
    if (!editAttendanceUser) return;
    setIsUpdating(true);

    try {
      const res = await fetch(`/api/admin/users/${editAttendanceUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendance_role: editAttendanceRole }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error('Gagal', data.error || 'Gagal mengubah role absensi user.');
        return;
      }

      toast.success(
        'Role Absensi Diperbarui',
        `Role absensi @${editAttendanceUser.username} berhasil diubah menjadi ${editAttendanceRole}.`
      );
      setEditAttendanceUser(null);
      await fetchUsers();
    } catch (err: unknown) {
      toast.error('Gagal', err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal Menghapus', data.error || 'Akun tidak dapat dihapus.');
        return;
      }

      toast.success('Akun Dihapus', `Akun @${deleteUser.username} dan riwayat absensinya sudah dihapus.`);
      setDeleteUser(null);
      await fetchUsers();
    } catch (error: unknown) {
      toast.error('Gagal Menghapus', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/admin/users/${resetPasswordUser.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error('Gagal Reset Password', data.error || 'Password tidak dapat dibuat ulang.');
        return;
      }

      setTemporaryPassword({
        username: resetPasswordUser.username,
        password: data.data.temporaryPassword,
      });
      setResetPasswordUser(null);
      toast.success('Password Diperbarui', 'Salin password sementara sebelum menutup jendela ini.');
    } catch (error: unknown) {
      toast.error('Gagal Reset Password', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword.password);
      toast.success('Password Disalin', 'Password sementara sudah disalin ke clipboard.');
    } catch {
      toast.error('Gagal Menyalin', 'Silakan salin password yang tampil secara manual.');
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Manajemen Akun Pengguna
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Kelola akun, hak akses, role absensi, dan status pengguna.
              </p>
            </div>
            <Button variant="primary" onClick={() => setIsCreateUserOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
              Buat Akun
            </Button>
          </div>
        </div>

        {/* Filter Card */}
        <Card className="p-4 sm:p-5">
          <form
            onSubmit={handleSearchSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(145px,1fr))_auto] items-end gap-3"
          >
            <Input
              placeholder="Username atau role absensi..."
              leftIcon={<Search className="w-4 h-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter role sistem"
              className="w-full rounded-xl text-xs sm:text-sm border border-slate-200 bg-white px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Semua Role Sistem</option>
              <option value="USER">User</option>
              <option value="DEVELOPER">Developer</option>
              <option value="ADMIN">Admin</option>
            </select>

            <select
              value={attendanceRoleFilter}
              onChange={(e) => {
                setAttendanceRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter role absensi"
              className="w-full rounded-xl text-xs sm:text-sm border border-slate-200 bg-white px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Semua Role Absensi</option>
              {ATTENDANCE_ROLES.map((attendanceRole) => (
                <option key={attendanceRole} value={attendanceRole}>{attendanceRole}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter status akun"
              className="w-full rounded-xl text-xs sm:text-sm border border-slate-200 bg-white px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Aktif</option>
              <option value="DISABLED">Nonaktif</option>
            </select>

            <Button type="submit" variant="primary" className="w-full lg:w-auto">
              Cari
            </Button>
          </form>
        </Card>

        {/* Users Table */}
        {isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : users.length === 0 ? (
          <EmptyState
            title="Tidak Ada User Ditemukan"
            description="Tidak ada pengguna yang cocok dengan kriteria pencarian Anda."
          />
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-12 text-center">ID</th>
                      <th className="py-3.5 px-4">Pengguna</th>
                      <th className="py-3.5 px-4 text-center">Role Sistem</th>
                      <th className="py-3.5 px-4 text-center">Role Absensi</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4">Absen Terakhir</th>
                      <th className="py-3.5 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      const isSelf = currentUser?.id === u.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                            #{u.id}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              {u.profile_photo ? (
                                <img
                                  src={u.profile_photo}
                                  alt={`Foto profil ${u.username}`}
                                  className="h-8 w-8 shrink-0 rounded-xl border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 shrink-0 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-xs">
                                  {u.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="font-bold text-slate-800">
                                @{u.username}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant={u.role === 'ADMIN' ? 'primary' : 'neutral'}
                              dot
                            >
                              {u.role}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-center font-semibold text-slate-700">
                            {u.attendance_role || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge
                              variant={u.status === 'ACTIVE' ? 'success' : 'danger'}
                              dot
                            >
                              {u.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                            {u.last_attendance
                              ? formatIndonesianDate(u.last_attendance)
                              : '-'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* View detail */}
                              <button
                                onClick={() => handleViewUser(u)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Lihat Detail Akun"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Edit role */}
                              <button
                                onClick={() => {
                                  setEditUser(u);
                                  setEditRole(u.role);
                                }}
                                disabled={isSelf}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title={isSelf ? 'Tidak bisa edit akun sendiri' : 'Ubah Role'}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  setEditAttendanceUser(u);
                                  setEditAttendanceRole(
                                    ATTENDANCE_ROLES.includes(u.attendance_role as AttendanceRole)
                                      ? u.attendance_role as AttendanceRole
                                      : 'CSOT'
                                  );
                                }}
                                disabled={isUpdating}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title="Ubah Role Absensi"
                              >
                                <BriefcaseBusiness className="w-4 h-4" />
                              </button>

                              {/* Disable / Enable toggle */}
                              <button
                                onClick={() => setConfirmToggleUser(u)}
                                disabled={isSelf}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                  u.status === 'ACTIVE'
                                    ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={
                                  isSelf
                                    ? 'Tidak bisa menonaktifkan diri sendiri'
                                    : u.status === 'ACTIVE'
                                    ? 'Nonaktifkan Akun'
                                    : 'Aktifkan Akun'
                                }
                              >
                                {u.status === 'ACTIVE' ? (
                                  <UserX className="w-4 h-4 text-rose-500" />
                                ) : (
                                  <UserCheck className="w-4 h-4 text-emerald-500" />
                                )}
                              </button>

                              <button
                                onClick={() => setResetPasswordUser(u)}
                                disabled={isSelf || isUpdating}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title={isSelf ? 'Tidak bisa reset akun sendiri' : 'Reset dan tampilkan password baru'}
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setDeleteUser(u)}
                                disabled={isSelf || isUpdating}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                title={isSelf ? 'Tidak bisa menghapus akun sendiri' : 'Hapus akun'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={10}
              onPageChange={(p) => setCurrentPage(p)}
            />
          </div>
        )}

        <Modal
          isOpen={isCreateUserOpen}
          onClose={() => setIsCreateUserOpen(false)}
          title="Buat Akun Pengguna"
          description="Pilih akses User atau Developer. Keduanya mengikuti aturan absensi."
          maxWidth="md"
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            <Input
              label="Username"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              minLength={3}
              autoComplete="username"
              required
            />
            <Input
              label="Nama Asli (Opsional)"
              value={newRealName}
              onChange={(event) => setNewRealName(event.target.value)}
              maxLength={100}
              autoComplete="name"
              helperText="Hanya administrator yang dapat melihat nama asli ini."
            />
            <Input
              label="Password Awal"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              helperText="Minimal 8 karakter. Pengguna dapat memakai ini untuk login pertama."
              required
            />
            <div className="space-y-1.5">
              <label htmlFor="new-system-role" className="block text-xs font-semibold text-slate-700">Role Sistem</label>
              <select
                id="new-system-role"
                value={newSystemRole}
                onChange={(event) => setNewSystemRole(event.target.value as 'USER' | 'DEVELOPER')}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="USER">User</option>
                <option value="DEVELOPER">Developer</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Role Absensi</label>
              <select
                value={newAttendanceRole}
                onChange={(event) => setNewAttendanceRole(event.target.value as AttendanceRole)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {ATTENDANCE_ROLES.map((attendanceRole) => (
                  <option key={attendanceRole} value={attendanceRole}>{attendanceRole}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)} disabled={isUpdating}>
                Batal
              </Button>
              <Button type="submit" variant="primary" isLoading={isUpdating} loadingText="Membuat akun...">
                Buat Akun
              </Button>
            </div>
          </form>
        </Modal>

        {/* View User Modal */}
        <Modal
          isOpen={!!viewUser}
          onClose={() => setViewUser(null)}
          title="Detail Akun Pengguna"
          description="Informasi lengkap akun terdaftar pada sistem."
          maxWidth="md"
        >
          {viewUser && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {viewUser.profile_photo ? (
                    <img
                      src={viewUser.profile_photo}
                      alt={`Foto profil ${viewUser.username}`}
                      className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                      {viewUser.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800">@{viewUser.username}</h4>
                  </div>
                </div>
                <Badge variant={viewUser.status === 'ACTIVE' ? 'success' : 'danger'} dot>
                  {viewUser.status}
                </Badge>
              </div>

              {isLoadingUserDetails && (
                <p className="text-center text-xs text-slate-500">Memuat foto profil...</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 col-span-2">
                  <span className="text-slate-400 block font-medium">Nama Asli</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {viewUser.real_name || 'Belum diisi'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Role Sistem</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{viewUser.role}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Role Absensi</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{viewUser.attendance_role || '-'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Terdaftar Sejak</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">{viewUser.created_at}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-400 block font-medium">Status Absensi Terakhir</span>
                    <Badge variant={viewUser.last_attendance ? 'success' : 'neutral'} dot>
                      {viewUser.last_attendance_status === 'Hadir' ? 'Sudah Absen' : 'Belum Pernah Absen'}
                    </Badge>
                  </div>
                  <span className="font-semibold text-blue-600 mt-1 block">
                    {viewUser.last_attendance
                      ? `${formatIndonesianDate(viewUser.last_attendance)}${viewUser.last_attendance_status ? ` · ${viewUser.last_attendance_status}` : ''}`
                      : 'Belum pernah melakukan absensi'}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="secondary" onClick={() => setViewUser(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={!!editAttendanceUser}
          onClose={() => setEditAttendanceUser(null)}
          title="Ubah Role Absensi"
          description={`Pilih role absensi untuk akun @${editAttendanceUser?.username}`}
          maxWidth="sm"
        >
          {editAttendanceUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="attendance-role" className="block text-xs font-semibold text-slate-700">
                  Role Absensi
                </label>
                <select
                  id="attendance-role"
                  value={editAttendanceRole}
                  onChange={(event) => setEditAttendanceRole(event.target.value as AttendanceRole)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {ATTENDANCE_ROLES.map((attendanceRole) => (
                    <option key={attendanceRole} value={attendanceRole}>{attendanceRole}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditAttendanceUser(null)}
                  disabled={isUpdating}
                >
                  Batal
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUpdateAttendanceRole}
                  isLoading={isUpdating}
                  loadingText="Menyimpan..."
                >
                  Simpan Perubahan
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Edit Role Modal */}
        <Modal
          isOpen={!!editUser}
          onClose={() => setEditUser(null)}
          title="Ubah Role Pengguna"
          description={`Sesuaikan hak akses untuk akun @${editUser?.username}`}
          maxWidth="sm"
        >
          {editUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Pilih Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-xl text-sm border border-slate-200 bg-white p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="USER">USER (Hanya akses absensi & dashboard pribadi)</option>
                  <option value="DEVELOPER">DEVELOPER (Absensi & tugas developer)</option>
                  <option value="ADMIN">ADMIN (Akses penuh dashboard & laporan)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditUser(null)} disabled={isUpdating}>
                  Batal
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUpdateRole}
                  isLoading={isUpdating}
                  loadingText="Menyimpan..."
                >
                  Simpan Perubahan
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Confirmation Dialog for Toggle Status */}
        {confirmToggleUser && (
          <ConfirmDialog
            isOpen={true}
            onClose={() => setConfirmToggleUser(null)}
            onConfirm={handleToggleStatus}
            title={
              confirmToggleUser.status === 'ACTIVE'
                ? 'Nonaktifkan Akun Pengguna?'
                : 'Aktifkan Kembali Akun Pengguna?'
            }
            message={
              confirmToggleUser.status === 'ACTIVE'
                ? `Akun @${confirmToggleUser.username} tidak akan dapat melakukan login atau mencatat absensi selama dinonaktifkan.`
                : `Akun @${confirmToggleUser.username} akan dapat kembali login dan mengisi absensi seperti biasa.`
            }
            confirmLabel={
              confirmToggleUser.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'
            }
            isDestructive={confirmToggleUser.status === 'ACTIVE'}
            isLoading={isUpdating}
          />
        )}

        {deleteUser && (
          <ConfirmDialog
            isOpen
            onClose={() => setDeleteUser(null)}
            onConfirm={handleDeleteUser}
            title="Hapus akun pengguna?"
            message={`Akun @${deleteUser.username} beserta seluruh riwayat absensinya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
            confirmLabel="Hapus Akun"
            isDestructive
            isLoading={isUpdating}
          />
        )}

        {resetPasswordUser && (
          <ConfirmDialog
            isOpen
            onClose={() => setResetPasswordUser(null)}
            onConfirm={handleResetPassword}
            title="Buat password baru?"
            message={`Password lama @${resetPasswordUser.username} tidak dapat dilihat. Sistem akan menggantinya dengan password sementara baru yang ditampilkan satu kali.`}
            confirmLabel="Reset Password"
            isLoading={isUpdating}
          />
        )}

        {temporaryPassword && (
          <Modal
            isOpen
            onClose={() => setTemporaryPassword(null)}
            title="Password Sementara"
            description={`Password baru untuk @${temporaryPassword.username}. Salin sebelum menutup jendela ini.`}
            maxWidth="sm"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="break-all font-mono text-sm font-semibold text-slate-800">{temporaryPassword.password}</p>
              </div>
              <p className="text-xs text-slate-500">
                Password lama tidak bisa dipulihkan. Setelah jendela ditutup, password sementara ini tidak akan ditampilkan lagi.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCopyTemporaryPassword} icon={<Copy className="h-4 w-4" />}>
                  Salin Password
                </Button>
                <Button variant="primary" onClick={() => setTemporaryPassword(null)}>
                  Selesai
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </>
  );
}
