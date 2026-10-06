import { BookOpenText, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react';

const rules = [
  'Web dilarang untuk disebarkan.',
  'Akun harus digunakan sesuai dengan nomor NIP.',
  'Dilarang menyebarkan akun milik diri sendiri ke orang lain.',
  'Jaga privasi di web ini karena bersifat rahasia.',
  'Web ini dikhususkan hanya untuk staf Ittoem Studio.',
];

export function InformationAndRules() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-3xl bg-gradient-to-r from-[#0F2747] via-[#153D70] to-[#2563EB] p-6 text-white shadow-xl shadow-blue-900/10 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <BookOpenText className="h-6 w-6 text-blue-200" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Panduan Pengguna</p>
            <h1 className="text-2xl font-extrabold tracking-tight">Informasi dan Peraturan</h1>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BookOpenText className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Tentang Web Ini</h2>
        </div>
        <p className="text-sm leading-7 text-slate-600">
          Web ini merupakan sistem internal untuk mendukung kegiatan staf Ittoem Studio. Sistem ini digunakan untuk mencatat dan melihat absensi serta menyediakan
          sarana komunikasi antar pengguna melalui fitur chat.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Sistem Absensi</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Mencatat kehadiran harian dan melihat riwayat absensi.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Komunikasi</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Berkomunikasi dengan staf dan administrator melalui fitur chat.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Peraturan Penggunaan</h2>
            <p className="mt-0.5 text-xs text-slate-500">Harap dipatuhi oleh seluruh pengguna web.</p>
          </div>
        </div>
        <ol className="space-y-3">
          {rules.map((rule, index) => (
            <li key={rule} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-[#1c2128]">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                {index + 1}
              </span>
              <span className="pt-0.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{rule}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
