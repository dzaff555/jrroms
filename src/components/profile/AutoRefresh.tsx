'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 1_000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };

    const intervalId = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [router]);

  return null;
}
