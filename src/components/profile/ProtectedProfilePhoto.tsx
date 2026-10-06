'use client';

import Image from 'next/image';

interface ProtectedProfilePhotoProps {
  src: string;
  alt: string;
  className: string;
}

export function ProtectedProfilePhoto({ src, alt, className }: ProtectedProfilePhotoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={256}
      height={256}
      unoptimized
      draggable={false}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className={`${className} select-none`}
    />
  );
}
