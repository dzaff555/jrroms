'use client';

import { memo, useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { formatIndonesianDate, getJakartaTimeString } from '@/lib/utils/date';

function HeaderClockComponent() {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(`${getJakartaTimeString(now)} WIB`);
      setCurrentDate(formatIndonesianDate(now));
    };
    updateTime();
    const timer = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs font-medium text-slate-600">
      <div className="flex items-center gap-1.5 text-slate-500">
        <Calendar className="w-3.5 h-3.5 text-blue-600" />
        <span>{currentDate || 'Memuat tanggal...'}</span>
      </div>
      <span className="text-slate-300">|</span>
      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
        <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
        <span>{currentTime || '00:00:00 WIB'}</span>
      </div>
    </div>
  );
}

export const HeaderClock = memo(HeaderClockComponent);
