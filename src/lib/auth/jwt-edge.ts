import { AuthSession } from '@/types';

/**
 * Lightweight JWT decoder for Next.js Proxy.
 */
export function decodeJwtPayload(token: string): AuthSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    // Check expiration
    if (parsed.exp && Date.now() >= parsed.exp * 1000) {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}
