/**
 * WritingPeekModal — PRD-0030 Task 4.2
 * Read-only view of a student's essay in real-time via RTDB.
 * Tabs per test format.
 * NO MANTINE.
 */

import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import type { WritingTestFormat } from '../../types/ielts-writing.types';

interface WritingPeekModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionCode: string;
    studentUid: string;
    studentName: string;
    testFormat: WritingTestFormat;
}

export default function WritingPeekModal({
    isOpen,
    onClose,
    sessionCode,
    studentUid,
    studentName,
    testFormat,
}: WritingPeekModalProps) {
    const [task1Text, setTask1Text] = useState('');
    const [task2Text, setTask2Text] = useState('');
    const [activeTab, setActiveTab] = useState<1 | 2>(testFormat === 'task2-only' ? 2 : 1);

    useEffect(() => {
        if (!isOpen) return;

        const writingRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentUid}/writing`
        );
        const unsub = onValue(writingRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setTask1Text(data.task1?.text || '');
                setTask2Text(data.task2?.text || '');
            }
        });
        return () => unsub();
    }, [isOpen, sessionCode, studentUid]);

    if (!isOpen) return null;

    const showTask1 = testFormat !== 'task2-only';
    const showTask2 = testFormat !== 'task1-only';
    const currentText = activeTab === 1 ? task1Text : task2Text;
    const wordCount = currentText.trim()
        ? currentText.trim().split(/\s+/).filter(w => w.length > 0).length
        : 0;

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: '16px',
                    maxWidth: '700px',
                    width: '90%',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                            👁️ {studentName}'s Essay
                        </h2>
                        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
                            Read-only view — updates in real-time
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: '20px',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '4px 8px',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                {showTask1 && showTask2 && (
                    <div style={{ display: 'flex', padding: '12px 24px 0', gap: '0' }}>
                        <button
                            onClick={() => setActiveTab(1)}
                            style={{
                                padding: '8px 20px',
                                border: 'none',
                                background: 'transparent',
                                borderBottom: `2px solid ${activeTab === 1 ? '#3b82f6' : 'transparent'}`,
                                color: activeTab === 1 ? '#3b82f6' : '#64748b',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            Task 1
                        </button>
                        <button
                            onClick={() => setActiveTab(2)}
                            style={{
                                padding: '8px 20px',
                                border: 'none',
                                background: 'transparent',
                                borderBottom: `2px solid ${activeTab === 2 ? '#3b82f6' : 'transparent'}`,
                                color: activeTab === 2 ? '#3b82f6' : '#64748b',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            Task 2
                        </button>
                    </div>
                )}

                {/* Essay Content */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: '20px 24px',
                }}>
                    {currentText ? (
                        <div style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: '15px',
                            lineHeight: 1.8,
                            color: '#1e293b',
                            whiteSpace: 'pre-wrap',
                        }}>
                            {currentText}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center',
                            color: '#94a3b8',
                            padding: '40px 0',
                        }}>
                            No content yet
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 24px',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: wordCount < 150 ? '#f59e0b' : '#10b981',
                        padding: '4px 12px',
                        background: wordCount < 150 ? '#fffbeb' : '#f0fdf4',
                        borderRadius: '16px',
                    }}>
                        {wordCount} words
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#475569',
                        }}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
