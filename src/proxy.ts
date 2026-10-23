import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwtPayload } from '@/lib/auth/jwt-edge';

const TOKEN_COOKIE_NAME = 'attendance_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const session = token ? decodeJwtPayload(token) : null;

  const isAdminRoute = pathname.startsWith('/admin');
  const isUserRoute =
    pathname.startsWith('/developer') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/attendance') ||
    pathname.startsWith('/complete-profile') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/staff');

  // Route layouts read the current role from the database; JWT role claims can be stale.
  // Middleware only checks authentication so a stale role cannot redirect users in a loop.
  if (isAdminRoute) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (isUserRoute) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
