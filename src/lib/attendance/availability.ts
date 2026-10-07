import { query } from '@/lib/database/db';
import { getJakartaTimeString } from '@/lib/utils/date';

export type AttendanceMode = 'AUTO' | 'MANUAL';

interface AttendanceSettingsRecord {
  mode: AttendanceMode;
}

export interface AttendanceAvailability {
  mode: AttendanceMode;
  isOpen: boolean;
  message: string;
}

export async function getAttendanceMode(): Promise<AttendanceMode> {
  const settings = await query<AttendanceSettingsRecord[]>(
    'SELECT mode FROM attendance_settings WHERE id = 1'
  );
  const mode = settings[0]?.mode;
  if (mode !== 'AUTO' && mode !== 'MANUAL') {
    throw new Error('Pengaturan mode absensi tidak valid.');
  }
  return mode;
}

export function getAttendanceAvailability(
  mode: AttendanceMode,
  date: Date = new Date()
): AttendanceAvailability {
  if (mode === 'MANUAL') {
    return {
      mode,
      isOpen: true,
      message: 'Absensi dibuka manual dan dapat diisi kapan saja.',
    };
  }

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
  }).format(date);
  const [hour, minute] = getJakartaTimeString(date).split(':').map(Number);
  const minutesSinceMidnight = hour * 60 + minute;
  const isAllowedDay = weekday === 'Fri' || weekday === 'Sat' || weekday === 'Sun';
  const isAllowedTime = minutesSinceMidnight >= 5 * 60 && minutesSinceMidnight < 18 * 60;

  return {
    mode,
    isOpen: isAllowedDay && isAllowedTime,
    message: 'Mode otomatis: absensi dibuka Jumat–Minggu pukul 05.00–18.00 WIB.',
  };
}

export async function getCurrentAttendanceAvailability(
  date: Date = new Date()
): Promise<AttendanceAvailability> {
  const mode = await getAttendanceMode();
  return getAttendanceAvailability(mode, date);
}
