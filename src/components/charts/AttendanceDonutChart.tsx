'use client';

import React from 'react';

export interface AttendanceDonutChartProps {
  attended: number;
  permission: number;
  absent: number;
}

export function AttendanceDonutChart({ attended, permission, absent }: AttendanceDonutChartProps) {
  const total = attended + permission + absent;
  const attendedPct = total > 0 ? Math.round((attended / total) * 100) : 0;
  const permissionPct = total > 0 ? Math.round((permission / total) * 100) : 0;
  const absentPct = Math.max(0, 100 - attendedPct - permissionPct);

  // SVG circle calculations
  const size = 160;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const attendedLength = (attendedPct / 100) * circumference;
  const permissionLength = (permissionPct / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-2">
      {/* Donut Chart SVG */}
      <div className="relative flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle (Absent) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {/* Absent segment if partial */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#F43F5E"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={0}
            className="opacity-75 transition-all duration-700 ease-out"
          />
          {/* Attended segment */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#2563EB"
            strokeWidth={strokeWidth}
            strokeDasharray={`${attendedLength} ${circumference - attendedLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
          {/* Permission segment */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#F59E0B"
            strokeWidth={strokeWidth}
            strokeDasharray={`${permissionLength} ${circumference - permissionLength}`}
            strokeDashoffset={-attendedLength}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-slate-800 tracking-tight">
            {attendedPct}%
          </span>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Kehadiran
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center justify-center gap-6 w-full text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-600 shadow-xs" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-700">Hadir</span>
            <span className="text-[11px] text-slate-500">{attended} ({attendedPct}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 shadow-xs" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-700">Izin</span>
            <span className="text-[11px] text-slate-500">{permission} ({permissionPct}%)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500 shadow-xs" />
          <div className="flex flex-col">
            <span className="font-semibold text-slate-700">Belum Absen</span>
            <span className="text-[11px] text-slate-500">{absent} ({absentPct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
