import { useMemo, useState } from 'react';
import { toast } from '../../modern';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPreviewApprovalReference,
  BookSourceStrategy,
  ComponentPdfSourceCandidate,
  FullPdfSourceCandidate,
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../../types/bookAssembly.types';
import type {
  BookAssemblySourceStrategySuccessorClient,
  BookAssemblySourceStrategySuccessorResult,
  PublishSourceStrategySuccessorInput,
} from '../../../services/book-assembly/assemblyClient.browser';
import {
  planSourceStrategyMigration,
  type SourceStrategyMigrationRemap,
} from '../../../services/book-assembly/sourceStrategyMigration.service';
import './BookAssemblySourceStrategySuccessorPanel.css';

type SourceDraft = {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey?: string;
};

type RemapDraft = {
  readonly sourceKey: string;
  readonly pages: readonly string[];
};

export interface BookAssemblySourceStrategySuccessorPanelProps {
  readonly bookId: string;
  readonly bookRevision: number;
  readonly currentSourceSetRevision: number;
  readonly predecessor: BookAssemblyImmutableManifestVersion;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly targetStrategy: BookSourceStrategy;
  readonly previewApproval: BookAssemblyPreviewApprovalReference;
  readonly successorClient?: BookAssemblySourceStrategySuccessorClient | null;
  readonly onPublished: (result: BookAssemblySourceStrategySuccessorResult) => void;
  readonly onClosed: () => void;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const operationId = (): string => globalThis.crypto?.randomUUID?.()
  ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

const emptySource = (strategy: BookSourceStrategy, index: number): SourceDraft => ({
  sourceKey: strategy === 'full_pdf' ? 'full' : `component-${index + 1}`,
  sourceVersionId: '',
  sourceOrder: index + 1,
  ...(strategy === 'component_pdfs' ? { ownerNodeKey: '' } : {}),
});

const remapDefaults = (
  predecessor: BookAssemblyImmutableManifestVersion,
): Record<string, RemapDraft> => Object.fromEntries(
  predecessor.manifest.units.flatMap((unit) => unit.pageGroups.map((group) => [
    group.pageGroupKey,
    { sourceKey: '', pages: group.pages.map(() => '') },
  ])),
);

const sourceLabel = (source: TrustedBookSourceVersionProjection): string =>
  `${source.sourceVersionId} (${source.physicalPageCount} pages)`;

const BookAssemblySourceStrategySuccessorPanel = ({
  bookId,
  bookRevision,
  currentSourceSetRevision,
  predecessor,
  sourceVersions,
  targetStrategy,
  previewApproval,
  successorClient,
  onPublished,
  onClosed,
  onAction,
}: BookAssemblySourceStrategySuccessorPanelProps) => {
  const [sources, setSources] = useState<SourceDraft[]>(() => [emptySource(targetStrategy, 0)]);
  const [remaps, setRemaps] = useState<Record<string, RemapDraft>>(() => remapDefaults(predecessor));
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sourceAuthority = useMemo(() => ({
    getSourceVersion: (sourceVersionId: string) =>
      sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
  }), [sourceVersions]);

  const targetSourceSet = useMemo<SourceSetCandidate>(() => {
    if (targetStrategy === 'full_pdf') {
      const source = sources[0] ?? emptySource('full_pdf', 0);
      const fullSource: FullPdfSourceCandidate = {
        sourceKey: source.sourceKey,
        sourceVersionId: source.sourceVersionId,
        sourceOrder: source.sourceOrder,
      };
      return { sourceStrategy: 'full_pdf', sources: [fullSource] };
    }
    const componentSources: ComponentPdfSourceCandidate[] = sources.map((source) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      sourceOrder: source.sourceOrder,
      ownerNodeKey: source.ownerNodeKey ?? '',
    }));
    const first = componentSources[0] ?? {
      sourceKey: 'component-1',
      sourceVersionId: '',
      sourceOrder: 1,
      ownerNodeKey: '',
    };
    return { sourceStrategy: 'component_pdfs', sources: [first, ...componentSources.slice(1)] };
  }, [sources, targetStrategy]);

  const migrationRemaps = useMemo<readonly SourceStrategyMigrationRemap[]>(() => Object.entries(remaps).map(([pageGroupKey, draft]) => {
    const group = predecessor.manifest.units.flatMap((unit) => unit.pageGroups)
      .find((candidate) => candidate.pageGroupKey === pageGroupKey);
    return {
      pageGroupKey,
      pages: draft.pages.map((page, index) => ({
        from: {
          sourceKey: group?.sourceKey ?? '',
          physicalPageNumber: group?.pages[index] ?? 0,
        },
        to: {
          sourceKey: draft.sourceKey,
          physicalPageNumber: Number(page),
        },
      })),
    };
  }), [predecessor.manifest, remaps]);

  const plan = useMemo(() => planSourceStrategyMigration({
    bookId,
    bookMode: 'pdf',
    bookRevision,
    sourceSetRevision: currentSourceSetRevision,
    sourceSet: predecessor.manifest.sourceSet,
    candidate: {
      candidateId: predecessor.candidateId,
      revision: predecessor.candidateRevision,
      bookRevision: predecessor.bookRevision,
      sourceSetRevision: predecessor.sourceSetRevision,
      manifest: predecessor.manifest,
    },
    target: {
      sourceSetRevision: currentSourceSetRevision + 1,
      sourceSet: targetSourceSet,
    },
    remaps: migrationRemaps,
    sourceVersionAuthority: sourceAuthority,
  }), [bookId, bookRevision, currentSourceSetRevision, migrationRemaps, predecessor, sourceAuthority, targetSourceSet]);

  const emit = (action: string, metadata: Record<string, unknown> = {}) => {
    onAction?.(action, {
      bookId,
      predecessorPublicationId: predecessor.publicationId,
      fromStrategy: predecessor.strategy,
      toStrategy: targetStrategy,
      ...metadata,
    });
  };

  const updateSource = (index: number, patch: Partial<SourceDraft>) => {
    setSources((current) => current.map((source, sourceIndex) => sourceIndex === index
      ? { ...source, ...patch }
      : source));
    setErrorMessage(null);
  };

  const updateRemap = (pageGroupKey: string, patch: Partial<RemapDraft>) => {
    setRemaps((current) => ({
      ...current,
      [pageGroupKey]: { ...current[pageGroupKey], ...patch },
    }));
    setErrorMessage(null);
  };

  const publish = async () => {
    if (!successorClient || !plan.canApply) {
      setErrorMessage('Complete every explicit Source Set and local-page remap before publishing.');
      emit('teacher_materials_book_successor_failed', { code: 'plan-invalid' });
      toast.warning('Successor needs explicit source-qualified remaps before it can be published.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    emit('teacher_materials_book_successor_opened');
    const input: PublishSourceStrategySuccessorInput = {
      operationId: operationId(),
      bookId,
      expectedCurrentPublicationId: predecessor.publicationId,
      expectedBookRevision: bookRevision,
      expectedSourceSetRevision: currentSourceSetRevision,
      targetSourceSetRevision: currentSourceSetRevision + 1,
      targetSourceSet: plan.targetSourceSet,
      remaps: migrationRemaps,
      previewApproval,
    };
    try {
      const result = await successorClient.publishSuccessor(input);
      if (result.status !== 'published' && result.status !== 'replayed') {
        throw new Error(result.failureCode ?? 'successor-publication-failed');
      }
      onPublished(result);
      emit('teacher_materials_book_successor_created', {
        successorPublicationId: result.pointer?.publicationId ?? result.version?.publicationId ?? null,
        impact: result.impact ?? null,
      });
      toast.success('Source-strategy successor published. The predecessor remains immutable and readable.');
      onClosed();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Successor publication failed.';
      setErrorMessage(message);
      emit('teacher_materials_book_successor_failed', { code: 'publish' });
      toast.error('Successor publication failed; the current predecessor remains active.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (busy) return;
    emit('teacher_materials_book_successor_canceled');
    toast.info('Successor canceled. The predecessor remains active and unchanged.');
    onClosed();
  };

  const structuralNodes = predecessor.manifest.nodes
    .filter((node) => ['section', 'chapter', 'unit', 'test'].includes(node.nodeType));
  const groups = predecessor.manifest.units.flatMap((unit) => unit.pageGroups);

  return (
    <section className="book-assembly-successor" aria-labelledby="book-assembly-successor-title">
      <div className="book-assembly-successor__heading">
        <div>
          <p className="book-assembly-successor__eyebrow">Published Book successor</p>
          <h2 id="book-assembly-successor-title">Review source-strategy successor</h2>
          <p>Publish a separately identified successor. The current publication remains active until the trusted transaction succeeds.</p>
        </div>
        <span data-testid="book-assembly-successor-state">{busy ? 'Publishing' : 'Reviewing successor'}</span>
      </div>
      <p data-testid="book-assembly-successor-direction">
        {predecessor.strategy} → {targetStrategy}
      </p>
      <dl className="book-assembly-successor__facts">
        <div><dt>Predecessor</dt><dd data-testid="book-assembly-successor-predecessor">{predecessor.publicationId}</dd></div>
        <div><dt>Predecessor remains</dt><dd>active and immutable</dd></div>
        <div><dt>Target Source Set revision</dt><dd>{currentSourceSetRevision + 1}</dd></div>
      </dl>
      <fieldset disabled={busy}>
        <legend>Successor Source Set</legend>
        {sources.map((source, index) => (
          <div className="book-assembly-successor__source" key={`${index}-${source.sourceKey}`}>
            <label>
              Source key
              <input aria-label={`Successor source key ${index + 1}`} value={source.sourceKey} onChange={(event) => updateSource(index, { sourceKey: event.target.value })} />
            </label>
            <label>
              Source Version
              <select aria-label={`Successor Source Version ${index + 1}`} value={source.sourceVersionId} onChange={(event) => updateSource(index, { sourceVersionId: event.target.value })}>
                <option value="">Choose verified Source Version</option>
                {sourceVersions.filter((candidate) => candidate.verifiedUsable).map((candidate) => (
                  <option key={candidate.sourceVersionId} value={candidate.sourceVersionId}>{sourceLabel(candidate)}</option>
                ))}
              </select>
            </label>
            <label>
              Source order
              <input aria-label={`Successor source order ${index + 1}`} type="number" min="1" value={source.sourceOrder} onChange={(event) => updateSource(index, { sourceOrder: Number(event.target.value) })} />
            </label>
            {targetStrategy === 'component_pdfs' && (
              <label>
                Owner node
                <select aria-label={`Successor owner node ${index + 1}`} value={source.ownerNodeKey ?? ''} onChange={(event) => updateSource(index, { ownerNodeKey: event.target.value })}>
                  <option value="">Choose explicit owner</option>
                  {structuralNodes.map((node) => <option key={node.nodeKey} value={node.nodeKey}>{node.nodeKey}</option>)}
                </select>
              </label>
            )}
          </div>
        ))}
        {targetStrategy === 'component_pdfs' && (
          <button type="button" onClick={() => setSources((current) => [...current, emptySource(targetStrategy, current.length)])}>Add component Source</button>
        )}
      </fieldset>
      <div className="book-assembly-successor__remaps">
        <h3>Explicit local-page remaps</h3>
        {groups.map((group) => {
          const draft = remaps[group.pageGroupKey] ?? { sourceKey: '', pages: group.pages.map(() => '') };
          return (
            <fieldset disabled={busy} key={group.pageGroupKey}>
              <legend>{group.pageGroupKey}: {group.sourceKey} pages {group.pages.join(', ')}</legend>
              <label>
                Target source key
                <select aria-label={`Successor mapping source for ${group.pageGroupKey}`} value={draft.sourceKey} onChange={(event) => updateRemap(group.pageGroupKey, { sourceKey: event.target.value })}>
                  <option value="">Choose target source</option>
                  {sources.map((source) => <option key={source.sourceKey} value={source.sourceKey}>{source.sourceKey}</option>)}
                </select>
              </label>
              <div className="book-assembly-successor__pages">
                {draft.pages.map((page, index) => (
                  <label key={`${group.pageGroupKey}-${index}`}>
                    Local page {index + 1}
                    <input aria-label={`Successor local page ${group.pageGroupKey} ${index + 1}`} inputMode="numeric" value={page} onChange={(event) => updateRemap(group.pageGroupKey, { pages: draft.pages.map((value, pageIndex) => pageIndex === index ? event.target.value : value) })} />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="book-assembly-successor__impact" aria-label="Successor impact summary">
        <h3>Impact summary</h3>
        <dl>
          <div><dt>Hierarchy preserved</dt><dd>{plan.impact.preservedHierarchyCount}</dd></div>
          <div><dt>Activities preserved</dt><dd>{plan.impact.preservedActivityCount}</dd></div>
          <div><dt>Page Groups affected</dt><dd>{plan.impact.affectedPageGroupCount}</dd></div>
          <div><dt>Page Groups remapped</dt><dd>{plan.impact.remappedPageGroupCount}</dd></div>
        </dl>
      </div>
      {!plan.valid && (
        <ol className="book-assembly-successor__errors" aria-label="Successor validation errors">
          {plan.errors.map((entry, index) => <li key={`${index}-${entry.code}-${entry.path}`}><code>{entry.code}</code> — {entry.message}</li>)}
        </ol>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <div className="book-assembly-successor__actions">
        <button type="button" disabled={busy || !successorClient} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish successor'}</button>
        <button type="button" disabled={busy} onClick={cancel}>Cancel successor</button>
      </div>
    </section>
  );
};

export default BookAssemblySourceStrategySuccessorPanel;
