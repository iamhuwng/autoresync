import React, { useState, useEffect } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';
import { Breadcrumbs } from './Breadcrumbs';
import { HamburgerButton } from './MobileMenu';
import { useNavigationContext } from '../../hooks/useNavigationContext';

interface AdminLayoutProps {
    children: React.ReactNode;
    pageTitle: string;
    currentPage: string;
    onNavigate: (page: string) => void;
    onLogout: () => void;
    userRole?: string;
}

/**
 * AdminLayout - Complete admin page wrapper
 * 
 * Combines:
 * - AdminSidebar (fixed left navigation on desktop, drawer on mobile)
 * - AdminTopBar (page title with hamburger on mobile)
 * - Main content area
 * - Breadcrumbs below top bar
 * 
 * Responsive Behavior:
 * - Desktop (>768px): Fixed sidebar (240px or 64px collapsed)
 * - Mobile (≤768px): Sidebar hidden, accessible via drawer overlay
 * 
 * Layout structure:
 * - Sidebar: Fixed left on desktop, drawer on mobile
 * - Content: Margin-left on desktop, full width on mobile
 * - TopBar: Sticky at top with hamburger button on mobile
 * - Breadcrumbs: Below top bar (condensed on mobile)
 */
export const AdminLayout: React.FC<AdminLayoutProps> = ({
    children,
    pageTitle,
    currentPage,
    onNavigate,
    onLogout,
    userRole,
}) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    // Detect mobile breakpoint (≤768px)
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const sidebarWidth = sidebarCollapsed ? 64 : 240;

    // Get breadcrumb items from navigation context
    const { breadcrumbs } = useNavigationContext();

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
                backgroundAttachment: 'fixed',
            }}
        >
            {/* Desktop: Fixed Sidebar */}
            {!isMobile && (
                <AdminSidebar
                    currentPage={currentPage}
                    onNavigate={onNavigate}
                    onLogout={onLogout}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
            )}

            {/* Mobile: Sidebar in Drawer */}
            {isMobile && (
                <>
                    {mobileDrawerOpen && (
                        <div
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(15, 23, 42, 0.45)',
                                zIndex: 999,
                            }}
                            onClick={() => setMobileDrawerOpen(false)}
                            aria-hidden="true"
                        />
                    )}
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Admin navigation"
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: '240px',
                            maxWidth: '80vw',
                            background: '#ffffff',
                            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
                            zIndex: 1000,
                            transform: mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
                            transition: 'transform 0.25s ease',
                            overflow: 'hidden',
                        }}
                    >
                        <AdminSidebar
                            currentPage={currentPage}
                            onNavigate={(page) => {
                                onNavigate(page);
                                setMobileDrawerOpen(false);
                            }}
                            onLogout={() => {
                                onLogout();
                                setMobileDrawerOpen(false);
                            }}
                            collapsed={false}
                        />
                    </div>
                </>
            )}

            {/* Main Content Area */}
            <div
                style={{
                    marginLeft: isMobile ? 0 : `${sidebarWidth}px`,
                    transition: 'margin-left 0.3s ease',
                    minHeight: '100vh',
                }}
            >
                {/* Top Bar with Mobile Hamburger */}
                <div
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            padding: '1rem 1.5rem',
                        }}
                    >
                        {/* Mobile Hamburger */}
                        {isMobile && (
                            <HamburgerButton
                                onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
                                isOpen={mobileDrawerOpen}
                            />
                        )}

                        {/* Top Bar Content */}
                        <div style={{ flex: 1 }}>
                            <AdminTopBar
                                pageTitle={pageTitle}
                                userRole={userRole}
                            />
                        </div>
                    </div>
                </div>

                {/* Breadcrumbs */}
                <div
                    style={{
                        padding: isMobile ? '0.5rem 1rem 0' : '1rem 2rem 0',
                        background: 'rgba(255, 255, 255, 0.5)',
                        borderBottom: '1px solid rgba(203, 213, 225, 0.2)',
                    }}
                >
                    <Breadcrumbs items={breadcrumbs} condensed={isMobile} />
                </div>

                {/* Main Content */}
                <main
                    style={{
                        padding: isMobile ? '1rem' : '2rem',
                    }}
                >
                    {children}
                </main>
            </div>
        </div>
    );
};
