'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockBlobClient } from '@azure/storage-blob';
import { UploadCloud } from 'lucide-react';
import { useAutoRefresh } from '@/components/profile/AutoRefresh';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  files: TaskFile[];
}

const MAX_FILE_SIZE = 1_000_000_000;

const formatBytes = (value: number | string) => {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function DeveloperTaskUploadPage() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<DeveloperTask[]>([]);
  const [today, setToday] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/developer/tasks', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat tugas.');
      }
      setTasks(result.data.tasks as DeveloperTask[]);
      setToday(result.data.today as string);
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

  const availableTasks = useMemo(
    () => tasks.filter((task) => task.starts_on <= today && task.ends_on >= today),
    [tasks, today]
  );
  const selectedTask = availableTasks.find((task) => String(task.id) === selectedTaskId);

  const submitFiles = async () => {
    if (!selectedTask) {
      toast.error('Pilih tugas', 'Pilih tugas yang sedang berlangsung terlebih dahulu.');
      return;
    }
    const files = Array.from(fileInput.current?.files || []);
    if (selectedTask.file_required && files.length === 0) {
      toast.error('File wajib diunggah', 'Pilih minimal satu file sebelum mengirim tugas ini.');
      return;
    }
    if (files.length === 0) {
      toast.info('Tidak ada file dipilih', 'Tugas ini tidak mewajibkan file. Tidak ada upload yang dilakukan.');
      return;
    }
    const tooLarge = files.find((file) => file.size < 1 || file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      toast.error('Ukuran file tidak valid', `${tooLarge.name}: setiap file harus lebih besar dari 0 dan maksimal 1 GB.`);
      return;
    }

    setIsUploading(true);
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`Mengunggah ${index + 1} dari ${files.length}: ${file.name}`);
        const prepareResponse = await fetch(`/api/developer/tasks/${selectedTask.id}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            byteSize: file.size,
          }),
        });
        const prepared = await prepareResponse.json();
        if (!prepareResponse.ok || !prepared.success) {
          throw new Error(prepared.error || `Gagal menyiapkan upload ${file.name}.`);
        }

        const blob = new BlockBlobClient(prepared.data.uploadUrl as string);
        await blob.uploadBrowserData(file, {
          blobHTTPHeaders: { blobContentType: file.type || 'application/octet-stream' },
        });

        const completeResponse = await fetch(`/api/developer/uploads/${prepared.data.uploadId}/complete`, {
          method: 'POST',
        });
        const completed = await completeResponse.json();
        if (!completeResponse.ok || !completed.success) {
          throw new Error(completed.error || `Gagal memverifikasi upload ${file.name}.`);
        }
      }

      toast.success('Upload selesai', `${files.length} file berhasil dikirim ke tugas "${selectedTask.title}".`);
      if (fileInput.current) fileInput.current.value = '';
      await loadTasks();
    } catch (error: unknown) {
      toast.error('Upload gagal', error instanceof Error ? error.message : 'Terjadi kesalahan saat mengunggah file.');
      await loadTasks();
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Upload Tugas</h1>
        <p className="mt-1 text-sm text-slate-500">Pilih quest yang sedang aktif, lalu kirim satu atau beberapa file.</p>
      </header>

      <Card className="space-y-5 p-5 sm:p-6">
        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Pilih tugas
          <select
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
            disabled={isLoading || isUploading}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal normal-case text-slate-800"
          >
            <option value="">Pilih tugas aktif</option>
            {availableTasks.map((task) => (
              <option key={task.id} value={task.id}>{task.title} · {task.category === 'MODELLING' ? 'Modelling' : 'Scripting'}</option>
            ))}
          </select>
        </label>

        {selectedTask && (
          <div className="rounded-xl bg-slate-50 p-4">
            <h2 className="font-bold text-slate-900">{selectedTask.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{selectedTask.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              Deadline: {selectedTask.ends_on} · {selectedTask.file_required ? 'File wajib' : 'File opsional'} · Maksimal 1 GB per file
            </p>
            {selectedTask.files.length > 0 && (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Sudah terkirim: {selectedTask.files.map((file) => `${file.original_name} (${formatBytes(file.byte_size)})`).join(', ')}
              </p>
            )}
          </div>
        )}

        <Input
          ref={fileInput}
          label="File tugas"
          type="file"
          multiple
          disabled={!selectedTask || isUploading}
          helperText="Format bebas, dapat memilih beberapa file. Maksimal 1 GB untuk setiap file."
        />
        {uploadProgress && <p role="status" className="text-sm font-medium text-blue-700">{uploadProgress}</p>}
        <Button
          type="button"
          onClick={() => void submitFiles()}
          disabled={!selectedTask}
          isLoading={isUploading}
          loadingText="Mengunggah..."
          icon={<UploadCloud className="h-4 w-4" />}
        >
          Kirim File
        </Button>
      </Card>
    </div>
  );
}
