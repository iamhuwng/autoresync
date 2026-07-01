import type { ListeningAuthoringIssue } from '../types/listeningAuthoring.types';

export type ListeningPublishReadinessMode = 'idle' | 'checking' | 'ready' | 'blocked';

interface ListeningPublishReadinessPanelProps {
  readonly mode: ListeningPublishReadinessMode;
  readonly blockers?: readonly ListeningAuthoringIssue[];
  readonly checkedSections?: number;
}

const toneStyles: Record<ListeningPublishReadinessMode, {
  readonly background: string;
  readonly border: string;
  readonly color: string;
}> = {
  idle: { background: '#f8fafc', border: '#cbd5e1', color: '#334155' },
  checking: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  ready: { background: '#ecfdf5', border: '#a7f3d0', color: '#166534' },
  blocked: { background: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
};

function messageForMode(
  mode: ListeningPublishReadinessMode,
  checkedSections: number,
): string {
  switch (mode) {
    case 'checking':
      return 'Checking audio delivery and byte-range playback before publish.';
    case 'ready':
      return `${checkedSections} audio section${checkedSections === 1 ? '' : 's'} passed delivery and byte-range checks.`;
    case 'blocked':
      return 'Audio readiness blocked Publish.';
    case 'idle':
    default:
      return 'Audio readiness will be checked when you publish.';
  }
}

function formatBlocker(issue: ListeningAuthoringIssue): string {
  const prefix = typeof issue.sectionNumber === 'number'
    ? `Section ${issue.sectionNumber}: `
    : '';
  return `${prefix}${issue.guidance}`;
}

export function ListeningPublishReadinessPanel({
  mode,
  blockers = [],
  checkedSections = 0,
}: ListeningPublishReadinessPanelProps) {
  const colors = toneStyles[mode];
  const role = mode === 'blocked' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-label="Publish audio readiness"
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
        display: 'grid',
        gap: '0.5rem',
        padding: '0.85rem 1rem',
        borderRadius: '0.5rem',
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
        fontSize: '0.875rem',
      }}
    >
      <strong style={{ fontSize: '0.9rem' }}>
        Publish audio readiness
      </strong>
      <span>{messageForMode(mode, checkedSections)}</span>
      {blockers.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.25rem' }}>
          {blockers.map((issue) => (
            <li key={`${issue.sectionNumber ?? 'global'}-${issue.field}-${issue.guidance}`}>
              {formatBlocker(issue)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default ListeningPublishReadinessPanel;
