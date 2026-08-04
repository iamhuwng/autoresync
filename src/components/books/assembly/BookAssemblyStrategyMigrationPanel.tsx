import { useMemo, useState } from 'react';
import { toast } from '../../modern';
import type {
  BookAssemblyManifestCandidate,
  BookSourceStrategy,
  TrustedBookSourceVersionProjection,
} from '../../../types/bookAssembly.types';
import type { BookAssemblyCandidateRecord, BookAssemblyMutationResult } from '../../../services/book-assembly/unitAssembly.types';
import type {
  BookAssemblyMigrationClient,
  MigrateAssemblySourceStrategyInput,
} from '../../../services/book-assembly/assemblyClient.browser';
import {
  planSourceStrategyMigration,
  type SourceStrategyMigrationRemap,
} from '../../../services/book-assembly/sourceStrategyMigration.service';

type MigrationSourceDraft = {
  sourceKey: string;
  sourceVersionId: string;
  sourceOrder: number;
  ownerNodeKey?: string;
};

type RemapDraft = {
  sourceKey: string;
  pages: string[];
};

export interface BookAssemblyStrategyMigrationPanelProps {
  readonly bookId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly currentCandidate: BookAssemblyCandidateRecord;
  readonly targetStrategy: BookSourceStrategy;
  readonly migrationClient?: BookAssemblyMigrationClient | null;
  readonly onCandidateConfirmed: (candidate: BookAssemblyCandidateRecord) => void;
  readonly onClosed: () => void;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const operationId = (): string => globalThis.crypto?.randomUUID?.()
  ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

const sourceVersionLabel = (source: TrustedBookSourceVersionProjection): string =>
  `${source.sourceVersionId} (${source.physicalPageCount} pages)`;

const emptySource = (strategy: BookSourceStrategy, index: number): MigrationSourceDraft => ({
  sourceKey: strategy === 'full_pdf' ? 'full' : `component-${index + 1}`,
  sourceVersionId: '',
  sourceOrder: index + 1,
  ...(strategy === 'component_pdfs' ? { ownerNodeKey: '' } : {}),
});

const initialSources = (strategy: BookSourceStrategy): MigrationSourceDraft[] => [emptySource(strategy, 0)];

const initialRemaps = (manifest: BookAssemblyManifestCandidate): Record<string, RemapDraft> => Object.fromEntries(
  manifest.units.flatMap((unit) => unit.pageGroups.map((group) => [
    group.pageGroupKey,
    { sourceKey: '', pages: group.pages.map(() => '') },
  ])),
);

const migrationResultCandidate = (result: BookAssemblyMutationResult): BookAssemblyCandidateRecord | null =>
  result.candidate && result.candidate.manifest ? result.candidate : null;

const BookAssemblyStrategyMigrationPanel = ({
  bookId,
  bookRevision,
  sourceSetRevision,
  sourceVersions,
  currentCandidate,
  targetStrategy,
  migrationClient,
  onCandidateConfirmed,
  onClosed,
  onAction,
}: BookAssemblyStrategyMigrationPanelProps) => {
  const currentManifest = currentCandidate.manifest;
  const [targetSources, setTargetSources] = useState<MigrationSourceDraft[]>(() => initialSources(targetStrategy));
  const [remaps, setRemaps] = useState<Record<string, RemapDraft>>(() => initialRemaps(currentManifest));
  const [stagedCandidate, setStagedCandidate] = useState<BookAssemblyCandidateRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sourceAuthority = useMemo(() => ({
    getSourceVersion: (sourceVersionId: string) =>
      sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
  }), [sourceVersions]);

  const targetSourceSet = useMemo(() => ({
    sourceStrategy: targetStrategy,
    sources: targetSources.map((source) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      sourceOrder: source.sourceOrder,
      ...(targetStrategy === 'component_pdfs' ? { ownerNodeKey: source.ownerNodeKey ?? '' } : {}),
    })),
  }), [targetSources, targetStrategy]);

  const migrationRemaps = useMemo<readonly SourceStrategyMigrationRemap[]>(() => Object.entries(remaps).map(([pageGroupKey, remap]) => ({
    pageGroupKey,
    pages: remap.pages.map((page, index) => {
      const currentGroup = currentManifest.units.flatMap((unit) => unit.pageGroups)
        .find((group) => group.pageGroupKey === pageGroupKey);
      return {
        from: {
          sourceKey: currentGroup?.sourceKey ?? '',
          physicalPageNumber: currentGroup?.pages[index] ?? 0,
        },
        to: {
          sourceKey: remap.sourceKey,
          physicalPageNumber: Number(page),
        },
      };
    }),
  })), [currentManifest, remaps]);

  const plan = useMemo(() => planSourceStrategyMigration({
    bookId,
    bookMode: 'pdf',
    bookRevision,
    sourceSetRevision,
    sourceSet: currentManifest.sourceSet,
    candidate: {
      candidateId: currentCandidate.candidateId,
      revision: currentCandidate.revision,
      bookRevision: currentCandidate.bookRevision,
      sourceSetRevision: currentCandidate.sourceSetRevision,
      manifest: currentManifest,
    },
    target: {
      sourceSetRevision: sourceSetRevision + 1,
      sourceSet: targetSourceSet,
    },
    remaps: migrationRemaps,
    sourceVersionAuthority: sourceAuthority,
  }), [bookId, bookRevision, currentCandidate, currentManifest, migrationRemaps, sourceAuthority, sourceSetRevision, targetSourceSet]);

  const emit = (action: string, metadata: Record<string, unknown> = {}) => {
    onAction?.(action, metadata);
  };

  const updateSource = (index: number, patch: Partial<MigrationSourceDraft>) => {
    setTargetSources((current) => current.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source));
    setStagedCandidate(null);
    setErrorMessage(null);
  };

  const updateRemap = (pageGroupKey: string, patch: Partial<RemapDraft>) => {
    setRemaps((current) => ({ ...current, [pageGroupKey]: { ...current[pageGroupKey], ...patch } }));
    setStagedCandidate(null);
    setErrorMessage(null);
  };

  const prepare = async () => {
    if (!migrationClient || !plan.canApply) {
      setErrorMessage('Complete every explicit Source Set and local-page remap before preparing migration.');
      emit('teacher_materials_book_assembly_strategy_migration_failed', { code: 'plan-invalid' });
      toast.warning('Migration needs explicit source-qualified remaps before it can be prepared.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    emit('teacher_materials_book_assembly_strategy_migration_started', {
      fromStrategy: plan.impact.fromStrategy,
      toStrategy: plan.impact.toStrategy,
    });
    const input: MigrateAssemblySourceStrategyInput = {
      operationId: operationId(),
      bookId,
      unitKey: currentCandidate.unitKey,
      candidateId: currentCandidate.candidateId,
      expectedBookRevision: bookRevision,
      expectedSourceSetRevision: sourceSetRevision,
      expectedCandidateRevision: currentCandidate.revision,
      targetSourceSetRevision: sourceSetRevision + 1,
      targetSourceSet: plan.targetSourceSet,
      remaps: migrationRemaps,
    };
    try {
      const result = await migrationClient.migrate(input);
      const next = migrationResultCandidate(result);
      if (!next) throw new Error('Migration did not return a staged candidate.');
      setStagedCandidate(next);
      emit('teacher_materials_book_assembly_strategy_migration_prepared', {
        candidateId: next.candidateId,
        revision: next.revision,
        currentCandidateId: currentCandidate.candidateId,
      });
      toast.info('Migration candidate prepared. Current candidate remains unchanged until confirmation.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Migration preparation failed.';
      setErrorMessage(message);
      emit('teacher_materials_book_assembly_strategy_migration_failed', { code: 'prepare' });
      toast.error('Migration candidate could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!migrationClient || !stagedCandidate) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await migrationClient.confirm({
        operationId: operationId(),
        bookId,
        unitKey: currentCandidate.unitKey,
        migrationCandidateId: stagedCandidate.candidateId,
        expectedCurrentCandidateId: currentCandidate.candidateId,
        expectedCurrentCandidateRevision: currentCandidate.revision,
        expectedMigrationCandidateRevision: stagedCandidate.revision,
      });
      const next = migrationResultCandidate(result) ?? stagedCandidate;
      onCandidateConfirmed(next);
      emit('teacher_materials_book_assembly_strategy_migration_confirmed', {
        candidateId: next.candidateId,
        revision: next.revision,
      });
      toast.success('Unpublished source strategy migration confirmed.');
      onClosed();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Migration confirmation failed.';
      setErrorMessage(message);
      emit('teacher_materials_book_assembly_strategy_migration_failed', { code: 'confirm' });
      toast.error('Migration confirmation failed; the current candidate was preserved.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      if (stagedCandidate && migrationClient) {
        await migrationClient.discardMigration({
          operationId: operationId(),
          bookId,
          unitKey: currentCandidate.unitKey,
          migrationCandidateId: stagedCandidate.candidateId,
          expectedCurrentCandidateId: currentCandidate.candidateId,
          expectedCurrentCandidateRevision: currentCandidate.revision,
          expectedMigrationCandidateRevision: stagedCandidate.revision,
        });
      }
      emit('teacher_materials_book_assembly_strategy_migration_canceled', {
        stagedCandidateId: stagedCandidate?.candidateId ?? null,
      });
      toast.info('Migration canceled. The original candidate and source bytes remain available.');
      onClosed();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Migration cancellation failed.';
      setErrorMessage(message);
      toast.error('Migration cancellation failed; retry or reload before continuing.');
    } finally {
      setBusy(false);
    }
  };

  const groups = currentManifest.units.flatMap((unit) => unit.pageGroups);
  const structuralNodes = currentManifest.nodes.filter((node) => ['section', 'chapter', 'unit', 'test'].includes(node.nodeType));

  return (
    <section className="book-assembly-workspace__migration" aria-labelledby="book-assembly-migration-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-migration-title">Unpublished source-strategy migration</h2>
          <p>Current candidate stays active until a trusted confirmation. Every page moves by explicit sourceKey and local page identity.</p>
        </div>
        <span data-testid="book-assembly-migration-state">{stagedCandidate ? 'Prepared; confirmation required' : 'Planning'}</span>
      </div>
      <p data-testid="book-assembly-migration-direction">
        {currentManifest.sourceSet.sourceStrategy} → {targetStrategy}
      </p>
      <fieldset disabled={busy || Boolean(stagedCandidate)}>
        <legend>Replacement Source Set</legend>
        {targetSources.map((source, index) => (
          <div className="book-assembly-workspace__migration-source" key={`${index}-${source.sourceKey}`}>
            <label>
              Source key
              <input
                aria-label={`Target source key ${index + 1}`}
                value={source.sourceKey}
                onChange={(event) => updateSource(index, { sourceKey: event.target.value })}
              />
            </label>
            <label>
              Source Version
              <select
                aria-label={`Target Source Version ${index + 1}`}
                value={source.sourceVersionId}
                onChange={(event) => updateSource(index, { sourceVersionId: event.target.value })}
              >
                <option value="">Choose verified Source Version</option>
                {sourceVersions.filter((candidate) => candidate.verifiedUsable).map((candidate) => (
                  <option key={candidate.sourceVersionId} value={candidate.sourceVersionId}>{sourceVersionLabel(candidate)}</option>
                ))}
              </select>
            </label>
            <label>
              Book order
              <input
                aria-label={`Target source order ${index + 1}`}
                type="number"
                min="1"
                value={source.sourceOrder}
                onChange={(event) => updateSource(index, { sourceOrder: Number(event.target.value) })}
              />
            </label>
            {targetStrategy === 'component_pdfs' && (
              <label>
                Owner node
                <select
                  aria-label={`Target owner node ${index + 1}`}
                  value={source.ownerNodeKey ?? ''}
                  onChange={(event) => updateSource(index, { ownerNodeKey: event.target.value })}
                >
                  <option value="">Choose explicit owner</option>
                  {structuralNodes.map((node) => <option key={node.nodeKey} value={node.nodeKey}>{node.nodeKey}</option>)}
                </select>
              </label>
            )}
          </div>
        ))}
        {targetStrategy === 'component_pdfs' && (
          <button type="button" onClick={() => setTargetSources((current) => [...current, emptySource(targetStrategy, current.length)])}>
            Add component Source
          </button>
        )}
      </fieldset>
      <div className="book-assembly-workspace__migration-remaps">
        <h3>Explicit Page Group remaps</h3>
        {groups.length === 0 && <p>No Page Groups need remapping.</p>}
        {groups.map((group) => {
          const draft = remaps[group.pageGroupKey] ?? { sourceKey: '', pages: group.pages.map(() => '') };
          return (
            <fieldset disabled={busy || Boolean(stagedCandidate)} key={group.pageGroupKey}>
              <legend>{group.pageGroupKey}: {group.sourceKey} pages {group.pages.join(', ')}</legend>
              <label>
                Target source key
                <select
                  aria-label={`Target mapping source for ${group.pageGroupKey}`}
                  value={draft.sourceKey}
                  onChange={(event) => updateRemap(group.pageGroupKey, { sourceKey: event.target.value })}
                >
                  <option value="">Choose target source</option>
                  {targetSources.map((source) => <option key={source.sourceKey} value={source.sourceKey}>{source.sourceKey}</option>)}
                </select>
              </label>
              <div className="book-assembly-workspace__migration-pages">
                {draft.pages.map((page, index) => (
                  <label key={`${group.pageGroupKey}-${index}`}>
                    Local page {index + 1}
                    <input
                      aria-label={`Target local page ${group.pageGroupKey} ${index + 1}`}
                      inputMode="numeric"
                      value={page}
                      onChange={(event) => updateRemap(group.pageGroupKey, { pages: draft.pages.map((value, pageIndex) => pageIndex === index ? event.target.value : value) })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="book-assembly-workspace__migration-impact" aria-label="Migration impact summary">
        <h3>Impact summary</h3>
        <dl>
          <div><dt>Hierarchy preserved</dt><dd>{plan.impact.preservedHierarchyCount}</dd></div>
          <div><dt>Activities preserved</dt><dd>{plan.impact.preservedActivityCount}</dd></div>
          <div><dt>Page Groups affected</dt><dd>{plan.impact.affectedPageGroupCount}</dd></div>
          <div><dt>Page Groups explicitly remapped</dt><dd>{plan.impact.remappedPageGroupCount}</dd></div>
        </dl>
      </div>
      {!plan.valid && (
        <ol className="book-assembly-workspace__migration-errors" aria-label="Migration validation errors">
          {plan.errors.map((entry, index) => <li key={`${index}-${entry.code}-${entry.path}`}><code>{entry.code}</code> — {entry.message}</li>)}
        </ol>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {stagedCandidate && <p role="status">Staged candidate {stagedCandidate.candidateId} is retained. Current candidate remains {currentCandidate.candidateId} until confirmation.</p>}
      <div className="book-assembly-workspace__actions">
        {!stagedCandidate && <button type="button" disabled={busy || !migrationClient} onClick={() => void prepare()}>{busy ? 'Preparing...' : 'Prepare migration'}</button>}
        {stagedCandidate && <button type="button" disabled={busy || !migrationClient} onClick={() => void confirm()}>{busy ? 'Confirming...' : 'Confirm migration'}</button>}
        <button type="button" disabled={busy} onClick={() => void cancel()}>{stagedCandidate ? 'Discard migration' : 'Cancel migration'}</button>
      </div>
    </section>
  );
};

export default BookAssemblyStrategyMigrationPanel;
