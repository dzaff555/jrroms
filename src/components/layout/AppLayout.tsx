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
    <div className="min-h-screen bg-[#F5F8FC] flex flex-col antialiased">
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
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          showSidebar ? (collapsed ? 'lg:pl-20' : 'lg:pl-64') : ''
        }`}
      >
        {/* Header */}
        <Header
          user={user}
          onMenuClick={() => setMobileOpen(true)}
          collapsed={collapsed}
          showMenuButton={showSidebar}
          showUserMenu={showUserMenu}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
