import { useMemo, useState } from 'react';
import { useClipboard } from '../../../core/platform';
import { toast } from '../../modern';
import {
  buildActivityRevisionPrompt,
  type ActivityRevisionCandidate,
  type ActivityRevisionPreviewResult,
  type ActivityRevisionPublishResult,
  type ActivityRevisionPublishService,
  type ActivityRevisionVersionRecord,
} from '../../../services/book-activity/activityRevisionPublish.service';
import type { EditableActivity } from '../../../types/bookActivity.types';
import './BookActivityRevisionPanel.css';

export interface BookActivityRevisionPanelProps {
  readonly current: ActivityRevisionVersionRecord;
  readonly currentEditable: EditableActivity;
  readonly publisher: ActivityRevisionPublishService;
  readonly onPublished: (result: ActivityRevisionPublishResult, candidate: ActivityRevisionCandidate) => void | Promise<void>;
  readonly onPreview?: (result: ActivityRevisionPreviewResult) => void;
  readonly onConflictReload: (candidate?: ActivityRevisionCandidate | null) => void | Promise<void>;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const stringify = (value: unknown): string => JSON.stringify(value, null, 2);

const parseObject = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Replacement must be a JSON object.');
  return parsed as Record<string, unknown>;
};

const previewError = (result: ActivityRevisionPreviewResult): string => (
  result.status === 'ready' ? '' : `${result.failureCode}${result.errors?.length ? `: ${result.errors.join(', ')}` : ''}`
);

