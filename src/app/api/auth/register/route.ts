import { NextResponse } from 'next/server';
import { query, testConnection } from '@/lib/database/db';
import { hashPassword } from '@/lib/auth/auth';
import { User } from '@/types';

export async function POST(_request: Request) {
  return NextResponse.json(
    {
      success: false,
      error: 'Pendaftaran akun telah ditutup. Hubungi administrator untuk membuat akun baru.',
    },
    { status: 403 }
  );
}
