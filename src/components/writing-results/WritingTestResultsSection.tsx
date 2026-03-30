import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigation } from '../../hooks/useNavigation';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { getSubmission } from '../../services/writingSubmissionService';
import { getSessionResults, type TestResultRecord } from '../../services/testResults.service';
import { classifyTeacherResultVisibility } from '../../services/resultVisibility.service';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import WritingResultDetailModal from './WritingResultDetailModal';
import { buildWritingResultSurfaceData } from './writingResultSurface';

interface WritingTestResultsSectionProps {
  sessionCode: string;
  testTitle: string;
}

type ViewerRole = 'teacher' | 'super_admin';
type CanonicalWritingResult = TestResultRecord & {
  teacherId?: string;
  visibility?: {
    visibilityOwnerTeacherId?: string | null;
  } | null;
  writingData?: {
    submissionId?: string | null;
    overallBand?: number | null;
    markingStatus?: 'pending-review' | 'graded' | 'reviewed' | null;
    tasks?: Array<{ taskNumber: number; wordCount: number; activeTimeSeconds: number }>;
  };
  markingStatus?: 'pending-review' | 'graded' | 'reviewed';
};

interface WritingResultRow {
  resultId: string;
  submissionId: string;
  studentId: string;
  studentName: string;
  overallBand: number | null;
  phase: 'pending-review' | 'published';
  draftState: 'owned' | 'locked' | null;
  viewerMode: 'teacher-actionable' | 'teacher-read-only';
  taskBands: Array<{ label: string; value: string }>;
  submittedAt: number;
  submission: WritingSubmission | null;
}

function buildViewerTeacherId(result: CanonicalWritingResult, viewerRole: ViewerRole, viewerTeacherId: string): string {
  if (viewerRole === 'super_admin') {
    return result.visibility?.visibilityOwnerTeacherId || viewerTeacherId;
  }
  return viewerTeacherId;
}

function buildRow(
  result: CanonicalWritingResult,
  submission: WritingSubmission | null,
  verdict: ReturnType<typeof classifyTeacherResultVisibility>,
  viewerTeacherId: string,
): WritingResultRow {
  const canAct = verdict.shouldAllowTeacherActions ?? !verdict.excludeFromAnalytics;
  const surfaceData = submission
    ? buildWritingResultSurfaceData(submission, {
        viewerMode: canAct ? 'teacher-actionable' : 'teacher-read-only',
        canRevealPublishedData: true,
      })
    : null;
  const phase: WritingResultRow['phase'] = surfaceData?.phase
    ?? ((submission?.markingStatus === 'graded' || result.writingData?.markingStatus === 'graded' || result.markingStatus === 'graded' || result.markingStatus === 'reviewed') ? 'published' : 'pending-review');
  const draftState: WritingResultRow['draftState'] = submission?.gradingDraftMeta?.ownerTeacherId
    ? (submission.gradingDraftMeta.ownerTeacherId === viewerTeacherId ? 'owned' : 'locked')
    : null;
  const taskBands = surfaceData
    ? surfaceData.tasks.map((task) => ({
        label: `Task ${task.taskNumber}`,
        value: task.isVoided ? 'Voided' : task.taskBand !== null ? task.taskBand.toFixed(1) : '—',
      }))
    : [];

  return {
    resultId: result.resultId,
    submissionId: result.writingData?.submissionId || result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    overallBand: phase === 'published' ? (surfaceData?.overallBand ?? result.writingData?.overallBand ?? result.bandScore ?? null) : null,
    phase,
    draftState,
    viewerMode: canAct ? 'teacher-actionable' : 'teacher-read-only',
    taskBands,
    submittedAt: submission?.submittedAt || result.submittedAt,
    submission,
  };
}

