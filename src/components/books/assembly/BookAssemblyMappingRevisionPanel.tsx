import { useMemo, useState } from 'react';
import { toast } from '../../modern';
import { fingerprintMappingRevisionInput } from '../../../services/book-assembly/mappingRevision.service';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookSourceVersionAuthority,
} from '../../../types/bookAssembly.types';
import type { BookAssemblyPublicationResult } from '../../../services/book-assembly/publicationTransaction.service';
import './BookAssemblyMappingRevisionPanel.css';

export interface MappingRevisionPublisher {
  publishMapping(input: {
    readonly targetManifest: BookAssemblyManifestCandidate;
    readonly previewApproval?: BookAssemblyPreviewApprovalReference;
  }): Promise<BookAssemblyPublicationResult & { readonly impact?: unknown }>;
}

export interface BookAssemblyMappingRevisionPanelProps {
  readonly predecessor: BookAssemblyImmutableManifestVersion;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
  readonly preservedActivityVersionIds: readonly string[];
  readonly publisher?: MappingRevisionPublisher | null;
  readonly onPublished: (result: BookAssemblyPublicationResult & { readonly impact?: unknown }) => void;
  readonly onClosed: () => void;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const activityGroup = (manifest: BookAssemblyManifestCandidate) => manifest.units[0]?.pageGroups.find((group) => group.mode === 'activity');
const referenceGroup = (manifest: BookAssemblyManifestCandidate) => manifest.units[0]?.pageGroups.find((group) => group.mode === 'reference_only');

const BookAssemblyMappingRevisionPanel = ({
  predecessor,
  sourceVersionAuthority,
  preservedActivityVersionIds,
  publisher,
  onPublished,
  onClosed,
  onAction,
}: BookAssemblyMappingRevisionPanelProps) => {
  const originalActivity = activityGroup(predecessor.manifest);
  const originalPage = originalActivity?.pages[0] ?? 1;
  const [pageText, setPageText] = useState(String(originalPage));
  const [referenceFirst, setReferenceFirst] = useState(false);
  const [previewApproval, setPreviewApproval] = useState<BookAssemblyPreviewApprovalReference | undefined>();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, setState] = useState<'reviewing' | 'previewed' | 'published' | 'canceled'>('reviewing');

  const targetManifest = useMemo<BookAssemblyManifestCandidate>(() => {
    const requestedPage = Number(pageText);
    const nextPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 0;
    return {
      ...predecessor.manifest,
      units: predecessor.manifest.units.map((unit, unitIndex) => {
        if (unitIndex !== 0) return unit;
        const groups = unit.pageGroups.map((group) => group.mode === 'activity'
          ? { ...group, pages: [nextPage] }
          : group);
        return { ...unit, pageGroups: referenceFirst ? [...groups].reverse() : groups };
      }),
    };
  }, [pageText, predecessor.manifest, referenceFirst]);

  const sourceAssisted = pageText !== String(originalPage);
  const inputFingerprint = fingerprintMappingRevisionInput({
    predecessorManifestVersionId: predecessor.manifestVersionId,
    targetManifest,
  });
  const targetActivity = activityGroup(targetManifest);
  const targetReference = referenceGroup(targetManifest);
  const sourceProjection = sourceVersionAuthority.getSourceVersion(
    targetManifest.sourceSet.sources[0]?.sourceVersionId ?? '',
  );
  const validPage = targetActivity?.pages[0] !== undefined
    && sourceProjection?.verifiedUsable === true
    && targetActivity.pages[0] >= 1
    && targetActivity.pages[0] <= sourceProjection.physicalPageCount;

  const emit = (action: string, metadata: Record<string, unknown> = {}) => onAction?.(action, {
    predecessorPublicationId: predecessor.publicationId,
    changedPage: targetActivity?.pages[0] ?? null,
    ...metadata,
  });

  const preview = () => {
    if (!validPage) {
      setErrorMessage('Choose a page inside the trusted Source Version range.');
      emit('teacher_materials_book_assembly_mapping_revision_failed', { code: 'invalid-page' });
      toast.warning('Mapping preview needs a valid trusted source page.');
      return;
    }
    const approvedAt = new Date();
    const approval: BookAssemblyPreviewApprovalReference = {
      approvalId: `preview-${predecessor.publicationId}`,
      approvalRevision: 1,
      approvedAt: approvedAt.toISOString(),
      expiresAt: new Date(approvedAt.getTime() + 60 * 60 * 1000).toISOString(),
      approvedInputFingerprint: inputFingerprint,
    };
    setPreviewApproval(approval);
    setState('previewed');
    setErrorMessage(null);
    emit('teacher_materials_book_assembly_mapping_revision_previewed', { inputFingerprint });
    toast.success('Source-assisted mapping preview approved for this exact draft.');
  };

