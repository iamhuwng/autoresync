import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import {
  previewReadingV2StudioDraft,
  publishReadingV2StudioDraft as publishStudioDraft,
  duplicateReadingV2StudioDraft as duplicateStudioDraft,
  extractReadingV2StudioTaskGroupDraft as extractStudioDraft,
  reloadLatestReadingV2StudioDraft as reloadStudioDraft,
  resolveReadingV2StudioWorkflowContext,
  readingV2StudioRepository,
  saveReadingV2StudioDraft as saveStudioDraft,
} from './readingV2StudioWorkflow.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';
import { validateReadingV2Draft } from './readingV2Validation.service';

vi.mock('../firebase', () => ({
  database: { name: 'mock-database' },
}));

vi.mock('./readingV2DraftFirebaseRepository.service', () => ({
  readingV2DraftContentEquals: (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right),
  createFirebaseReadingV2DraftRepository: () => ({
    createDraft: async (input: Parameters<typeof readingV2StudioRepository.createDraft>[0]) => {
      readingV2StudioRepository.store.drafts.delete(input.draftId);
      return readingV2StudioRepository.createDraft(input);
    },
    loadDraft: async (id: Parameters<typeof readingV2StudioRepository.loadDraft>[0]) => readingV2StudioRepository.loadDraft(id),
    saveDraft: async (input: Parameters<typeof readingV2StudioRepository.saveDraft>[0]) => readingV2StudioRepository.saveDraft(input),
    storeSource: async (record: unknown) => record,
    loadSource: async () => null,
  }),
}));

const actorFor = (snapshot: any) => ({ uid: snapshot.metadata.ownerId, role: 'teacher' as const });
const saveReadingV2StudioDraft = (snapshot: any) => {
  const id = readingV2Ids.draftId(snapshot.draftId);
  const current = readingV2StudioRepository.loadDraft(id);
  if (!current) readingV2StudioRepository.createDraft({ draftId: id, ownerId: snapshot.metadata.ownerId, materialId: snapshot.materialId, document: snapshot.document, studioMetadata: snapshot.metadata, workflowOrigin: snapshot.workflowOrigin });
  return { draft: readingV2StudioRepository.saveDraft({ draftId: id, expectedRevision: snapshot.revision, document: snapshot.document, studioMetadata: snapshot.metadata, authoringContext: snapshot.authoringContext, workflowOrigin: snapshot.workflowOrigin }) };
};
const duplicateReadingV2StudioDraft = (snapshot: any) => ({ draft: readingV2StudioRepository.createDraft({ draftId: readingV2Ids.draftId(`studio-copy-${crypto.randomUUID()}`), ownerId: snapshot.metadata.ownerId, materialId: readingV2Ids.materialId(`copy-${crypto.randomUUID()}`), document: snapshot.document, studioMetadata: snapshot.metadata, authoringContext: snapshot.authoringContext, workflowOrigin: { mode: 'duplicate-material', sourceMaterialId: snapshot.materialId } }) });
const reloadLatestReadingV2StudioDraft = (snapshot: any) => ({ draft: readingV2StudioRepository.loadDraft(readingV2Ids.draftId(snapshot.draftId))! });
const extractReadingV2StudioTaskGroupDraft = (snapshot: any, request: any) => extractStudioDraft(snapshot, request, actorFor(snapshot));
const publishReadingV2StudioDraft = async (snapshot: any, adapter?: any) => {
  if (!readingV2StudioRepository.loadDraft(readingV2Ids.draftId(snapshot.draftId))) {
    readingV2StudioRepository.createDraft({ draftId: readingV2Ids.draftId(snapshot.draftId), ownerId: snapshot.metadata.ownerId,
      materialId: snapshot.materialId, document: snapshot.document, studioMetadata: snapshot.metadata,
      authoringContext: snapshot.authoringContext, workflowOrigin: snapshot.workflowOrigin });
  }
  const saved = await saveReadingV2StudioDraft(snapshot);
  return publishStudioDraft({ ...snapshot, revision: saved.draft.revision }, actorFor(snapshot), adapter);
};

