'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Percent,
  Search,
  RefreshCw,
  Eye,
  Calendar,
  Clock,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { StatCardSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttendanceBarChart } from '@/components/charts/AttendanceBarChart';
import { AttendanceDonutChart } from '@/components/charts/AttendanceDonutChart';
import { formatIndonesianDate, formatIndonesianTime } from '@/lib/utils/date';
import { DashboardStats } from '@/types';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [todayDateStr, setTodayDateStr] = useState<string>('');
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // Filter & Search states for today's table
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingTable, setIsLoadingTable] = useState(true);
  const isLoadingStatsRef = React.useRef(false);
  const isLoadingTableRef = React.useRef(false);

  // Fetch Dashboard Statistics
  const loadStats = async (showLoading = true) => {
    if (isLoadingStatsRef.current) return;
    isLoadingStatsRef.current = true;
    if (showLoading) setIsLoadingStats(true);
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch admin stats:', err);
    } finally {
      if (showLoading) setIsLoadingStats(false);
      isLoadingStatsRef.current = false;
    }
  };

  // Fetch Today's Monitoring Table
  const loadAttendanceTable = async (showLoading = true) => {
    if (isLoadingTableRef.current) return;
    isLoadingTableRef.current = true;
    if (showLoading) setIsLoadingTable(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        status: statusFilter,
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/attendance?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setRecords(data.data.records || []);
        setTodayDateStr(data.data.todayDate);
        setTotalPages(data.data.pagination.totalPages || 1);
        setTotalItems(data.data.pagination.totalItems || 0);
      }
    } catch (err) {
      console.error('Failed to fetch admin attendance table:', err);
    } finally {
      if (showLoading) setIsLoadingTable(false);
      isLoadingTableRef.current = false;
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadAttendanceTable();
  }, [currentPage, statusFilter]);

  useAutoRefresh(() => {
    void loadStats(false);
    void loadAttendanceTable(false);
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadAttendanceTable();
  };

  return (
    <>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0F2747] via-[#122B4F] to-[#1E40AF] p-6 sm:p-8 md:p-10 text-white shadow-xl shadow-blue-950/20">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-blue-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Panel Kendali Administrator
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Selamat datang kembali, Admin!
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                Berikut adalah ringkasan aktivitas dan monitoring kehadiran seluruh pengguna hari ini.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/admin/reports">
                <Button
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 shadow-none text-xs"
                  icon={<FileSpreadsheet className="w-4 h-4" />}
                >
                  Laporan Lengkap
                </Button>
              </Link>
              <Button
                variant="primary"
                onClick={() => {
                  loadStats();
                  loadAttendanceTable();
                }}
                className="text-xs"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Segarkan Data
              </Button>
            </div>
          </div>
        </div>

        {/* =======================================================
         * 4 STATISTIC CARDS (PAGE 13)
         * ======================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {isLoadingStats ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              {/* Total User Card */}
              <Card hover className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Total Karyawan
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                    {stats?.totalUsers ?? 0}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">User Terdaftar</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Akun Aktif</span>
                </div>
              </Card>

              {/* Sudah Absen Card */}
              <Card hover className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Sudah Absen
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
                    <UserCheck className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 tracking-tight">
                    {stats?.attendedToday ?? 0}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Hari Ini</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Hadir tercatat</span>
                </div>
              </Card>

              {/* Belum Absen Card */}
              <Card hover className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Belum Absen
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-xs">
                    <UserX className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-rose-600 tracking-tight">
                    {stats?.notAttendedToday ?? 0}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Hari Ini</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Belum mengisi kehadiran</span>
                </div>
              </Card>

              {/* Persentase Kehadiran Card */}
              <Card hover className="p-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Persentase
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
                    <Percent className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-blue-600 tracking-tight">
                    {stats?.attendanceRate ?? 0}%
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Rasio Kehadiran</span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>Target harian 100%</span>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* =======================================================
         * CHARTS VISUALIZATION SECTION (PAGE 28)
         * ======================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 7-Days Attendance Bar Chart */}
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Tren Kehadiran Jumat–Minggu</CardTitle>
                <CardDescription>
                  Grafik total karyawan yang hadir per hari kerja (Asia/Jakarta)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <AttendanceBarChart data={stats?.recentDaysTrend || []} />
              )}
            </CardContent>
          </Card>

          {/* Status Donut Chart */}
          <Card className="overflow-hidden flex flex-col">
            <CardHeader>
              <div>
                <CardTitle>Distribusi Status</CardTitle>
                <CardDescription>
                  Perbandingan kehadiran hari ini
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center">
              {isLoadingStats ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <AttendanceDonutChart
                  attended={stats?.statusDistribution.attended || 0}
                  absent={stats?.statusDistribution.absent || 0}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* =======================================================
         * TODAY'S MONITORING TABLE (PAGE 14)
         * ======================================================= */}
        <div className="space-y-4" id="monitoring">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Monitoring Absensi Hari Ini
              </h2>
              <p className="text-xs text-slate-500">
                {todayDateStr ? formatIndonesianDate(todayDateStr) : 'Hari ini'} • Daftar kehadiran seluruh user
              </p>
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => {
                  setStatusFilter('HADIR');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'HADIR'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-emerald-700'
                }`}
              >
                Hadir
              </button>
              <button
                onClick={() => {
                  setStatusFilter('BELUM_ABSEN');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'BELUM_ABSEN'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-500 hover:text-rose-700'
                }`}
              >
                Belum Absen
              </button>
            </div>
          </div>

          {/* Search bar */}
          <Card className="p-4">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <Input
                placeholder="Cari user berdasarkan nama, username, Discord, atau Roblox..."
                leftIcon={<Search className="w-4 h-4" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" variant="primary">
                Cari
              </Button>
            </form>
          </Card>

          {/* Table */}
          {isLoadingTable ? (
            <TableSkeleton rows={5} cols={8} />
          ) : records.length === 0 ? (
            <EmptyState
              title="Tidak ada data ditemukan"
              description="Tidak ada karyawan yang cocok dengan kriteria filter saat ini."
            />
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4 w-12 text-center">No</th>
                        <th className="py-3.5 px-4">Nama</th>
                        <th className="py-3.5 px-4">Username</th>
                        <th className="py-3.5 px-4">Discord</th>
                        <th className="py-3.5 px-4">Roblox</th>
                        <th className="py-3.5 px-4">Jam Absen</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {records.map((r, index) => {
                        const isAttended = r.status === 'Hadir';
                        return (
                          <tr key={r.user_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4 text-center text-slate-400 font-medium">
                              {(currentPage - 1) * 10 + index + 1}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-800">
                              {r.name}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              @{r.username}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-indigo-600">
                              {r.discord_username}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-700">
                              {r.roblox_username}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {isAttended ? (
                                <span className="font-semibold text-blue-600">
                                  {formatIndonesianTime(r.attendance_time)}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <Badge variant={isAttended ? 'success' : 'danger'} dot>
                                {r.status}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedRecord(r)}
                                icon={<Eye className="w-3.5 h-3.5" />}
                              >
                                Lihat Detail
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={10}
                onPageChange={(p) => setCurrentPage(p)}
              />
            </div>
          )}
        </div>

        {/* =======================================================
         * DETAIL MODAL (PAGE 14)
         * ======================================================= */}
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title="Detail Kehadiran Karyawan"
          description="Informasi absensi hari ini yang tercatat di database."
          maxWidth="md"
        >
          {selectedRecord && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center">
                    {selectedRecord.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{selectedRecord.name}</h4>
                    <p className="text-xs text-slate-500">ID User: #{selectedRecord.user_id}</p>
                  </div>
                </div>
                <Badge variant={selectedRecord.status === 'Hadir' ? 'success' : 'danger'} dot>
                  {selectedRecord.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Username</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    @{selectedRecord.username}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Username Discord</span>
                  <span className="font-mono font-semibold text-indigo-600 mt-0.5 block">
                    {selectedRecord.discord_username}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Username Roblox</span>
                  <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                    {selectedRecord.roblox_username}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Tanggal Absen</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {formatIndonesianDate(selectedRecord.attendance_date)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-medium">Jam Absen</span>
                  <span className="font-semibold text-blue-600 mt-0.5 block">
                    {selectedRecord.status === 'Hadir'
                      ? formatIndonesianTime(selectedRecord.attendance_time)
                      : 'Belum Melakukan Absen'}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="secondary" onClick={() => setSelectedRecord(null)}>
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