export default function WritingTestResultsSection({
  sessionCode,
  testTitle,
}: WritingTestResultsSectionProps) {
  const { user, profile } = useAuth();
  const viewerRole: ViewerRole = profile?.role === 'super_admin' ? 'super_admin' : 'teacher';
  const viewerTeacherId = user?.uid || '';
  const { navigateTo } = useNavigation('teacher');
  const { trackAction } = useFeatureTracking(FEATURE_IDS.results);

  const [rows, setRows] = useState<WritingResultRow[]>([]);
  const [analyticsRows, setAnalyticsRows] = useState<WritingResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<WritingSubmission | null>(null);
  const [sortField, setSortField] = useState<'name' | 'band' | 'status' | 'date'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    void loadRows();
  }, [sessionCode, viewerRole, viewerTeacherId]);

  const loadRows = async () => {
    if (!viewerTeacherId) {
      setRows([]);
      setAnalyticsRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const canonicalResults = await getSessionResults(sessionCode) as CanonicalWritingResult[];
    const classified = canonicalResults.map((result) => ({
      result,
      verdict: classifyTeacherResultVisibility({
        result: result as any,
        teacherId: buildViewerTeacherId(result, viewerRole, viewerTeacherId),
        hasAssignmentAccess: true,
      }),
    }));

    const visibleResults = classified.filter(({ verdict }) => verdict.shouldDisplayInTeacherHistory);
    const analyticsIds = new Set(
      classified
        .filter(({ verdict }) => verdict.shouldDisplayInTeacherHistory && !verdict.excludeFromAnalytics)
        .map(({ result }) => result.resultId),
    );

    const nextRows = await Promise.all(
      visibleResults.map(async ({ result }) => {
        const submissionId = result.writingData?.submissionId || result.resultId;
        try {
          const response = await getSubmission(submissionId);
          const verdict = classifyTeacherResultVisibility({
            result: result as any,
            teacherId: buildViewerTeacherId(result, viewerRole, viewerTeacherId),
            hasAssignmentAccess: true,
          });
          return buildRow(result, response.success ? response.data || null : null, verdict, viewerTeacherId);
        } catch (error) {
          console.warn('[WritingTestResultsSection] Failed to load submission detail', submissionId, error);
          const verdict = classifyTeacherResultVisibility({
            result: result as any,
            teacherId: buildViewerTeacherId(result, viewerRole, viewerTeacherId),
            hasAssignmentAccess: true,
          });
          return buildRow(result, null, verdict, viewerTeacherId);
        }
      }),
    );

    setRows(nextRows);
    setAnalyticsRows(nextRows.filter((row) => analyticsIds.has(row.resultId)));
    setLoading(false);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
      return;
    }
    setSortField(field);
    setSortAsc(false);
  };

  const sortedRows = [...rows].sort((left, right) => {
    let leftValue: number | string;
    let rightValue: number | string;

    switch (sortField) {
      case 'name':
        leftValue = left.studentName.toLowerCase();
        rightValue = right.studentName.toLowerCase();
        break;
      case 'band':
        leftValue = left.overallBand ?? -1;
        rightValue = right.overallBand ?? -1;
        break;
      case 'status':
        leftValue = `${left.phase}:${left.draftState || 'none'}:${left.viewerMode}`;
        rightValue = `${right.phase}:${right.draftState || 'none'}:${right.viewerMode}`;
        break;
      case 'date':
        leftValue = left.submittedAt;
        rightValue = right.submittedAt;
        break;
      default:
        return 0;
    }

    if (leftValue < rightValue) return sortAsc ? -1 : 1;
    if (leftValue > rightValue) return sortAsc ? 1 : -1;
    return 0;
  });

  const gradedCount = analyticsRows.filter((row) => row.phase === 'published').length;
  const avgBand = gradedCount > 0
    ? analyticsRows
      .filter((row) => row.overallBand !== null)
      .reduce((sum, row) => sum + (row.overallBand || 0), 0) / gradedCount
    : 0;

  const openSubmission = (row: WritingResultRow) => {
    if (!row.submission) return;
    trackAction('viewResults', {
      source: 'teacher_test_results_writing',
      resultId: row.resultId,
      submissionId: row.submissionId,
    });
    setSelectedSubmission(row.submission);
  };

  const openGrading = (row: WritingResultRow) => {
      trackAction('openWritingGrading', {
      source: 'teacher_test_results_writing',
      resultId: row.resultId,
      submissionId: row.submissionId,
      status: row.phase,
    });
    navigateTo(
      'TEACHER_GRADING_DETAIL',
      { submissionId: row.submissionId },
      { reason: 'teacher_writing_results_grade' },
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        Loading writing submissions...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>Writing Results</h1>
            <div style={{ fontSize: '1rem', color: '#64748b', marginTop: '0.25rem' }}>
              {testTitle} | Session: {sessionCode}
            </div>
          </div>
          <button
            onClick={() => navigateTo('SESSIONS', {}, { reason: 'teacher_writing_results_back' })}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
          >
            Back to Sessions
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            ['Total Submissions', analyticsRows.length.toString()],
            ['Graded', `${gradedCount}/${analyticsRows.length}`],
            ['Avg Band', avgBand > 0 ? avgBand.toFixed(1) : '-'],
            ['Pending', `${analyticsRows.length - gradedCount}`],
          ].map(([label, value]) => (
            <div key={label} style={{ padding: '1rem', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>Individual Results</div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('name')}>Student</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('band')}>Band Summary</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('status')}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('date')}>Submitted</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr
                    key={row.resultId}
                    onClick={() => openSubmission(row)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: row.submission ? 'pointer' : 'default' }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{row.studentName}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'grid', gap: '4px', justifyItems: 'center' }}>
                        <strong style={{ color: '#0f172a' }}>
                          {row.overallBand !== null ? row.overallBand.toFixed(1) : '—'}
                        </strong>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                          {row.taskBands.map((taskBand) => (
                            <span
                              key={`${row.resultId}-${taskBand.label}`}
                              style={{
                                borderRadius: '999px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: '#475569',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                              }}
                            >
                              {taskBand.label}: {taskBand.value}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <span>{row.phase === 'published' ? 'Published' : 'Pending Review'}</span>
                        {row.draftState === 'owned' && (
                          <span style={{ fontSize: '0.72rem', color: '#4f46e5', fontWeight: 700 }}>draft-in-progress</span>
                        )}
                        {row.draftState === 'locked' && (
                          <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700 }}>lock conflict</span>
                        )}
                        {row.viewerMode === 'teacher-read-only' && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Read only</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>{new Date(row.submittedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {row.phase === 'pending-review' && row.viewerMode === 'teacher-actionable' && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openGrading(row);
                          }}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}
                        >
                          {row.draftState === 'owned'
                            ? 'Resume Draft'
                            : row.draftState === 'locked'
                              ? 'View Conflict'
                              : 'Grade'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              No writing submissions found for this session.
            </div>
          )}
        </div>
      </div>

      {selectedSubmission && (() => {
        const selectedRow = rows.find((row) => row.submissionId === selectedSubmission.id);

        return (
        <WritingResultDetailModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          viewerMode={selectedRow?.viewerMode ?? 'teacher-read-only'}
          onEditGrades={selectedRow && selectedRow.viewerMode === 'teacher-actionable'
            ? () => openGrading(selectedRow)
            : undefined}
        />
        );
      })()}
    </div>
  );
}
