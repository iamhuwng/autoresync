import React, { useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { S } from './studentLayoutStyles';

export interface StudentLayoutProps {
    children: React.ReactNode;
    sidebar: React.ReactNode;
    rightPanel?: React.ReactNode;
    mobileTitle: string;
    mobileRightAction?: React.ReactNode;
}

export const StudentLayout: React.FC<StudentLayoutProps> = ({
    children,
    sidebar,
    rightPanel,
    mobileTitle,
    mobileRightAction,
}) => {
    const [showMobileLeft, setShowMobileLeft] = useState(false);
    const [showMobileRight, setShowMobileRight] = useState(false);

    const isMobile = useMediaQuery('(max-width: 768px)');
    const isTablet = useMediaQuery('(max-width: 1024px)');

    const toggleLeft = () => {
        setShowMobileLeft(!showMobileLeft);
        setShowMobileRight(false);
    };

    const toggleRight = () => {
        if (mobileRightAction) {
            setShowMobileRight(!showMobileRight);
            setShowMobileLeft(false);
        }
    };

    const closeAll = () => {
        setShowMobileLeft(false);
        setShowMobileRight(false);
    };

    return (
        <div className="student-view-root" style={S.root}>
            {/* Centralized Head additions */}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            <style>{`
        * { box-sizing: border-box; }
        body { 
          background: #f3f4f6 !important; 
          background-image: none !important;
          margin: 0;
          padding: 0;
        }
        @keyframes dashFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>

            {/* Mobile + Tablet Header */}
            {(isMobile || isTablet) && (
                <div style={S.mobileHeader}>
                    <button style={S.mobileBtn} onClick={toggleLeft} aria-label="Open navigation">
                        ☰
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111827' }}>
                        {mobileTitle}
                    </span>
                    {mobileRightAction ? (
                        <div onClick={toggleRight}>{mobileRightAction}</div>
                    ) : (
                        <div style={{ width: 40 }} /> /* Spacer for centering */
                    )}
                </div>
            )}

            {/* Mobile + Tablet Backdrops */}
            {(isMobile || isTablet) && (showMobileLeft || showMobileRight) && (
                <div style={S.backdrop} onClick={closeAll} />
            )}

            {/* Main 3-Column Container */}
            <div style={{
                ...S.container,
                ...(isMobile ? { flexDirection: 'column' } : {}),
            }}>

                {/* ── LEFT SIDEBAR ── */}
                <header style={{
                    ...S.sidebar,
                    ...((isMobile || isTablet) ? {
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: 280,
                        height: '100vh',
                        background: 'white',
                        zIndex: 1000,
                        padding: 24,
                        transform: showMobileLeft ? 'translateX(0)' : 'translateX(-100%)',
                        transition: 'transform 0.3s ease-in-out',
                        boxShadow: showMobileLeft ? '4px 0 20px rgba(0,0,0,0.1)' : 'none',
                    } : {}),
                }}>
                    {sidebar}
                </header>

                {/* ── CENTER FEED ── */}
                <main style={{
                    ...S.feed,
                    ...((isMobile || isTablet) ? { marginTop: 56, borderLeft: 'none', borderRight: 'none', maxWidth: '100%' } : {}),
                }}>
                    {children}
                </main>

                {/* ── RIGHT PANEL ── */}
                {rightPanel && (
                    <aside style={{
                        ...S.rightPanel,
                        ...(isMobile ? {
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            width: 320,
                            height: '100vh',
                            background: 'white',
                            zIndex: 1000,
                            padding: 24,
                            overflowY: 'auto',
                            transform: showMobileRight ? 'translateX(0)' : 'translateX(100%)',
                            transition: 'transform 0.3s ease-in-out',
                            boxShadow: showMobileRight ? '-4px 0 20px rgba(0,0,0,0.1)' : 'none',
                        } : {}),
                        ...(isTablet && !isMobile ? { display: 'none' } : {}), // Hidden on tablet
                    }}>
                        {rightPanel}
                    </aside>
                )}
            </div>
        </div>
    );
};
