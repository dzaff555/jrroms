import { query } from '@/lib/database/db';
import { isAttendanceRole } from '@/types';
import { getJakartaDateString } from '@/lib/utils/date';
import { getLastCompletedAttendanceDate } from '@/lib/attendance/stats';

export interface AttendanceReportFilters {
  startDate?: string;
  endDate?: string;
  search?: string;
  status?: string;
  attendanceRole?: string;
}

export interface AttendanceReportRecord {
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
  profile_photo: string | null;
}

interface AttendanceReportQuery {
  withSql: string;
  fromSql: string;
  whereSql: string;
  params: unknown[];
  empty: boolean;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function resolveAttendanceDateRange(
  startValue?: string,
  endValue?: string
): { startDate: string; endDate: string } {
  const requestedStart = startValue?.trim();
  const requestedEnd = endValue?.trim();
  const fallback = getJakartaDateString();
  const startDate = requestedStart || requestedEnd || fallback;
  const endDate = requestedEnd || requestedStart || fallback;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new RangeError('Format tanggal tidak valid.');
  }
  if (startDate > endDate) {
    throw new RangeError('Tanggal mulai tidak boleh setelah tanggal akhir.');
  }

  return { startDate, endDate };
}

function getDateRange(filters: AttendanceReportFilters, defaultToday: boolean) {
  const requestedStart = filters.startDate?.trim();
  const requestedEnd = filters.endDate?.trim();
  if (!requestedStart && !requestedEnd && !defaultToday) return null;
  return resolveAttendanceDateRange(requestedStart, requestedEnd);
}

const digitRows = Array.from({ length: 10 }, (_, digit) => `SELECT ${digit} AS digit`).join(
  ' UNION ALL '
);

