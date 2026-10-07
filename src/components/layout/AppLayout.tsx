'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthSession } from '@/types';
import { usePathname, useSearchParams } from 'next/navigation';
import { useToast } from '../ui/Toast';
import { AutoRefresh } from '@/components/profile/AutoRefresh';
import { ChatNotificationWatcher } from '@/components/chat/ChatNotificationWatcher';

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
  const pathname = usePathname();
  const isChatPage = pathname === '/chat' || pathname === '/admin/chat' || pathname === '/developer/chat';

  return (
    <div className={`${isChatPage ? 'h-dvh overflow-hidden' : 'min-h-screen'} flex flex-col bg-[#F5F8FC] antialiased`}>
      <AutoRefresh />
      <ChatNotificationWatcher user={user} />
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
          isChatPage ? 'min-h-0' : ''
        } ${
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
        <main className={`w-full flex-1 ${
          isChatPage
            ? 'min-h-0 max-w-none overflow-hidden p-0'
            : 'mx-auto max-w-7xl p-4 sm:p-6 lg:p-8'
        } animate-fade-in`}>
          {children}
        </main>
      </div>
    </div>
  );
}
