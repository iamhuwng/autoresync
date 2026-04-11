import React, { useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ConnectedStudentRightRail, StudentRightRail, type StudentRightRailShellData } from './StudentRightRail';
import { S } from './studentLayoutStyles';
import { useDocumentTitle } from '../../core/platform';

export interface StudentLayoutProps {
    children: React.ReactNode;
    sidebar: React.ReactNode;
    rightPanel?: React.ReactNode;
    shellData?: StudentRightRailShellData;
    mobileTitle: string;
    mobileRightAction?: React.ReactNode;
    rightRailVariant?: 'default' | 'academic-record' | 'dashboard';
}

export const StudentLayout: React.FC<StudentLayoutProps> = ({
    children,
    sidebar,
    rightPanel,
    shellData,
    mobileTitle,
    mobileRightAction,
    rightRailVariant = 'default',
}) => {
    const [showMobileLeft, setShowMobileLeft] = useState(false);
    const [showMobileRight, setShowMobileRight] = useState(false);
    useDocumentTitle(mobileTitle);

    const isMobile = useMediaQuery('(max-width: 768px)');
    const isTablet = useMediaQuery('(max-width: 1024px)');

    const defaultMobileLeftAction = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="16" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
    );

    const defaultMobileRightAction = (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="20" y2="12" />
            <line x1="12" y1="18" x2="20" y2="18" />
        </svg>
    );

    const toggleLeft = () => {
        setShowMobileLeft((current) => !current);
        setShowMobileRight(false);
    };

    const toggleRight = () => {
        setShowMobileRight((current) => !current);
        setShowMobileLeft(false);
    };

    const closeAll = () => {
        setShowMobileLeft(false);
        setShowMobileRight(false);
    };

    return (
        <div
            className="student-view-root"
            style={{
                ...S.root,
                ...((isMobile || isTablet) ? { overflowX: 'hidden' } : {}),
            }}
        >
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            <style>{`
        * { box-sizing: border-box; }
        body {
          background: #f8f9fa !important;
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
        .student-mobile-scrollbar-hidden::-webkit-scrollbar { display: none; }
        .student-mobile-scrollbar-hidden { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

            {(isMobile || isTablet) && (
                <div style={S.mobileHeader}>
                    <button type="button" style={S.mobileBtn} onClick={toggleLeft} aria-label="Open navigation">
                        {defaultMobileLeftAction}
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#2b3437', letterSpacing: '-0.02em' }}>
                        {mobileTitle}
                    </span>
                    <button type="button" style={S.mobileBtn} onClick={toggleRight} aria-label="Open right rail">
                        {mobileRightAction || defaultMobileRightAction}
                    </button>
                </div>
            )}

            {(isMobile || isTablet) && (showMobileLeft || showMobileRight) && (
                <div style={S.backdrop} onClick={closeAll} />
            )}

            <div
                data-testid="student-layout-container"
                style={{
                    ...S.container,
                    ...((isMobile || isTablet)
                        ? {
                            display: 'block',
                            padding: 0,
                        }
                        : {}),
                }}
            >
                <aside
                    style={{
                        ...S.sidebar,
                        ...((isMobile || isTablet)
                            ? {
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                width: 280,
                                height: '100vh',
                                background: '#f1f4f6',
                                zIndex: 1000,
                                padding: 24,
                                transform: showMobileLeft ? 'translateX(0)' : 'translateX(-100%)',
                                transition: 'transform 0.3s ease-in-out',
                                boxShadow: showMobileLeft ? '12px 0 32px rgba(43, 52, 55, 0.12)' : 'none',
                                pointerEvents: showMobileLeft ? 'auto' : 'none',
                            }
                            : {}),
                    }}
                >
                    {sidebar}
                </aside>

                <div
                    style={{
                        ...((isMobile || isTablet)
                            ? {}
                            : S.bodyFrame),
                    }}
                >
                    <main
                        style={{
                            ...S.feed,
                            ...(!isMobile && !isTablet && rightRailVariant === 'dashboard'
                                ? {
                                    padding: '0 48px 48px',
                                }
                                : {}),
                            ...((isMobile || isTablet)
                                ? {
                                    marginTop: 56,
                                    maxWidth: '100%',
                                    width: '100%',
                                    boxShadow: 'none',
                                    padding: '16px 12px 24px',
                                }
                                : {}),
                        }}
                    >
                        {children}
                    </main>

                    <aside
                        data-testid="student-layout-right-rail"
                        style={{
                            ...S.rightPanel,
                            ...(!isMobile && !isTablet && rightRailVariant === 'dashboard'
                                ? {
                                    width: 320,
                                    minWidth: 320,
                                    flex: '0 0 320px',
                                }
                                : {}),
                            ...((isMobile || isTablet)
                                ? {
                                    position: 'fixed',
                                    top: 0,
                                    right: 0,
                                    width: 'min(320px, 85vw)',
                                    minWidth: 0,
                                    maxWidth: '85vw',
                                    height: '100vh',
                                    background: '#f1f4f6',
                                    zIndex: 1000,
                                    padding: 24,
                                    overflowY: 'auto',
                                    transform: showMobileRight ? 'translateX(0)' : 'translateX(100%)',
                                    transition: 'transform 0.3s ease-in-out',
                                    boxShadow: showMobileRight ? '-12px 0 32px rgba(43, 52, 55, 0.12)' : 'none',
                                    pointerEvents: showMobileRight ? 'auto' : 'none',
                                }
                                : {}),
                        }}
                    >
                        {shellData ? (
                            <StudentRightRail shellData={shellData} supplementalContent={rightPanel} variant={rightRailVariant} />
                        ) : (
                            <ConnectedStudentRightRail supplementalContent={rightPanel} variant={rightRailVariant} />
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
};
