import React, { ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import { AdminHeader } from './AdminHeader';

/**
 * @deprecated This component is deprecated as of 2026-02-02.
 * Use `AdminLayout` from `src/components/navigation/AdminLayout.tsx` instead.
 * 
 * AdminLayout provides a superior admin experience with:
 * - Fixed sidebar navigation (more intuitive than top-bar back button)
 * - Automatic breadcrumb integration via useNavigationContext
 * - Consistent layout and navigation across all admin pages
 * - Better scalability for adding new admin pages
 * - Mobile-responsive design (future Phase 5)
 * 
 * Migration example:
 * ```tsx
 * // OLD:
 * <AdminPageLayout title="Admin Console" onBack={handleBack} onLogout={handleLogout}>
 *   <YourContent />
 * </AdminPageLayout>
 * 
 * // NEW:
 * <AdminLayout
 *   pageTitle="User Management"
 *   currentPage="users"
 *   onNavigate={handleSidebarNavigate}
 *   onLogout={handleLogout}
 *   userRole={profile?.role}
 * >
 *   <YourContent />
 * </AdminLayout>
 * ```
 * 
 * See `AdminUserManagementPage.jsx` for complete migration example.
 */
export interface AdminPageLayoutProps {
  title: string;
  onBack: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  title,
  onBack,
  onLogout,
  children,
}) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <AppShell header={{ height: 70 }} padding="md">
        <AdminHeader
          title={title}
          onBack={onBack}
          onLogout={onLogout}
        />

        <AppShell.Main>
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes slideDown {
              from { opacity: 0; transform: translateY(-20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes staggeredFadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .staggered-item {
              animation: staggeredFadeIn 0.4s ease-out forwards;
              opacity: 0;
            }
            .staggered-item:nth-child(1) { animation-delay: 0.05s; }
            .staggered-item:nth-child(2) { animation-delay: 0.1s; }
            .staggered-item:nth-child(3) { animation-delay: 0.15s; }
            .staggered-item:nth-child(4) { animation-delay: 0.2s; }
            .staggered-item:nth-child(5) { animation-delay: 0.25s; }
          `}</style>

          {children}
        </AppShell.Main>
      </AppShell>
    </div>
  );
};
