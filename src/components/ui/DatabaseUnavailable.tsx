export function DatabaseUnavailable() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <section
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center"
        role="alert"
      >
        <h1 className="text-lg font-bold text-amber-950">Layanan database sedang sibuk</h1>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Dashboard belum bisa dimuat karena database mencapai batas koneksi. Tunggu sebentar,
          lalu coba muat ulang. Jika masalah berlanjut, periksa koneksi aktif dan batas koneksi
          database di Aiven.
        </p>
        <a
          className="mt-5 inline-flex rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          href="/admin/dashboard"
        >
          Coba lagi
        </a>
      </section>
    </main>
  );
}
