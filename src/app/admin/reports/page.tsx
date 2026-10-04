'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Search, Calendar, Download, FileSpreadsheet, RefreshCw, Filter } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIndonesianDate, formatIndonesianTime } from '@/lib/utils/date';
import { ATTENDANCE_ROLES } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

type AttendanceReportRecord = {
  id: number | string;
  user_id: number;
  name: string;
  attendance_role: string;
  discord_username: string | null;
  roblox_username: string | null;
  attendance_date: string;
  attendance_time: string;
  status: string;
  username: string;
  profile_photo?: string | null;
};

export default function AdminReportsPage() {
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceReportRecord[]>([]);

  // Filter criteria
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Hadir');
  const [attendanceRole, setAttendanceRole] = useState('ALL');

  // Pagination & Loading
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const isFetchingRef = React.useRef(false);

  const fetchReports = useCallback(async (showLoading = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoading) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '15',
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      if (status !== 'ALL') params.set('status', status);
      if (attendanceRole !== 'ALL') params.set('attendanceRole', attendanceRole);

      const res = await fetch(`/api/admin/reports?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (res.ok && data.success) {
        setRecords((data.data.records as AttendanceReportRecord[]) || []);
        setTotalPages(data.data.pagination.totalPages || 1);
        setTotalItems(data.data.pagination.totalItems || 0);
      } else {
        throw new Error(data.error || 'Gagal memuat laporan absensi.');
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      if (showLoading) {
        toast.error(
          'Gagal',
          error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat laporan.'
        );
        setRecords([]);
      }
    } finally {
      if (showLoading) setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [attendanceRole, currentPage, endDate, search, startDate, status, toast]);

  useAutoRefresh(() => void fetchReports(false));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchReports();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchReports]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchReports();
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSearch('');
    setStatus('Hadir');
    setAttendanceRole('ALL');
    setCurrentPage(1);
    setTimeout(() => {
      fetchReports();
    }, 50);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search) params.set('search', search);
      if (status !== 'ALL') params.set('status', status);
      if (attendanceRole !== 'ALL') params.set('attendanceRole', attendanceRole);

      const downloadUrl = `/api/admin/reports/export?${params.toString()}`;
      // Trigger download
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.setAttribute('download', '');
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      toast.success('Export Dimulai', 'File CSV laporan absensi sedang diunduh.');
    } catch {
      toast.error('Gagal Export', 'Tidak dapat menghasilkan file laporan.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    if (status !== 'ALL') params.set('status', status);
    if (attendanceRole !== 'ALL') params.set('attendanceRole', attendanceRole);

    const anchor = document.createElement('a');
    anchor.href = `/api/admin/reports/export/excel?${params.toString()}`;
    anchor.setAttribute('download', '');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    toast.success('Export Dimulai', 'File Excel dengan kolom rapi sedang diunduh.');
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Laporan Rekapitulasi Absensi
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Filter dan ekspor seluruh catatan riwayat absensi pengguna ke format file CSV.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExportCsv}
              isLoading={isExporting}
              loadingText="Mengekspor..."
              icon={<Download className="w-4 h-4" />}
            >
              Export CSV
            </Button>
            <Button
              variant="primary"
              onClick={handleExportExcel}
              icon={<FileSpreadsheet className="w-4 h-4" />}
              className="shadow-sm shadow-blue-600/20"
            >
              Excel (.xlsx)
            </Button>
          </div>
        </div>

        {/* Filter Controls Card */}
        <Card className="p-5">
          <form onSubmit={handleFilterSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Start Date */}
              <Input
                type="date"
                label="Tanggal Mulai"
                leftIcon={<Calendar className="w-4 h-4" />}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />

              {/* End Date */}
              <Input
                type="date"
                label="Tanggal Akhir"
                leftIcon={<Calendar className="w-4 h-4" />}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />

              {/* Keyword Search */}
              <Input
                label="Pencarian"
                placeholder="Nama, username, Discord, role..."
                leftIcon={<Search className="w-4 h-4" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-xl text-sm border border-slate-200 bg-white px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                >
                  <option value="Hadir">Hadir</option>
                  <option value="Belum Absen">Belum Absen</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Role Absensi
                </label>
                <select
                  value={attendanceRole}
                  onChange={(e) => setAttendanceRole(e.target.value)}
                  className="w-full rounded-xl text-sm border border-slate-200 bg-white px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 cursor-pointer"
                >
                  <option value="ALL">Semua Role</option>
                  {ATTENDANCE_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Reset
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                icon={<Filter className="w-3.5 h-3.5" />}
              >
                Tampilkan
              </Button>
            </div>
          </form>
        </Card>

        {/* Reports Table */}
        {isLoading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : records.length === 0 ? (
          <EmptyState
            title="Tidak Ada Laporan Ditemukan"
            description={status === 'Belum Absen'
              ? 'Tidak ditemukan akun aktif yang melewatkan jendela absensi Jumat–Minggu yang sudah ditutup pukul 18.00 WIB pada periode tersebut.'
              : 'Tidak ada catatan absensi yang sesuai dengan rentang tanggal atau kriteria filter yang Anda tentukan.'}
            actionLabel="Reset Filter"
            onAction={handleResetFilters}
          />
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-12 text-center">No</th>
                      <th className="py-3.5 px-4">Tanggal</th>
                      <th className="py-3.5 px-4">Nama Lengkap</th>
                      <th className="py-3.5 px-4">ID</th>
                      <th className="py-3.5 px-4">Role Absensi</th>
                      <th className="py-3.5 px-4">Discord</th>
                      <th className="py-3.5 px-4">Roblox</th>
                      <th className="py-3.5 px-4">Jam Absen</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r, index) => (
                      <tr key={`${r.id}-${r.attendance_date}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center text-slate-400 font-medium">
                          {(currentPage - 1) * 15 + index + 1}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {formatIndonesianDate(r.attendance_date)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            {r.profile_photo ? (
                              <img
                                src={r.profile_photo}
                                alt={`Foto profil ${r.name}`}
                                className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                                {r.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-bold text-slate-800">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">
                          #{r.user_id}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {r.attendance_role}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-indigo-600">
                          {r.discord_username || '-'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {r.roblox_username || '-'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-blue-600">
                          {r.attendance_time === '-' ? '-' : formatIndonesianTime(r.attendance_time)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge variant={r.status === 'Belum Absen' ? 'danger' : 'success'} dot>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={15}
              onPageChange={(p) => setCurrentPage(p)}
            />
          </div>
        )}
      </div>
    </>
  );
}
