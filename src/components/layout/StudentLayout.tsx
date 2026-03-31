import React, { useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ConnectedStudentRightRail, StudentRightRail, type StudentRightRailShellData } from './StudentRightRail';
import { S } from './studentLayoutStyles';

export interface StudentLayoutProps {
    children: React.ReactNode;
    sidebar: React.ReactNode;
    rightPanel?: React.ReactNode;
    shellData?: StudentRightRailShellData;
    mobileTitle: string;
    mobileRightAction?: React.ReactNode;
}

export const StudentLayout: React.FC<StudentLayoutProps> = ({
    children,
    sidebar,
    rightPanel,
    shellData,
    mobileTitle,
    mobileRightAction,
}) => {
    const [showMobileLeft, setShowMobileLeft] = useState(false);
    const [showMobileRight, setShowMobileRight] = useState(false);

    const isMobile = useMediaQuery('(max-width: 768px)');
    const isTablet = useMediaQuery('(max-width: 1024px)');

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
        <div className="student-view-root" style={S.root}>
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

            {(isMobile || isTablet) && (
                <div style={S.mobileHeader}>
                    <button type="button" style={S.mobileBtn} onClick={toggleLeft} aria-label="Open navigation">
                        ☰
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111827' }}>
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
                <header
                    style={{
                        ...S.sidebar,
                        ...((isMobile || isTablet)
                            ? {
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
                            }
                            : {}),
                    }}
                >
                    {sidebar}
                </header>

                <main
                    style={{
                        ...S.feed,
                        ...((isMobile || isTablet)
                            ? {
                                marginTop: 56,
                                borderLeft: 'none',
                                borderRight: 'none',
                                maxWidth: '100%',
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
                        ...((isMobile || isTablet)
                            ? {
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
                            }
                            : {}),
                    }}
                >
                    {shellData ? (
                        <StudentRightRail shellData={shellData} supplementalContent={rightPanel} />
                    ) : (
                        <ConnectedStudentRightRail supplementalContent={rightPanel} />
                    )}
                </aside>
            </div>
        </div>
    );
};
