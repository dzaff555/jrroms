export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Memuat halaman admin">
      <div className="h-8 w-64 rounded-lg bg-slate-200" />
      <div className="h-4 w-96 max-w-full rounded bg-slate-200" />
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="h-10 rounded-xl bg-slate-100" />
      </div>
      <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
