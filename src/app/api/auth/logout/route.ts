import { NextResponse } from 'next/server';
import { TOKEN_COOKIE_NAME, getSessionUser } from '@/lib/auth/auth';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Anda berhasil keluar.',
  });

  response.cookies.set({
    name: TOKEN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Anda belum masuk atau sesi telah kedaluwarsa.' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: session,
  });
}
