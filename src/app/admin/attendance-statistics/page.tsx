'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Search, UserX } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { getJakartaDateString, formatIndonesianDate } from '@/lib/utils/date';
import { ATTENDANCE_ROLES } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface AttendanceStatisticsRecord {
  id: number;
  username: string;
  attendance_role: string;
  profile_photo: string | null;
  attended_days: number;
  permission_days: number;
  absent_days: number;
}

export default function AdminAttendanceStatisticsPage() {
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceStatisticsRecord[]>([]);
  const [startDate, setStartDate] = useState(() => getJakartaDateString());
  const [endDate, setEndDate] = useState(() => getJakartaDateString());
  const [search, setSearch] = useState('');
  const [attendanceRole, setAttendanceRole] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const isFetchingRef = React.useRef(false);

  const fetchStatistics = useCallback(async (showLoading = true) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showLoading) setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        page: currentPage.toString(),
      });
      if (search) params.set('search', search);
      if (attendanceRole !== 'ALL') params.set('attendanceRole', attendanceRole);

      const response = await fetch(`/api/admin/attendance-statistics?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat statistik absensi.');
      }

      setRecords(data.data.records as AttendanceStatisticsRecord[]);
      setTotalPages(data.data.pagination.totalPages || 1);
      setTotalItems(data.data.pagination.totalItems || 0);
    } catch (error: unknown) {
      console.error('Failed to fetch attendance statistics:', error);
      if (showLoading) {
        toast.error(
          'Gagal memuat',
          error instanceof Error ? error.message : 'Gagal memuat statistik absensi.'
        );
        setRecords([]);
      }
    } finally {
      if (showLoading) setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [attendanceRole, currentPage, endDate, search, startDate, toast]);

  useAutoRefresh(() => void fetchStatistics(false));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchStatistics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchStatistics, requestVersion]);

  const handleFilterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setCurrentPage(1);
    setRequestVersion((version) => version + 1);
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Statistik Absensi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Kehadiran dihitung saat dicatat. Ketidakhadiran hanya dihitung untuk periode absensi
            Jumat–Minggu setelah ditutup pukul 18.00 WIB, terhitung sejak akun dibuat.
          </p>
        </div>

        <Card className="p-5">
          <form onSubmit={handleFilterSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                type="date"
                label="Tanggal mulai"
                leftIcon={<Calendar className="h-4 w-4" />}
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
              <Input
                type="date"
                label="Tanggal akhir"
                leftIcon={<Calendar className="h-4 w-4" />}
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setCurrentPage(1);
                }}
              />
              <Input
                label="Cari akun"
                placeholder="Nama pengguna atau peran absensi"
                leftIcon={<Search className="h-4 w-4" />}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
              />
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Peran absensi
                </label>
                <select
                  value={attendanceRole}
                  onChange={(event) => {
                    setAttendanceRole(event.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">Semua peran</option>
                  {ATTENDANCE_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button type="submit" variant="primary" size="sm">
                Terapkan filter
              </Button>
            </div>
          </form>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : records.length === 0 ? (
          <EmptyState
            title="Akun tidak ditemukan"
            description="Tidak ada akun aktif yang cocok dengan tanggal dan filter yang dipilih."
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Akun</th>
                      <th className="px-4 py-3.5">Peran absensi</th>
                      <th className="px-4 py-3.5 text-center">Hadir</th>
                      <th className="px-4 py-3.5 text-center">Izin</th>
                      <th className="px-4 py-3.5 text-center">Tidak hadir (periode ditutup)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            {record.profile_photo ? (
                              <ProtectedProfilePhoto
                                src={record.profile_photo}
                                alt={`Foto profil ${record.username}`}
                                className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                                {record.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-semibold text-slate-800">{record.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="primary">{record.attendance_role}</Badge>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            {record.attended_days}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                            {record.permission_days}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                            <UserX className="h-4 w-4" />
                            {record.absent_days}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={15}
              onPageChange={setCurrentPage}
            />
            <p className="text-xs text-slate-500">
              Periode: {formatIndonesianDate(startDate)} – {formatIndonesianDate(endDate)}.
              Hanya periode Jumat–Minggu yang ditutup pukul 18.00 WIB yang dihitung sebagai ketidakhadiran.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
