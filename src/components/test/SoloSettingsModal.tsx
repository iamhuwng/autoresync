import React, { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/modern/Button';
import type { ResolvedPracticeSettings, StudentSoloPreferences } from '../../types/practice.types';

interface SoloSettingsModalProps {
    opened: boolean;
    onClose: () => void;
    testSkill: 'Reading' | 'Listening' | string;
    resolvedSettings: ResolvedPracticeSettings;
    studentPrefs: StudentSoloPreferences;
    onPrefsChange: (prefs: StudentSoloPreferences) => void;
    onExit?: () => void;
}

const SPEED_OPTIONS = ['0.75', '1.0', '1.25', '1.5', '2.0'] as const;

export const SoloSettingsModal: React.FC<SoloSettingsModalProps> = ({
    opened,
    onClose,
    testSkill,
    resolvedSettings,
    studentPrefs,
    onPrefsChange,
    onExit,
}) => {
    const titleId = useId();
    const speedSelectId = useId();
    const fontSizeId = useId();
    const lineSpacingId = useId();
    const [localPrefs, setLocalPrefs] = useState<StudentSoloPreferences>(studentPrefs);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setLocalPrefs(studentPrefs);
    }, [studentPrefs, opened]);

    useEffect(() => {
        if (!opened) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [opened, onClose]);

    if (!opened) return null;

    const handleSave = () => {
        onPrefsChange(localPrefs);
        onClose();
    };

    const updatePref = <K extends keyof StudentSoloPreferences>(key: K, value: StudentSoloPreferences[K]) => {
        setLocalPrefs((prev) => ({ ...prev, [key]: value }));
    };

    const isTimerLocked = resolvedSettings._sources?.['reading.showTimer'] !== undefined
        && resolvedSettings._sources?.['reading.showTimer'] !== 'material_owner_default';
    const isReplayLocked = !resolvedSettings.listening.allowReplay;
    const isSpeedLocked = !resolvedSettings.listening.allowSpeedControl;
    const isSkipLocked = !resolvedSettings.listening.allowSkipSection;
    const isPauseAudioLocked = !resolvedSettings.listening.allowPauseAudio;

    const normalizedTestSkill = testSkill.trim().toLowerCase();
    const showReading = normalizedTestSkill === 'reading';
    const showListening = normalizedTestSkill === 'listening';

    const badgeStyle = (allowed: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        background: allowed ? '#e8f7ee' : '#fef3c7',
        color: allowed ? '#166534' : '#92400e',
    });

    const rowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid #e2e8f0',
    };

    return (
        <div
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                background: 'rgba(15, 23, 42, 0.45)',
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                style={{
                    width: '100%',
                    maxWidth: 460,
                    maxHeight: '90dvh',
                    overflowY: 'auto',
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.2)',
                    color: '#0f172a',
                    display: 'grid',
                    gap: 20,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Practice Settings</h2>
                    <button
                        type="button"
                        aria-label="Close settings"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#64748b',
                            fontSize: 20,
                            lineHeight: 1,
                            cursor: 'pointer',
                            padding: 4,
                        }}
                    >
                        ×
                    </button>
                </div>

                {showReading && (
                    <section style={{ display: 'grid', gap: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>Reading &amp; Display</h3>

                        <label htmlFor={fontSizeId} style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 500 }}>
                            <span>Font Size ({localPrefs.fontSize}px)</span>
                            <input
                                id={fontSizeId}
                                type="range"
                                min={12}
                                max={24}
                                step={1}
                                value={localPrefs.fontSize}
                                onChange={(event) => updatePref('fontSize', Number(event.currentTarget.value))}
                            />
                        </label>

                        <label htmlFor={lineSpacingId} style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 500 }}>
                            <span>Line Spacing ({localPrefs.lineSpacing})</span>
                            <input
                                id={lineSpacingId}
                                type="range"
                                min={1.0}
                                max={2.5}
                                step={0.1}
                                value={localPrefs.lineSpacing}
                                onChange={(event) => updatePref('lineSpacing', Number(event.currentTarget.value))}
                            />
                        </label>

                        <label style={rowStyle}>
                            <span>
                                <strong style={{ display: 'block', fontSize: 14 }}>Highlighter Tool</strong>
                                <span style={{ fontSize: 12, color: '#64748b' }}>Enable text highlighting on passages</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={localPrefs.highlighterEnabled}
                                onChange={(event) => updatePref('highlighterEnabled', event.currentTarget.checked)}
                            />
                        </label>

                        <label style={rowStyle} title={isTimerLocked ? 'Set by teacher' : undefined}>
                            <span>
                                <strong style={{ display: 'block', fontSize: 14, color: isTimerLocked ? '#64748b' : undefined }}>Show Timer</strong>
                                <span style={{ fontSize: 12, color: '#64748b' }}>
                                    Display the countdown clock{isTimerLocked ? ' · Locked by teacher' : ''}
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                checked={localPrefs.showTimer}
                                disabled={isTimerLocked}
                                onChange={(event) => updatePref('showTimer', event.currentTarget.checked)}
                            />
                        </label>

                        <label style={{ ...rowStyle, borderBottom: 'none' }}>
                            <span>
                                <strong style={{ display: 'block', fontSize: 14 }}>Dark Mode</strong>
                                <span style={{ fontSize: 12, color: '#64748b' }}>Use dark theme for reading</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={localPrefs.darkMode}
                                onChange={(event) => updatePref('darkMode', event.currentTarget.checked)}
                            />
                        </label>
                    </section>
                )}

                {showListening && (
                    <section style={{ display: 'grid', gap: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>Listening Audio</h3>

                        <label htmlFor={speedSelectId} style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>Audio Speed</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                                {isSpeedLocked ? 'Speed control disabled by teacher' : 'Adjust playback speed'}
                            </span>
                            <select
                                id={speedSelectId}
                                value={localPrefs.audioSpeed.toFixed(localPrefs.audioSpeed % 1 === 0 ? 1 : localPrefs.audioSpeed === 0.75 || localPrefs.audioSpeed === 1.25 ? 2 : 1)}
                                disabled={isSpeedLocked}
                                onChange={(event) => updatePref('audioSpeed', parseFloat(event.currentTarget.value) || 1.0)}
                                style={{
                                    width: '100%',
                                    height: 38,
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    border: '1px solid #cbd5e1',
                                    background: isSpeedLocked ? '#f1f5f9' : '#fff',
                                    color: '#0f172a',
                                    fontSize: 14,
                                }}
                            >
                                {SPEED_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}x</option>
                                ))}
                            </select>
                        </label>

                        <div style={rowStyle}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>Replay Audio</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                    Allow replaying audio sections
                                    {!isReplayLocked && resolvedSettings.listening.maxReplays != null
                                        ? ` (max ${resolvedSettings.listening.maxReplays})`
                                        : ''}
                                </div>
                            </div>
                            <span style={badgeStyle(!isReplayLocked)}>
                                {isReplayLocked ? 'Locked by teacher' : 'Allowed'}
                            </span>
                        </div>

                        <div style={rowStyle}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>Skip to Section</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>Jump between audio sections</div>
                            </div>
                            <span style={badgeStyle(!isSkipLocked)}>
                                {isSkipLocked ? 'Locked by teacher' : 'Allowed'}
                            </span>
                        </div>

                        <div style={{ ...rowStyle, borderBottom: 'none' }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>Pause Audio</div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>Pause during playback</div>
                            </div>
                            <span style={badgeStyle(!isPauseAudioLocked)}>
                                {isPauseAudioLocked ? 'Locked by teacher' : 'Allowed'}
                            </span>
                        </div>
                    </section>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: onExit ? 'space-between' : 'flex-end', gap: 12, paddingTop: 4 }}>
                    {onExit && (
                        <Button type="button" variant="outline" size="sm" onClick={onExit} style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>
                            Exit
                        </Button>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                        <Button type="button" size="sm" onClick={handleSave}>Save Settings</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
