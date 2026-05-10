import React, { useState } from 'react';
import { useMaterialLibrary, preloadMaterialLibraryData } from '../hooks/useMaterialLibrary';
import { useAuth } from '../hooks/useAuth';

import { clearSoloProgress } from '../hooks/solo/useSoloAutoSave';
import { SoloResumeModal } from '../components/test/SoloResumeModal';
import type { LibrarySource } from '../types/solo.types';
import type { SoloSessionProgress } from '../types/practice.types';
import { readSoloProgress } from '../services/soloProgress.service';

import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
import { useResolvedStudentHomeworkList } from '../context/StudentShellDataContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useNavigation } from '../hooks/useNavigation';

/* ── Inline SVG Icons (24×24, currentColor) ─────────────────────── */
const SvgBook = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
const SvgClock = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const SvgFilter = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
const SvgX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const SvgSearch = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const SvgChevronRight = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
const SvgAlertTriangle = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const SvgBookLarge = ({ size = 48, color = studentTokens.textMuted }: { size?: number; color?: string }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
const SvgPen = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;

const localStyles = {
    card: { background: studentTokens.bgSurface, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const, height: '100%', transition: 'box-shadow 0.2s' },
    cardBody: { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 16 },
    cardFooter: { padding: '16px 20px', borderTop: `1px solid ${studentTokens.borderWhisper}`, background: studentTokens.bgShell },
    badge: { display: 'inline-block', padding: '4px 10px', borderRadius: studentTokens.radiusPill, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
    statRow: { display: 'flex', gap: 16, fontSize: '0.875rem', color: studentTokens.textBody, fontWeight: 500 },
    historyBox: { background: studentTokens.bgShell, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', marginTop: 'auto' },
    historyBoxItem: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
    historyBoxLabel: { fontSize: '0.6875rem', color: studentTokens.textMuted, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em' },
    historyBoxValue: { fontSize: '1rem', fontWeight: 700, color: studentTokens.textPrimary },
    historyBoxValueAccent: { fontSize: '1rem', fontWeight: 700, color: studentTokens.accent },
    loaderWrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2dfff', borderTopColor: studentTokens.accent, animation: 'studentSpinner 0.8s linear infinite' },
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
            {label ? <p style={{ color: studentTokens.textMuted, margin: 0, fontWeight: 500 }}>{label}</p> : null}
        </div>
    );
}

const FILTER_TABS = [
    { key: 'my_courses', label: 'My Courses' },
    { key: 'public', label: 'Public Library' },
    { key: 'recommended', label: 'Recommended' },
    { key: 'recent', label: 'Recent' },
];

const SKILL_FILTER_OPTIONS = [
    { value: 'reading', label: 'Reading' },
    { value: 'reading-v2', label: 'Reading V2' },
    { value: 'listening', label: 'Listening' },
    { value: 'writing', label: 'Writing' },
    { value: 'speaking', label: 'Speaking' },
];

function getMaterialSkillLabel(skill?: string): string {
    if (skill === 'reading-v2') {
        return 'Reading V2';
    }

    if (!skill) {
        return 'Reading';
    }

    return skill.charAt(0).toUpperCase() + skill.slice(1);
}

function getMaterialSkillBadgeStyle(skill?: string) {
    if (skill === 'writing') {
        return {
            background: studentTokens.accentSoft,
            color: studentTokens.accentHover,
        };
    }

    if (skill === 'reading-v2') {
        return {
            background: '#e7f0fb',
            color: '#1f5f99',
        };
    }

    return {
        background: '#edf5f9',
        color: '#4c5458',
    };
}

export const StudentLibraryPage: React.FC = () => {
    const { user, profile } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { notStarted = [] } = useResolvedStudentHomeworkList(user?.uid || '');
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [activeTab, setActiveTab] = useState<LibrarySource>('my_courses');
    const [showFilters, setShowFilters] = useState(false);

    const [resumeModalOpen, setResumeModalOpen] = useState(false);
    const [pendingMaterial, setPendingMaterial] = useState<{ id: string; title: string } | null>(null);
    const [pendingProgress, setPendingProgress] = useState<SoloSessionProgress | null>(null);

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

    const navigateToLibraryPractice = (materialId: string, title: string, resumeFrom?: SoloSessionProgress) => {
        navigateTo('STUDENT_PRACTICE', {
            materialId,
        }, {
            reason: resumeFrom ? 'student_library_resume_practice' : 'student_library_start_practice',
            state: {
                context: { type: 'self_study', source: { type: 'library', id: materialId, name: title } },
                ...(resumeFrom ? { resumeFrom } : {}),
            },
        });
    };

    const handlePractice = async (materialId: string, title?: string) => {
        const studentId = user?.uid || '';
        const materialTitle = title || '';
        const { progress: saved } = await readSoloProgress({
            materialId,
            studentId,
            scopeContext: { mode: 'self_study' },
        });

        if (saved) {
            setPendingMaterial({ id: materialId, title: materialTitle });
            setPendingProgress(saved);
            setResumeModalOpen(true);
            return;
        }

        navigateToLibraryPractice(materialId, materialTitle);
    };

    const renderMaterialCard = (material: any, index: number) => {
        const history = material.studentHistory;
        const hasAttempted = history && history.attemptCount > 0;
        const skillBadgeStyle = getMaterialSkillBadgeStyle(material.skill);

        const diffColor = material.difficulty === 'easy' ? { bg: '#edf5f9', text: '#4c5458' } : material.difficulty === 'medium' ? { bg: '#f4ede4', text: '#9a6427' } : material.difficulty === 'hard' ? { bg: '#fff2f2', text: '#9e3f4e' } : { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody };

        return (
            <div
                key={material.id}
                style={{ ...localStyles.card, animation: `dashFadeIn 0.3s ease-out ${index * 0.05}s backwards` }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 10px 24px rgba(43, 52, 55, 0.06)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
                <div style={localStyles.cardBody}>
                    <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 12px', letterSpacing: '-0.01em', lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', display: isMobile ? '-webkit-box' : undefined, WebkitLineClamp: isMobile ? 2 : undefined, WebkitBoxOrient: isMobile ? 'vertical' : undefined }}>{material.title}</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ ...localStyles.badge, ...skillBadgeStyle }}>
                                {getMaterialSkillLabel(material.skill)}
                            </span>
                            {material.skill === 'reading-v2' && (
                                <span style={{ ...localStyles.badge, background: '#f8fafc', color: '#334155', border: `1px solid ${studentTokens.borderSoft}` }}>V2 Engine</span>
                            )}
                            <span style={{ ...localStyles.badge, background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody }}>{material.type}</span>
                            {material.difficulty && (
                                <span style={{ ...localStyles.badge, background: diffColor.bg, color: diffColor.text }}>{material.difficulty}</span>
                            )}
                            {material.skill === 'writing' && material.format && (
                                <span style={{ ...localStyles.badge, background: studentTokens.accentSoft, color: studentTokens.accentHover, border: `1px solid ${studentTokens.borderSoft}` }}>
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
                            <div style={{ width: 1, background: studentTokens.borderWhisper }} />
                            <div style={localStyles.historyBoxItem}>
                                <span style={localStyles.historyBoxLabel}>Attempts</span>
                                <span style={localStyles.historyBoxValue}>{history.attemptCount}</span>
                            </div>
                            <div style={{ width: 1, background: studentTokens.borderWhisper }} />
                            <div style={localStyles.historyBoxItem}>
                                <span style={localStyles.historyBoxLabel}>Last Practice</span>
                                <span style={{ ...localStyles.historyBoxValue, fontSize: '0.875rem', marginTop: 2 }}>{new Date(history.lastPracticed).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={localStyles.cardFooter}>
                    <button
                        onClick={() => void handlePractice(material.id, material.title)}
                        style={{ width: '100%', minHeight: isMobile ? 44 : undefined, padding: '10px 14px', borderRadius: studentTokens.radiusSoft, border: 'none', background: hasAttempted ? studentTokens.bgSurfaceStrong : studentTokens.accent, color: hasAttempted ? studentTokens.textPrimary : '#faf6ff', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = hasAttempted ? studentTokens.bgSurfaceAlt : studentTokens.accentHover}
                        onMouseLeave={e => e.currentTarget.style.background = hasAttempted ? studentTokens.bgSurfaceStrong : studentTokens.accent}
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
                <div style={S.feedHeaderText}>
                    <h2 style={{ ...S.feedHeaderTitle, ...(isMobile ? { fontSize: '1.5rem' } : {}) }}>Practice Library</h2>
                    <p style={{ ...S.feedHeaderSubtitle, ...(isMobile ? mobileStyles.feedSubtitleHidden : {}) }}>Browse course materials, public resources, and recent practice using the same restrained academic visual language.</p>
                </div>
            </div>

            <div
                className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
                style={{ ...S.filterBar, ...(isMobile ? { gap: 16 } : {}) }}
            >
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        style={{ ...S.filterTab, ...(isMobile ? mobileStyles.touchTarget : {}), ...(activeTab === tab.key ? S.filterTabActive : {}) }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div style={{ padding: '18px 0 0', animation: 'dashFadeIn 200ms ease-out forwards' }}>
                <div style={{ background: studentTokens.bgSurface, borderRadius: 12, padding: isMobile ? '16px' : '16px 20px', border: `1px solid ${studentTokens.borderWhisper}`, marginBottom: 24 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', ...(isMobile ? mobileStyles.stackVertical : {}) }}>
                        <div style={{ flex: isMobile ? '1 1 100%' : '1 1 300px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Search</label>
                            <div style={{ position: 'relative', background: studentTokens.bgShell, borderRadius: 12, display: 'flex', alignItems: 'center', border: `1px solid ${studentTokens.borderWhisper}` }}>
                                <div style={{ paddingLeft: 16, color: studentTokens.textMuted, display: 'flex' }}><SvgSearch /></div>
                                <input
                                    placeholder="Search materials..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ background: 'transparent', width: '100%', padding: '10px 16px', outline: 'none', border: 'none', color: studentTokens.textPrimary, fontSize: '0.938rem', fontFamily: 'inherit' }}
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            style={{ width: isMobile ? '100%' : undefined, minHeight: isMobile ? 44 : undefined, padding: '10px 16px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: showFilters ? studentTokens.bgShell : studentTokens.bgSurface, color: studentTokens.textPrimary, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = studentTokens.bgShell}
                            onMouseLeave={e => e.currentTarget.style.background = showFilters ? studentTokens.bgShell : studentTokens.bgSurface}
                        >
                            <SvgFilter /> Filters
                        </button>

                        {(searchQuery || filters.skill || filters.type || filters.difficulty) && (
                            <button
                                onClick={clearFilters}
                                style={{ width: isMobile ? '100%' : undefined, minHeight: isMobile ? 44 : undefined, padding: '10px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: '#9e3f4e', fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}
                            >
                                <SvgX /> Clear
                            </button>
                        )}
                    </div>

                    {showFilters && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${studentTokens.borderWhisper}`, ...(isMobile ? mobileStyles.stackVertical : {}) }}>
                            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 200px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Skill</label>
                                <select value={filters.skill || ''} onChange={e => updateFilter('skill', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: studentTokens.bgSurface, color: studentTokens.textPrimary, fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">All Skills</option>
                                    {SKILL_FILTER_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 200px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Type</label>
                                <select value={filters.type || ''} onChange={e => updateFilter('type', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: studentTokens.bgSurface, color: studentTokens.textPrimary, fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">All Types</option>
                                    <option value="quiz">Quiz</option>
                                    <option value="test">Test</option>
                                </select>
                            </div>

                            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 200px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: studentTokens.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Difficulty</label>
                                <select value={filters.difficulty || ''} onChange={e => updateFilter('difficulty', e.target.value as any)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: studentTokens.bgSurface, color: studentTokens.textPrimary, fontSize: '0.938rem', outline: 'none', fontFamily: 'inherit' }}>
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
                    <span style={{ color: studentTokens.textMuted, fontSize: '0.875rem', fontWeight: 500 }}>
                        {filteredMaterials.length} material{filteredMaterials.length !== 1 ? 's' : ''} found
                    </span>
                    {totalPages > 1 && (
                        <span style={{ color: studentTokens.textMuted, fontSize: '0.875rem', fontWeight: 500 }}>
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
                    <div style={{ textAlign: 'center', padding: '60px 0', background: studentTokens.bgSurface, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><SvgAlertTriangle size={48} color="#9e3f4e" /></div>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#9e3f4e', margin: 0 }}>{error}</p>
                    </div>
                )}

                {!isLoading && !error && paginatedMaterials.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '80px 20px', background: studentTokens.bgSurface, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><SvgBookLarge /></div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>No materials found</h3>
                        <p style={{ color: studentTokens.textMuted, margin: '0 0 24px', fontSize: '0.938rem' }}>Try adjusting your filters or search query.</p>
                        {(searchQuery || filters.skill || filters.type || filters.difficulty) && (
                            <button
                                onClick={clearFilters}
                                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: studentTokens.accent, color: '#faf6ff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {!isLoading && !error && paginatedMaterials.length > 0 && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', ...(isMobile ? mobileStyles.singleColumnGrid : {}), gap: isMobile ? '16px' : '24px' }}>
                            {paginatedMaterials.map((material, index) => renderMaterialCard(material, index))}
                        </div>

                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 40, alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={prevPage}
                                    disabled={currentPage === 1}
                                    style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, padding: '8px 20px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: studentTokens.bgSurface, color: currentPage === 1 ? studentTokens.textDim : studentTokens.textPrimary, fontWeight: 700, cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}
                                >
                                    Previous
                                </button>
                                <span style={{ fontSize: '0.875rem', color: studentTokens.textMuted, fontWeight: 500 }}>
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={nextPage}
                                    disabled={currentPage === totalPages}
                                    style={{ minHeight: isMobile ? 44 : undefined, minWidth: isMobile ? 44 : undefined, padding: '8px 20px', borderRadius: 8, border: `1px solid ${studentTokens.borderSoft}`, background: studentTokens.bgSurface, color: currentPage === totalPages ? studentTokens.textDim : studentTokens.textPrimary, fontWeight: 700, cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {pendingMaterial && pendingProgress && (
                <SoloResumeModal
                    opened={resumeModalOpen}
                    onClose={() => { setResumeModalOpen(false); setPendingMaterial(null); setPendingProgress(null); }}
                    onResume={() => {
                        setResumeModalOpen(false);
                        navigateToLibraryPractice(pendingMaterial.id, pendingMaterial.title, pendingProgress);
                    }}
                    onStartNew={() => {
                        clearSoloProgress(pendingMaterial.id, user?.uid || '');
                        setResumeModalOpen(false);
                        setPendingProgress(null);
                        navigateToLibraryPractice(pendingMaterial.id, pendingMaterial.title);
                    }}
                    savedProgress={pendingProgress}
                    totalQuestions={0} // Filled after load on the test side
                />
            )}
        </StudentLayout>
    );
};

export const preloadStudentLibraryPageData = preloadMaterialLibraryData;

export default StudentLibraryPage;
