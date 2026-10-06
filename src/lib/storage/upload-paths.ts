import path from 'node:path';

const UPLOAD_DIRECTORY = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR || '/app/uploads');

export function resolveUploadStoragePaths(storageKey: string) {
  const absolutePath = path.resolve(UPLOAD_DIRECTORY, ...storageKey.split('/'));
  if (!absolutePath.startsWith(`${UPLOAD_DIRECTORY}${path.sep}`)) {
    throw new Error('Lokasi file berada di luar penyimpanan upload.');
  }

  return { absolutePath, temporaryPath: `${absolutePath}.part` };
}
