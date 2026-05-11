import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids } from '../../types/readingV2.types';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import {
  previewReadingV2StudioDraft,
  publishReadingV2StudioDraft,
  compareLatestReadingV2StudioDraft,
  duplicateReadingV2StudioDraft,
  extractReadingV2StudioTaskGroupDraft,
  reloadLatestReadingV2StudioDraft,
  resolveReadingV2StudioWorkflowContext,
  readingV2StudioRepository,
  saveReadingV2StudioDraft,
} from './readingV2StudioWorkflow.service';

describe('readingV2StudioWorkflow.service', () => {
  it('resolves create mode into a persisted editable draft context', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-create',
      materialId: 'studio-workflow-material',
      ownerId: 'teacher-1',
    });

    expect(context.status).toBe('ready');
    expect(context.draftId).toBe(readingV2Ids.draftId('studio-workflow-create'));
    expect(context.materialId).toBe(readingV2Ids.materialId('studio-workflow-material'));
    expect(context.revisionToken).toBe('studio-workflow-create-rev-1');
    expect(context.document.deliveryEngine).toBe('reading-v2');
  });

  it('seeds new Reading V2 drafts from modal metadata before Studio opens', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-import',
      draftId: 'studio-workflow-modal-metadata',
      materialId: 'studio-workflow-modal-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Modal Metadata First',
        durationMinutes: 40,
        difficulty: 'advanced',
        targetBand: 'Band 7.5',
        description: 'Created from modal setup.',
        tags: ['reading-v2'],
        ownerId: 'teacher-modal',
        provenanceSummary: 'Started from Test Creation Modal metadata step',
      },
    });

    expect(context.status).toBe('ready');
    expect(context.document.title).toBe('Modal Metadata First');
    expect(context.metadata).toEqual(expect.objectContaining({
      title: 'Modal Metadata First',
      durationMinutes: 40,
      difficulty: 'advanced',
      targetBand: 'Band 7.5',
      description: 'Created from modal setup.',
      tags: ['reading-v2'],
      ownerId: 'teacher-modal',
      provenanceSummary: 'Started from Test Creation Modal metadata step',
    }));
    expect(context.importCandidate).toBeDefined();
  });

  it('opens modal-prepared import candidates directly in editable Studio draft state', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-import',
      draftId: 'studio-workflow-modal-import-candidate',
      materialId: 'studio-workflow-modal-import-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Modal Prepared Import',
        ownerId: 'teacher-modal',
      },
      initialImportCandidate: {
        sourceKind: 'pasted-text',
        rawText: [
          '## Imported Reading passage',
          '',
          'This imported passage has enough text to become an editable Reading V2 passage paragraph after the setup modal parse.',
          '',
          '#### Questions 1-1',
          'Complete the sentence.',
          '**1** imported answer',
        ].join('\n'),
        answerKeyText: '1 teacher key',
        evidence: ['Detected source in modal'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });
    const firstInteraction = Object.values(context.document.interactions)[0];

    expect(context.status).toBe('ready');
    expect(context.document.title).toBe('Modal Prepared Import');
    expect(Object.keys(context.document.taskGroups)).toHaveLength(1);
    expect(firstInteraction?.scoringRule.acceptableAnswers).toEqual(['teacher key']);
    expect(context.importCandidate?.answerKeyText).toBe('1 teacher key');
    expect(context.message).toMatch(/ready in Studio/);

    const preview = previewReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: context.document,
      metadata: context.metadata,
      revisionToken: context.revisionToken,
    });
    const serializedPreview = JSON.stringify(preview);

    expect(preview.projectionKind).toBe('preview');
    expect(preview.runtimeContract).toBe('teacher-preview');
    expect(preview.content.taskGroups[0]?.interactions[0]).toEqual(expect.objectContaining({
      interactionId: firstInteraction?.interactionId,
      displayNumber: 1,
      responseShape: firstInteraction?.responseShape,
    }));
    expect(serializedPreview).not.toContain('teacher key');
    expect(serializedPreview).not.toContain('scoringRule');
  });

  it('opens Auto Gemini import candidates through the import Studio path', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-import-candidate',
      materialId: 'studio-workflow-auto-import-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Auto Prepared Import',
        ownerId: 'teacher-modal',
        provenanceSummary: 'Generated from Auto Gemini import in Test Creation Modal',
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        rawText: [
          '## Imported Reading passage',
          '',
          'This Auto Gemini passage has enough text to become an editable Reading V2 passage paragraph.',
          '',
          '#### Questions 1-1',
          'Complete the sentence.',
          '**1** imported answer',
        ].join('\n'),
        answerKeyText: '1 teacher key',
        evidence: ['Detected source from Auto Gemini'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });

    expect(context.status).toBe('ready');
    expect(context.mode).toBe('create-from-auto');
    expect(context.importCandidate?.sourceKind).toBe('auto-gemini');
    expect(context.message).toMatch(/Auto-generated Reading V2 draft/);
    expect(Object.values(context.document.interactions)[0]?.scoringRule.acceptableAnswers).toEqual(['teacher key']);
  });

  it('saves with revision tokens and rejects stale writes through the repository boundary', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-save',
      ownerId: 'teacher-1',
    });
    const firstSave = saveReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: { ...context.document, title: 'Saved title' },
      metadata: { ...context.metadata, title: 'Saved title' },
      revisionToken: context.revisionToken,
    });

    expect(firstSave.draft.revisionToken).toBe('studio-workflow-save-rev-2');
    expect(firstSave.draft.document.title).toBe('Saved title');
    expect(() =>
      saveReadingV2StudioDraft({
        draftId: context.draftId,
        materialId: context.materialId,
        document: { ...context.document, title: 'Stale title' },
        metadata: context.metadata,
        revisionToken: context.revisionToken,
      }),
    ).toThrow(/stale/i);
  });

  it('persists canonical document, metadata, task-group, interaction, and settings draft edits', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-save-all-edit-types',
      ownerId: 'teacher-1',
    });
    const fixtureDocument = createReadingV2CanonicalFixture('sentence-completion');
    const firstSectionId = fixtureDocument.sectionIds[0]!;
    const firstTaskGroupId = fixtureDocument.sections[firstSectionId]!.taskGroupIds[0]!;
    const firstInteractionId = fixtureDocument.taskGroups[firstTaskGroupId]!.interactionIds[0]!;
    const editedDocument = {
      ...fixtureDocument,
      title: 'Edited canonical document title',
      taskGroups: {
        ...fixtureDocument.taskGroups,
        [firstTaskGroupId]: {
          ...fixtureDocument.taskGroups[firstTaskGroupId]!,
          instructionBlocks: [
            {
              ...fixtureDocument.taskGroups[firstTaskGroupId]!.instructionBlocks[0]!,
              text: 'Edited task-group instruction.',
            },
          ],
        },
      },
      interactions: {
        ...fixtureDocument.interactions,
        [firstInteractionId]: {
          ...fixtureDocument.interactions[firstInteractionId]!,
          scoringRule: {
            maxScore: 1,
            acceptableAnswers: ['edited answer'],
          },
        },
      },
    };
    const saved = saveReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: editedDocument,
      metadata: {
        ...context.metadata,
        title: 'Edited metadata title',
        durationMinutes: 75,
        difficulty: 'advanced',
        visibility: 'library-eligible',
        targetBand: 'Band 8-9',
      },
      revisionToken: context.revisionToken,
    });
    const resumed = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: context.draftId,
      ownerId: 'teacher-1',
    });

    expect(saved.draft.document.title).toBe('Edited canonical document title');
    expect(saved.draft.studioMetadata).toEqual(expect.objectContaining({
      title: 'Edited metadata title',
      durationMinutes: 75,
      difficulty: 'advanced',
      visibility: 'library-eligible',
      targetBand: 'Band 8-9',
    }));
    expect(resumed.document.taskGroups[firstTaskGroupId]?.instructionBlocks[0]?.text).toBe('Edited task-group instruction.');
    expect(resumed.document.interactions[firstInteractionId]?.scoringRule.acceptableAnswers).toEqual(['edited answer']);
    expect(resumed.metadata.title).toBe('Edited metadata title');
    expect(resumed.metadata.durationMinutes).toBe(75);
  });

  it('reloads latest, duplicates draft, and compares stale snapshots through repository handlers', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-conflict',
      ownerId: 'teacher-1',
    });
    const saved = saveReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: { ...context.document, title: 'Latest persisted title' },
      metadata: { ...context.metadata, title: 'Latest persisted title' },
      revisionToken: context.revisionToken,
    });
    const staleSnapshot = {
      draftId: context.draftId,
      materialId: context.materialId,
      document: { ...context.document, title: 'Local stale title' },
      metadata: context.metadata,
      revisionToken: context.revisionToken,
    };

    const reloaded = reloadLatestReadingV2StudioDraft(staleSnapshot);
    const duplicate = duplicateReadingV2StudioDraft(staleSnapshot);
    const diff = compareLatestReadingV2StudioDraft(staleSnapshot);

    expect(reloaded.draft.revisionToken).toBe(saved.draft.revisionToken);
    expect(reloaded.draft.document.title).toBe('Latest persisted title');
    expect(duplicate.draft.draftId).toContain('studio-workflow-conflict-duplicate');
    expect(duplicate.draft.document.title).toBe('Local stale title');
    expect(diff.latestRevisionToken).toBe(saved.draft.revisionToken);
    expect(diff.changedTitle).toBe(true);
  });

  it('extracts selected task groups into a new Studio draft without mutating the source document', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-extract',
      materialId: 'studio-workflow-extract-source',
      ownerId: 'teacher-1',
    });
    const sourceDocument = createReadingV2CanonicalFixture('sentence-completion');
    const firstSectionId = sourceDocument.sectionIds[0]!;
    const firstTaskGroupId = sourceDocument.sections[firstSectionId]!.taskGroupIds[0]!;
    const sourceTitle = sourceDocument.title;
    const result = extractReadingV2StudioTaskGroupDraft(
      {
        draftId: context.draftId,
        materialId: context.materialId,
        document: sourceDocument,
        metadata: context.metadata,
        revisionToken: context.revisionToken,
      },
      {
        taskGroupIds: [firstTaskGroupId],
        materialKind: 'extracted-task-group-material',
      },
    );

    expect(result.draft.draftId).toContain(`${context.materialId}-extract`);
    expect(result.draft.document.title).toContain('extracted task-group material');
    expect(sourceDocument.title).toBe(sourceTitle);
    expect(Object.keys(result.draft.document.taskGroups)).toHaveLength(1);
  });

  it('hydrates revise-published from the latest immutable published snapshot without mutating it', () => {
    const materialId = readingV2Ids.materialId('studio-workflow-revision-material');
    const olderDocument = {
      ...resolveReadingV2StudioWorkflowContext({
        mode: 'create-blank',
        draftId: 'studio-workflow-revision-source-old',
        ownerId: 'teacher-1',
      }).document,
      title: 'Older live title',
    };
    const latestDocument = {
      ...olderDocument,
      title: 'Latest live title',
    };
    readingV2StudioRepository.publishSnapshot({
      materialId,
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-old'),
      ownerId: 'teacher-1',
      document: olderDocument,
      publishedBy: 'teacher-1',
      publishedAt: '2026-04-01T00:00:00.000Z',
    });
    readingV2StudioRepository.publishSnapshot({
      materialId,
      snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-latest'),
      ownerId: 'teacher-1',
      document: latestDocument,
      publishedBy: 'teacher-1',
      publishedAt: '2026-04-02T00:00:00.000Z',
    });

    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'revise-published',
      draftId: 'studio-workflow-revision-draft',
      materialId,
      ownerId: 'teacher-1',
    });

    expect(context.status).toBe('ready');
    expect(context.document.title).toBe('Latest live title');
    expect(context.message).toContain('snapshot-latest');
    expect(readingV2StudioRepository.loadPublishedSnapshot(materialId, readingV2Ids.snapshotVersionId('snapshot-latest'))?.document.title).toBe('Latest live title');
  });

  it('generates local-only preview and commits publish results through the injected adapter', async () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'revise-published',
      draftId: 'studio-workflow-publish',
      materialId: 'studio-workflow-published-material',
      ownerId: 'teacher-1',
    });
    const snapshot = {
      draftId: context.draftId,
      materialId: context.materialId,
      document: context.document,
      metadata: { ...context.metadata, title: 'Published workflow title' },
      revisionToken: context.revisionToken,
      returnContext: 'teacher-lobby',
    };
    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));
    const preview = previewReadingV2StudioDraft(snapshot);
    const publish = await publishReadingV2StudioDraft(snapshot, commitAdapter);

    expect(preview.projectionKind).toBe('preview');
    expect(preview.localOnlyAnswerState).toBe(true);
    expect(publish.materialId).toBe(context.materialId);
    expect(publish.projectionCount).toBeGreaterThan(0);
    expect(publish.snapshotVersionId).toContain(context.materialId);
    expect(publish.firebaseCommitStatus).toBe('committed');
    expect(publish.firebaseCommitPath).toContain(context.materialId);
    expect(publish.firebaseOperationCount).toBeGreaterThan(0);
    expect(commitAdapter).toHaveBeenCalledOnce();
    expect(commitAdapter.mock.calls[0]?.[0].operations.some((operation) =>
      operation.operationKey.includes('/return-context/teacher-lobby'),
    )).toBe(true);
  });

  it('fails closed for missing resume-draft context and blocks create-from-import before normalization', () => {
    const missing = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: 'studio-workflow-missing',
      ownerId: 'teacher-1',
    });
    const importContext = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-import',
      draftId: 'studio-workflow-import',
      ownerId: 'teacher-1',
    });

    expect(missing.status).toBe('missing');
    expect(missing.revisionToken).toBe('missing-draft');
    expect(missing.message).toMatch(/No persisted draft/);
    expect(importContext.importCandidate?.publishBlockingPlaceholders).toContain('Missing answer key for imported question group');
    expect(importContext.document.validationState.issues.map((issue) => issue.code)).toContain('unresolved-import-uncertainty');
  });

  it('fails closed for unauthorized, discarded, malformed, and unsupported-schema draft resumes', () => {
    const authorized = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-fail-closed-authorized',
      ownerId: 'teacher-owner',
    });
    const discarded = resolveReadingV2StudioWorkflowContext({
      mode: 'create-blank',
      draftId: 'studio-workflow-fail-closed-discarded',
      ownerId: 'teacher-1',
    });
    readingV2StudioRepository.discardDraft(discarded.draftId, discarded.revisionToken);

    const malformedDraftId = readingV2Ids.draftId('studio-workflow-fail-closed-malformed');
    const unsupportedSchemaDraftId = readingV2Ids.draftId('studio-workflow-fail-closed-schema');
    readingV2StudioRepository.store.drafts.set(malformedDraftId, {
      draftId: malformedDraftId,
      ownerId: 'teacher-1',
      materialId: readingV2Ids.materialId('malformed-material'),
      document: {
        ...authorized.document,
        sectionIds: ['missing-section' as never],
      },
      revisionToken: 'studio-workflow-fail-closed-malformed-rev-1',
      state: 'draft',
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    });
    readingV2StudioRepository.store.drafts.set(unsupportedSchemaDraftId, {
      draftId: unsupportedSchemaDraftId,
      ownerId: 'teacher-1',
      materialId: readingV2Ids.materialId('unsupported-schema-material'),
      document: {
        ...authorized.document,
        schemaVersion: 999,
      },
      revisionToken: 'studio-workflow-fail-closed-schema-rev-1',
      state: 'draft',
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    });

    const unauthorized = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: authorized.draftId,
      ownerId: 'teacher-other',
    });
    const deleted = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: discarded.draftId,
      ownerId: 'teacher-1',
    });
    const malformed = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: malformedDraftId,
      ownerId: 'teacher-1',
    });
    const unsupportedSchema = resolveReadingV2StudioWorkflowContext({
      mode: 'resume-draft',
      draftId: unsupportedSchemaDraftId,
      ownerId: 'teacher-1',
    });

    expect(unauthorized.status).toBe('invalid');
    expect(unauthorized.message).toMatch(/not owned/);
    expect(deleted.status).toBe('invalid');
    expect(deleted.message).toMatch(/discarded/);
    expect(malformed.status).toBe('invalid');
    expect(malformed.message).toMatch(/missing section/);
    expect(unsupportedSchema.status).toBe('invalid');
    expect(unsupportedSchema.message).toMatch(/Unsupported Reading V2 schema version/);
    expect(unsupportedSchema.document.title).toContain('Invalid draft');
  });
});
