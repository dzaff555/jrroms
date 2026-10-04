export type UserRole = 'USER' | 'ADMIN' | 'DEVELOPER';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export const ATTENDANCE_ROLES = ['CSOT', 'PPKA', 'MASINIS', 'PKD', 'PJL'] as const;
export type AttendanceRole = (typeof ATTENDANCE_ROLES)[number];

export interface User {
  id: number;
  username: string;
  email: string | null;
  password?: string;
  role: UserRole;
  status: UserStatus;
  attendance_role?: AttendanceRole;
  profile_photo?: string | null;
  roblox_username?: string | null;
  discord_username?: string | null;
  profile_completed?: boolean;
  created_at: string;
  updated_at: string;
  last_attendance?: string | null;
}

export interface Attendance {
  id: number;
  user_id: number;
  name: string;
  attendance_role: AttendanceRole;
  discord_username: string;
  roblox_username: string;
  attendance_date: string; // YYYY-MM-DD
  attendance_time: string; // HH:mm:ss
  status: string; // 'Hadir'
  created_at: string;
  username?: string;
  email?: string;
}

export interface DashboardStats {
  totalUsers: number;
  attendedToday: number;
  notAttendedToday: number;
  attendanceRate: number; // percentage e.g. 92.5
  recentDaysTrend: {
    day: string; // e.g. "Senin", "Selasa"
    date: string; // YYYY-MM-DD
    count: number;
  }[];
  statusDistribution: {
    attended: number;
    absent: number;
  };
}

export interface AuthSession {
  id: number;
  username: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  attendance_role?: AttendanceRole;
  profile_photo?: string | null;
  roblox_username?: string | null;
  discord_username?: string | null;
  profile_completed?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}