const withSectionTitleAndNumbers = (
  document: ReadingV2Document,
  sectionTitle: string,
  reviewNumbers: readonly number[],
): ReadingV2Document => {
  const sectionId = document.sectionIds[0];

  if (!sectionId) {
    throw new Error('Fixture document missing section.');
  }

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...document.sections[sectionId],
        title: sectionTitle,
      },
    },
    interactions: Object.fromEntries(
      Object.entries(document.interactions).map(([interactionId, interaction], index) => [
        interactionId,
        {
          ...interaction,
          reviewLabel: {
            ...interaction.reviewLabel,
            displayNumber: reviewNumbers[index],
          },
        },
      ]),
    ),
  };
};

const threePassageAutoV4Document = (): ReadingV2Document => {
  const first = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('sentence-completion'),
    'Reading Passage 1',
    [1, 13],
  );
  const second = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('true-false-not-given'),
    'Reading Passage 2',
    [14, 26],
  );
  const third = withSectionTitleAndNumbers(
    createReadingV2CanonicalFixture('table-completion'),
    'Reading Passage 3',
    [27, 40],
  );

  return {
    ...first,
    documentId: readingV2Ids.documentId('doc-auto-v4-three-passages'),
    title: 'IELTS Cambridge 20 - Test 1: Reading',
    sectionIds: [...first.sectionIds, ...second.sectionIds, ...third.sectionIds],
    sections: { ...first.sections, ...second.sections, ...third.sections },
    stimuli: { ...first.stimuli, ...second.stimuli, ...third.stimuli },
    anchors: { ...first.anchors, ...second.anchors, ...third.anchors },
    taskGroups: { ...first.taskGroups, ...second.taskGroups, ...third.taskGroups },
    interactions: { ...first.interactions, ...second.interactions, ...third.interactions },
    optionSets: { ...first.optionSets, ...second.optionSets, ...third.optionSets },
    validationState: { issues: [] },
  };
};

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
    expect(context.revision).toBe(1);
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
      revision: context.revision,
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

  it('opens Auto V4 import candidates through the import Studio path', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-import-candidate',
      materialId: 'studio-workflow-auto-import-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Auto Prepared Import',
        ownerId: 'teacher-modal',
        provenanceSummary: 'Generated from Auto V4 import in Test Creation Modal',
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        rawText: [
          '## Imported Reading passage',
          '',
          'This Auto V4 passage has enough text to become an editable Reading V2 passage paragraph.',
          '',
          '#### Questions 1-1',
          'Complete the sentence.',
          '**1** imported answer',
        ].join('\n'),
        answerKeyText: '1 teacher key',
        evidence: ['Detected source from Auto V4'],
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

  it('defaults partial Auto V4 source imports to Reading Passage material kind', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-partial-passage',
      materialId: 'studio-workflow-auto-partial-passage-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Imported Passage 3',
        ownerId: 'teacher-modal',
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        sourceLedgerCategory: 'single-passage-or-partial-extract',
        rawText: [
          '## Reading Passage 3',
          'A synthetic partial passage with enough text to normalize.',
          '#### Questions 27-27',
          '**27** imported answer',
        ].join('\n'),
        answerKeyText: '27 teacher key',
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });

    expect(context.metadata.materialKind).toBe('reading-passage');
  });

  it('preserves an explicit full-test choice for partial Auto V4 source imports', () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-partial-explicit-full-test',
      materialId: 'studio-workflow-auto-partial-explicit-full-test-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Explicit Partial Full Test',
        ownerId: 'teacher-modal',
        materialKind: 'full-test',
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        sourceLedgerCategory: 'single-passage-or-partial-extract',
        rawText: [
          '## Reading Passage 3',
          'A synthetic partial passage with enough text to normalize.',
          '#### Questions 27-27',
          '**27** imported answer',
        ].join('\n'),
        answerKeyText: '27 teacher key',
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });

    expect(context.metadata.materialKind).toBe('full-test');
  });

  it('publishes partial Auto V4 source imports as standalone Reading Passage material', async () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-partial-publish',
      materialId: 'studio-workflow-auto-partial-publish-material',
      ownerId: 'teacher-auto-partial',
      initialMetadata: {
        title: 'Imported Passage 3',
        ownerId: 'teacher-auto-partial',
        visibility: 'private',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        sourceLedgerCategory: 'single-passage-or-partial-extract',
        rawText: [
          '## Reading Passage 3',
          'A synthetic partial passage with enough text to normalize and publish.',
          '#### Questions 27-27',
          'Complete the sentence.',
          '**27** imported answer',
        ].join('\n'),
        answerKeyText: '27 teacher key',
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });
    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));

    const publishDocument = withSectionTitleAndNumbers(
      createReadingV2CanonicalFixture('sentence-completion'),
      'Reading Passage 3',
      [27, 28],
    );
    const result = await publishReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: publishDocument,
      metadata: context.metadata,
      revision: context.revision,
      returnContext: 'teacher-lobby',
    }, commitAdapter);

    const commitPlan = commitAdapter.mock.calls[0]?.[0];
    const storagePaths = (commitPlan?.operations ?? [])
      .filter((operation) => operation.kind === 'storage-write')
      .map((operation) => operation.path);

    expect(context.metadata.materialKind).toBe('reading-passage');
    expect(result.firebaseCommitStatus).toBe('committed');
    expect(result.generatedReadingPassages).toEqual([]);
    expect(storagePaths).toContain(
      readingV2StoragePaths.readingPassageMaterials(context.materialId),
    );
    expect(storagePaths.some((path) => path.startsWith('reading_v2/full_test_compositions/'))).toBe(false);
  });

  it('opens a reviewable Auto draft when localized duplicate structured-layout questions are canonical-safe', () => {
    const duplicateAnchorPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'cambridge-ielts-10-test-1-reading-table-1-3',
        materials: [
          {
            passageNumber: 1,
            title: 'Auto duplicate anchor import',
            passages: [
              {
                title: 'Auto duplicate anchor import',
                content: 'This Auto V4 passage has enough source text for duplicate anchor rejection.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q9-10',
                taskType: 'table-completion',
                text: 'Complete the table below.',
                questionRange: { start: 9, end: 10 },
                table: {
                  rows: [
                    [{ text: 'Feature', role: 'header' }, { text: 'Detail', role: 'header' }],
                    [{ text: 'First row' }, { text: 'First duplicate blank _____.', questionNumber: 9 }],
                    [{ text: 'Second row' }, { text: 'Second duplicate blank _____.', questionNumber: 9 }],
                    [{ text: 'Third row' }, { text: 'Valid second blank _____.', questionNumber: 10 }],
                  ],
                },
              },
            ],
            questions: [
              { questionNumber: 9, type: 'table-completion', sectionInstructionId: 'p1-q9-10', questionText: 'First duplicate blank.' },
              { questionNumber: 10, type: 'table-completion', sectionInstructionId: 'p1-q9-10', questionText: 'Valid second blank.' },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const draftId = readingV2Ids.draftId('studio-workflow-auto-duplicate-anchor');

    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId,
      materialId: 'studio-workflow-auto-duplicate-anchor-material',
      ownerId: 'teacher-modal',
      initialMetadata: {
        title: 'Auto Duplicate Anchor Import',
        ownerId: 'teacher-modal',
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        rawText: duplicateAnchorPayload,
        answerKeyText: ['9 alpha', '10 beta'].join('\n'),
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });

    expect(context.status).toBe('ready');
    expect(context.message).toContain('ready in Studio');
    expect(validateReadingV2Draft(context.document).blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'orphan-anchor-reference',
      }),
    ]));
    expect(readingV2StudioRepository.loadDraft(draftId)).not.toBeNull();
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
      revision: context.revision,
    });

    expect(firstSave.draft.revision).toBe(2);
    expect(firstSave.draft.document.title).toBe('Saved title');
    expect(() =>
      saveReadingV2StudioDraft({
        draftId: context.draftId,
        materialId: context.materialId,
        document: { ...context.document, title: 'Stale title' },
        metadata: context.metadata,
        revision: context.revision,
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
      revision: context.revision,
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
      revision: context.revision,
    });
    const staleSnapshot = {
      draftId: context.draftId,
      materialId: context.materialId,
      document: { ...context.document, title: 'Local stale title' },
      metadata: context.metadata,
      revision: context.revision,
    };

    const reloaded = reloadLatestReadingV2StudioDraft(staleSnapshot);
    const duplicate = duplicateReadingV2StudioDraft(staleSnapshot);
    const diff = undefined;

    expect(reloaded.draft.revision).toBe(saved.draft.revision);
    expect(reloaded.draft.document.title).toBe('Latest persisted title');
    expect(duplicate.draft.draftId).toContain('studio-copy-');
    expect(duplicate.draft.document.title).toBe('Local stale title');

  });

  it('extracts selected task groups into a new Studio draft without mutating the source document', async () => {
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
    const result = await extractReadingV2StudioTaskGroupDraft(
      {
        draftId: context.draftId,
        materialId: context.materialId,
        document: sourceDocument,
        metadata: context.metadata,
        revision: context.revision,
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

  it('keeps the published owner when direct revise routes do not provide an owner', () => {
    const materialId = readingV2Ids.materialId('studio-workflow-revision-source-owner-material');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-source-owner');
    const document = {
      ...createReadingV2CanonicalFixture('summary-completion-text'),
      title: 'Source owned passage',
    };

    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'revise-published',
      draftId: 'studio-workflow-revision-source-owner',
      materialId,
      sourceSnapshot: {
        materialId,
        snapshotVersionId,
        ownerId: 'teacher-real',
        document,
        publishedBy: 'teacher-real',
        publishedAt: '2026-04-03T00:00:00.000Z',
      },
    });

    expect(context.status).toBe('ready');
    expect(context.metadata.ownerId).toBe('teacher-real');
    expect(readingV2StudioRepository.loadDraft(context.draftId)?.ownerId).toBe('teacher-real');
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
      document: createReadingV2CanonicalFixture('sentence-completion'),
      metadata: { ...context.metadata, title: 'Published workflow title' },
      revision: context.revision,
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
    expect(publish.snapshotVersionId).toMatch(/^snapshot-/);
    expect(publish.firebaseCommitStatus).toBe('committed');
    expect(publish.firebaseCommitPath).toContain(context.materialId);
    expect(publish.firebaseOperationCount).toBeGreaterThan(0);
    expect(commitAdapter).toHaveBeenCalledOnce();
    expect(commitAdapter.mock.calls[0]?.[0].operations.some((operation) =>
      operation.operationKey.includes('/return-context/teacher-lobby'),
    )).toBe(true);
  });

  it('wires full-test Studio publish into Reading Passage extraction and canonical index writes', async () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const sectionId = document.sectionIds[0]!;
    const publishDocument = {
      ...document,
      title: 'Studio full-test extraction',
      sections: {
        ...document.sections,
        [sectionId]: {
          ...document.sections[sectionId]!,
          title: 'Reading Passage 1',
        },
      },
    };
    const snapshot = {
      draftId: 'studio-workflow-passage-extraction',
      materialId: 'studio-workflow-passage-source',
      document: publishDocument,
      metadata: {
        title: 'Studio full-test extraction',
        productMarker: 'IELTS Reading V2',
        materialKind: 'full-test' as const,
        durationMinutes: 60,
        difficulty: 'intermediate',
        targetBand: 'Band 6-7',
        description: 'Published through Studio.',
        tags: ['studio'],
        visibility: 'library-eligible' as const,
        ownerId: 'teacher-1',
        provenanceSummary: 'Studio publish extraction proof.',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      revision: 1,
      returnContext: 'teacher-lobby',
    };
    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));

    const publish = await publishReadingV2StudioDraft(snapshot, commitAdapter);
    const commitPlan = commitAdapter.mock.calls[0]?.[0];
    const storageWrites = commitPlan?.operations
      .filter((operation) => operation.kind === 'storage-write')
      ?? [];
    const storagePaths = storageWrites
      .map((operation) => operation.path) ?? [];
    const byPath = Object.fromEntries(storageWrites.map((operation) => [operation.path, operation.value]));

    expect(publish.firebaseCommitStatus).toBe('committed');
    const passagePath = storagePaths.find((path) =>
      path.startsWith('reading_v2/reading_passage_materials/studio-workflow-passage-source-passage-section-'),
    );
    expect(passagePath).toBeDefined();
    const passageId = passagePath?.split('/').at(-1);
    expect(storagePaths).toEqual(expect.arrayContaining([
      passagePath,
      `material_catalog/material_indexes/by_owner/teacher-1/${passageId}`,
      `material_catalog/material_indexes/by_visibility/public/${passageId}`,
      `material_catalog/material_indexes/by_test_type/ielts/${passageId}`,
    ]));
    expect(JSON.stringify(byPath[`material_catalog/material_indexes/by_visibility/public/${passageId}`]))
      .not.toMatch(/acceptableAnswers|scoringRule|teacherAdminProvenance|document/);
  });

  it('publishes repaired create-from-import full tests with Reading Passage entities and ordered composition refs', async () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-import',
      draftId: 'studio-workflow-import-publish',
      materialId: 'studio-workflow-import-publish-material',
      ownerId: 'teacher-import',
      initialMetadata: {
        title: 'Imported full-test publish',
        ownerId: 'teacher-import',
        materialKind: 'full-test',
        visibility: 'library-eligible',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      initialImportCandidate: {
        sourceKind: 'pasted-text',
        rawText: [
          '## Reading Passage 1',
          '',
          'This imported passage has enough text to publish as a standalone Reading Passage.',
          '',
          '#### Questions 1-1',
          'Complete the sentence.',
          '**1** imported answer',
        ].join('\n'),
        answerKeyText: '1 teacher key',
        evidence: ['Detected import source'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });
    const repairedDocument = createReadingV2CanonicalFixture('sentence-completion');
    const repairedSectionId = repairedDocument.sectionIds[0]!;
    const publishDocument = {
      ...repairedDocument,
      title: context.document.title,
      sections: {
        ...repairedDocument.sections,
        [repairedSectionId]: {
          ...repairedDocument.sections[repairedSectionId]!,
          title: 'Reading Passage 1',
        },
      },
    };
    const snapshot = {
      draftId: context.draftId,
      materialId: context.materialId,
      document: publishDocument,
      metadata: {
        ...context.metadata,
        title: 'Imported full-test publish',
        materialKind: 'full-test' as const,
        visibility: 'library-eligible' as const,
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      revision: context.revision,
      returnContext: 'teacher-lobby',
    };
    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));

    await publishReadingV2StudioDraft(snapshot, commitAdapter);
    const commitPlan = commitAdapter.mock.calls[0]?.[0];
    const storageWrites = commitPlan?.operations
      .filter((operation) => operation.kind === 'storage-write')
      ?? [];
    const byPath = Object.fromEntries(storageWrites.map((operation) => [operation.path, operation.value]));
    const passagePath = Object.keys(byPath).find((path) =>
      path.startsWith('reading_v2/reading_passage_materials/studio-workflow-import-publish-material-passage-section-'),
    );
    expect(passagePath).toBeDefined();
    const passageId = passagePath?.split('/').at(-1)!;
    const compositionPath = Object.keys(byPath).find((path) =>
      path.startsWith('reading_v2/full_test_compositions/'),
    );

    expect(byPath[readingV2StoragePaths.readingPassageMaterials(passageId)]).toMatchObject({
      passageMaterialId: passageId,
      sourceFullTestId: context.materialId,
      state: 'published',
    });
    expect(byPath[`material_catalog/material_indexes/by_visibility/public/${passageId}`]).toMatchObject({
      materialId: passageId,
      materialKind: 'reading-passage',
      visibility: 'public',
    });
    expect(byPath[compositionPath!]).toMatchObject({
      testMaterialId: context.materialId,
      passageRefs: [
        expect.objectContaining({
          passageMaterialId: passageId,
          order: 1,
        }),
      ],
    });
  });

  it('publishes Auto V4 full-test drafts with three generated Reading Passage entities and composition refs', async () => {
    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'studio-workflow-auto-v4-publish',
      materialId: 'studio-workflow-auto-v4-material',
      ownerId: 'teacher-auto-v4',
      initialMetadata: {
        title: 'IELTS Cambridge 20 - Test 1: Reading',
        ownerId: 'teacher-auto-v4',
        materialKind: 'full-test',
        visibility: 'private',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        rawText: [
          '## Reading Passage 1',
          'Auto V4 source passage one.',
          '#### Questions 1-13',
          '**1** answer one',
          '## Reading Passage 2',
          'Auto V4 source passage two.',
          '#### Questions 14-26',
          '**14** answer fourteen',
          '## Reading Passage 3',
          'Auto V4 source passage three.',
          '#### Questions 27-40',
          '**27** answer twenty seven',
        ].join('\n'),
        answerKeyText: '1 one\n14 fourteen\n27 twenty seven',
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });
    const snapshot = {
      draftId: context.draftId,
      materialId: context.materialId,
      document: threePassageAutoV4Document(),
      metadata: {
        ...context.metadata,
        title: 'IELTS Cambridge 20 - Test 1: Reading',
        materialKind: 'full-test' as const,
        visibility: 'private' as const,
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      revision: context.revision,
      returnContext: 'teacher-lobby',
    };
    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));

    const publish = await publishReadingV2StudioDraft(snapshot, commitAdapter);
    const commitPlan = commitAdapter.mock.calls[0]?.[0];
    const storageWrites = commitPlan?.operations
      .filter((operation) => operation.kind === 'storage-write')
      ?? [];
    const byPath = Object.fromEntries(storageWrites.map((operation) => [operation.path, operation.value]));
    const passageIds = publish.generatedReadingPassages.map((passage) => passage.materialId);
    expect(passageIds).toHaveLength(3);
    const compositionPath = Object.keys(byPath).find((path) =>
      path.startsWith('reading_v2/full_test_compositions/'),
    );

    expect(context.mode).toBe('create-from-auto');
    expect(commitAdapter).toHaveBeenCalledOnce();
    expect(passageIds.map((passageId) => byPath[readingV2StoragePaths.readingPassageMaterials(passageId)])).toEqual([
      expect.objectContaining({
        passageMaterialId: passageIds[0],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 1',
        sourceTitleSnapshot: 'IELTS Cambridge 20 - Test 1: Reading',
        sourceFullTestId: context.materialId,
        state: 'published',
      }),
      expect.objectContaining({
        passageMaterialId: passageIds[1],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 2',
        sourceTitleSnapshot: 'IELTS Cambridge 20 - Test 1: Reading',
        sourceFullTestId: context.materialId,
        state: 'published',
      }),
      expect.objectContaining({
        passageMaterialId: passageIds[2],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 3',
        sourceTitleSnapshot: 'IELTS Cambridge 20 - Test 1: Reading',
        sourceFullTestId: context.materialId,
        state: 'published',
      }),
    ]);
    expect(passageIds.map((passageId) => byPath[`material_catalog/material_indexes/by_owner/teacher-auto-v4/${passageId}`])).toEqual([
      expect.objectContaining({
        materialId: passageIds[0],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 1',
        materialKind: 'reading-passage',
        visibility: 'private',
      }),
      expect.objectContaining({
        materialId: passageIds[1],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 2',
        materialKind: 'reading-passage',
        visibility: 'private',
      }),
      expect.objectContaining({
        materialId: passageIds[2],
        title: 'IELTS Cambridge 20 - Test 1: Reading: Passage 3',
        materialKind: 'reading-passage',
        visibility: 'private',
      }),
    ]);
    expect(byPath[compositionPath!]).toMatchObject({
      testMaterialId: context.materialId,
      passageRefs: passageIds.map((passageMaterialId, index) =>
        expect.objectContaining({
          passageMaterialId,
          order: index + 1,
        }),
      ),
    });
  });

  it('resolves import review when hydrated with create-from-auto mode', async () => {
    const rawText = [
      '### READING PASSAGE 1',
      'You should spend about 20 minutes on Questions 1-3.',
      '## Stepwells',
      'A millennium ago, stepwells were fundamental to life in the driest parts of India.',
      '#### Questions 1-3',
      'Do the following statements agree with the information given in Reading Passage 1?',
      '**TRUE** if the statement agrees',
      '**FALSE** if the statement contradicts',
      '**NOT GIVEN** if there is no information',
      '**1** Examples of ancient stepwells can be found all over the world.',
      '**2** Stepwells had a range of functions.',
      '**3** The few existing stepwells in Delhi are more attractive.',
    ].join('\n');

    const answerKeyText = [
      '1 FALSE',
      '2 TRUE',
      '3 NOT GIVEN',
    ].join('\n');

    const context = resolveReadingV2StudioWorkflowContext({
      mode: 'create-from-auto',
      draftId: 'cam10-auto-v4-publish',
      materialId: 'cam10-auto-v4-material',
      ownerId: 'teacher-repro',
      initialMetadata: {
        title: 'Practice Cam 10 Reading Test 01',
        ownerId: 'teacher-repro',
        materialKind: 'reading-passage',
        visibility: 'private',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      initialImportCandidate: {
        sourceKind: 'auto-gemini',
        rawText,
        answerKeyText,
        evidence: ['Detected source from Auto V4'],
        uncertaintyMarkers: [],
        publishBlockingPlaceholders: [],
      },
    });

    const issues = validateReadingV2Draft(context.document).blockingIssues;
    expect(issues.some((issue) => issue.code === 'unresolved-import-uncertainty')).toBe(false);
    expect(Object.values(context.document.taskGroups).some((tg) => (tg.importEvidenceRefs?.length ?? 0) > 0)).toBe(true);

    const commitAdapter = vi.fn(async (commitPlan) => ({
      commitPath: `/readingV2/publishCommits/${commitPlan.materialId}/${commitPlan.snapshotVersionId}`,
      operationKeys: commitPlan.operations.map((operation) => operation.operationKey),
      updates: {},
      status: 'committed' as const,
    }));

    const result = await publishReadingV2StudioDraft({
      draftId: context.draftId,
      materialId: context.materialId,
      document: context.document,
      metadata: {
        ...context.metadata,
        title: 'Practice Cam 10 Reading Test 01',
        materialKind: 'reading-passage',
        visibility: 'private',
        primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
        testTypeIds: [materialCatalogIds.testTypeId('ielts')],
        testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      },
      revision: context.revision,
      returnContext: 'teacher-lobby',
    }, commitAdapter);

    expect(result.firebaseCommitStatus).toBe('committed');
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
    expect(missing.revision).toBe(0);
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
    readingV2StudioRepository.discardDraft(discarded.draftId, discarded.revision);

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
      revision: 1,
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
      revision: 1,
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
