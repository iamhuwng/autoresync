/**
 * WritingResultDetailModal — PRD-0030 Task 6.4
 * Teacher-facing modal for viewing a graded writing submission.
 * Shows: CriteriaScoreChart, overall band, per-task table,
 * AnnotatedEssayReadOnly, feedback, GradingAuditTrail.
 * "Edit Grades" → navigate to grading page.
 * NO MANTINE.
 */

import { useNavigate } from 'react-router-dom';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import CriteriaScoreChart from './CriteriaScoreChart';
import AnnotatedEssayReadOnly from './AnnotatedEssayReadOnly';
import GradingAuditTrail from '../writing-grading/GradingAuditTrail';

interface WritingResultDetailModalProps {
    submission: WritingSubmission;
    onClose: () => void;
}

const CRITERIA_LABELS: Record<string, string> = {
    TA: 'Task Achievement',
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GRA: 'Grammatical Range',
};

export default function WritingResultDetailModal({
    submission,
    onClose,
}: WritingResultDetailModalProps) {
    const navigate = useNavigate();
    const { grading, tasks, annotations, auditTrail } = submission;

    const handleEditGrades = () => {
        onClose();
        navigate(`/teacher/grading/writing/${submission.id}`);
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
        >
            {/* Backdrop */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(4px)',
            }} />

            {/* Modal */}
            <div
                style={{
                    position: 'relative',
                    width: '90%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: '#fff',
                    borderRadius: '16px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
                    padding: '2rem',
                    fontFamily: "'Inter', sans-serif",
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: '1.5rem',
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                            {submission.studentName}
                        </h2>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                            {submission.testMeta.testTitle} • {submission.testMeta.format.toUpperCase()}
                            {' • '}
                            {new Date(submission.submittedAt).toLocaleDateString()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleEditGrades}
                            style={{
                                padding: '6px 14px', borderRadius: '8px',
                                border: '1px solid #3b82f6', background: '#eff6ff',
                                color: '#1d4ed8', fontSize: '0.8rem',
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            ✏️ Edit Grades
                        </button>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '6px 12px', borderRadius: '8px',
                                border: '1px solid #e2e8f0', background: '#f8fafc',
                                color: '#64748b', fontSize: '0.85rem',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Overall Band */}
                {grading && (
                    <div style={{
                        textAlign: 'center',
                        padding: '1.25rem',
                        background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                        borderRadius: '12px',
                        marginBottom: '1.5rem',
                        border: '1px solid #e0f2fe',
                    }}>
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 600, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                            Overall Band
                        </div>
                        <div style={{
                            fontSize: '3rem', fontWeight: 900,
                            background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            lineHeight: 1.1,
                        }}>
                            {grading.overallBand.toFixed(1)}
                        </div>
                    </div>
                )}

                {/* Per-task band table */}
                {grading && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <table style={{
                            width: '100%', borderCollapse: 'collapse',
                            fontSize: '0.8rem',
                        }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#64748b' }}>Task</th>
                                    {Object.keys(CRITERIA_LABELS).map(k => (
                                        <th key={k} style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>
                                            {k}
                                        </th>
                                    ))}
                                    <th style={{ padding: '8px', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                                        Band
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {grading.perTask.map(t => (
                                    <tr key={t.taskNumber} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px', fontWeight: 600 }}>
                                            Task {t.taskNumber}
                                            {t.isVoided && (
                                                <span style={{
                                                    marginLeft: '6px', fontSize: '0.65rem',
                                                    color: '#dc2626', fontStyle: 'italic',
                                                }}>
                                                    (Voided)
                                                </span>
                                            )}
                                        </td>
                                        {Object.keys(CRITERIA_LABELS).map(k => {
                                            const val = (t.criteriaScores as Record<string, number | undefined>)[k];
                                            return (
                                                <td key={k} style={{ padding: '8px', textAlign: 'center', color: t.isVoided ? '#cbd5e1' : '#1e293b' }}>
                                                    {val !== undefined ? val : '—'}
                                                </td>
                                            );
                                        })}
                                        <td style={{
                                            padding: '8px', textAlign: 'center',
                                            fontWeight: 700, color: t.isVoided ? '#cbd5e1' : '#1d4ed8',
                                        }}>
                                            {t.isVoided ? '—' : t.taskBand}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Criteria Chart */}
                {grading && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <CriteriaScoreChart perTask={grading.perTask} />
                    </div>
                )}

                {/* Annotated essays */}
                {tasks.map(task => {
                    const taskAnnotations = annotations.filter(a => a.taskNumber === task.taskNumber);
                    return (
                        <div key={task.taskNumber} style={{ marginBottom: '1.5rem' }}>
                            <div style={{
                                fontSize: '0.85rem', fontWeight: 700,
                                color: '#475569', marginBottom: '0.5rem',
                            }}>
                                Task {task.taskNumber} — Essay ({task.wordCount} words)
                            </div>
                            <AnnotatedEssayReadOnly
                                essayText={task.essayText}
                                annotations={taskAnnotations}
                            />
                        </div>
                    );
                })}

                {/* Feedback */}
                {grading?.feedback?.overall && (
                    <div style={{
                        padding: '1rem', borderRadius: '10px',
                        border: '1px solid #e2e8f0', background: '#f8fafc',
                        marginBottom: '1.25rem',
                    }}>
                        <div style={{
                            fontSize: '0.8rem', fontWeight: 700,
                            color: '#475569', marginBottom: '0.5rem',
                        }}>
                            📝 Overall Feedback
                        </div>
                        <div
                            style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#334155' }}
                            dangerouslySetInnerHTML={{ __html: grading.feedback.overall }}
                        />
                    </div>
                )}

                {/* Audit Trail */}
                {auditTrail && auditTrail.length > 0 && (
                    <GradingAuditTrail entries={auditTrail} />
                )}
            </div>
        </div>
    );
}
