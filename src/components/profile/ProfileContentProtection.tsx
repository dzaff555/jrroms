'use client';

import type { ReactNode } from 'react';

export function ProfileContentProtection({ children }: { children: ReactNode }) {
  return (
    <div
      className="select-none"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
