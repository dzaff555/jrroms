'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 30_000;
export const AUTO_REFRESH_EVENT = 'app:auto-refresh';

type UserRole = 'USER' | 'ADMIN' | 'DEVELOPER';

function getRoleDestination(role: UserRole) {
  return role === 'ADMIN' ? '/admin/dashboard' : role === 'DEVELOPER' ? '/developer/tasks' : '/dashboard';
}

function isRoleRouteMismatch(role: UserRole, pathname: string) {
  const isAdminRoute = pathname.startsWith('/admin');
  const isDeveloperRoute = pathname.startsWith('/developer');
  const isDashboardRoute = pathname === '/dashboard';
  return isAdminRoute
    ? role !== 'ADMIN'
    : isDeveloperRoute
      ? role !== 'DEVELOPER'
      : isDashboardRoute
        ? role !== 'USER'
        : role === 'ADMIN';
}

export function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let currentVersion: string | null = null;
    let isChecking = false;

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

        const currentPath = pathnameRef.current;
        const routeRoleMismatch = isRoleRouteMismatch(result.role, currentPath);
        const dataChanged = currentVersion !== null && currentVersion !== result.version;

        if (routeRoleMismatch) {
          router.replace(getRoleDestination(result.role));
        } else if (dataChanged) {
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

    const intervalId = window.setInterval(() => void checkForChanges(), REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForChanges();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
