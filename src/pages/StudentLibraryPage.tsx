import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMaterialLibrary, preloadMaterialLibraryData } from '../hooks/useMaterialLibrary';
import { useAuth } from '../hooks/useAuth';

import { clearSoloProgress } from '../hooks/solo/useSoloAutoSave';
import { SoloResumeModal } from '../components/test/SoloResumeModal';
import type { LibrarySource } from '../types/solo.types';

import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { useResolvedStudentHomeworkList } from '../context/StudentShellDataContext';

/* ── Inline SVG Icons (24×24, currentColor) ─────────────────────── */
const SvgBook = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
const SvgClock = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const SvgFilter = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
const SvgX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const SvgSearch = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const SvgChevronRight = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
const SvgAlertTriangle = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const SvgBookLarge = ({ size = 48, color = '#6b7280' }: { size?: number; color?: string }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
const SvgPen = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;

const localStyles = {
    card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const, height: '100%', transition: 'box-shadow 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
    cardBody: { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 16 },
    cardFooter: { padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' },
    badge: { display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const },
    statRow: { display: 'flex', gap: 16, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 },
    historyBox: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', marginTop: 'auto' },
    historyBoxItem: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
    historyBoxLabel: { fontSize: '0.75rem', color: '#6b7280', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    historyBoxValue: { fontSize: '1rem', fontWeight: 700, color: '#111827' },
    historyBoxValueAccent: { fontSize: '1rem', fontWeight: 700, color: '#4f46e5' },
    loaderWrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: '3px solid #e0e7ff', borderTopColor: '#4f46e5', animation: 'studentSpinner 0.8s linear infinite' },
};

function InlineLoader({ label, size = 32 }: { label?: string; size?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div
                aria-hidden="true"
                style={{
                    ...localStyles.loaderWrap,
                    width: size,
                    height: size,
                }}
            />
            {label ? <p style={{ color: '#6b7280', margin: 0, fontWeight: 500 }}>{label}</p> : null}
        </div>
    );
}

const FILTER_TABS = [
    { key: 'my_courses', label: 'My Courses' },
    { key: 'public', label: 'Public Library' },
    { key: 'recommended', label: 'Recommended' },
    { key: 'recent', label: 'Recent' },
];

export const StudentLibraryPage: React.FC = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { notStarted = [] } = useResolvedStudentHomeworkList(user?.uid || '');
    const [activeTab, setActiveTab] = useState<LibrarySource>('my_courses');
    const [showFilters, setShowFilters] = useState(false);

    const [resumeModalOpen, setResumeModalOpen] = useState(false);
    const [pendingMaterial, setPendingMaterial] = useState<{ id: string; title: string } | null>(null);

    const {
        paginatedMaterials,
        filteredMaterials,
        filters,
        updateFilter,
        clearFilters,
        searchQuery,
        setSearchQuery,
        isLoading,
        error,
        currentPage,
        totalPages,
        nextPage,
        prevPage,
        fetchBySource
    } = useMaterialLibrary({
        studentId: user?.uid || '',
        initialSource: 'my_courses',
        itemsPerPage: 12
    });

    const handleTabChange = (value: string) => {
        setActiveTab(value as LibrarySource);
        fetchBySource(value as LibrarySource);
    };

    const handlePractice = (materialId: string, title?: string) => {
        const studentId = user?.uid || '';
        const key = `solo_progress_${materialId}_${studentId}`;
        const saved = localStorage.getItem(key);

        if (saved) {
            setPendingMaterial({ id: materialId, title: title || '' });
            setResumeModalOpen(true);
            return;
        }

        navigate(`/student/practice/${materialId}`, {
            state: {
                context: { type: 'self_study', source: { type: 'library', id: materialId, name: title || '' } }
            }
        });
    };

    const renderMaterialCard = (material: any, index: number) => {
        const history = material.studentHistory;
        const hasAttempted = history && history.attemptCount > 0;

        const diffColor = material.difficulty === 'easy' ? { bg: '#d1fae5', text: '#059669' } : material.difficulty === 'medium' ? { bg: '#fef3c7', text: '#d97706' } : material.difficulty === 'hard' ? { bg: '#fee2e2', text: '#dc2626' } : { bg: '#f3f4f6', text: '#374151' };

        return (
            <div
                key={material.id}
                style={{ ...localStyles.card, animation: `dashFadeIn 0.3s ease-out ${index * 0.05}s backwards` }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'}
            >
                <div style={localStyles.cardBody}>
                    <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 12px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>{material.title}</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ ...localStyles.badge, background: material.skill === 'writing' ? '#f5f3ff' : '#e0e7ff', color: material.skill === 'writing' ? '#7c3aed' : '#4338ca' }}>
                                {material.skill === 'writing' && <span style={{ marginRight: 4 }}>✍️</span>}
                                {material.skill}
                            </span>
                            <span style={{ ...localStyles.badge, background: '#f3f4f6', color: '#374151' }}>{material.type}</span>
                            {material.difficulty && (
                                <span style={{ ...localStyles.badge, background: diffColor.bg, color: diffColor.text }}>{material.difficulty}</span>
                            )}
                            {material.skill === 'writing' && material.format && (
                                <span style={{ ...localStyles.badge, background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff' }}>
                                    {material.format === 'full-test' ? 'Full Test' : material.format === 'task1-only' ? 'Task 1' : 'Task 2'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={localStyles.statRow}>
                        {material.skill === 'writing' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SvgPen /> Writing Practice</div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SvgBook /> {material.questionCount} questions</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SvgClock /> {material.estimatedDuration} min</div>
                    </div>

                    {hasAttempted && (
                        <div style={localStyles.historyBox}>
                            <div style={localStyles.historyBoxItem}>
                                <span style={localStyles.historyBoxLabel}>Best Score</span>
                                <span style={localStyles.historyBoxValueAccent}>{history.bestScore}%</span>
                            </div>
                            <div style={{ width: 1, background: '#e5e7eb' }} />
                            <div style={localStyles.historyBoxItem}>
                                <span style={localStyles.historyBoxLabel}>Attempts</span>
                                <span style={localStyles.historyBoxValue}>{history.attemptCount}</span>
                            </div>
                            <div style={{ width: 1, background: '#e5e7eb' }} />
                            <div style={localStyles.historyBoxItem}>
                                <span style={localStyles.historyBoxLabel}>Last Practice</span>
                                <span style={{ ...localStyles.historyBoxValue, fontSize: '0.875rem', marginTop: 2 }}>{new Date(history.lastPracticed).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={localStyles.cardFooter}>
                    <button
                        onClick={() => handlePractice(material.id, material.title)}
                        style={{ width: '100%', padding: '10px', borderRadius: 999, border: 'none', background: hasAttempted ? '#111827' : '#4f46e5', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.938rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = hasAttempted ? '#374151' : '#4338ca'}
                        onMouseLeave={e => e.currentTarget.style.background = hasAttempted ? '#111827' : '#4f46e5'}
                    >
                        {hasAttempted ? 'Practice Again' : 'Start Practice'} <SvgChevronRight />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="Library"
            sidebar={
                <StudentSidebar
                    user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                    activePage="library"
                    pendingHomeworkCount={notStarted.length}
                />
            }
        >
            <style>{`
                @keyframes studentSpinner {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>Practice Library</h2>
            </div>

            <div style={S.filterBar}>
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        style={{ ...S.filterTab, ...(activeTab === tab.key ? S.filterTabActive : {}) }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div style={{ padding: '24px 16px', animation: 'dashFadeIn 200ms ease-out forwards' }}>
                <div style={{ background: 'white', borderRadius: 16, padding: '16px 20px', border: '1px solid #e5e7eb', marginBottom: 24 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Search</label>
                            <div style={{ position: 'relative', background: '#f3f4f6', borderRadius: 12, display: 'flex', alignItems: 'center' }}>
                                <div style={{ paddingLeft: 16, color: '#6b7280', display: 'flex' }}><SvgSearch /></div>
                                <input
                                    placeholder="Search materials..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ background: 'transparent', width: '100%', padding: '10px 16px', outline: 'none', border: 'none', color: '#111827', fontSize: '0.938rem', fontFamily: 'inherit' }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: showFilters ? '#f3f4f6' : 'white', color: '#111827', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.875rem', fontFamily: 'inherit', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={e => e.currentTarget.style.background = showFilters ? '#f3f4f6' : 'white'}
                        >
                            <SvgFilter /> Filters
                        </button>

                        {(searchQuery || filters.skill || filters.type || filters.difficulty) && (
                            <button
                                onClick={clearFilters}
                                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.875rem', fontFamily: 'inherit' }}
                            >
                                <SvgX /> Clear
                            </button>
                        )}
                    </div>

                    {showFilters && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Skill</label>
                                <select value={filters.skill || ''} onChange={e => updateFilter('skill', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white', color: '#111827', fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">All Skills</option>
                                    <option value="reading">Reading</option>
                                    <option value="listening">Listening</option>
                                    <option value="writing">Writing</option>
                                    <option value="speaking">Speaking</option>
                                </select>
                            </div>

                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Type</label>
                                <select value={filters.type || ''} onChange={e => updateFilter('type', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white', color: '#111827', fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">All Types</option>
                                    <option value="quiz">Quiz</option>
                                    <option value="test">Test</option>
                                </select>
                            </div>

                            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Difficulty</label>
                                <select value={filters.difficulty || ''} onChange={e => updateFilter('difficulty', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white', color: '#111827', fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">All Difficulties</option>
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <span style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 500 }}>
                        {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''} found
                    </span>
                    {totalPages > 1 && (
                        <span style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 500 }}>
                            Page {currentPage} of {totalPages}
                        </span>
                    )}
                </div>

                {isLoading && (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                        <InlineLoader label="Loading materials..." />
                    </div>
                )}

                {error && (
                    <div style={{ textAlign: 'center', padding: '60px 0', background: 'white', border: '1px solid #e5e7eb', borderRadius: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><SvgAlertTriangle size={48} color="#dc2626" /></div>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', margin: 0 }}>{error}</p>
                    </div>
                )}

                {!isLoading && !error && paginatedMaterials.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><SvgBookLarge /></div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No materials found</h3>
                        <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: '0.938rem' }}>Try adjusting your filters or search query</p>
                        {(searchQuery || filters.skill || filters.type || filters.difficulty) && (
                            <button
                                onClick={clearFilters}
                                style={{ padding: '10px 24px', borderRadius: 999, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.938rem' }}
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {!isLoading && !error && paginatedMaterials.length > 0 && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                            {paginatedMaterials.map((material, index) => renderMaterialCard(material, index))}
                        </div>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 40, alignItems: 'center' }}>
                                <button
                                    onClick={prevPage}
                                    disabled={currentPage === 1}
                                    style={{ padding: '8px 20px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', color: currentPage === 1 ? '#9ca3af' : '#111827', fontWeight: 600, cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' }}
                                >
                                    Previous
                                </button>
                                <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={nextPage}
                                    disabled={currentPage === totalPages}
                                    style={{ padding: '8px 20px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', color: currentPage === totalPages ? '#9ca3af' : '#111827', fontWeight: 600, cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {pendingMaterial && (
                <SoloResumeModal
                    opened={resumeModalOpen}
                    onClose={() => { setResumeModalOpen(false); setPendingMaterial(null); }}
                    onResume={() => {
                        setResumeModalOpen(false);
                        const saved = JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.id}_${user?.uid}`) || '{}');
                        navigate(`/student/practice/${pendingMaterial.id}`, {
                            state: {
                                context: { type: 'self_study', source: { type: 'library', id: pendingMaterial.id, name: pendingMaterial.title } },
                                resumeFrom: saved,
                            }
                        });
                    }}
                    onStartNew={() => {
                        clearSoloProgress(pendingMaterial.id, user?.uid || '');
                        setResumeModalOpen(false);
                        navigate(`/student/practice/${pendingMaterial.id}`, {
                            state: {
                                context: { type: 'self_study', source: { type: 'library', id: pendingMaterial.id, name: pendingMaterial.title } }
                            }
                        });
                    }}
                    savedProgress={JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.id}_${user?.uid}`) || '{}')}
                    totalQuestions={0} // Filled after load on the test side
                />
            )}
        </StudentLayout>
    );
};

export const preloadStudentLibraryPageData = preloadMaterialLibraryData;

export default StudentLibraryPage;
