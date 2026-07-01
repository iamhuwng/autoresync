import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ListeningAuthoringIssue } from '../types/listeningAuthoring.types';

const STALE_DRAFT_MS = 8 * 60 * 60 * 1000;

export type ListeningDraftStatusMode =
  | 'idle'
  | 'saving-draft'
  | 'draft-saved'
  | 'draft-warning'
  | 'draft-error'
  | 'publish-blocked'
  | 'publishing'
  | 'publish-error'
  | 'conflict'
  | 'duplicate'
  | 'discard-pending'
  | 'discarded';

interface ListeningDraftStatusProps {
  readonly mode: ListeningDraftStatusMode;
  readonly warnings?: readonly ListeningAuthoringIssue[];
  readonly blockers?: readonly ListeningAuthoringIssue[];
  readonly lastSavedAt?: number | null;
  readonly hasDraft: boolean;
  readonly hasUnsavedChanges: boolean;
  readonly duplicateAction?: 'saveDraft' | 'publish' | null;
  readonly discardContext?: 'navigation-away' | 'saved-draft' | null;
  readonly message?: string;
  readonly action?: ReactNode;
}

interface DerivedStatus {
  readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  readonly role?: 'alert';
  readonly title: string;
  readonly details: string[];
}

function formatIssue(issue: ListeningAuthoringIssue) {
  if (typeof issue.sectionNumber === 'number') {
    return `Section ${issue.sectionNumber} ${issue.field}: ${issue.guidance}`;
  }
  if (typeof issue.questionNumber === 'number') {
    return `Question ${issue.questionNumber} ${issue.field}: ${issue.guidance}`;
  }
  return issue.guidance;
}

function formatSavedAge(lastSavedAt: number) {
  const ageMs = Date.now() - lastSavedAt;
  const ageMinutes = Math.max(1, Math.round(ageMs / 60000));
  if (ageMinutes < 60) {
    return `Last saved ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago.`;
  }
  const ageHours = Math.round(ageMinutes / 60);
  return `Last saved ${ageHours} hour${ageHours === 1 ? '' : 's'} ago.`;
}

function deriveStatus(input: ListeningDraftStatusProps): DerivedStatus {
  const warningDetails = (input.warnings ?? []).map(formatIssue);
  const blockerDetails = (input.blockers ?? []).map(formatIssue);
  const hasAudioWarning = (input.warnings ?? []).some((issue) => issue.field === 'audioUrl');
  const hasAudioBlocker = (input.blockers ?? []).some((issue) => issue.field === 'audioUrl');

  switch (input.mode) {
    case 'saving-draft':
      return {
        tone: 'info',
        title: 'Saving draft…',
        details: ['Saving keeps your current authoring state available for later editing.'],
      };
    case 'draft-saved':
      return {
        tone: 'success',
        title: 'Draft saved.',
        details: input.lastSavedAt
          ? [formatSavedAge(input.lastSavedAt)]
          : ['Draft created. Publish when audio and answers are ready.'],
      };
    case 'draft-warning':
      return {
        tone: 'warning',
        title: 'Draft saved with warnings.',
        details: [
          ...(hasAudioWarning
            ? ['Missing audio can stay in draft, but Publish stays blocked until every section has audio.']
            : []),
          ...warningDetails,
          ...(hasAudioWarning ? ['Re-upload each missing section before publishing.'] : []),
        ],
      };
    case 'draft-error':
      return {
        tone: 'error',
        role: 'alert',
        title: 'Save draft failed.',
        details: [input.message ?? 'Draft could not be saved. Try again.'],
      };
    case 'publish-blocked':
      return {
        tone: 'error',
        role: 'alert',
        title: 'Publish blocked.',
        details: [
          ...blockerDetails,
          ...(hasAudioBlocker ? ['Re-upload each missing section before publishing.'] : []),
        ],
      };
    case 'publishing':
      return {
        tone: 'info',
        title: 'Publishing…',
        details: ['Publish creates the student-visible version after validation passes.'],
      };
    case 'publish-error':
      return {
        tone: 'error',
        role: 'alert',
        title: 'Publish failed.',
        details: [input.message ?? 'Publish could not complete. Try again.'],
      };
    case 'conflict':
      return {
        tone: 'error',
        role: 'alert',
        title: 'Draft conflict detected.',
        details: ['This draft is stale. Reload or merge newer changes before saving again.'],
      };
    case 'duplicate':
      return {
        tone: 'info',
        title: 'Action already in progress.',
        details: [`${input.duplicateAction === 'publish' ? 'Publish' : 'Save draft'} already in progress. Wait for the current request to finish.`],
      };
    case 'discard-pending':
      return {
        tone: 'warning',
        title: 'Discard draft changes?',
        details: [
          input.discardContext === 'navigation-away'
            ? 'Leaving now will discard unsaved draft changes.'
            : 'Discard removes the current draft work from this builder session.',
        ],
      };
    case 'discarded':
      return {
        tone: 'info',
        title: 'Draft changes discarded.',
        details: ['You can start a fresh draft or return later to rebuild this test.'],
      };
    case 'idle':
    default:
      if (input.lastSavedAt && Date.now() - input.lastSavedAt >= STALE_DRAFT_MS) {
        return {
          tone: 'warning',
          title: 'Draft status may be stale after 8 hours.',
          details: ['Save draft again before publishing so the latest audio and answers are captured.'],
        };
      }
      if (input.hasDraft && input.hasUnsavedChanges) {
        return {
          tone: 'info',
          title: 'Draft has unsaved changes.',
          details: ['Save draft to keep the latest edits before you navigate away or publish.'],
        };
      }
      if (input.hasDraft && input.lastSavedAt) {
        return {
          tone: 'success',
          title: 'Draft ready for more editing.',
          details: [formatSavedAge(input.lastSavedAt)],
        };
      }
      return {
        tone: 'neutral',
        title: 'First save creates a draft.',
        details: ['Save draft first. Publish stays separate and only runs after blockers are cleared.'],
      };
  }
}

const toneStyles: Record<DerivedStatus['tone'], { background: string; border: string; color: string }> = {
  neutral: { background: '#f8fafc', border: '#cbd5e1', color: '#334155' },
  info: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  success: { background: '#ecfdf5', border: '#a7f3d0', color: '#166534' },
  warning: { background: '#fffbeb', border: '#fcd34d', color: '#92400e' },
  error: { background: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
};

export function ListeningDraftStatus(props: ListeningDraftStatusProps) {
  const derived = deriveStatus(props);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (derived.role === 'alert') {
      containerRef.current?.focus();
    }
  }, [derived.role, derived.title]);

  const colors = toneStyles[derived.tone];

  return (
    <div
      ref={containerRef}
      role={derived.role}
      aria-live={derived.role === 'alert' ? 'assertive' : undefined}
      tabIndex={derived.role === 'alert' ? -1 : undefined}
      style={{
        display: 'grid',
        gap: '0.75rem',
        marginBottom: '1.25rem',
        padding: '1rem 1.1rem',
        borderRadius: '0.75rem',
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.color,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{derived.title}</div>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '0.35rem', fontSize: '0.875rem' }}>
        {derived.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      {props.action ? <div>{props.action}</div> : null}
    </div>
  );
}

export default ListeningDraftStatus;
