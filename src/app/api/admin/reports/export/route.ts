import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/auth';
import {
  getAttendanceReportRecords,
  validateAttendanceReportFilters,
} from '@/lib/admin/attendance-report';
import { getJakartaDateString } from '@/lib/utils/date';

export async function GET(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'ADMIN') {
      return new NextResponse('Silakan masuk terlebih dahulu.', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filters = {
      startDate: searchParams.get('startDate')?.trim() || undefined,
      endDate: searchParams.get('endDate')?.trim() || undefined,
      search: searchParams.get('search')?.trim() || undefined,
      status: searchParams.get('status')?.trim() || 'ALL',
      attendanceRole: searchParams.get('attendanceRole')?.trim() || 'ALL',
    };
    validateAttendanceReportFilters(filters);
    const records = await getAttendanceReportRecords(filters);

    const delimiter = ';';
    const csvHeaders = [
      'No',
      'Tanggal Absen',
      'Nama Lengkap',
      'User ID',
      'Username',
      'Role Absensi',
      'Discord',
      'Roblox',
      'Jam Absen',
      'Status',
    ];

    const escapeCsv = (val: unknown) => {
      if (val === null || val === undefined || val === '') return '""';

      const normalized = String(val)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/"/g, '""');

      return /[;"\n]/.test(normalized) ? `"${normalized}"` : normalized;
    };

    const csvRows = records.map((row, idx) => [
      idx + 1,
      escapeCsv(row.attendance_date),
      escapeCsv(row.name),
      escapeCsv(row.user_id),
      escapeCsv(row.username),
      escapeCsv(row.attendance_role),
      escapeCsv(row.discord_username),
      escapeCsv(row.roblox_username),
      escapeCsv(row.attendance_time),
      escapeCsv(row.status),
    ]);

    const csvString = [
      csvHeaders.join(delimiter),
      ...csvRows.map((row) => row.join(delimiter)),
    ].join('\r\n');

    const todayStr = getJakartaDateString();
    const filename = `attendance-report-${todayStr}.csv`;

    return new NextResponse(csvString, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return new NextResponse(error.message, { status: 400 });
    }
    console.error('[Export CSV Error]:', error);
    return new NextResponse('Terjadi kesalahan pada server.', { status: 500 });
  }
}
