'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 1_000;
export const AUTO_REFRESH_EVENT = 'app:auto-refresh';

export function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let currentVersion: string | null = null;
    let currentRole: 'USER' | 'ADMIN' | 'DEVELOPER' | null = null;
    let isChecking = false;

    const refreshSession = async () => {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menyegarkan sesi.');
      }

      const role = result.data.role;
      if (role !== 'USER' && role !== 'ADMIN' && role !== 'DEVELOPER') {
        throw new Error('Role akun yang diterima tidak valid.');
      }
      const roleChanged =
        result.roleChanged === true || (currentRole !== null && currentRole !== role);
      currentRole = role;
      const targetPath = role === 'ADMIN'
        ? '/admin/dashboard'
        : role === 'DEVELOPER'
          ? '/developer/tasks'
          : '/dashboard';
      const isAdminRoute = pathname.startsWith('/admin');
      const isDeveloperRoute = pathname.startsWith('/developer');
      const isDashboardRoute = pathname === '/dashboard';
      const routeRoleMismatch = isAdminRoute
        ? role !== 'ADMIN'
        : isDeveloperRoute
          ? role !== 'DEVELOPER'
          : isDashboardRoute
            ? role !== 'USER'
            : role === 'ADMIN';

      if (roleChanged || routeRoleMismatch) {
        router.replace(targetPath);
        return true;
      }

      return false;
    };

    const checkForChanges = async () => {
      if (document.visibilityState !== 'visible' || isChecking) return;
      isChecking = true;

      try {
        const response = await fetch('/api/updates', { cache: 'no-store' });
        const result = await response.json();
        if (
          !response.ok ||
          !result.success ||
          typeof result.version !== 'string' ||
          (result.role !== 'USER' && result.role !== 'ADMIN' && result.role !== 'DEVELOPER')
        ) {
          throw new Error(result.error || 'Gagal memeriksa perubahan data.');
        }

        const isAdminRoute = pathname.startsWith('/admin');
        const isDeveloperRoute = pathname.startsWith('/developer');
        const isDashboardRoute = pathname === '/dashboard';
        const routeRoleMismatch = isAdminRoute
          ? result.role !== 'ADMIN'
          : isDeveloperRoute
            ? result.role !== 'DEVELOPER'
            : isDashboardRoute
              ? result.role !== 'USER'
              : result.role === 'ADMIN';
        const dataChanged = currentVersion !== null && currentVersion !== result.version;

        if (routeRoleMismatch || dataChanged) {
          const redirected = await refreshSession();
          if (!redirected && dataChanged) {
            router.refresh();
            window.dispatchEvent(new Event(AUTO_REFRESH_EVENT));
          }
        }
        currentVersion = result.version;
      } catch (error: unknown) {
        console.error('Failed to check for data changes:', error);
      } finally {
        isChecking = false;
      }
    };

    void refreshSession().catch((error: unknown) => {
      console.error('Failed to refresh login session:', error);
    });
    void checkForChanges();
    const intervalId = window.setInterval(() => void checkForChanges(), REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkForChanges);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkForChanges);
    };
  }, [pathname, router]);

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
