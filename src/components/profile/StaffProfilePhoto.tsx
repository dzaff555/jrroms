'use client';

import React from 'react';
import { ProtectedProfilePhoto } from '@/components/profile/ProtectedProfilePhoto';

interface StaffProfilePhotoProps {
  userId: number;
  username: string;
  photoVersion: string;
  className: string;
}

export function StaffProfilePhoto({ userId, username, photoVersion, className }: StaffProfilePhotoProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [photoUrl, setPhotoUrl] = React.useState('');

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const controller = new AbortController();
    let objectUrl = '';
    let isActive = true;
    const loadPhoto = async () => {
      try {
        const response = await fetch(
          `/api/staff/${userId}/photo?v=${encodeURIComponent(photoVersion)}`,
          {
            signal: controller.signal,
          }
        );
        if (response.status === 404) return;
        if (!response.ok) {
          throw new Error(`Gagal memuat foto profil (${response.status}).`);
        }

        const photo = await response.blob();
        if (isActive) {
          objectUrl = URL.createObjectURL(photo);
          setPhotoUrl(objectUrl);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error(`[Staff Profile Photo Error: ${username}]`, error);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void loadPhoto();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(container);

    return () => {
      isActive = false;
      controller.abort();
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoVersion, userId, username]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {photoUrl ? (
        <ProtectedProfilePhoto
          src={photoUrl}
          alt={`Foto profil ${username}`}
          className="h-full w-full rounded-[inherit] object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-[inherit] bg-blue-600/30 text-xs font-bold text-blue-200">
          {username.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
