import ExcelJS from 'exceljs';
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Operation Managing System - JRR';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Laporan Absensi');
    sheet.columns = [
      { header: 'No', key: 'number', width: 8 },
      { header: 'Tanggal Absen', key: 'date', width: 16 },
      { header: 'Nama Lengkap', key: 'name', width: 24 },
      { header: 'User ID', key: 'userId', width: 12 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Role Absensi', key: 'attendanceRole', width: 18 },
      { header: 'Discord', key: 'discord', width: 22 },
      { header: 'Roblox', key: 'roblox', width: 22 },
      { header: 'Jam Absen', key: 'time', width: 14 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Alasan Izin', key: 'attendanceReason', width: 32 },
    ];

    for (const [index, record] of records.entries()) {
      sheet.addRow({
        number: index + 1,
        date: record.attendance_date,
        name: record.name,
        userId: record.user_id,
        username: record.username,
        attendanceRole: record.attendance_role,
        discord: record.discord_username,
        roblox: record.roblox_username,
        time: record.attendance_time,
        status: record.status,
        attendanceReason: record.attendance_reason,
      });
    }

    sheet.columns.forEach((column, index) => {
      const headerLength = String(column.header || '').length;
      const values = sheet.getColumn(index + 1).values;
      const contentLength = values.reduce<number>((maxLength, value) => {
        return Math.max(maxLength, String(value ?? '').length);
      }, headerLength);
      column.width = Math.min(Math.max(contentLength + 2, 12), 42);
    });

    const header = sheet.getRow(1);
    header.height = 24;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16365F' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(records.length + 1, 1), column: 11 },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `attendance-report-${getJakartaDateString()}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof RangeError) {
      return new NextResponse(error.message, { status: 400 });
    }
    console.error('[Export Excel Error]:', error);
    return new NextResponse('Terjadi kesalahan pada server.', { status: 500 });
  }
}