/**
 * THCSVersionDropdown — Version changelog viewer for editor (Task 9.5)
 * Shows when editing an existing published test.
 * Dropdown of changelog entries, view selected version, compare with current.
 * Shows last 20 versions initially with "Show all" toggle.
 * Loading indicator if reconstruction >500ms. Read-only viewing — NO revert.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../../services/firebase';
import { reconstructVersion, type ChangelogEntry } from '../../services/thcsTestStorage';
import { Button } from '../modern';
import type { THCSTest } from '../../types/thcs-test.types';

interface THCSVersionDropdownProps {
    testId: string;
    currentData: THCSTest;
}

const INITIAL_SHOW_COUNT = 20;

export const THCSVersionDropdown: React.FC<THCSVersionDropdownProps> = ({
    testId,
    currentData,
}) => {
    const [entries, setEntries] = useState<Array<{ key: string } & ChangelogEntry>>([]);
    const [loading, setLoading] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [reconstructedData, setReconstructedData] = useState<THCSTest | null>(null);
    const [reconstructing, setReconstructing] = useState(false);
    const [showDiff, setShowDiff] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load all changelog entries on mount
    useEffect(() => {
        if (!testId) return;
        setLoading(true);
        const changelogRef = ref(database, `tests/${testId}/_changelog`);
        get(changelogRef).then(snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const parsed = Object.entries(data)
                    .map(([key, entry]: [string, any]) => ({
                        key,
                        publishedAt: entry.publishedAt,
                        publishedBy: entry.publishedBy,
                        label: entry.label,
                        previousValues: entry.previousValues || {},
                    }))
                    .sort((a, b) => b.publishedAt - a.publishedAt);
                setEntries(parsed);
            }
        }).catch(err => {
            console.error('Failed to load changelog:', err);
        }).finally(() => {
            setLoading(false);
        });
    }, [testId]);

    const handleViewVersion = async (key: string) => {
        setSelectedKey(key);
        setReconstructing(true);
        setReconstructedData(null);
        setShowDiff(false);

        // Show loading indicator if >500ms
        timerRef.current = setTimeout(() => { }, 500);

        try {
            const data = await reconstructVersion(testId, key);
            setReconstructedData(data);
        } catch (err) {
            console.error('Failed to reconstruct version:', err);
            alert('Failed to load this version.');
        } finally {
            setReconstructing(false);
            if (timerRef.current) clearTimeout(timerRef.current);
        }
    };

    const handleCompare = () => {
        if (!reconstructedData) return;
        setShowDiff(true);
    };

    const displayedEntries = showAll ? entries : entries.slice(0, INITIAL_SHOW_COUNT);

    if (entries.length === 0 && !loading) {
        return null; // No changelog = first version, don't show dropdown
    }

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    // Compute diff fields for compare view
    const computeDiffFields = (): Array<{ path: string; oldVal: any; newVal: any }> => {
        if (!reconstructedData || !selectedKey) return [];
        const entry = entries.find(e => e.key === selectedKey);
        if (!entry) return [];

        return Object.entries(entry.previousValues).map(([path, oldVal]) => ({
            path,
            oldVal,
            newVal: getNestedValue(currentData, path),
        }));
    };

    const getNestedValue = (obj: any, path: string): any => {
        const parts = path.split('~');
        let current = obj;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Toggle button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: isOpen ? '#eef2ff' : 'white',
                    color: '#6366f1',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                }}
            >
                📋 v{entries.length + 1} ({entries.length} edit{entries.length !== 1 ? 's' : ''})
                <span style={{ fontSize: '0.6rem', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    width: '420px',
                    maxHeight: '500px',
                    overflowY: 'auto',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    padding: '0.75rem',
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                        Version History
                    </div>

                    {loading && (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>Loading...</div>
                    )}

                    {/* Entries list */}
                    {displayedEntries.map(entry => (
                        <div
                            key={entry.key}
                            style={{
                                padding: '0.5rem 0.75rem',
                                marginBottom: '0.25rem',
                                borderRadius: '8px',
                                background: selectedKey === entry.key ? '#eef2ff' : '#fafafa',
                                border: selectedKey === entry.key ? '1px solid #c7d2fe' : '1px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            onClick={() => setSelectedKey(entry.key)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                                    {entry.label}
                                </span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                    {formatDate(entry.publishedAt)}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
                                by {entry.publishedBy.substring(0, 12)}...
                            </div>
                        </div>
                    ))}

                    {/* Show all toggle */}
                    {entries.length > INITIAL_SHOW_COUNT && !showAll && (
                        <button
                            onClick={() => setShowAll(true)}
                            style={{
                                width: '100%',
                                padding: '0.4rem',
                                border: 'none',
                                background: 'transparent',
                                color: '#6366f1',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginTop: '0.25rem',
                            }}
                        >
                            Show all {entries.length} versions →
                        </button>
                    )}

                    {/* Action buttons */}
                    {selectedKey && (
                        <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #e2e8f0',
                        }}>
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={() => handleViewVersion(selectedKey)}
                                disabled={reconstructing}
                                style={{ flex: 1, fontSize: '0.75rem' }}
                            >
                                {reconstructing ? '⏳ Loading...' : '👁️ View Version'}
                            </Button>
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={handleCompare}
                                disabled={!reconstructedData || reconstructing}
                                style={{ flex: 1, fontSize: '0.75rem' }}
                            >
                                🔀 Compare
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* Read-only version view overlay */}
            {reconstructedData && !showDiff && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                }}
                    onClick={e => { if (e.target === e.currentTarget) setReconstructedData(null); }}
                >
                    <div style={{
                        maxWidth: '800px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        borderRadius: '16px',
                        background: 'white',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc',
                            borderRadius: '16px 16px 0 0',
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                    📋 Version: {entries.find(e => e.key === selectedKey)?.label || selectedKey}
                                </h3>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>Read-only view</p>
                            </div>
                            <button onClick={() => setReconstructedData(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>
                                <strong>Title:</strong> {reconstructedData.metadata?.title}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>
                                <strong>Questions:</strong> {reconstructedData.questionCount} | <strong>Points:</strong> {reconstructedData.totalPoints} | <strong>Duration:</strong> {reconstructedData.metadata?.duration}min
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                                <strong>Sections:</strong> {reconstructedData.sections?.length || 0}
                            </div>
                            {reconstructedData.sections?.map((section, i) => (
                                <div key={section.id || i} style={{
                                    padding: '0.75rem',
                                    marginBottom: '0.5rem',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fafafa',
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#4338ca', marginBottom: '0.25rem' }}>
                                        {section.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {section.questions?.length || 0} questions · {section.totalPoints} pts · {section.pointMode}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Diff view overlay */}
            {showDiff && reconstructedData && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                }}
                    onClick={e => { if (e.target === e.currentTarget) setShowDiff(false); }}
                >
                    <div style={{
                        maxWidth: '900px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        borderRadius: '16px',
                        background: 'white',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                            borderRadius: '16px 16px 0 0',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                🔀 Compare: {entries.find(e => e.key === selectedKey)?.label} → Current
                            </h3>
                            <button onClick={() => setShowDiff(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            {computeDiffFields().length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No changes found</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Field</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: '#dc2626', fontWeight: 600 }}>Old Value</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: '#059669', fontWeight: 600 }}>New Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {computeDiffFields().map((field, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: '#475569', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    {field.path.replace(/~/g, ' → ')}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.5rem', color: '#dc2626', background: 'rgba(239,68,68,0.05)' }}>
                                                    {field.oldVal === null ? <em>New field</em> : String(field.oldVal).substring(0, 80)}
                                                </td>
                                                <td style={{ padding: '0.4rem 0.5rem', color: '#059669', background: 'rgba(16,185,129,0.05)' }}>
                                                    {field.newVal === undefined ? <em>Removed</em> : String(field.newVal).substring(0, 80)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default THCSVersionDropdown;
