/**
 * Student Homework Detail Page
 * PRD-0016: Solo Study & Homework System
 *
 * Unified student-shell detail workspace that preserves the existing
 * homework workflow while using the shared student design tokens.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { useHomeworkSubmission } from '../hooks/useHomeworkSubmission';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../hooks/useNavigation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { getTestFromFirebase, TestData } from '../services/testStorage';
import { database } from '../services/firebase';
import { getBookHomeworkProgress } from '../services/homeworkSubmissionService';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';
import { isBookHomeworkAssignment } from '../services/book-homework/bookHomeworkManifest.service';
import { buildBookPlacementPracticeRouteParams } from '../services/book-delivery/bookPlacementLaunch.browser';
import type {
    BookHomeworkProgressActivity,
    BookHomeworkProgressProjection,
} from '../services/book-homework/bookHomeworkProgress.types';
import {
    buildReadingV2LaunchReadPlan,
    createReadingV2LaunchMaterialSummary,
    isReadingV2LaunchCandidate,
} from '../services/reading-v2/readingV2LaunchIntegration.service';
import { getReadingPassageHomeworkSummary } from '../services/reading-v2/readingV2PassageHomeworkLaunch.service';
import type { ReadingV2DerivedProjection } from '../services/reading-v2/readingV2Projection.service';
import type { ReadingV2MaterialMetadata } from '../services/reading-v2/readingV2MaterialMetadata.service';
import { Card, CardBody, Button } from '../components/modern';
import { DeferredResultSlidePanel } from '../components/results/DeferredResultSlidePanel';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getTimeRemaining = (dueDate: number): { text: string; urgent: boolean; color: string } => {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) {
        return { text: 'Past Due', urgent: true, color: 'red' };
    }

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (hours < 1) {
        return { text: `${minutes} minutes remaining`, urgent: true, color: 'red' };
    }

    if (hours < 24) {
        return { text: `${hours} hour${hours > 1 ? 's' : ''} remaining`, urgent: true, color: 'orange' };
    }

    if (days < 7) {
        return { text: `${days} day${days > 1 ? 's' : ''} remaining`, urgent: days < 2, color: days < 2 ? 'yellow' : 'blue' };
    }

    return { text: `${days} days remaining`, urgent: false, color: 'green' };
};

const getFeedbackTimingDescription = (timing: string): string => {
    switch (timing) {
        case 'immediate': return 'Answers shown after each question';
        case 'after_completion': return 'Answers shown after you submit';
        case 'after_deadline': return 'Answers shown after deadline passes';
        case 'never': return 'Only score will be shown';
        default: return 'Unknown';
    }
};

const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

const firstString = (...values: unknown[]): string | undefined => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
    }

    return undefined;
};

const firstNumber = (...values: unknown[]): number | undefined => {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }

    return undefined;
};

const stringArray = (value: unknown): readonly string[] =>
    Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        : [];

const buildReadingV2MetadataFromStudentBridge = (testData: TestData): ReadingV2MaterialMetadata => {
    const bridge = asRecord(testData);
    const bridgeMetadata = asRecord(bridge.metadata);
    const materialId = firstString(bridge.materialId, bridge.id) ?? '';
    const title = firstString(bridgeMetadata.title, bridge.title) ?? 'Reading V2 material';
    const materialKind = firstString(bridgeMetadata.materialKind, bridge.materialKind) ?? 'full-test';

    return {
        materialId: materialId as ReadingV2MaterialMetadata['materialId'],
        ownerId: firstString(bridge.ownerId, bridgeMetadata.ownerId) ?? '',
        compositionId: firstString(bridgeMetadata.compositionId, bridge.compositionId) as ReadingV2MaterialMetadata['compositionId'],
        state: firstString(bridgeMetadata.state, bridge.state) as ReadingV2MaterialMetadata['state'],
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title,
        materialKind: materialKind as ReadingV2MaterialMetadata['materialKind'],
        durationMinutes: firstNumber(
            bridgeMetadata.durationMinutes,
            bridgeMetadata.duration,
            bridge.durationMinutes,
            bridge.duration,
        ) ?? 0,
        difficulty: firstString(bridgeMetadata.difficulty, bridge.difficulty) ?? 'intermediate',
        targetBand: firstString(bridgeMetadata.targetBand, bridge.targetBand),
        description: firstString(bridgeMetadata.description, bridge.description) ?? '',
        tags: stringArray(bridgeMetadata.tags),
        visibility: (firstString(bridgeMetadata.visibility, bridge.visibility) ?? 'private') as ReadingV2MaterialMetadata['visibility'],
        primaryTestTypeId: firstString(bridgeMetadata.primaryTestTypeId, bridge.primaryTestTypeId) as ReadingV2MaterialMetadata['primaryTestTypeId'],
        testTypeIds: stringArray(bridgeMetadata.testTypeIds).length > 0
            ? stringArray(bridgeMetadata.testTypeIds) as ReadingV2MaterialMetadata['testTypeIds']
            : stringArray(bridge.testTypeIds) as ReadingV2MaterialMetadata['testTypeIds'],
        publishedSnapshotVersionId: firstString(
            bridgeMetadata.publishedSnapshotVersionId,
            bridge.publishedSnapshotVersionId,
        ),
        updatedAt: firstString(bridgeMetadata.updatedAt, bridge.updatedAt) ?? new Date(0).toISOString(),
        relationshipSurfaces: ['homework-assignment'],
    };
};

const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatSubmissionOutcome = (submission: { percentage?: number; bandScore?: number; status: string }): string | null => {
    if (typeof submission.percentage === 'number') {
        return `${submission.percentage.toFixed(0)}%`;
    }

    if (typeof submission.bandScore === 'number') {
        return `Band ${submission.bandScore.toFixed(1)}`;
    }

    if (submission.status === 'graded') {
        return 'Graded';
    }

    if (submission.status === 'submitted') {
        return 'Pending Review';
    }

    return null;
};

const SPACE_MAP: Record<string, string> = {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
};

const TEXT_SIZE_MAP: Record<string, string> = {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
};

type ColorTone = { lightBg: string; lightText: string; filledBg: string; filledText: string };

const DEFAULT_COLOR_TONE: ColorTone = {
    lightBg: 'rgba(77, 68, 227, 0.12)',
    lightText: studentTokens.accent,
    filledBg: studentTokens.accent,
    filledText: '#faf6ff',
};

const COLOR_MAP: Record<string, ColorTone> = {
    blue: DEFAULT_COLOR_TONE,
    gray: { lightBg: studentTokens.bgShell, lightText: studentTokens.textBody, filledBg: studentTokens.textBody, filledText: '#faf6ff' },
    red: { lightBg: 'rgba(158, 63, 78, 0.12)', lightText: '#9e3f4e', filledBg: '#9e3f4e', filledText: '#faf6ff' },
    orange: { lightBg: 'rgba(243, 144, 63, 0.12)', lightText: '#b66a0a', filledBg: '#f3903f', filledText: '#faf6ff' },
    yellow: { lightBg: 'rgba(199, 155, 0, 0.12)', lightText: '#997400', filledBg: '#c79b00', filledText: '#faf6ff' },
    green: { lightBg: 'rgba(38, 143, 78, 0.12)', lightText: '#1d7a46', filledBg: '#268f4e', filledText: '#faf6ff' },
    teal: { lightBg: 'rgba(20, 184, 166, 0.12)', lightText: '#0f8a7b', filledBg: '#14b8a6', filledText: '#faf6ff' },
    violet: { lightBg: 'rgba(124, 58, 237, 0.12)', lightText: '#7c3aed', filledBg: '#7c3aed', filledText: '#faf6ff' },
    white: { lightBg: 'rgba(255, 255, 255, 0.18)', lightText: '#faf6ff', filledBg: '#faf6ff', filledText: studentTokens.textPrimary },
};

const resolveSpace = (value?: string | number): string | number | undefined => {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value === 'number') {
        return value;
    }

    return SPACE_MAP[value] || value;
};

const resolveTextSize = (value?: string): string | undefined => {
    if (!value) {
        return undefined;
    }

    return TEXT_SIZE_MAP[value] || value;
};

const resolveTone = (color = 'blue'): ColorTone => COLOR_MAP[color] ?? DEFAULT_COLOR_TONE;

const resolveTextColor = (color: unknown): string | undefined => {
    if (typeof color !== 'string') {
        return undefined;
    }

    if (color.startsWith('#')) {
        return color;
    }

    if (color === 'dimmed') {
        return studentTokens.textMuted;
    }

    return resolveTone(color).lightText;
};

const iconBaseStyle = {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const IconClipboard = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
    </svg>
);

const IconClock = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
    </svg>
);

const IconCalendar = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <path d="M3 10h18" />
    </svg>
);

const IconAlertTriangle = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="m10.29 3.86-7.5 13a2 2 0 0 0 1.73 3h15a2 2 0 0 0 1.73-3l-7.5-13a2 2 0 0 0-3.46 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
    </svg>
);

const IconPlaylistAdd = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M4 6h10" />
        <path d="M4 12h10" />
        <path d="M4 18h6" />
        <path d="M18 11v6" />
        <path d="M15 14h6" />
    </svg>
);

const IconBook = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
);

const IconArrowLeft = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
    </svg>
);

const IconCheck = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="m5 13 4 4L19 7" />
    </svg>
);

const IconX = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);

const IconInfoCircle = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <path d="M12 7h.01" />
    </svg>
);

const IconPlayerPlay = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={iconBaseStyle}>
        <path d="M8 5.14v13.72c0 .8.87 1.29 1.55.87l9.55-5.86a1 1 0 0 0 0-1.7L9.55 4.27A1 1 0 0 0 8 5.14Z" />
    </svg>
);

const IconHistory = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M3 3v5h5" />
        <path d="M3.05 13a9 9 0 1 0 3-6.71L3 8" />
        <path d="M12 7v5l3 3" />
    </svg>
);

const IconTrophy = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M17 5h2a2 2 0 0 1 0 4h-2" />
        <path d="M7 5H5a2 2 0 0 0 0 4h2" />
    </svg>
);

const IconEye = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const IconEyeOff = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="m3 3 18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.4 0 10 7 10 7a17.1 17.1 0 0 1-3.17 4.36" />
        <path d="M6.71 6.71C3.93 8.27 2 12 2 12a17.2 17.2 0 0 0 5.09 5.91" />
    </svg>
);

const IconHome = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
    </svg>
);

const IconBooks = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={iconBaseStyle}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        <path d="M8 6h8" />
        <path d="M8 10h8" />
    </svg>
);

const Center = ({ children, style }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</div>
);

const Stack = ({ children, gap = 'md', align, style }: any) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            gap: resolveSpace(gap),
            alignItems: align,
            ...style,
        }}
    >
        {children}
    </div>
);

const Group = ({ children, gap = 'md', justify, align = 'center', mt, mb, style }: any) => (
    <div
        style={{
            display: 'flex',
            alignItems: align,
            justifyContent: justify,
            gap: resolveSpace(gap),
            marginTop: resolveSpace(mt),
            marginBottom: resolveSpace(mb),
            flexWrap: style?.flexWrap || undefined,
            ...style,
        }}
    >
        {children}
    </div>
);

const Text = ({ children, size, fw, c, style, mt, mb }: any) => (
    <span
        style={{
            fontSize: resolveTextSize(size),
            fontWeight: fw,
            color: resolveTextColor(c),
            marginTop: resolveSpace(mt),
            marginBottom: resolveSpace(mb),
            ...style,
        }}
    >
        {children}
    </span>
);

const Loader = ({ size = 'xl', color = studentTokens.accent }: any) => {
    const resolvedSize = typeof size === 'number' ? size : size === 'xl' ? 40 : 32;
    return (
        <span
            aria-label="Loading"
            style={{
                width: resolvedSize,
                height: resolvedSize,
                borderRadius: '50%',
                border: '3px solid rgba(77, 68, 227, 0.18)',
                borderTopColor: color,
                display: 'inline-block',
                animation: 'studentSpin 0.8s linear infinite',
            }}
        />
    );
};

const ThemeIcon = ({ children, color = 'blue', variant = 'light', size = 28, radius = '50%' }: any) => {
    const tone = resolveTone(color);
    const resolvedSize = typeof size === 'number' ? size : size === 'lg' ? 36 : size === 'xl' ? 42 : 28;
    return (
        <span
            style={{
                width: resolvedSize,
                height: resolvedSize,
                borderRadius: radius === 'xl' ? '999px' : radius,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: variant === 'filled' ? tone.filledBg : tone.lightBg,
                color: variant === 'filled' ? tone.filledText : tone.lightText,
                flexShrink: 0,
            }}
        >
            {children}
        </span>
    );
};

const Divider = ({ style }: any) => (
    <hr style={{ border: 'none', borderTop: `1px solid ${studentTokens.borderWhisper}`, margin: '0.5rem 0', ...style }} />
);

const Badge = ({ children, color = 'blue', variant = 'light', size, title, ml }: any) => {
    const tone = resolveTone(color);
    return (
        <span
            title={title}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: size === 'xs' ? '0.2rem 0.45rem' : size === 'lg' ? '0.35rem 0.7rem' : '0.3rem 0.55rem',
                borderRadius: studentTokens.radiusPill,
                background: variant === 'filled' ? tone.filledBg : tone.lightBg,
                color: variant === 'filled' ? tone.filledText : tone.lightText,
                fontSize: size === 'xs' ? '0.6875rem' : '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginLeft: resolveSpace(ml),
            }}
        >
            {children}
        </span>
    );
};

const Alert = ({ children, color = 'blue', icon }: any) => {
    const tone = resolveTone(color);
    return (
        <div
            style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                padding: '0.9rem 1rem',
                borderRadius: studentTokens.radiusSoft,
                border: `1px solid ${tone.lightBg}`,
                background: tone.lightBg,
                color: tone.lightText,
            }}
        >
            {icon ? <span style={{ display: 'inline-flex', marginTop: 1 }}>{icon}</span> : null}
            <div style={{ minWidth: 0 }}>{children}</div>
        </div>
    );
};

const GridBase = ({ children, style }: any) => (
    <div
        style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            ...style,
        }}
    >
        {children}
    </div>
);

GridBase.Col = ({ children, style }: any) => <div style={style}>{children}</div>;
const Grid = GridBase as any;

const ListBase = ({ children, spacing = 'xs', style }: any) => (
    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: resolveSpace(spacing), ...style }}>
        {children}
    </ul>
);

ListBase.Item = ({ children, icon }: any) => (
    <li style={{ paddingLeft: icon ? '0.25rem' : 0 }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            {icon ? <span style={{ display: 'inline-flex', marginTop: 2 }}>{icon}</span> : null}
            <div>{children}</div>
        </div>
    </li>
);
const List = ListBase as any;

const TimelineBase = ({ children }: any) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{children}</div>
);

TimelineBase.Item = ({ bullet, title, children }: any) => (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: '1rem' }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', top: 28, bottom: -16, width: 2, background: studentTokens.borderWhisper }} />
            <div style={{ position: 'relative', zIndex: 1 }}>{bullet}</div>
        </div>
        <div style={{ minWidth: 0 }}>
            <div>{title}</div>
            <div style={{ marginTop: '0.5rem' }}>{children}</div>
        </div>
    </div>
);
const Timeline = TimelineBase as any;

const Modal = ({ opened, onClose, title, children, shellStyle, backdropStyle, contentStyle }: any) => {
    if (!opened) {
        return null;
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                ...shellStyle,
            }}
        >
            <button
                type="button"
                aria-label="Close modal"
                onClick={onClose}
                style={{
                    position: 'absolute',
                    inset: 0,
                    border: 'none',
                    background: 'rgba(12, 15, 16, 0.45)',
                    cursor: 'pointer',
                    ...backdropStyle,
                }}
            />
            <div
                style={{
                    position: 'relative',
                    zIndex: 1,
                    width: 'min(100%, 520px)',
                    borderRadius: 16,
                    background: studentTokens.bgSurface,
                    border: `1px solid ${studentTokens.borderSoft}`,
                    boxShadow: '0 20px 40px rgba(43, 52, 55, 0.18)',
                    padding: '1.5rem',
                    ...contentStyle,
                }}
                onClick={(event) => event.stopPropagation()}
            >
                {title ? <div style={{ marginBottom: '1rem' }}>{title}</div> : null}
                {children}
            </div>
        </div>
    );
};

const bookProgressPanelStyle: React.CSSProperties = {
    background: studentTokens.bgSurface,
    border: `1px solid ${studentTokens.borderSoft}`,
    borderRadius: studentTokens.radiusPanel,
    boxShadow: 'none',
};

const bookProgressInsetStyle: React.CSSProperties = {
    background: studentTokens.bgShell,
    border: `1px solid ${studentTokens.borderWhisper}`,
    borderRadius: studentTokens.radiusSoft,
    padding: '0.9rem 1rem',
};

const getBookCompletionLabel = (status: BookHomeworkProgressProjection['completion']['status']): string => {
    if (status === 'completed') return 'Complete';
    if (status === 'in_progress') return 'In progress';
    return 'Not started';
};

const getBookActivityStateLabel = (activity: BookHomeworkProgressActivity): string => {
    if (!activity.submitted) return 'Not submitted';
    if (activity.gradingState === 'review_required') return 'Pending review';
    if (activity.gradingState === 'scored') return 'Scored';
    return 'Submitted';
};

const getHistoricalReasonLabel = (reason: string): string => reason
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

export function BookHomeworkProgressPanel({
    progress,
    error,
    title,
    isMobile,
    onBack,
    onRetry,
    onLaunch,
}: {
    progress: BookHomeworkProgressProjection | null;
    error: string | null;
    title: string;
    isMobile: boolean;
    onBack: () => void;
    onRetry?: () => void;
    onLaunch?: () => void;
}) {
    const completionLabel = progress
        ? getBookCompletionLabel(progress.completion.status)
        : 'Unavailable';

    return (
        <div
            className="student-view-root"
            data-testid="student-book-homework-progress"
            style={{
                maxWidth: '900px',
                margin: '0 auto',
                padding: isMobile ? '1rem 0 1.5rem' : '2rem 1rem',
                width: '100%',
            }}
        >
            <section aria-labelledby="book-homework-progress-title" style={bookProgressPanelStyle}>
                <div style={{ padding: isMobile ? '1rem' : '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                            <p style={{
                                margin: 0,
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: studentTokens.textMuted,
                            }}>
                                Book Homework progress
                            </p>
                            <h1 id="book-homework-progress-title" style={{
                                margin: '0.35rem 0 0',
                                color: studentTokens.textPrimary,
                                fontSize: isMobile ? '1.45rem' : '1.75rem',
                                lineHeight: 1.2,
                                overflowWrap: 'anywhere',
                            }}>
                                {title}
                            </h1>
                        </div>
                        <span
                            aria-label={`Book completion status: ${completionLabel}`}
                            style={{
                                border: `1px solid ${studentTokens.borderSoft}`,
                                borderRadius: studentTokens.radiusPill,
                                color: studentTokens.textBody,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.4rem 0.7rem',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {completionLabel}
                        </span>
                    </div>

                    {!progress ? (
                        <div style={{ marginTop: '1.5rem' }}>
                            <div role={error ? 'alert' : 'status'} style={{ color: studentTokens.textBody }}>
                                {error || 'Book progress is not available yet.'}
                            </div>
                            {error && onRetry ? (
                                <button type="button" onClick={onRetry} style={{ marginTop: '0.75rem', minHeight: 44 }}>
                                    Retry Book progress
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: '0.75rem', marginTop: '1.5rem' }}>
                                <div style={bookProgressInsetStyle}>
                                    <div style={{ color: studentTokens.textMuted, fontSize: '0.8rem' }}>Activities submitted</div>
                                    <strong style={{ color: studentTokens.textPrimary, fontSize: '1.15rem' }}>
                                        {progress.completion.submittedCount} of {progress.completion.requiredCount}
                                    </strong>
                                </div>
                                <div style={bookProgressInsetStyle}>
                                    <div style={{ color: studentTokens.textMuted, fontSize: '0.8rem' }}>Completion</div>
                                    <strong style={{ color: studentTokens.textPrimary, fontSize: '1.15rem' }}>{completionLabel}</strong>
                                </div>
                                <div style={bookProgressInsetStyle}>
                                    <div style={{ color: studentTokens.textMuted, fontSize: '0.8rem' }}>Review state</div>
                                    <strong style={{ color: studentTokens.textPrimary, fontSize: '1.15rem' }}>
                                        {progress.grading.pendingReviewCount > 0
                                            ? `${progress.grading.pendingReviewCount} pending review`
                                            : progress.grading.ungradedSubmittedCount > 0
                                                ? `${progress.grading.ungradedSubmittedCount} awaiting score`
                                                : 'No pending review'}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ marginTop: '1.75rem' }}>
                                <h2 style={{ color: studentTokens.textPrimary, fontSize: '1.1rem', margin: '0 0 0.75rem' }}>Activities</h2>
                                {progress.activities.length === 0 ? (
                                    <p style={{ color: studentTokens.textBody, margin: 0 }}>No current Activities are assigned.</p>
                                ) : (
                                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                                        {progress.activities.map((activity, index) => (
                                            <div
                                                key={activity.bindingId}
                                                data-testid={`book-activity-${activity.bindingId}`}
                                                style={{ ...bookProgressInsetStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}
                                            >
                                                <div style={{ minWidth: 0 }}>
                                                    <strong style={{ color: studentTokens.textPrimary, overflowWrap: 'anywhere' }}>
                                                        Activity {activity.order > 0 ? activity.order : index + 1}: {activity.activityId}
                                                    </strong>
                                                    <div style={{ color: studentTokens.textBody, marginTop: '0.25rem' }}>
                                                        {getBookActivityStateLabel(activity)}
                                                    </div>
                                                </div>
                                                {activity.score ? (
                                                    <span style={{ color: studentTokens.textBody, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                        Activity score: {activity.score.displayScore ?? `${activity.score.earnedScore} / ${activity.score.maximumScore}`}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {progress.excludedHistoricalRows.length > 0 && (
                                <div style={{ marginTop: '1.75rem' }}>
                                    <h2 style={{ color: studentTokens.textPrimary, fontSize: '1.1rem', margin: '0 0 0.35rem' }}>Historical / excluded Activities</h2>
                                    <p style={{ color: studentTokens.textBody, margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                                        These historical results remain available for review but are excluded from current completion.
                                    </p>
                                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                                        {progress.excludedHistoricalRows.map((row, index) => (
                                            <div key={`${row.terminalId ?? row.activityBindingId ?? 'historical'}-${index}`} style={bookProgressInsetStyle}>
                                                <strong style={{ color: studentTokens.textPrimary, overflowWrap: 'anywhere' }}>
                                                    {row.activityId ?? row.activityBindingId ?? 'Historical Activity'}
                                                </strong>
                                                <div style={{ color: studentTokens.textBody, marginTop: '0.25rem' }}>
                                                    Excluded from current completion: {getHistoricalReasonLabel(row.reason)}
                                                </div>
                                                {row.score ? (
                                                    <div style={{ color: studentTokens.textBody, marginTop: '0.25rem' }}>
                                                        Historical Activity score: {row.score.displayScore ?? `${row.score.earnedScore} / ${row.score.maximumScore}`}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            minHeight: 44,
                            marginTop: '1.5rem',
                            border: `1px solid ${studentTokens.borderSoft}`,
                            borderRadius: studentTokens.radiusSoft,
                            background: studentTokens.bgSurface,
                            color: studentTokens.textBody,
                            cursor: 'pointer',
                            padding: '0.6rem 1rem',
                        }}
                    >
                        Back to Homework List
                    </button>
                    {onLaunch ? (
                        <button
                            type="button"
                            onClick={onLaunch}
                            style={{
                                minHeight: 44,
                                marginTop: '0.75rem',
                                border: 0,
                                borderRadius: studentTokens.radiusSoft,
                                background: studentTokens.accent,
                                color: '#ffffff',
                                cursor: 'pointer',
                                padding: '0.6rem 1rem',
                                fontWeight: 700,
                            }}
                        >
                            Open Book Activities
                        </button>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

// ============================================================================
// COMPONENT
// ============================================================================

export const StudentHomeworkDetailPage: React.FC = () => {
    const { homeworkId } = useParams<{ homeworkId: string }>();
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.homework);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const resolvedStudentName = user?.displayName || user?.email || 'Student';
    const sidebar = <StudentSidebar activePage="homework" />;

    // State
    const [material, setMaterial] = useState<TestData | null>(null);
    const [materialLoading, setMaterialLoading] = useState(true);
    const [showStartModal, setShowStartModal] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
    const [bookProgress, setBookProgress] = useState<BookHomeworkProgressProjection | null>(null);
    const [bookProgressLoading, setBookProgressLoading] = useState(false);
    const [bookProgressError, setBookProgressError] = useState<string | null>(null);
    const [bookProgressAttempted, setBookProgressAttempted] = useState(false);
    const [bookProgressRetry, setBookProgressRetry] = useState(0);
    const bookProgressRequestRef = useRef<{
        key: string;
        promise: Promise<BookHomeworkProgressProjection | null>;
    } | null>(null);

    // Fetch homework data
    const {
        homework,
        currentSubmission,
        allSubmissions,
        bestSubmission,
        maxAttempts,
        attemptsUsed,
        attemptsRemaining,
        isLoading,
        error,
        isOverdue,
        isAvailable,
        canStartAttempt,
        hasInProgressAttempt,
        startAttempt
    } = useHomeworkSubmission({
        homeworkId: homeworkId || '',
        studentId: user?.uid || '',
        studentName: resolvedStudentName,
    });

    const isBookCompatibilityHomework = isBookHomeworkCompatibilityProjection(homework);
    const isExistingBookHomework = Boolean(
        homework
        && isBookHomeworkAssignment(
            homework as unknown as Parameters<typeof isBookHomeworkAssignment>[0],
        ),
    );
    const isBookHomework = isBookCompatibilityHomework || isExistingBookHomework;

    // Book Homework has its own completion projection. A missing legacy shell
    // is also a supported path because Book assignments are owned by the Book
    // service rather than the legacy homework collections.
    useEffect(() => {
        const shouldLoadBookProgress = Boolean(
            homeworkId
            && user?.uid
            && (isBookHomework || error === 'Homework not found')
        );

        if (!shouldLoadBookProgress) {
            bookProgressRequestRef.current = null;
            setBookProgress(null);
            setBookProgressError(null);
            setBookProgressLoading(false);
            setBookProgressAttempted(false);
            return;
        }

        let cancelled = false;
        setBookProgressAttempted(true);
        setBookProgressLoading(true);
        setBookProgressError(null);

        const requestKey = `${homeworkId}:${user!.uid}`;
        const cachedRequest = bookProgressRequestRef.current?.key === requestKey
            ? bookProgressRequestRef.current.promise
            : null;
        const progressRequest = cachedRequest ?? getBookHomeworkProgress(homeworkId!);
        if (!cachedRequest) {
            bookProgressRequestRef.current = { key: requestKey, promise: progressRequest };
        }

        progressRequest
            .then((projection) => {
                if (!cancelled) {
                    setBookProgress(projection);
                    if (!projection) {
                        setBookProgressError('Book progress is not available for this assignment.');
                    }
                }
            })
            .catch((progressError: unknown) => {
                if (!cancelled) {
                    bookProgressRequestRef.current = null;
                    setBookProgress(null);
                    setBookProgressError(progressError instanceof Error
                        ? progressError.message
                        : 'Book progress could not be loaded.');
                }
            })
            .finally(() => {
                if (!cancelled) setBookProgressLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [bookProgressRetry, error, homeworkId, isBookHomework, user?.uid]);

    // Load material data
    useEffect(() => {
        const loadMaterial = async () => {
            if (isBookHomework) {
                setMaterialLoading(false);
                return;
            }

            if (!homework?.materialId) return;

            try {
                setMaterialLoading(true);
                const readingPassageSummary = getReadingPassageHomeworkSummary(homework);

                if (readingPassageSummary) {
                    setMaterial({
                        id: homework.materialId,
                        title: readingPassageSummary.title,
                        duration: homework.config?.timerMinutes ?? 0,
                        updatedAt: undefined,
                        questionCount: readingPassageSummary.questionCount,
                        questions: Array.from({ length: readingPassageSummary.questionCount }, (_value, index) => ({
                            id: `reading-passage-question-${index + 1}`,
                        })),
                        skillType: 'reading',
                        testType: 'ReadingV2',
                        metadata: {
                            deliveryEngine: 'reading-v2',
                            productLabel: readingPassageSummary.label,
                            materialKind: homework.materialType,
                            tags: [],
                        },
                    } as unknown as TestData);
                    return;
                }

                const result = await getTestFromFirebase(homework.materialId);
                if (result.success && result.data) {
                    if (!isReadingV2LaunchCandidate(result.data)) {
                        setMaterial(result.data);
                        return;
                    }

                    const metadata = buildReadingV2MetadataFromStudentBridge(result.data);
                    const projectionPlan = buildReadingV2LaunchReadPlan({
                        surface: 'homework',
                        materialId: metadata.materialId,
                        snapshotVersionId: metadata.publishedSnapshotVersionId,
                    });
                    const projectionSnapshot = await get(ref(database, projectionPlan.projectionPath));
                    const projection = projectionSnapshot.exists()
                        ? projectionSnapshot.val() as ReadingV2DerivedProjection
                        : null;
                    const summary = createReadingV2LaunchMaterialSummary({ metadata, projection });

                    setMaterial({
                        id: summary.id,
                        title: summary.title,
                        duration: summary.durationMinutes,
                        updatedAt: metadata.updatedAt,
                        questionCount: summary.questionCount,
                        questions: Array.from({ length: summary.questionCount }, (_value, index) => ({
                            id: `reading-v2-question-${index + 1}`,
                        })),
                        skillType: 'reading',
                        testType: 'ReadingV2',
                        metadata: summary.metadata,
                    } as unknown as TestData);
                    return;
                }
            } catch (err) {
                console.error('Error loading material:', err);
            } finally {
                setMaterialLoading(false);
            }
        };

        loadMaterial();
    }, [homework, isBookHomework]);

    const navigateToTest = (submission?: any) => {
        if (!homework?.materialId || !homeworkId) return;
        navigateTo('STUDENT_PRACTICE', { materialId: homework.materialId }, {
            reason: submission?.id || currentSubmission?.id ? 'student_homework_continue' : 'student_homework_start',
            state: {
                isHomework: true,
                homeworkId,
                submissionId: submission?.id || currentSubmission?.id,
                teacherId: homework.createdBy,
                dueDate: homework.scheduling?.dueDate,
                lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
                timerMinutes: homework.config?.timerMinutes,
                maxAttempts: homework.config?.maxAttempts,
                startedAt: submission?.startedAt || currentSubmission?.startedAt,
            },
        });
    };

    const handleStartClick = () => {
        setShowStartModal(true);
    };

    const handleConfirmStart = async () => {
        try {
            setIsStarting(true);
            setStartError(null);

            const submission = await startAttempt();

            setShowStartModal(false);
            // Navigate to the test-taking interface
            navigateToTest(submission);
        } catch (err: any) {
            console.error('Error starting homework:', err);
            setStartError(err.message || 'Failed to start homework');
        } finally {
            setIsStarting(false);
        }
    };

    const handleResume = () => {
        if (currentSubmission) {
            navigateToTest(currentSubmission);
        }
    };

    const handleLaunchBookHomework = () => {
        if (!homeworkId || !user?.uid) return;
        trackAction('bookHomeworkStudentLaunchRequested', {
            homeworkId,
            source: 'student_homework_detail',
        });
        navigateTo(
            'STUDENT_PRACTICE',
            buildBookPlacementPracticeRouteParams(homeworkId, {
                kind: 'homework',
                surface: 'homework',
                homeworkId,
            }),
            { force: true, reason: 'student_book_homework_runtime_launch' },
        );
    };

    // PRD-0039 Task 9.7: Redirect to academic-record slide panel
    const handleViewResult = (resultId: string) => {
        setSelectedResultId(resultId);
    };

    const handleLogout = () => {
        logout();
        navigateTo('LOGIN', {}, { reason: 'student_logout', replace: true });
    };

    const tokenizedBackButtonStyle: React.CSSProperties = {
        minHeight: 44,
        borderRadius: studentTokens.radiusSoft,
        border: `1px solid ${studentTokens.borderSoft}`,
        background: studentTokens.bgSurface,
        color: studentTokens.textBody,
        boxShadow: 'none',
    };
    const quietSurfaceStyle: React.CSSProperties = {
        background: studentTokens.bgSurface,
        border: `1px solid ${studentTokens.borderWhisper}`,
        borderRadius: studentTokens.radiusPanel,
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
    };
    const quietInsetStyle: React.CSSProperties = {
        padding: '1rem',
        background: studentTokens.bgShell,
        borderRadius: studentTokens.radiusSoft,
        border: `1px solid ${studentTokens.borderWhisper}`,
    };
    const secondaryButtonStyle: React.CSSProperties = {
        minHeight: 44,
        borderRadius: studentTokens.radiusSoft,
        border: `1px solid ${studentTokens.borderSoft}`,
        background: studentTokens.bgSurface,
        color: studentTokens.textBody,
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
    };
    const primaryActionButtonStyle: React.CSSProperties = {
        minHeight: 44,
        borderRadius: studentTokens.radiusSoft,
        border: `1px solid ${studentTokens.accent}`,
        background: studentTokens.accent,
        color: '#ffffff',
        boxShadow: 'none',
    };
    const mobileFullWidthButtonStyle: React.CSSProperties = isMobile ? { ...mobileStyles.fullWidthButton } : {};
    const mobileHeaderTitleStyle: React.CSSProperties = isMobile ? { fontSize: '1.5rem' } : {};
    const mobileSubtitleStyle: React.CSSProperties = isMobile ? mobileStyles.feedSubtitleHidden : {};

    const isBookProgressSurface = isBookHomework
        || (bookProgressAttempted && (error === 'Homework not found' || Boolean(bookProgress)));

    if (isBookProgressSurface) {
        const bookTitle = homework?.title || homework?.materialTitle || 'Book Homework';
        const progressPanel = bookProgressLoading || (!bookProgress && !bookProgressAttempted)
            ? (
                <Center style={{ minHeight: '45vh' }}>
                    <Stack align="center" gap="md">
                        <Loader size="xl" color={studentTokens.accent} type="bars" />
                        <Text c={studentTokens.textBody} fw={500}>Loading Book progress...</Text>
                    </Stack>
                </Center>
            )
            : (
                <BookHomeworkProgressPanel
                    progress={bookProgress}
                    error={bookProgressError}
                    title={bookTitle}
                    isMobile={isMobile}
                    onBack={() => {
                        trackAction('bookHomeworkProgressBack', { role: 'student' });
                        navigateTo('STUDENT_HOMEWORK', {}, { reason: 'student_homework_detail_book_progress_back' });
                    }}
                    onRetry={() => {
                        trackAction('bookHomeworkProgressRetry', { role: 'student' });
                        setBookProgressRetry((value) => value + 1);
                    }}
                    onLaunch={isBookCompatibilityHomework ? handleLaunchBookHomework : undefined}
                />
            );

        return (
            <StudentLayout sidebar={sidebar} mobileTitle="Homework Details">
                {progressPanel}
            </StudentLayout>
        );
    }

    // Loading state
    if (isLoading || materialLoading) {
        return (
            <StudentLayout sidebar={sidebar} mobileTitle="Homework Details">
                <Center style={{ minHeight: '60vh' }}>
                    <Stack align="center" gap="md">
                        <Loader size="xl" color={studentTokens.accent} type="bars" />
                        <Text c={studentTokens.textBody} fw={500}>Loading homework...</Text>
                    </Stack>
                </Center>
            </StudentLayout>
        );
    }

    // Error state
    if (error || !homework) {
        return (
            <StudentLayout sidebar={sidebar} mobileTitle="Homework Details">
                <Center style={{ minHeight: '60vh' }}>
                    <Card
                        variant="default"
                        hover={false}
                        style={{
                            ...quietSurfaceStyle,
                            padding: '3rem',
                            width: '100%',
                            maxWidth: 520,
                        }}
                    >
                        <Stack align="center" gap="md">
                            <ThemeIcon size="xl" color="red" variant="light">
                                <IconAlertTriangle size={32} />
                            </ThemeIcon>
                            <Text size="xl" fw={700} c={studentTokens.textPrimary}>
                                {error || 'Homework not found'}
                            </Text>
                            <Button
                                variant="primary"
                                leftSection={<IconArrowLeft size={16} />}
                                onClick={() => navigateTo('STUDENT_HOMEWORK')}
                                style={primaryActionButtonStyle}
                            >
                                Back to Homework List
                            </Button>
                        </Stack>
                    </Card>
                </Center>
            </StudentLayout>
        );
    }

    const timeInfo = getTimeRemaining(homework.scheduling.dueDate);
    const readingPassageSummary = getReadingPassageHomeworkSummary(homework);
    const completedSubmissions = allSubmissions.filter(s => s.status === 'submitted' || s.status === 'graded');

    return (
        <StudentLayout
            sidebar={sidebar}
            mobileTitle="Homework Details"
        >
            <div
                className="student-view-root"
                style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '1rem 0 1.5rem' : '2rem 1rem', width: '100%' }}
            >
                <div
                    style={{
                        ...S.feedHeader,
                        alignItems: isMobile ? 'flex-start' : 'center',
                        flexWrap: 'wrap',
                        gap: isMobile ? '0.75rem' : '1rem',
                        paddingBottom: '1.5rem',
                    }}
                >
                    <div style={S.feedHeaderText}>
                        <p
                            style={{
                                margin: 0,
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: studentTokens.textMuted,
                            }}
                        >
                            Homework Workspace
                        </p>
                        <h1 style={{ ...S.feedHeaderTitle, ...mobileHeaderTitleStyle }}>Homework Details</h1>
                        <p style={{ ...S.feedHeaderSubtitle, ...mobileSubtitleStyle }}>
                            Review the assignment details, check past attempts, and launch the next available submission.
                        </p>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            alignItems: 'center',
                            marginLeft: isMobile ? 0 : 'auto',
                            width: isMobile ? '100%' : 'auto',
                        }}
                    >
                        <Button
                            variant="outline"
                            onClick={() => navigateTo('STUDENT_HOMEWORK')}
                            leftSection={<IconArrowLeft size={16} />}
                            fullWidth={isMobile}
                            style={{
                                ...tokenizedBackButtonStyle,
                                ...(isMobile ? { flexBasis: '100%' } : {}),
                            }}
                        >
                            Back
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => navigateTo('STUDENT_DASHBOARD')}
                            leftSection={<IconHome size={18} />}
                            style={secondaryButtonStyle}
                        >
                            Dashboard
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => navigateTo('STUDENT_LIBRARY')}
                            leftSection={<IconBooks size={18} />}
                            style={secondaryButtonStyle}
                        >
                            Library
                        </Button>
                        <span
                            style={{
                                fontSize: '0.875rem',
                                color: studentTokens.textBody,
                                padding: '0 0.25rem',
                                width: isMobile ? '100%' : 'auto',
                            }}
                        >
                            {profile?.displayName || user?.displayName || profile?.email || user?.email}
                        </span>
                        <Button variant="outline" onClick={handleLogout} style={secondaryButtonStyle}>Logout</Button>
                    </div>
                </div>

                <Stack gap="xl">
                        {/* Header Card */}
                        <Card variant="default" hover={false} style={{ ...quietSurfaceStyle, animation: 'slideDown 0.5s ease-out' }}>
                            <CardBody style={{ padding: isMobile ? '1rem' : '2rem' }}>
                                <Stack gap="md">
                                    <Group
                                        justify="space-between"
                                        align="flex-start"
                                        style={{
                                            flexDirection: isMobile ? 'column' : 'row',
                                            gap: isMobile ? '0.75rem' : '1rem',
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                                            <h1 style={{
                                                fontSize: isMobile ? '1.5rem' : '1.75rem',
                                                fontWeight: '800',
                                                color: studentTokens.textPrimary,
                                                margin: 0,
                                                marginBottom: '0.75rem',
                                                lineHeight: 1.2,
                                                overflowWrap: 'anywhere',
                                            }}>
                                                {homework.title || homework.materialTitle}
                                            </h1>
                                            <Group gap="xs" style={{ flexWrap: 'wrap' }}>
                                                <Badge color="blue" variant="light" size="lg">
                                                    {homework.materialSkill}
                                                </Badge>
                                                <Badge color="gray" variant="light" size="lg">
                                                    {readingPassageSummary?.label ?? homework.materialType}
                                                </Badge>
                                                {isOverdue && (
                                                    <Badge color="red" variant="filled" size="lg">
                                                        Overdue
                                                    </Badge>
                                                )}
                                                {material?.updatedAt && (
                                                    <Badge color="teal" variant="light" size="lg" title={`Test last updated: ${new Date(material.updatedAt).toLocaleString()}`}>
                                                        Updated {formatTimeAgo(material.updatedAt)}
                                                    </Badge>
                                                )}
                                            </Group>
                                            {readingPassageSummary && (
                                                <Stack gap="xs" style={{ marginTop: '0.75rem' }}>
                                                    {readingPassageSummary.meta.length > 0 && (
                                                        <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
                                                            {readingPassageSummary.meta.join(', ')}
                                                        </Text>
                                                    )}
                                                    {readingPassageSummary.kind === 'set' && readingPassageSummary.passageTitles.length > 0 && (
                                                        <Text size="sm" c={studentTokens.textBody} style={{ lineHeight: 1.5 }}>
                                                            {readingPassageSummary.passageTitles.join(', ')}
                                                        </Text>
                                                    )}
                                                </Stack>
                                            )}
                                        </div>
                                    </Group>

                                    <Divider />

                                    <Grid style={isMobile ? mobileStyles.singleColumnGrid : undefined}>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="gray" variant="light" size="lg">
                                                    <IconCalendar size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Due Date</Text>
                                                    <Text fw={600}>{formatDate(homework.scheduling.dueDate)}</Text>
                                                </div>
                                            </Group>
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, sm: 6 }}>
                                            <Group gap="xs">
                                                <ThemeIcon color={timeInfo.color} variant="light" size="lg">
                                                    <IconClock size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Time Remaining</Text>
                                                    <Text fw={600} c={timeInfo.color}>{timeInfo.text}</Text>
                                                </div>
                                            </Group>
                                        </Grid.Col>
                                    </Grid>
                                </Stack>
                            </CardBody>
                        </Card>

                        {/* Configuration Info */}
                        <Card variant="default" hover={false} style={quietSurfaceStyle}>
                            <CardBody style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                                <Text fw={700} size="lg" mb="md" c={studentTokens.textPrimary}>Assignment Details</Text>
                                <Grid style={isMobile ? mobileStyles.singleColumnGrid : undefined}>
                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={quietInsetStyle}>
                                            <Group gap="xs">
                                                <ThemeIcon color="blue" variant="light" size="lg">
                                                    <IconClock size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Time Limit</Text>
                                                    <Text fw={600}>
                                                        {homework.config.timerMinutes
                                                            ? `${homework.config.timerMinutes} minutes`
                                                            : 'No time limit'}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={quietInsetStyle}>
                                            <Group gap="xs">
                                                <ThemeIcon color="violet" variant="light" size="lg">
                                                    <IconPlaylistAdd size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Attempts</Text>
                                                    <Text fw={600}>
                                                        {maxAttempts !== null
                                                            ? `${attemptsUsed} of ${maxAttempts} used`
                                                            : 'Unlimited attempts'}
                                                    </Text>
                                                    {attemptsRemaining !== null && attemptsRemaining > 0 && maxAttempts !== null && (
                                                        <Text size="xs" c="blue">{attemptsRemaining} remaining</Text>
                                                    )}
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={quietInsetStyle}>
                                            <Group gap="xs">
                                                <ThemeIcon color="teal" variant="light" size="lg">
                                                    <IconBook size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Questions</Text>
                                                    <Text fw={600}>
                                                        {material?.questions?.length || 'Loading...'} questions
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>

                                    <Grid.Col span={{ base: 12, sm: 6 }}>
                                        <div style={quietInsetStyle}>
                                            <Group gap="xs">
                                                <ThemeIcon color="orange" variant="light" size="lg">
                                                    {homework.config.feedbackTiming === 'never'
                                                        ? <IconEyeOff size={20} />
                                                        : <IconEye size={20} />}
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Feedback</Text>
                                                    <Text fw={600} size="sm">
                                                        {getFeedbackTimingDescription(homework.config.feedbackTiming)}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    </Grid.Col>
                                </Grid>
                            </CardBody>
                        </Card>

                        {/* Teacher Instructions */}
                        {homework.description && (
                            <Card variant="default" hover={false} style={quietSurfaceStyle}>
                                <CardBody>
                                    <Group gap="xs" mb="md">
                                        <ThemeIcon color="gray" variant="light">
                                            <IconInfoCircle size={20} />
                                        </ThemeIcon>
                                        <Text fw={700} size="lg" c={studentTokens.textPrimary}>Instructions</Text>
                                    </Group>
                                    <Text
                                        style={{
                                            whiteSpace: 'pre-wrap',
                                            fontSize: isMobile ? '0.938rem' : undefined,
                                            lineHeight: isMobile ? 1.6 : undefined,
                                        }}
                                        c={studentTokens.textBody}
                                    >
                                        {homework.description}
                                    </Text>
                                </CardBody>
                            </Card>
                        )}

                        {/* Attempt History */}
                        {completedSubmissions.length > 0 && (
                            <Card variant="default" hover={false} style={quietSurfaceStyle}>
                                <CardBody>
                                    <Group gap="xs" mb="md">
                                        <ThemeIcon color="gray" variant="light">
                                            <IconHistory size={20} />
                                        </ThemeIcon>
                                        <Text fw={700} size="lg" c={studentTokens.textPrimary}>Your Attempts</Text>
                                    </Group>

                                    <Timeline active={-1} bulletSize={24} lineWidth={2}>
                                        {completedSubmissions.map((submission) => (
                                            <Timeline.Item
                                                key={submission.id}
                                                bullet={
                                                    <ThemeIcon
                                                        size={24}
                                                        variant="filled"
                                                        color={submission.status === 'graded' ? 'green' : 'blue'}
                                                        radius="xl"
                                                    >
                                                        {submission.status === 'graded' ? <IconCheck size={14} /> : <IconClipboard size={14} />}
                                                    </ThemeIcon>
                                                }
                                                title={
                                                    <Group gap="xs" style={{ flexWrap: 'wrap' }}>
                                                        <Text fw={600}>Attempt {submission.attemptNumber}</Text>
                                                        {submission.isLate && (
                                                            <Badge color="orange" size="xs">Late</Badge>
                                                        )}
                                                    </Group>
                                                }
                                            >
                                                <Group
                                                    justify="space-between"
                                                    mt="xs"
                                                    style={{
                                                        flexDirection: isMobile ? 'column' : 'row',
                                                        alignItems: isMobile ? 'flex-start' : 'center',
                                                        gap: isMobile ? '0.75rem' : undefined,
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <Text size="sm" c="dimmed">
                                                            {new Date(submission.submittedAt || 0).toLocaleString()}
                                                        </Text>
                                                        {formatSubmissionOutcome(submission) && (
                                                            <Text size="lg" fw={700} c="blue">
                                                                {formatSubmissionOutcome(submission)}
                                                            </Text>
                                                        )}
                                                    </div>
                                                    {submission.resultId && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleViewResult(submission.resultId!)}
                                                            fullWidth={isMobile}
                                                            style={{
                                                                ...secondaryButtonStyle,
                                                                ...(isMobile ? { ...mobileStyles.touchTarget, width: '100%' } : {}),
                                                            }}
                                                        >
                                                            View Details
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Timeline.Item>
                                        ))}
                                    </Timeline>

                                    {bestSubmission && completedSubmissions.length > 1 && (
                                        <div style={{ ...quietInsetStyle, marginTop: '1rem' }}>
                                            <Group gap="xs">
                                                <ThemeIcon color="blue" variant="light">
                                                    <IconTrophy size={20} />
                                                </ThemeIcon>
                                                <div>
                                                    <Text size="sm" c="dimmed">Best Result</Text>
                                                    <Text fw={700} size="lg" c="blue">
                                                        {formatSubmissionOutcome(bestSubmission) || '--'}
                                                    </Text>
                                                </div>
                                            </Group>
                                        </div>
                                    )}
                                </CardBody>
                            </Card>
                        )}

                        {/* Alerts */}
                        {!isAvailable && homework.scheduling.availableFrom && (
                            <Alert icon={<IconInfoCircle size={16} />} color="blue">
                                This homework will be available starting {formatDate(homework.scheduling.availableFrom)}
                            </Alert>
                        )}

                        {isOverdue && !homework.config.lateSubmissionAllowed && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="red">
                                This homework is past due and no longer accepting submissions.
                            </Alert>
                        )}

                        {isOverdue && homework.config.lateSubmissionAllowed && canStartAttempt && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="orange">
                                This homework is past due. You can still submit, but it will be marked as late.
                            </Alert>
                        )}

                        {attemptsRemaining !== null && attemptsRemaining === 0 && (
                            <Alert icon={<IconX size={16} />} color="red">
                                You have used all available attempts for this homework.
                            </Alert>
                        )}

                        {/* Action Buttons */}
                        <Card variant="default" hover={false} style={quietSurfaceStyle}>
                            <CardBody style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                                <Group
                                    justify="center"
                                    style={{
                                        width: '100%',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        alignItems: isMobile ? 'stretch' : 'center',
                                    }}
                                >
                                    {hasInProgressAttempt ? (
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            leftSection={<IconPlayerPlay size={20} />}
                                            onClick={handleResume}
                                            style={{
                                                ...primaryActionButtonStyle,
                                                ...mobileFullWidthButtonStyle,
                                            }}
                                            fullWidth={isMobile}
                                        >
                                            Resume Attempt
                                        </Button>
                                    ) : canStartAttempt ? (
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            leftSection={<IconPlayerPlay size={20} />}
                                            onClick={handleStartClick}
                                            style={{
                                                ...primaryActionButtonStyle,
                                                ...mobileFullWidthButtonStyle,
                                            }}
                                            fullWidth={isMobile}
                                        >
                                            Start Homework
                                            {maxAttempts !== null && (
                                                <Badge ml="sm" color="white" variant="light">
                                                    Attempt {attemptsUsed + 1}
                                                </Badge>
                                            )}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="lg"
                                            disabled
                                            fullWidth={isMobile}
                                            style={{
                                                ...secondaryButtonStyle,
                                                ...mobileFullWidthButtonStyle,
                                            }}
                                        >
                                            {attemptsRemaining === 0
                                                ? 'No Attempts Remaining'
                                                : isOverdue
                                                    ? 'Homework Closed'
                                                    : 'Cannot Start'}
                                        </Button>
                                    )}
                                </Group>
                            </CardBody>
                        </Card>
                </Stack>
            </div>

            {/* Start Confirmation Modal */}
            <Modal
                opened={showStartModal}
                onClose={() => setShowStartModal(false)}
                title={<Text fw={700} size="lg">Start Homework?</Text>}
                shellStyle={isMobile ? { padding: 0, alignItems: 'stretch', justifyContent: 'stretch' } : undefined}
                contentStyle={
                    isMobile
                        ? {
                            width: '100%',
                            maxWidth: '100%',
                            height: '100dvh',
                            maxHeight: '100dvh',
                            borderRadius: 0,
                            padding: '1rem 1rem 0',
                            display: 'flex',
                            flexDirection: 'column',
                        }
                        : {
                            maxHeight: 'min(85vh, 720px)',
                            display: 'flex',
                            flexDirection: 'column',
                        }
                }
            >
                <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
                    <div
                        style={{
                            flex: 1,
                            overflowY: isMobile ? 'auto' : 'visible',
                            WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
                            paddingBottom: isMobile ? '1rem' : 0,
                        }}
                    >
                        <Stack gap="md">
                            <Text>
                                You are about to start <strong>{homework.title || homework.materialTitle}</strong>.
                            </Text>

                            <List size="sm" spacing="xs">
                                {homework.config.timerMinutes && (
                                    <List.Item icon={
                                        <ThemeIcon color="blue" size={20} radius="xl">
                                            <IconClock size={12} />
                                        </ThemeIcon>
                                    }>
                                        You will have <strong>{homework.config.timerMinutes} minutes</strong> to complete
                                    </List.Item>
                                )}
                                {maxAttempts !== null && (
                                    <List.Item icon={
                                        <ThemeIcon color="violet" size={20} radius="xl">
                                            <IconPlaylistAdd size={12} />
                                        </ThemeIcon>
                                    }>
                                        This will be attempt <strong>{attemptsUsed + 1} of {maxAttempts}</strong>
                                    </List.Item>
                                )}
                                {isOverdue && (
                                    <List.Item icon={
                                        <ThemeIcon color="orange" size={20} radius="xl">
                                            <IconAlertTriangle size={12} />
                                        </ThemeIcon>
                                    }>
                                        This submission will be marked as <strong>late</strong>
                                    </List.Item>
                                )}
                            </List>

                            {startError && (
                                <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                                    {startError}
                                </Alert>
                            )}
                        </Stack>
                    </div>

                    <Group
                        justify="flex-end"
                        mt="md"
                        style={{
                            position: isMobile ? 'sticky' : 'static',
                            bottom: isMobile ? 0 : undefined,
                            background: isMobile ? studentTokens.bgSurface : 'transparent',
                            paddingTop: '1rem',
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'stretch' : 'center',
                        }}
                    >
                        <Button
                            variant="outline"
                            onClick={() => setShowStartModal(false)}
                            fullWidth={isMobile}
                            style={{
                                ...secondaryButtonStyle,
                                ...(isMobile ? mobileStyles.fullWidthButton : {}),
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            leftSection={<IconPlayerPlay size={16} />}
                            onClick={handleConfirmStart}
                            loading={isStarting}
                            fullWidth={isMobile}
                            style={{
                                ...primaryActionButtonStyle,
                                ...(isMobile ? mobileStyles.fullWidthButton : { minHeight: 44 }),
                            }}
                        >
                            Start Now
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Animations */}
            <style>{`
                @keyframes studentSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
            {selectedResultId && (
                <DeferredResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => setSelectedResultId(null)}
                />
            )}
        </StudentLayout>
    );
};

export default StudentHomeworkDetailPage;
