import { getJakartaDateString, getJakartaTimeString } from '@/lib/utils/date';

export function getLastCompletedAttendanceDate(date: Date = new Date()): string {
  const today = getJakartaDateString(date);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
  }).format(date);
  const [hour] = getJakartaTimeString(date).split(':').map(Number);
  const attendanceDay = weekday === 'Fri' || weekday === 'Sat' || weekday === 'Sun';

  if (!attendanceDay || hour >= 18) return today;

  const previousDate = new Date(`${today}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

export function countWeekendDaysSince(
  joinedAt: string,
  throughDate: string,
  fromDate: string = joinedAt.slice(0, 10)
): number {
  const joinedDate = joinedAt.slice(0, 10);
  const startDate = fromDate > joinedDate ? fromDate : joinedDate;
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const lastDay = new Date(`${throughDate}T00:00:00.000Z`);
  const joinedTime = joinedAt.slice(11, 19);

  let count = 0;

  while (current <= lastDay) {
    const weekday = current.getUTCDay();
    const date = current.toISOString().slice(0, 10);
    const isAttendanceDay = weekday === 0 || weekday === 5 || weekday === 6;
    const accountCreatedAfterWindow = date === joinedDate && joinedTime >= '18:00:00';

    if (isAttendanceDay && !accountCreatedAfterWindow) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

export function getDateAfter(date: string): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}
