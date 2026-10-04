import path from 'node:path';

export const MAX_TASK_FILE_SIZE = 1_000_000_000;
const UPLOAD_DIRECTORY = path.resolve(process.env.UPLOAD_DIR || '/app/uploads');

export function getTaskFilePaths(storageKey: string) {
  if (!/^tasks\/\d+\/\d+\/[0-9a-f-]{36}$/.test(storageKey)) {
    throw new Error('Lokasi file tugas tidak valid.');
  }

  const absolutePath = path.resolve(UPLOAD_DIRECTORY, ...storageKey.split('/'));
  if (!absolutePath.startsWith(`${UPLOAD_DIRECTORY}${path.sep}`)) {
    throw new Error('Lokasi file tugas berada di luar penyimpanan upload.');
  }

  return { absolutePath, temporaryPath: `${absolutePath}.part` };
}
