'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Download, Plus, ClipboardList, Pencil, Save, Trash2, X } from 'lucide-react';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';

interface TaskFile {
  id: number;
  developer_username: string;
  original_name: string;
  content_type: string;
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
  created_at: string;
  created_by_username: string;
  files: TaskFile[];
}

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatBytes = (value: number | string) => {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function AdminTasksPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<DeveloperTask[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'MODELLING' | 'SCRIPTING'>('MODELLING');
  const [fileRequired, setFileRequired] = useState(false);
  const [startsOn, setStartsOn] = useState(localDate);
  const [endsOn, setEndsOn] = useState(localDate);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<DeveloperTask | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/tasks', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat daftar tugas.');
      }
      setTasks(result.data as DeveloperTask[]);
    } catch (error: unknown) {
      toast.error('Gagal memuat tugas', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTasks(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks]);
  useAutoRefresh(() => void loadTasks());

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, fileRequired, startsOn, endsOn }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal membuat tugas.');
      }
      toast.success('Tugas dibuat', 'Tugas baru tersedia untuk semua Developer.');
      setTitle('');
      setDescription('');
      setCategory('MODELLING');
      setFileRequired(false);
      setStartsOn(localDate());
      setEndsOn(localDate());
      await loadTasks();
    } catch (error: unknown) {
      toast.error('Gagal membuat tugas', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTask) return;

    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/admin/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingTask.title,
          description: editingTask.description,
          category: editingTask.category,
          fileRequired: editingTask.file_required,
          startsOn: editingTask.starts_on,
          endsOn: editingTask.ends_on,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memperbarui tugas.');
      }
      toast.success('Tugas diperbarui', 'Perubahan tugas berhasil disimpan.');
      setEditingTask(null);
      await loadTasks();
    } catch (error: unknown) {
      toast.error('Gagal memperbarui tugas', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteTask = async (task: DeveloperTask) => {
    const confirmed = window.confirm(
      `Hapus tugas "${task.title}"? Semua kiriman Developer untuk tugas ini juga akan dihapus permanen.`
    );
    if (!confirmed) return;

    setDeletingTaskId(task.id);
    try {
      const response = await fetch(`/api/admin/tasks/${task.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menghapus tugas.');
      }
      toast.success('Tugas dihapus', result.cleanupWarning
        ? 'Tugas dan kiriman terhapus, tetapi sebagian berkas perlu dibersihkan dari penyimpanan.'
        : result.message || 'Tugas dan kiriman terkait berhasil dihapus.');
      if (editingTask?.id === task.id) setEditingTask(null);
      await loadTasks();
    } catch (error: unknown) {
      toast.error('Gagal menghapus tugas', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const downloadFile = async (fileId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/admin/tasks/files/${fileId}`, { cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || `Gagal mengunduh berkas (${response.status}).`);
      }

      const file = await response.blob();
      if (file.size === 0) {
        throw new Error('Berkas yang diunduh kosong.');
      }
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success('Unduhan dimulai', `${fileName} sedang diunduh.`);
    } catch (error: unknown) {
      toast.error('Unduhan gagal', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Tugas Developer</h1>
        <p className="mt-1 text-sm text-slate-500">Buat tugas dan pantau berkas yang dikirim Developer.</p>
      </header>

      <Card className="p-5 sm:p-6">
        <form onSubmit={createTask} className="space-y-4">
          <h2 className="text-base font-bold text-slate-800">Buat Tugas Baru</h2>
          <Input label="Judul tugas" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required />
          <div className="space-y-1.5">
            <label htmlFor="task-description" className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
              Isi tugas
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={10000}
              required
              rows={5}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Jenis tugas
              <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case text-slate-800">
                <option value="MODELLING">Pemodelan</option>
                <option value="SCRIPTING">Penulisan Skrip</option>
              </select>
            </label>
            <Input label="Tanggal mulai" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
            <Input label="Tanggal akhir" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} min={startsOn} required />
            <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={fileRequired} onChange={(event) => setFileRequired(event.target.checked)} className="h-4 w-4 accent-blue-600" />
              <span>Wajib mengunggah berkas</span>
            </label>
          </div>
          <p className="text-xs text-slate-500">Berkas dapat berformat apa saja, maksimal 1 GB per berkas. Tugas ini akan terlihat oleh semua Developer.</p>
          <Button type="submit" isLoading={isSaving} loadingText="Menyimpan..." icon={<Plus className="h-4 w-4" />}>
            Buat Tugas
          </Button>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Tugas dan Kiriman Developer</h2>
        {isLoading ? (
          <Card className="p-6 text-sm text-slate-500">Memuat tugas...</Card>
        ) : tasks.length === 0 ? (
          <EmptyState title="Belum ada tugas" description="Tugas yang dibuat akan muncul di sini dan di halaman Developer." icon={<ClipboardList className="h-7 w-7" />} />
        ) : (
          tasks.map((task) => (
            <Card key={task.id} className="overflow-hidden">
              <div className="space-y-3 p-5 sm:p-6">
                {editingTask?.id === task.id ? (
                  <form onSubmit={saveTask} className="space-y-4">
                    <Input
                      label="Judul tugas"
                      value={editingTask.title}
                      onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })}
                      maxLength={180}
                      required
                    />
                    <div className="space-y-1.5">
                      <label htmlFor={`task-description-${task.id}`} className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Isi tugas
                      </label>
                      <textarea
                        id={`task-description-${task.id}`}
                        value={editingTask.description}
                        onChange={(event) => setEditingTask({ ...editingTask, description: event.target.value })}
                        maxLength={10000}
                        required
                        rows={4}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Jenis tugas
                        <select
                          value={editingTask.category}
                          onChange={(event) => setEditingTask({ ...editingTask, category: event.target.value as DeveloperTask['category'] })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case text-slate-800"
                        >
                          <option value="MODELLING">Pemodelan</option>
                          <option value="SCRIPTING">Penulisan Skrip</option>
                        </select>
                      </label>
                      <Input
                        label="Tanggal mulai"
                        type="date"
                        value={editingTask.starts_on}
                        onChange={(event) => setEditingTask({ ...editingTask, starts_on: event.target.value })}
                        required
                      />
                      <Input
                        label="Tanggal akhir"
                        type="date"
                        value={editingTask.ends_on}
                        onChange={(event) => setEditingTask({ ...editingTask, ends_on: event.target.value })}
                        min={editingTask.starts_on}
                        required
                      />
                      <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={editingTask.file_required}
                          onChange={(event) => setEditingTask({ ...editingTask, file_required: event.target.checked })}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <span>Wajib mengunggah berkas</span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" isLoading={isSavingEdit} loadingText="Menyimpan..." icon={<Save className="h-4 w-4" />}>
                        Simpan Perubahan
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setEditingTask(null)} icon={<X className="h-4 w-4" />}>
                        Batal
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">{task.title}</h3>
                        <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {task.category === 'MODELLING' ? 'Pemodelan' : 'Penulisan Skrip'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{task.starts_on} – {task.ends_on}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          icon={<Pencil className="h-4 w-4" />}
                          onClick={() => setEditingTask({ ...task })}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          icon={<Trash2 className="h-4 w-4" />}
                          isLoading={deletingTaskId === task.id}
                          loadingText="Menghapus..."
                          onClick={() => void deleteTask(task)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
                    <p className="text-xs font-medium text-slate-500">
                      {task.file_required ? 'Berkas wajib diunggah' : 'Berkas opsional'} · {task.files.length} berkas terkirim
                    </p>
                  </>
                )}
              </div>
              {task.files.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                  <ul className="space-y-2">
                    {task.files.map((file) => (
                      <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{file.original_name}</p>
                          <p className="text-xs text-slate-500">{file.developer_username} · {formatBytes(file.byte_size)} · {file.uploaded_at}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void downloadFile(file.id, file.original_name)}>
                          Unduh
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
