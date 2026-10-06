'use client';

import React, { useState } from 'react';
import Cropper from 'react-easy-crop';
import { Camera, Check, UserCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProfilePhotoFieldProps {
  photo: string;
  onChange: (photo: string) => void | Promise<void>;
  error?: string;
}

function cropImage(imageSource: string, area: CropArea): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(area.width);
      canvas.height = Math.round(area.height);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Tidak dapat memproses foto.'));
        return;
      }

      context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    image.onerror = () => reject(new Error('Foto tidak dapat dibuka.'));
    image.src = imageSource;
  });
}

export function ProfilePhotoField({ photo, onChange, error }: ProfilePhotoFieldProps) {
  const [cropSource, setCropSource] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [cropError, setCropError] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setCropError('Ukuran foto maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(String(reader.result || ''));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
      setCropError('');
    };
    reader.onerror = () => setCropError('Foto tidak dapat dibaca.');
    reader.readAsDataURL(file);
  };

  const handleApply = async () => {
    if (!cropSource || !croppedArea) return;
    setIsApplying(true);
    setCropError('');
    try {
      await onChange(await cropImage(cropSource, croppedArea));
      setCropSource('');
    } catch (cropFailure: unknown) {
      setCropError(cropFailure instanceof Error ? cropFailure.message : 'Foto tidak dapat diproses.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        {photo ? (
          <ProtectedProfilePhoto
            src={photo}
            alt="Pratinjau foto profil"
            className="h-40 w-40 rounded-full border-4 border-white object-cover shadow-lg shadow-slate-200"
          />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-full bg-slate-200 text-slate-500 shadow-inner">
            <UserCircle2 className="h-16 w-16" />
          </div>
        )}

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-300">
          <Camera className="h-4 w-4 text-blue-600" />
          {photo ? 'Ganti Foto' : 'Unggah Foto'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
        <p className="mt-2 text-[11px] text-slate-500">Foto opsional · pemotongan 1:1 · maks. 2 MB</p>
        {(error || cropError) && <p className="mt-2 text-xs font-medium text-rose-600">{error || cropError}</p>}
      </div>

      <Modal
        isOpen={Boolean(cropSource)}
        onClose={() => setCropSource('')}
        title="Atur Foto Profil"
        description="Geser dan perbesar foto. Area potong selalu persegi 1:1."
        maxWidth="lg"
        animation="none"
        scrollable
        portal
      >
        <div className="space-y-4">
          <div
            className="relative mx-auto aspect-square w-[min(100%,420px,55dvh)] overflow-hidden rounded-xl bg-slate-950"
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
          >
            {cropSource && (
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedArea(areaPixels)}
                showGrid
                restrictPosition
              />
            )}
          </div>
          <label className="block space-y-2 text-xs font-semibold text-slate-700">
            Perbesar
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-blue-600"
            />
          </label>
          {cropError && <p className="text-xs font-medium text-rose-600">{cropError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCropSource('')} icon={<X className="h-4 w-4" />}>
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleApply}
              isLoading={isApplying}
              loadingText="Memproses..."
              disabled={!croppedArea}
              icon={<Check className="h-4 w-4" />}
            >
              Gunakan Foto
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}