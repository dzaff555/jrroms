import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwtPayload } from '@/lib/auth/jwt-edge';

const TOKEN_COOKIE_NAME = 'attendance_token';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const session = token ? decodeJwtPayload(token) : null;
  const isChatApiRoute = pathname === '/api/chat' || pathname.startsWith('/api/chat/');
  if (isChatApiRoute) {
    return Response.json(
      { success: false, error: 'Fitur chat sedang dinonaktifkan.' },
      { status: 410, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const isChatPage =
    pathname === '/chat' ||
    pathname.startsWith('/chat/') ||
    pathname === '/admin/chat' ||
    pathname.startsWith('/admin/chat/') ||
    pathname === '/developer/chat' ||
    pathname.startsWith('/developer/chat/');
  if (isChatPage) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    const destination = pathname.startsWith('/admin/chat')
      ? '/admin/dashboard'
      : pathname.startsWith('/developer/chat')
        ? '/developer/tasks'
        : '/dashboard';
    return NextResponse.redirect(new URL(destination, request.url));
  }

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
    '/api/chat/:path*',
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
