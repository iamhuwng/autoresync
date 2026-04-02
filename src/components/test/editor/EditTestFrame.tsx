import React, { useState, useEffect } from 'react';
import { Text, Group, ActionIcon, Badge } from '@mantine/core';
import { Button, Card } from '../../modern';
import { IconDeviceFloppy, IconX, IconSettings, IconList, IconFiles, IconKey } from '@tabler/icons-react';

export type EditorTab = 'questions' | 'context' | 'answerKey' | 'settings';

export interface EditTestFrameProps {
    title: string;
    onTitleChange: (title: string) => void;
    activeTab: EditorTab;
    onTabChange: (tab: EditorTab) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving: boolean;
    children?: React.ReactNode;
    saveLabel?: string;
    extraActions?: React.ReactNode;

    // Optional stats or badges
    questionCount?: number;
    resourceCount?: number;

    // Timer settings (test duration)
    duration?: number;
    onDurationChange?: (minutes: number) => void;

    // Bulk timer actions (for settings tab)
    onBulkSetTimer?: (seconds: number) => void;

    // Visibility
    isPublic?: boolean;
    onIsPublicChange?: (isPublic: boolean) => void;

    // Solo Practice (PRD-0025)
    onOpenPracticeSettings?: () => void;

    // Ownership — when true, all edit controls are disabled
    readOnly?: boolean;

    // Optional: hide specific tabs (e.g. THCS hides 'answerKey')
    hiddenTabs?: EditorTab[];
}

