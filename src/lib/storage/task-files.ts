import { resolveUploadStoragePaths } from '@/lib/storage/upload-paths';

export const MAX_TASK_FILE_SIZE = 1_000_000_000;

export function getTaskFilePaths(storageKey: string) {
  if (!/^tasks\/\d+\/\d+\/[0-9a-f-]{36}$/.test(storageKey)) {
    throw new Error('Lokasi file tugas tidak valid.');
  }

  return resolveUploadStoragePaths(storageKey);
}
