/**
 * StudentHeader Component
 * 
 * Unified header component for all student pages combining:
 * - Left section: Back button + Page Title
 * - Center section: StudentNavigation (navigation buttons) - desktop only
 * - Right section: NotificationBell + Logout (desktop) / Hamburger menu (mobile)
 * - Bottom section: Breadcrumbs (displayed below header)
 * 
 * Responsive Behavior:
 * - Desktop (>768px): Full navigation bar with buttons
 * - Mobile (≤768px): Hamburger menu with slide-in drawer
 * 
 * This component provides consistent navigation across all student pages.
 * 
 * Usage:
 * <StudentHeader
 *   pageTitle="My Library"
 *   userId={currentUser.id}
 *   onLogout={handleLogout}
 * />
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../modern';
import { StudentNavigation } from './StudentNavigation';
import { Breadcrumbs } from './Breadcrumbs';
import { MobileMenu, HamburgerButton } from './MobileMenu';
import { useNavigationContext } from '../../hooks/useNavigationContext';
import { ROUTES } from '../../constants/routes';
import { useDocumentTitle } from '../../core/platform';

export interface StudentHeaderProps {
    /** Page title to display */
    pageTitle: string;
    /** Current user ID for notifications */
    userId?: string;
    /** Callback when logout is clicked */
    onLogout: () => void;
    /** Hide back button even if not on root (optional override) */
    hideBackButton?: boolean;
    /** Hide navigation buttons (useful for specific pages like tests/quizzes) */
    hideNavigation?: boolean;
    /** Hide breadcrumbs (optional override) */
    hideBreadcrumbs?: boolean;
    /** Custom background color (default: white with glass effect) */
    backgroundColor?: string;
}

/**
 * StudentHeader Component
 * 
 * @example
 * <StudentHeader
 *   pageTitle="Practice Library"
 *   userId={currentUser.id}
 *   onLogout={handleLogout}
 * />
 */
export const StudentHeader: React.FC<StudentHeaderProps> = ({
    pageTitle,
    userId,
    onLogout,
    hideBackButton = false,
    hideNavigation = false,
    hideBreadcrumbs = false,
    backgroundColor = 'rgba(255, 255, 255, 0.95)',
}) => {
    const navigate = useNavigate();
    const { isRoot, navigateToParent, breadcrumbs } = useNavigationContext();
    useDocumentTitle(pageTitle);

    // Mobile state
    const [isMobile, setIsMobile] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Detect mobile breakpoint (≤768px)
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Show back button if not on root and not hidden
    const showBackButton = !isRoot && !hideBackButton;

    // Convert breadcrumbs from navigation context to breadcrumb component format
    const breadcrumbItems = breadcrumbs.map((item, index) => ({
        label: item.label,
        path: index < breadcrumbs.length - 1 ? item.path : undefined,
        isActive: index === breadcrumbs.length - 1,
    }));

    const handleNavigate = (route: string, _reason: string) => {
        navigate(route);
        setMobileMenuOpen(false);
    };

    // Mobile menu items for students
    const mobileMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: '🏠', onClick: () => handleNavigate(ROUTES.STUDENT_DASHBOARD, 'nav_to_dashboard'), isActive: false },
        { id: 'library', label: 'Library', icon: '📚', onClick: () => handleNavigate(ROUTES.STUDENT_LIBRARY, 'nav_to_library'), isActive: false },
        { id: 'homework', label: 'Homework', icon: '📋', onClick: () => handleNavigate(ROUTES.STUDENT_HOMEWORK, 'nav_to_homework'), isActive: false },
        { id: 'courses', label: 'Courses', icon: '📖', onClick: () => handleNavigate(ROUTES.STUDENT_COURSES, 'nav_to_courses'), isActive: false },
        { id: 'results', label: 'Results', icon: '📊', onClick: () => handleNavigate(ROUTES.STUDENT_RESULTS_HISTORY, 'nav_to_results'), isActive: false },
    ];

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                background: backgroundColor,
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            }}
        >
            {/* Main Header Bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    gap: '1.5rem',
                }}
            >
                {/* Left Section: Back Button + Page Title */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        minWidth: '0', // Allow flex shrinking
                    }}
                >
                    {showBackButton && (
                        <Button
                            variant="glass"
                            onClick={navigateToParent}
                            style={{
                                padding: '0.5rem 1rem',
                                fontSize: '0.875rem',
                                flexShrink: 0,
                            }}
                        >
                            ← Back
                        </Button>
                    )}

                    <h1
                        style={{
                            margin: 0,
                            fontSize: isMobile ? '1.25rem' : '1.5rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {pageTitle}
                    </h1>
                </div>

                {/* Desktop: Full Navigation */}
                {!hideNavigation && !isMobile && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            flex: 1,
                            justifyContent: 'flex-end',
                        }}
                    >
                        <StudentNavigation
                            userId={userId}
                            onNavigate={handleNavigate}
                            onLogout={onLogout}
                        />
                    </div>
                )}

                {/* Mobile: Hamburger Menu */}
                {!hideNavigation && isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <HamburgerButton
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            isOpen={mobileMenuOpen}
                        />
                    </div>
                )}
            </div>

            {/* Breadcrumbs Section */}
            {!hideBreadcrumbs && breadcrumbItems.length > 1 && (
                <Breadcrumbs
                    items={breadcrumbItems}
                    condensed={isMobile}
                />
            )}

            {/* Mobile Menu Drawer */}
            {isMobile && (
                <MobileMenu
                    isOpen={mobileMenuOpen}
                    onClose={() => setMobileMenuOpen(false)}
                    items={mobileMenuItems}
                    onLogout={onLogout}
                    userRole="student"
                />
            )}
        </div>
    );
};

export default StudentHeader;
