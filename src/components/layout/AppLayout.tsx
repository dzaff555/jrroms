'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthSession } from '@/types';
import { useSearchParams } from 'next/navigation';
import { useToast } from '../ui/Toast';
import { AutoRefresh } from '@/components/profile/AutoRefresh';

export interface AppLayoutProps {
  children: React.ReactNode;
  user: AuthSession | null;
  showSidebar?: boolean;
  showUserMenu?: boolean;
}

function AccessDeniedAlert() {
  const searchParams = useSearchParams();
  const toast = useToast();

  useEffect(() => {
    if (searchParams.get('error') === 'access_denied') {
      toast.error(
        'Akses Ditolak',
        'Anda tidak memiliki izin administrator untuk mengakses halaman tersebut.'
      );
    }
  }, [searchParams, toast]);

  return null;
}

export function AppLayout({ children, user, showSidebar = true, showUserMenu = true }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F8FC] antialiased">
      <AutoRefresh />
      <Suspense fallback={null}>
        <AccessDeniedAlert />
      </Suspense>

      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          user={user}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
      )}

      {/* Main Content Area */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ease-in-out ${
          showSidebar ? (collapsed ? 'lg:pl-20' : 'lg:pl-64') : ''
        }`}
      >
        {/* Header */}
        <Header
          user={user}
          onMenuClick={() => setMobileOpen(true)}
          showMenuButton={showSidebar}
          showUserMenu={showUserMenu}
        />

        {/* Dynamic Page Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 animate-fade-in sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