export const EditTestFrame: React.FC<EditTestFrameProps> = ({
    title,
    onTitleChange,
    activeTab,
    onTabChange,
    onSave,
    onCancel,
    isSaving,
    children,
    questionCount = 0,
    resourceCount = 0,
    duration = 0,
    onDurationChange,
    onBulkSetTimer,
    isPublic = false,
    onIsPublicChange,
    onOpenPracticeSettings,
    readOnly = false,
    hiddenTabs = [],
    saveLabel = 'Save Test',
    extraActions,
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState(title);
    const [tempDuration, setTempDuration] = useState(duration);
    const [bulkTimerValue, setBulkTimerValue] = useState(30);

    useEffect(() => {
        setTempTitle(title);
    }, [title]);

    useEffect(() => {
        setTempDuration(duration);
    }, [duration]);

    const handleTitleSave = () => {
        if (tempTitle.trim()) {
            onTitleChange(tempTitle);
        } else {
            setTempTitle(title); // Revert if empty
        }
        setIsEditingTitle(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleTitleSave();
        if (e.key === 'Escape') {
            setTempTitle(title);
            setIsEditingTitle(false);
        }
    };

    const handleDurationBlur = () => {
        if (onDurationChange && tempDuration >= 0) {
            onDurationChange(tempDuration);
        } else {
            setTempDuration(duration);
        }
    };

    const renderSettingsTab = () => (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <Text size="xl" fw={700} mb="lg">Test Settings</Text>

            <div style={{ marginBottom: '2rem' }}>
                <Text fw={600} mb="xs">Visibility</Text>
                <div style={{
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(0,0,0,0.1)',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: readOnly ? 0.65 : 1,
                }}>
                    <div>
                        <Text size="sm" fw={600}>Public Test</Text>
                        <Text size="xs" c="dimmed">
                            {readOnly
                                ? 'Only the test owner can change this setting'
                                : 'Allow other teachers to see and use this test'}
                        </Text>
                    </div>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: readOnly ? 'not-allowed' : 'pointer',
                    }}>
                        <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => !readOnly && onIsPublicChange && onIsPublicChange(e.target.checked)}
                            disabled={readOnly}
                            style={{
                                width: '1.25rem',
                                height: '1.25rem',
                                cursor: readOnly ? 'not-allowed' : 'pointer',
                                accentColor: '#8b5cf6',
                            }}
                        />
                    </label>
                </div>

                <Text fw={600} mb="xs">Bulk Actions</Text>
                <div style={{
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(0,0,0,0.1)',
                    marginBottom: '1rem',
                    opacity: readOnly ? 0.65 : 1,
                }}>
                    <Text size="sm" mb="xs">Set timer for all questions</Text>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <input
                            type="number"
                            value={bulkTimerValue || 30}
                            onChange={(e) => setBulkTimerValue(parseInt(e.target.value) || 0)}
                            disabled={readOnly}
                            style={{ padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #ccc', width: '100px', cursor: readOnly ? 'not-allowed' : undefined }}
                        />
                        <Button
                            variant="glass"
                            disabled={readOnly || !onBulkSetTimer}
                            onClick={() => !readOnly && onBulkSetTimer && onBulkSetTimer(bulkTimerValue || 30)}
                        >
                            Apply to All
                        </Button>
                    </div>
                </div>

                <Text fw={600} mb="xs">Solo Practice Options (PRD-0025)</Text>
                <div style={{
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(0,0,0,0.1)',
                    opacity: readOnly ? 0.65 : 1,
                }}>
                    <Text size="sm" mb="xs">Configure how this test behaves when students take it solo.</Text>
                    <Button
                        variant="glass"
                        disabled={readOnly || !onOpenPracticeSettings}
                        onClick={() => !readOnly && onOpenPracticeSettings && onOpenPracticeSettings()}
                    >
                        Configure Solo Practice Rules...
                    </Button>
                </div>
            </div>
        </div>
    );

    return (
        <Card
            variant="glass"
            style={{
                width: '75vw',     // Proportional to screen — stable across tabs
                maxWidth: '1200px', // Cap for ultra-wide monitors
                height: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 253, 250, 0.95) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)'
            }}
        >
            {/* Read-Only Banner */}
            {readOnly && (
                <div style={{
                    padding: '0.6rem 1.5rem',
                    background: 'linear-gradient(90deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.08) 100%)',
                    borderBottom: '1px solid rgba(245,158,11,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: '1rem' }}>🔒</span>
                    <Text size="sm" fw={600} style={{ color: '#92400e' }}>
                        View Only — This test belongs to another teacher. You can browse but not edit.
                    </Text>
                </div>
            )}

            {/* Header Section */}
            <div style={{
                padding: '1rem 1.5rem',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
            }}>
                {/* Left: Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    {isEditingTitle && !readOnly ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                value={tempTitle}
                                onChange={(e) => setTempTitle(e.target.value)}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.375rem',
                                    border: '1px solid #8b5cf6',
                                    outline: 'none',
                                    color: '#1e293b'
                                }}
                            />
                            <ActionIcon size="sm" variant="filled" color="violet" onClick={handleTitleSave}>
                                <IconDeviceFloppy size={16} />
                            </ActionIcon>
                        </div>
                    ) : (
                        <div
                            onClick={() => !readOnly && setIsEditingTitle(true)}
                            style={{
                                cursor: readOnly ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Text size="xl" fw={700} style={{ color: '#1e293b' }}>{title}</Text>
                            {!readOnly && (
                                <Badge variant="light" color="gray" size="sm">Click to edit</Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* Center: Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '2rem' }}>
                    <Text size="sm" fw={600} c="dimmed">Duration:</Text>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                            type="number"
                            value={tempDuration}
                            onChange={(e) => setTempDuration(parseInt(e.target.value) || 0)}
                            onBlur={handleDurationBlur}
                            disabled={readOnly}
                            style={{
                                width: '60px',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                textAlign: 'center',
                                fontWeight: 600,
                                backgroundColor: 'rgba(255,255,255,0.5)',
                                cursor: readOnly ? 'not-allowed' : undefined,
                            }}
                        />
                        <Text size="xs" c="dimmed" style={{ marginLeft: '0.25rem' }}>min</Text>
                    </div>
                </div>

                {/* Right: Actions */}
                <Group>
                    {extraActions}
                    {readOnly ? (
                        <Button
                            variant="glass"
                            disabled
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        >
                            View Only
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            icon={<IconDeviceFloppy size={18} />}
                            loading={isSaving}
                            onClick={onSave}
                        >
                            {saveLabel}
                        </Button>
                    )}
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        onClick={onCancel}
                    >
                        <IconX size={24} />
                    </ActionIcon>
                </Group>
            </div>

            {/* Tabs / Toolbar */}
            <div style={{
                padding: '0.5rem 1.5rem',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                background: 'rgba(255,255,255,0.5)',
                display: 'flex',
                gap: '2rem'
            }}>
                <TabButton
                    active={activeTab === 'questions'}
                    onClick={() => onTabChange('questions')}
                    icon={<IconList size={18} />}
                    label="Questions"
                    badge={questionCount}
                />
                <TabButton
                    active={activeTab === 'context'}
                    onClick={() => onTabChange('context')}
                    icon={<IconFiles size={18} />}
                    label="Context & Resources"
                    badge={resourceCount}
                />
                {!hiddenTabs.includes('answerKey') && (
                    <TabButton
                        active={activeTab === 'answerKey'}
                        onClick={() => onTabChange('answerKey')}
                        icon={<IconKey size={18} />}
                        label="Answer Key"
                    />
                )}
                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {!hiddenTabs.includes('settings') && (
                    <TabButton
                        active={activeTab === 'settings'}
                        onClick={() => onTabChange('settings')}
                        icon={<IconSettings size={18} />}
                        label="Settings"
                    />
                )}
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                {activeTab === 'settings' && !hiddenTabs.includes('settings') ? renderSettingsTab() : children}
            </div>
        </Card>
    );
};

// Helper Subfolder
interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: number;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label, badge }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0',
            background: 'transparent',
            border: 'none',
            borderBottom: active ? '2px solid #8b5cf6' : '2px solid transparent',
            color: active ? '#8b5cf6' : '#64748b',
            fontWeight: active ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
        }}
    >
        {icon}
        <span>{label}</span>
        {badge !== undefined && (
            <Badge size="xs" variant={active ? "filled" : "light"} color={active ? "violet" : "gray"}>
                {badge}
            </Badge>
        )}
    </button>
);
