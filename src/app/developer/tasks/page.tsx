'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';

interface TaskFile {
  id: number;
  original_name: string;
  byte_size: number | string;
  uploaded_at: string;
}

interface DeveloperTask {
  id: number;
  title: string;
  description: string;
  category: 'MODELLING' | 'SCRIPTING';
  file_required: boolean;
  starts_on: string;
  ends_on: string;
  is_completed: boolean;
  files: TaskFile[];
}

const formatBytes = (value: number | string) => {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function DeveloperTasksPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<DeveloperTask[]>([]);
  const [today, setToday] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      const response = await fetch(`/api/developer/tasks?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat daftar tugas.');
      }
      setTasks(result.data.tasks as DeveloperTask[]);
      setToday(result.data.today as string);
    } catch (error: unknown) {
      toast.error('Gagal memuat tugas', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsLoading(false);
    }
  }, [category, search, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTasks(), 200);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);
  useAutoRefresh(() => void loadTasks());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Tugas Developer</h1>
        <p className="mt-1 text-sm text-slate-500">Tugas dari Admin untuk semua Developer.</p>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <Input placeholder="Cari tugas..." leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Jenis tugas
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case text-slate-800">
            <option value="">Semua jenis</option>
            <option value="MODELLING">Pemodelan</option>
            <option value="SCRIPTING">Penulisan Skrip</option>
          </select>
        </label>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-slate-500">Memuat tugas...</Card>
      ) : tasks.length === 0 ? (
        <EmptyState title="Tugas tidak ditemukan" description="Coba ubah kata pencarian atau filter jenis tugas." icon={<ClipboardList className="h-7 w-7" />} />
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const status = task.is_completed || today > task.ends_on
              ? 'Selesai'
              : today < task.starts_on
                ? 'Belum dimulai'
                : 'Sedang berlangsung';
            return (
              <Card key={task.id} className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{task.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{task.category === 'MODELLING' ? 'Pemodelan' : 'Penulisan Skrip'}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'Sedang berlangsung' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status}</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{task.starts_on} – {task.ends_on}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.description}</p>
                <p className="text-xs text-slate-500">
                  {task.file_required ? 'Berkas wajib dikirim' : 'Berkas opsional'} · {task.files.length} berkas Anda sudah dikirim
                </p>
                {task.files.length > 0 && (
                  <ul className="space-y-1 border-t border-slate-100 pt-3">
                    {task.files.map((file) => (
                      <li key={file.id} className="text-xs text-slate-600">{file.original_name} · {formatBytes(file.byte_size)} · {file.uploaded_at}</li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