function buildAttendanceReportQuery(filters: AttendanceReportFilters): AttendanceReportQuery {
  const status = filters.status?.trim() || 'ALL';
  const attendanceRole = filters.attendanceRole?.trim() || 'ALL';
  const search = filters.search?.trim();
  const isAbsent = status === 'Belum Absen';
  const dateRange = getDateRange(filters, isAbsent);
  const whereConditions: string[] = [];
  const params: unknown[] = [];
  const withSql = '';
  let fromSql: string;
  let empty = false;

  if (!['ALL', 'Hadir', 'Belum Absen'].includes(status)) {
    throw new RangeError('Filter status tidak valid.');
  }
  if (attendanceRole !== 'ALL' && !isAttendanceRole(attendanceRole)) {
    throw new RangeError('Filter role absensi tidak valid.');
  }

  if (isAbsent) {
    const { startDate, endDate } = resolveAttendanceDateRange(
      filters.startDate,
      filters.endDate
    );
    const lastCompletedDate = getLastCompletedAttendanceDate();
    const effectiveEndDate = endDate < lastCompletedDate ? endDate : lastCompletedDate;
    empty = startDate > effectiveEndDate;
    if (empty) {
      return { withSql: '', fromSql: '', whereSql: '', params: [], empty };
    }
    const dayCount =
      (Date.parse(`${effectiveEndDate}T00:00:00.000Z`) -
        Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000 +
      1;
    if (dayCount > 900) {
      throw new RangeError('Rentang laporan Belum Absen maksimal 900 hari.');
    }

    params.push(startDate, effectiveEndDate, startDate);
    fromSql = `
      FROM (
        SELECT DATE_ADD(
          CAST(? AS DATE),
          INTERVAL (ones.digit + tens.digit * 10 + hundreds.digit * 100) DAY
        ) AS report_date
        FROM (${digitRows}) ones
        CROSS JOIN (${digitRows}) tens
        CROSS JOIN (${digitRows}) hundreds
        WHERE ones.digit + tens.digit * 10 + hundreds.digit * 100
          <= DATEDIFF(CAST(? AS DATE), CAST(? AS DATE))
      ) d
      JOIN users u ON u.role = 'USER' AND u.status = 'ACTIVE'
      LEFT JOIN attendance a ON a.user_id = u.id AND a.attendance_date = d.report_date
    `;
    whereConditions.push(
      'a.id IS NULL',
      'DAYOFWEEK(d.report_date) IN (1, 6, 7)',
      '(DATE(u.created_at) < d.report_date OR (DATE(u.created_at) = d.report_date AND TIME(u.created_at) < \'18:00:00\'))'
    );
  } else {
    fromSql = `
      FROM attendance a
      JOIN users u ON a.user_id = u.id
    `;
    if (dateRange) {
      whereConditions.push('a.attendance_date >= ?', 'a.attendance_date <= ?');
      params.push(dateRange.startDate, dateRange.endDate);
    }
    if (status !== 'ALL') {
      whereConditions.push('a.status = ?');
      params.push(status);
    }
  }

  if (attendanceRole !== 'ALL') {
    whereConditions.push(`${isAbsent ? 'u' : 'a'}.attendance_role = ?`);
    params.push(attendanceRole);
  }

  if (search) {
    const term = `%${search}%`;
    if (isAbsent) {
      whereConditions.push(
        '(u.username LIKE ? OR u.attendance_role LIKE ? OR u.discord_username LIKE ? OR u.roblox_username LIKE ?)'
      );
      params.push(term, term, term, term);
    } else {
      whereConditions.push(
        '(a.name LIKE ? OR a.attendance_role LIKE ? OR a.discord_username LIKE ? OR a.roblox_username LIKE ? OR u.username LIKE ?)'
      );
      params.push(term, term, term, term, term);
    }
  }

  return {
    withSql,
    fromSql,
    whereSql: whereConditions.join(' AND '),
    params,
    empty,
  };
}

function getReportSelect(isAbsent: boolean): string {
  if (isAbsent) {
    return `
      SELECT
        CONCAT('absent-', u.id, '-', DATE_FORMAT(d.report_date, '%Y-%m-%d')) AS id,
        u.id AS user_id,
        u.username AS name,
        u.attendance_role,
        u.discord_username,
        u.roblox_username,
        DATE_FORMAT(d.report_date, '%Y-%m-%d') AS attendance_date,
        '-' AS attendance_time,
        'Belum Absen' AS status,
        u.username,
        u.profile_photo
    `;
  }

  return `
    SELECT
      a.id,
      a.user_id,
      a.name,
      a.attendance_role,
      a.discord_username,
      a.roblox_username,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.attendance_time,
      a.status,
      u.username,
      u.profile_photo
  `;
}

export function validateAttendanceReportFilters(filters: AttendanceReportFilters): void {
  buildAttendanceReportQuery(filters);
}

export async function countAttendanceReportRecords(
  filters: AttendanceReportFilters
): Promise<number> {
  const prepared = buildAttendanceReportQuery(filters);
  if (prepared.empty) return 0;

  const result = await query<{ total: number }[]>(
    `${prepared.withSql}
     SELECT COUNT(*) AS total
     ${prepared.fromSql}
     WHERE ${prepared.whereSql}`,
    prepared.params
  );
  return Number(result[0]?.total || 0);
}

export async function getAttendanceReportRecords(
  filters: AttendanceReportFilters,
  pagination?: { limit: number; offset: number }
): Promise<AttendanceReportRecord[]> {
  const prepared = buildAttendanceReportQuery(filters);
  if (prepared.empty) return [];

  const isAbsent = filters.status?.trim() === 'Belum Absen';
  const orderBy = isAbsent
    ? 'ORDER BY d.report_date DESC, u.username ASC'
    : 'ORDER BY a.attendance_date DESC, a.attendance_time DESC';
  const paginationSql = pagination ? 'LIMIT ? OFFSET ?' : '';
  const params = pagination
    ? [...prepared.params, pagination.limit, pagination.offset]
    : prepared.params;

  return query<AttendanceReportRecord[]>(
    `${prepared.withSql}
     ${getReportSelect(isAbsent)}
     ${prepared.fromSql}
     WHERE ${prepared.whereSql}
     ${orderBy}
     ${paginationSql}`,
    params
  );
}