  const publish = async () => {
    if (!publisher || !validPage || (sourceAssisted && !previewApproval)) {
      setErrorMessage(sourceAssisted
        ? 'Preview the exact source-assisted mapping before publishing.'
        : 'Choose a valid mapping before publishing.');
      emit('teacher_materials_book_assembly_mapping_revision_failed', { code: 'preview-or-plan-required' });
      toast.warning('Mapping publication stays blocked until its exact preview gate passes.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    emit('teacher_materials_book_assembly_mapping_revision_opened');
    try {
      const result = await publisher.publishMapping({ targetManifest, previewApproval });
      if (result.status !== 'published' && result.status !== 'replayed') throw new Error(result.failureCode ?? 'mapping-publication-failed');
      setState('published');
      onPublished(result);
      emit('teacher_materials_book_assembly_mapping_revision_published', { publicationId: result.pointer?.publicationId ?? null });
      toast.success('Mapping revision published. Activity Versions remain unchanged and the predecessor stays readable.');
      onClosed();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mapping publication failed.';
      setErrorMessage(message);
      emit('teacher_materials_book_assembly_mapping_revision_failed', { code: 'publish' });
      toast.error('Mapping publication failed; predecessor and Activity Versions remain unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (busy) return;
    setState('canceled');
    emit('teacher_materials_book_assembly_mapping_revision_canceled');
    toast.info('Mapping repair canceled. The predecessor remains active and unchanged.');
    onClosed();
  };

  return (
    <section className="book-assembly-mapping" aria-labelledby="book-assembly-mapping-title">
      <div className="book-assembly-mapping__heading">
        <div>
          <p className="book-assembly-mapping__eyebrow">Published Unit mapping repair</p>
          <h2 id="book-assembly-mapping-title">Repair mapping without Activity reimport</h2>
          <p>Creates a new immutable mapping revision. The prior Manifest, Activity Version, and existing bindings remain readable.</p>
        </div>
        <span data-testid="mapping-revision-state">{state === 'published' ? 'Published' : state === 'canceled' ? 'Canceled' : state === 'previewed' ? 'Previewed' : 'Reviewing'}</span>
      </div>
      <dl className="book-assembly-mapping__facts">
        <div><dt>Predecessor</dt><dd data-testid="mapping-revision-predecessor">{predecessor.publicationId}</dd></div>
        <div><dt>Predecessor Manifest</dt><dd>{predecessor.manifestVersionId}</dd></div>
        <div><dt>Activity Versions preserved</dt><dd data-testid="mapping-revision-activity-versions">{preservedActivityVersionIds.join(', ')}</dd></div>
        <div><dt>Current binding</dt><dd>unchanged until atomic success</dd></div>
      </dl>
      <fieldset disabled={busy}>
        <legend>Explicit mapping repair</legend>
        <label>
          Activity source page
          <input
            aria-label="Mapping activity source page"
            inputMode="numeric"
            value={pageText}
            onChange={(event) => {
              setPageText(event.target.value);
              setPreviewApproval(undefined);
              setState('reviewing');
              setErrorMessage(null);
              emit('teacher_materials_book_assembly_mapping_revision_changed');
            }}
          />
        </label>
        <label className="book-assembly-mapping__check">
          <input
            type="checkbox"
            checked={referenceFirst}
            onChange={(event) => {
              setReferenceFirst(event.target.checked);
              emit('teacher_materials_book_assembly_mapping_revision_changed', { change: 'page-group-order' });
            }}
          />
          Put reference-only Page Group first
        </label>
      </fieldset>
      <div className="book-assembly-mapping__comparison" aria-label="Mapping comparison">
        <h3>Old / new mapping</h3>
        <dl>
          <div><dt>Old activity page</dt><dd>{originalActivity?.pages.join(', ')}</dd></div>
          <div><dt>New activity page</dt><dd data-testid="mapping-revision-new-page">{targetActivity?.pages.join(', ')}</dd></div>
          <div><dt>Reference group</dt><dd>{targetReference?.mode === 'reference_only' ? 'reference-only' : 'activity'}</dd></div>
          <div><dt>Source-assisted preview</dt><dd data-testid="mapping-revision-preview-state">{sourceAssisted ? (previewApproval ? 'approved' : 'required') : 'not required'}</dd></div>
        </dl>
      </div>
      {!validPage && <p role="alert">Mapping page must be inside the trusted Source Version range.</p>}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <div className="book-assembly-mapping__actions">
        <button type="button" disabled={busy || !sourceAssisted} onClick={preview}>{busy ? 'Working…' : 'Preview source-assisted mapping'}</button>
        <button type="button" disabled={busy || !publisher} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish mapping revision'}</button>
        <button type="button" disabled={busy} onClick={cancel}>Cancel mapping repair</button>
      </div>
    </section>
  );
};

export default BookAssemblyMappingRevisionPanel;
