/**
 * WritingMonitorCard — PRD-0030 Task 4.1
 * Teacher monitor card for a single student in a Writing session.
 * Shows per-task word counts, status badges, "Peek" button.
 * Subscribes to RTDB for real-time updates.
 * NO MANTINE.
 */

import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../../services/firebase';
import type { WritingTestFormat } from '../../types/ielts-writing.types';

interface WritingMonitorCardProps {
    sessionCode: string;
    studentUid: string;
    studentName: string;
    testFormat: WritingTestFormat;
    onPeek?: (studentUid: string) => void;
    onReopen?: (studentUid: string) => void;
}

interface WritingStudentData {
    task1?: { text: string; lastSavedAt: number };
    task2?: { text: string; lastSavedAt: number };
    activeTask?: number;
    submitted?: boolean;
    tabSwitches?: number;
}

export default function WritingMonitorCard({
    sessionCode,
    studentUid,
    studentName,
    testFormat,
    onPeek,
    onReopen,
}: WritingMonitorCardProps) {
    const [data, setData] = useState<WritingStudentData | null>(null);

    useEffect(() => {
        const writingRef = ref(
            database,
            `game_sessions/${sessionCode}/students/${studentUid}/writing`
        );
        const unsub = onValue(writingRef, (snap) => {
            setData(snap.exists() ? snap.val() : null);
        });
        return () => unsub();
    }, [sessionCode, studentUid]);

    const getWordCount = (text?: string) => {
        if (!text || !text.trim()) return 0;
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    };

    const isActive = () => {
        if (!data) return false;
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const t1Active = data.task1?.lastSavedAt && data.task1.lastSavedAt > fiveMinAgo;
        const t2Active = data.task2?.lastSavedAt && data.task2.lastSavedAt > fiveMinAgo;
        return t1Active || t2Active;
    };

    const task1Words = getWordCount(data?.task1?.text);
    const task2Words = getWordCount(data?.task2?.text);
    const active = isActive();
    const submitted = data?.submitted === true;

    return (
        <div
            style={{
                padding: '16px',
                background: '#fff',
                border: `1px solid ${submitted ? '#86efac' : active ? '#bfdbfe' : '#e2e8f0'}`,
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'border-color 0.2s ease',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
                        {studentName}
                    </span>
                    {submitted ? (
                        <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#dcfce7',
                            color: '#15803d',
                        }}>
                            ✅ Submitted
                        </span>
                    ) : active ? (
                        <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#dbeafe',
                            color: '#1d4ed8',
                        }}>
                            🟢 Active
                        </span>
                    ) : (
                        <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#64748b',
                        }}>
                            ⚪ Idle
                        </span>
                    )}
                </div>
                {onPeek && !submitted && (
                    <button
                        onClick={() => onPeek(studentUid)}
                        style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#64748b',
                        }}
                    >
                        👁️ Peek
                    </button>
                )}
                {onReopen && submitted && (
                    <button
                        onClick={() => onReopen(studentUid)}
                        style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            border: '1px solid #93c5fd',
                            background: '#eff6ff',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#2563eb',
                            fontWeight: 500,
                        }}
                    >
                        🔄 Reopen
                    </button>
                )}
            </div>

            {/* Word Counts */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {(testFormat === 'full-test' || testFormat === 'task1-only') && (
                    <div style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: data?.activeTask === 1 ? '#eff6ff' : '#f8fafc',
                        fontSize: '13px',
                    }}>
                        <div style={{ color: '#64748b', fontSize: '11px', marginBottom: 2 }}>Task 1</div>
                        <strong style={{ color: task1Words < 150 ? '#f59e0b' : '#10b981' }}>
                            {task1Words} words
                        </strong>
                    </div>
                )}
                {(testFormat === 'full-test' || testFormat === 'task2-only') && (
                    <div style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: data?.activeTask === 2 ? '#eff6ff' : '#f8fafc',
                        fontSize: '13px',
                    }}>
                        <div style={{ color: '#64748b', fontSize: '11px', marginBottom: 2 }}>Task 2</div>
                        <strong style={{ color: task2Words < 250 ? '#f59e0b' : '#10b981' }}>
                            {task2Words} words
                        </strong>
                    </div>
                )}
            </div>

            {/* Tab switches */}
            {(data?.tabSwitches ?? 0) > 0 && (
                <div style={{ fontSize: '12px', color: '#f59e0b' }}>
                    ⚠️ {data?.tabSwitches} tab switch{(data?.tabSwitches ?? 0) > 1 ? 'es' : ''}
                </div>
            )}
        </div>
    );
}
