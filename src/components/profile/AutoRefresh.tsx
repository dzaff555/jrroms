'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 1_000;
export const AUTO_REFRESH_EVENT = 'app:auto-refresh';

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let currentVersion: string | null = null;
    let isChecking = false;

    const checkForChanges = async () => {
      if (document.visibilityState !== 'visible' || isChecking) return;
      isChecking = true;

      try {
        const response = await fetch('/api/updates', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success || typeof result.version !== 'string') {
          throw new Error(result.error || 'Gagal memeriksa perubahan data.');
        }

        if (currentVersion !== null && currentVersion !== result.version) {
          router.refresh();
          window.dispatchEvent(new Event(AUTO_REFRESH_EVENT));
        }
        currentVersion = result.version;
      } catch (error: unknown) {
        console.error('Failed to check for data changes:', error);
      } finally {
        isChecking = false;
      }
    };

    void checkForChanges();
    const intervalId = window.setInterval(() => void checkForChanges(), REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkForChanges);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkForChanges);
    };
  }, [router]);

  return null;
}

export function useAutoRefresh(callback: () => void) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') callbackRef.current();
    };

    window.addEventListener(AUTO_REFRESH_EVENT, refreshWhenVisible);
    return () => window.removeEventListener(AUTO_REFRESH_EVENT, refreshWhenVisible);
  }, []);
}