const BookActivityRevisionPanel = ({
  current,
  currentEditable,
  publisher,
  onPublished,
  onPreview,
  onConflictReload,
  onAction,
}: BookActivityRevisionPanelProps) => {
  const { writeText } = useClipboard();
  const [replacement, setReplacement] = useState(() => stringify(currentEditable));
  const [preview, setPreview] = useState<ActivityRevisionPreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const prompt = useMemo(() => buildActivityRevisionPrompt({
    current: currentEditable,
    sourceEvidenceRefs: current.sourceEvidenceRefs,
    answerEvidenceRefs: current.answerEvidenceRefs,
  }), [current.answerEvidenceRefs, currentEditable, current.sourceEvidenceRefs]);

  const action = (name: string, metadata?: Record<string, unknown>) => onAction?.(name, metadata);

  const copyPrompt = async () => {
    action('teacher_materials_book_assembly_activity_revision_prompt_copied', { activityId: current.activityId });
    const copied = await writeText(prompt);
    setPromptCopied(copied);
    if (copied) toast.success('Revision prompt copied. Manual copy remains available below.');
    else toast.warning('Clipboard unavailable. Use the visible manual-copy prompt.');
  };

  const previewReplacement = async () => {
    action('teacher_materials_book_assembly_activity_revision_previewed', { activityId: current.activityId });
    setBusy(true);
    setError(null);
    try {
      const result = await publisher.preview({
        activityId: current.activityId,
        ownerId: current.ownerId,
        candidateId: 'ticket68-candidate',
        candidateRevision: 1,
        expectedCurrentVersionId: current.versionId,
        expectedCurrentVersion: current.version,
        expectedContextFingerprint: current.sourceContextFingerprint,
        placementIds: current.placementIds,
        evidenceRefs: current.evidenceRefs,
        sourceEvidenceRefs: current.sourceEvidenceRefs,
        answerEvidenceRefs: current.answerEvidenceRefs,
        replacement: parseObject(replacement),
      });
      setPreview(result);
      onPreview?.(result);
      if (result.status !== 'ready') {
        setError(previewError(result));
        toast.error(`Could not preview Activity revision: ${previewError(result)}`);
      } else {
        toast.info('Revision preview ready. Publish remains blocked until this exact preview is reviewed.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'invalid replacement';
      setPreview(null);
      setError(message);
      toast.error(`Could not preview Activity revision: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (preview?.status !== 'ready') return;
    action('teacher_materials_book_assembly_activity_revision_published', { activityId: current.activityId });
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const result = await publisher.publish({
        operationId: `ticket68-${Date.now()}`,
        ownerId: current.ownerId,
        candidate: preview.candidate,
        previewApproval: {
          approvalId: preview.candidate.fingerprint,
          approvedAt: now,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        now,
      });
      if (result.status !== 'revised' && result.status !== 'replayed') {
        const failureCode = 'failureCode' in result ? result.failureCode : 'publication-failed';
        setError(failureCode);
        action('teacher_materials_book_assembly_activity_revision_failed', { code: failureCode });
        toast.error(`Activity revision was not published: ${failureCode}`);
        if (failureCode === 'stale-current-activity-version') {
          action('teacher_materials_book_assembly_activity_revision_conflict_reloaded', { activityId: current.activityId });
        }
        return;
      }
      toast.success(result.status === 'replayed' ? 'Activity revision replay confirmed.' : 'Activity revision published. Previous version remains immutable.');
      await onPublished(result, preview.candidate);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'publication failed';
      setError(message);
      action('teacher_materials_book_assembly_activity_revision_failed', { code: message });
      toast.error(`Activity revision was not published: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    action('teacher_materials_book_assembly_activity_revision_discarded', { activityId: current.activityId });
    setReplacement(stringify(currentEditable));
    setPreview(null);
    setError(null);
    toast.info('Unpublished replacement discarded. The current Activity remains unchanged.');
  };

  const reload = async () => {
    action('teacher_materials_book_assembly_activity_revision_conflict_reloaded', { activityId: current.activityId });
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      const candidateId = preview?.status === 'ready' ? preview.candidate.candidateId : 'ticket68-candidate';
      const storedCandidate = await publisher.loadCandidate(candidateId);
      await onConflictReload(storedCandidate);
      if (!storedCandidate) {
        setError('candidate-not-found');
        toast.warning('Saved candidate was not found. Current Activity was reloaded; review a fresh replacement.');
      } else {
        toast.info('Saved candidate reloaded against the current Activity. Review a fresh replacement before publishing.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'candidate reload failed';
      setError(message);
      toast.error(`Could not reload Activity candidate: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const candidate: ActivityRevisionCandidate | null = preview?.status === 'ready' ? preview.candidate : null;

  return (
    <section className="book-activity-revision" aria-labelledby="book-activity-revision-title">
      <header className="book-activity-revision__heading">
        <div>
          <p className="book-activity-revision__eyebrow">Ticket 68 · Teacher Activity revision</p>
          <h2 id="book-activity-revision-title">Replace one Activity safely</h2>
          <p>Complete replacement only. Existing Activity and compatible Placement identity stay stable; old versions remain readable.</p>
        </div>
        <span data-testid="ticket68-revision-state">{busy ? 'Working' : candidate ? 'Preview ready' : 'Review required'}</span>
      </header>

      <dl className="book-activity-revision__facts">
        <div><dt>Activity</dt><dd data-testid="ticket68-activity-id">{current.activityId}</dd></div>
        <div><dt>Current version</dt><dd data-testid="ticket68-current-version">{current.versionId} · v{current.version}</dd></div>
        <div><dt>Context</dt><dd data-testid="ticket68-context">{current.sourceContextFingerprint ?? 'none'}</dd></div>
        <div><dt>Interaction IDs</dt><dd>{current.activity.interactions.map((interaction) => interaction.interactionId).join(', ')}</dd></div>
      </dl>

      <div className="book-activity-revision__prompt" aria-labelledby="ticket68-prompt-title">
        <div className="book-activity-revision__section-heading">
          <div>
            <h3 id="ticket68-prompt-title">Copy Revision Prompt</h3>
            <p>Prompt includes editable content requirements, evidence references, and presentation/context constraints. IDs and ownership stay outside editable JSON.</p>
          </div>
          <button type="button" data-testid="ticket68-copy-prompt" onClick={() => void copyPrompt()}>{promptCopied ? 'Prompt copied' : 'Copy prompt'}</button>
        </div>
        <pre data-testid="ticket68-prompt">{prompt}</pre>
      </div>

      <label className="book-activity-revision__editor" htmlFor="ticket68-replacement-json">
        <span>Complete replacement Activity JSON</span>
        <textarea
          id="ticket68-replacement-json"
          data-testid="ticket68-replacement-json"
          value={replacement}
          onChange={(event) => {
            action('teacher_materials_book_assembly_activity_revision_imported', { activityId: current.activityId });
            setReplacement(event.target.value);
            setPreview(null);
          }}
          spellCheck={false}
          rows={16}
        />
      </label>

      {error && <p className="book-activity-revision__error" role="alert" data-testid="ticket68-error">{error}</p>}

      {candidate && (
        <section className="book-activity-revision__preview" aria-labelledby="ticket68-preview-title">
          <h3 id="ticket68-preview-title">Exact prepublish preview</h3>
          <dl>
            <div><dt>Impact</dt><dd data-testid="ticket68-impact">{candidate.semanticImpact.classification}</dd></div>
            <div><dt>Reasons</dt><dd>{candidate.semanticImpact.reasons.join(', ') || 'none'}</dd></div>
            <div><dt>New Activity Version</dt><dd>Allocated only at publish</dd></div>
            <div><dt>Student-safe interactions</dt><dd data-testid="ticket68-safe-count">{candidate.projection.interactions.length}</dd></div>
          </dl>
          <p role="status">Answer keys, teacher notes, and editable provenance are excluded from the preview projection.</p>
        </section>
      )}

      <div className="book-activity-revision__actions">
        <button type="button" data-testid="ticket68-preview" disabled={busy} onClick={() => void previewReplacement()}>Preview replacement</button>
        <button type="button" data-testid="ticket68-publish" disabled={busy || !candidate} onClick={() => void publish()}>Publish revision</button>
        <button type="button" data-testid="ticket68-reload" disabled={busy} onClick={() => void reload()}>Reload current version</button>
        <button type="button" data-testid="ticket68-discard" disabled={busy} onClick={discard}>Discard replacement</button>
      </div>
    </section>
  );
};

export default BookActivityRevisionPanel;
