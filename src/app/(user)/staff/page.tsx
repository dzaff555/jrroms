import Link from 'next/link';
import { ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { query } from '@/lib/database/db';

interface StaffCard {
  id: number;
  username: string;
  role: 'USER' | 'ADMIN' | 'DEVELOPER';
  attendance_role: string | null;
  profile_photo: string | null;
}

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const requestedPage = Number.parseInt(pageParam || '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 24;
  const offset = (page - 1) * pageSize;

  const [countRows, staff] = await Promise.all([
    query<{ total: number }[]>("SELECT COUNT(*) AS total FROM users WHERE status = 'ACTIVE'"),
    query<StaffCard[]>(
      `SELECT id, username, role, attendance_role, profile_photo
       FROM users WHERE status = 'ACTIVE'
       ORDER BY username ASC LIMIT ? OFFSET ?`,
      [pageSize, offset]
    ),
  ]);
  const totalStaff = countRows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalStaff / pageSize));

  return (
    <>
      <div className="space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Dashboard
        </Link>

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Directory</p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900">List Staff</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4 text-blue-600" />
            {totalStaff} akun aktif
          </div>
        </div>

        {staff.length === 0 ? (
          <div className="border-t border-slate-200 py-10 text-center text-sm text-slate-500">
            Belum ada staff aktif.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {staff.map((member) => (
              <Link
                key={member.id}
                href={`/staff/${member.id}`}
                className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 transition-colors hover:bg-slate-50"
              >
                {member.profile_photo ? (
                  <img
                    src={member.profile_photo}
                    alt={`Foto profil ${member.username}`}
                    className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">
                    {member.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold text-slate-900">{member.username}</span>
                  <span className="mt-0.5 truncate text-xs text-slate-500">
                    {member.role === 'ADMIN'
                      ? 'Administrator'
                      : member.role === 'DEVELOPER'
                        ? 'Developer'
                        : member.attendance_role || 'Role belum ditentukan'}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            {page > 1 && (
              <Link href={`/staff?page=${page - 1}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Sebelumnya
              </Link>
            )}
            <span className="text-xs text-slate-500">Halaman {page} dari {totalPages}</span>
            {page < totalPages && (
              <Link href={`/staff?page=${page + 1}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                Berikutnya
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}