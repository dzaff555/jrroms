'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  UserCheck,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIndonesianDate, formatIndonesianTime } from '@/lib/utils/date';
import { Attendance } from '@/types';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';

export default function AttendanceHistoryPage() {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const isFetchingRef = React.useRef(false);

  const fetchHistory = React.useCallback(async (showLoading = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoading) setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
      });
      if (search) queryParams.set('search', search);
      if (dateFilter) queryParams.set('date', dateFilter);

      const res = await fetch(`/api/attendance/history?${queryParams.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setRecords(data.data.records || []);
        setTotalPages(data.data.pagination.totalPages || 1);
        setTotalItems(data.data.pagination.totalItems || 0);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      if (showLoading) setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [currentPage, dateFilter, search]);

  useAutoRefresh(() => void fetchHistory(false));

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchHistory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchHistory();
  };

  const handleResetFilters = () => {
    setSearch('');
    setDateFilter('');
    setCurrentPage(1);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dasbor</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Riwayat Absensi Saya
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Daftar rekap kehadiran yang pernah Anda lakukan di sistem.
            </p>
          </div>

          <Link href="/attendance">
            <Button variant="primary" icon={<UserCheck className="w-4 h-4" />}>
              Absen Hari Ini
            </Button>
          </Link>
        </div>

        {/* Filter Card */}
        <Card className="p-4 sm:p-5">
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-col md:flex-row items-center gap-3"
          >
            <div className="w-full md:flex-1">
              <Input
                placeholder="Cari berdasarkan nama, Discord, atau Roblox..."
                leftIcon={<Search className="w-4 h-4" />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="w-full md:w-56">
              <Input
                type="date"
                leftIcon={<Calendar className="w-4 h-4" />}
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button type="submit" variant="primary" size="md" className="flex-1 md:flex-none">
                <Search className="w-4 h-4" />
                <span>Cari</span>
              </Button>
              {(search || dateFilter) && (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handleResetFilters}
                  title="Atur Ulang Filter"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* History Table / Responsive Cards */}
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : records.length === 0 ? (
          <EmptyState
            title="Belum Ada Riwayat Absensi"
            description={
              search || dateFilter
                ? 'Tidak ditemukan data riwayat yang cocok dengan kata kunci atau tanggal yang dipilih.'
                : 'Anda belum pernah mencatat absensi kehadiran sebelumnya.'
            }
            actionLabel={search || dateFilter ? 'Atur Ulang Filter' : 'Absen Sekarang'}
            onAction={
              search || dateFilter
                ? handleResetFilters
                : () => (window.location.href = '/attendance')
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 w-12 text-center">No</th>
                      <th className="py-3.5 px-4">Tanggal</th>
                      <th className="py-3.5 px-4">Nama Lengkap</th>
                      <th className="py-3.5 px-4">Peran</th>
                      <th className="py-3.5 px-4">Discord</th>
                      <th className="py-3.5 px-4">Roblox</th>
                      <th className="py-3.5 px-4">Jam Absen</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r, index) => (
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 text-center text-slate-400 font-medium">
                          {(currentPage - 1) * 10 + index + 1}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                          {formatIndonesianDate(r.attendance_date)}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{r.name}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700">{r.attendance_role}</td>
                        <td className="py-3 px-4 font-mono text-indigo-600">
                          {r.discord_username}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {r.roblox_username}
                        </td>
                        <td className="py-3 px-4 font-semibold text-blue-600 whitespace-nowrap">
                          {formatIndonesianTime(r.attendance_time)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="success" dot>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Responsive Cards List */}
            <div className="grid grid-cols-1 gap-3.5 md:hidden">
              {records.map((r, index) => (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-bold text-slate-400">
                      #{(currentPage - 1) * 10 + index + 1}
                    </span>
                    <Badge variant="success" dot>
                      {r.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Tanggal:</span>
                      <span className="font-bold text-slate-800">
                        {formatIndonesianDate(r.attendance_date)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Jam Absen:</span>
                      <span className="font-bold text-blue-600">
                        {formatIndonesianTime(r.attendance_time)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Nama:</span>
                      <span className="font-semibold text-slate-800">{r.name}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Peran:</span>
                      <span className="font-semibold text-slate-800">{r.attendance_role}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Discord:</span>
                      <span className="font-mono text-indigo-600">{r.discord_username}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Roblox:</span>
                      <span className="font-mono text-slate-800">{r.roblox_username}</span>
                    </div>
                  </div>
                </div>
              ))}
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
    </>
  );
}
