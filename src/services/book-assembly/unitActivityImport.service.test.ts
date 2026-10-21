import { describe, expect, it, vi } from 'vitest';
import type { ActivityAuthoringService } from '../book-activity/activityAuthoring.service';
import { ActivityAuthoringHttpError } from '../book-activity/activityStorage.service';
import type { EditableActivity } from '../../types/bookActivity.types';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';
import {
  discardStagedUnitActivities,
  parseUnitActivityImportBundle,
  stageUnitActivityImportBundle,
  UnitActivityImportConflictError,
  UnitActivityImportError,
} from './unitActivityImport.service';
import { UNIT_ACTIVITY_IMPORT_PROMPT_VERSION, UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION } from './unitPrompt.service';

const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
  },
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [
      { activityKey: 'activity-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-full-2'] },
      { activityKey: 'activity-b', order: 2, contextRequirement: 'optional', pageGroupKeys: ['pages-full-3'] },
    ],
    pageGroups: [
      { pageGroupKey: 'pages-full-2', sourceKey: 'full', pages: [2], defaultPhysicalPageNumber: 2, activityKeys: ['activity-a'], mode: 'activity' },
      { pageGroupKey: 'pages-full-3', sourceKey: 'full', pages: [3], defaultPhysicalPageNumber: 3, activityKeys: ['activity-b'], mode: 'activity' },
    ],
  }],
};

const activity = (title: string): EditableActivity => ({
  schemaVersion: 1,
  title,
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-select' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{ prompt: 'Pick.', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
});

const bundle = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
  bookId: 'book-1',
  unitKey: 'unit-1',
  slots: [
    {
      activityKey: 'activity-a',
      content: activity('A'),
      evidenceRefs: ['import:activity-a'],
      sourceEvidenceRefs: ['source:full:page:2'],
      answerEvidenceRefs: ['pageGroup:pages-full-2'],
    },
    {
      activityKey: 'activity-b',
      content: activity('B'),
      evidenceRefs: ['import:activity-b'],
      sourceEvidenceRefs: ['source:full:page:3'],
      answerEvidenceRefs: ['pageGroup:pages-full-3'],
    },
  ],
  ...overrides,
});

const authoring = (): ActivityAuthoringService => ({
  stage: vi.fn(async (input) => ({
    status: 'staged',
    candidateId: `candidate-${input.unitActivityBinding?.activityKey}`,
    targetActivityId: input.unitActivityBinding?.activityKey ?? 'generated',
    revision: 1,
    lifecycle: 'staged',
    validation: { valid: true, errors: [] },
    diff: { classification: 'added', reasons: ['import'], requiresRedo: false },
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  validate: vi.fn(async (input) => ({
    status: 'validated' as const,
    candidateId: input.candidateId,
    revision: input.expectedRevision + 1,
    lifecycle: 'validated' as const,
    validation: { valid: true, errors: [] },
    diff: null,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])],
    answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  saveDraft: vi.fn(async (input) => ({
    status: 'saved' as const, activityId: input.candidateId.replace('candidate-', ''), candidateId: input.candidateId,
    candidateRevision: input.expectedRevision + 1, revision: 1, lifecycle: 'saved' as const,
    validation: { valid: true, errors: [] }, diff: null, evidenceRefs: [...(input.evidenceRefs ?? [])],
    sourceEvidenceRefs: [...(input.sourceEvidenceRefs ?? [])], answerEvidenceRefs: [...(input.answerEvidenceRefs ?? [])],
  })),
  discard: vi.fn(),
  loadCandidate: vi.fn(),
});

describe('unit Activity JSON import', () => {
  it('parses one bounded exact-slot bundle for the selected Unit', () => {
    const parsed = parseUnitActivityImportBundle(bundle(), manifest, 'unit-1');

    expect(parsed.slots.map((slot) => slot.activityKey)).toEqual(['activity-a', 'activity-b']);
    expect(parsed.slots[0]?.sourceEvidenceRefs).toEqual(['source:full:page:2']);
  });

  it('edits exactly the selected Activity using its full-manifest page context and explicit replacement', async () => {
    const service = authoring();
    const before = structuredClone(manifest);
    const slot = JSON.parse(bundle()).slots[1];
    const text = bundle({ slots: [slot] });
    const result = await stageUnitActivityImportBundle({ text, manifest, unitKey: 'unit-1',
      selectedActivityKey: 'activity-b', activityAuthoring: service,
      expectedActivityRevisions: { 'activity-b': 7 } });
    expect(result.bundle.slots.map(entry => entry.activityKey)).toEqual(['activity-b']);
    expect(service.stage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      expectedRevision: 7, unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-b' },
      clientValidationContext: { mappedBookPageRefs: ['source:full:page:3'] },
      sourceEvidenceRefs: ['source:full:page:3'],
    }));
    expect(service.validate).toHaveBeenCalledTimes(1);
    expect(service.saveDraft).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-b' }, replaceExistingUnitActivityBinding: true,
    }));
    expect(manifest).toEqual(before);
    expect(() => parseUnitActivityImportBundle(text, manifest, 'unit-1')).toThrow(/exactly match/);
  });

  it.each(['foreign selection', 'missing slot', 'wrong slot', 'duplicate slot', 'extra sibling', 'sibling evidence'])(
    'rejects selected-Activity %s before authoring writes', async kind => {
      const slots = JSON.parse(bundle()).slots;
      let selectedActivityKey = 'activity-b';
      let selectedSlots = [slots[1]];
      if (kind === 'foreign selection') selectedActivityKey = 'activity-foreign';
      if (kind === 'missing slot') selectedSlots = [];
      if (kind === 'wrong slot') selectedSlots = [slots[0]];
      if (kind === 'duplicate slot') selectedSlots = [slots[1], slots[1]];
      if (kind === 'extra sibling') selectedSlots = slots;
      if (kind === 'sibling evidence') selectedSlots[0].sourceEvidenceRefs = ['source:full:page:2'];
      const service = authoring();
      await expect(stageUnitActivityImportBundle({ text: bundle({ slots: selectedSlots }), manifest,
        unitKey: 'unit-1', selectedActivityKey, activityAuthoring: service }))
        .rejects.toBeInstanceOf(UnitActivityImportError);
      expect(service.stage).not.toHaveBeenCalled();
      expect(service.saveDraft).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['malformed JSON', '{', 'invalid-json'],
    ['wrong prompt version', bundle({ promptVersion: 'old' }), 'invalid-prompt-version'],
    ['foreign Unit', bundle({ unitKey: 'unit-2' }), 'foreign-unit'],
    ['missing slot', bundle({ slots: [{ activityKey: 'activity-a', content: activity('A') }] }), 'slot-mismatch'],
    ['extra slot', bundle({ slots: [
      { activityKey: 'activity-a', content: activity('A') },
      { activityKey: 'activity-b', content: activity('B') },
      { activityKey: 'activity-c', content: activity('C') },
    ] }), 'slot-mismatch'],
    ['duplicate slot', bundle({ slots: [
      { activityKey: 'activity-a', content: activity('A') },
      { activityKey: 'activity-a', content: activity('A2') },
    ] }), 'duplicate-slot'],
    ['cross-source ref', bundle({ slots: [
      { activityKey: 'activity-a', content: activity('A'), sourceEvidenceRefs: ['source:other:page:9'] },
      { activityKey: 'activity-b', content: activity('B') },
    ] }), 'cross-source-evidence'],
    ['cross-slot page ref', bundle({ slots: [
      { activityKey: 'activity-a', content: activity('A'), sourceEvidenceRefs: ['source:full:page:3'] },
      { activityKey: 'activity-b', content: activity('B') },
    ] }), 'cross-source-evidence'],
    ['forbidden authority', bundle({ slots: [
      { activityKey: 'activity-a', content: { ...activity('A'), providerObjectKey: 'secret' } },
      { activityKey: 'activity-b', content: activity('B') },
    ] }), 'forbidden-field'],
    ['hidden owner node key', bundle({ slots: [
      { activityKey: 'activity-a', content: { ...activity('A'), ownerNodeKey: 'section-secret' } },
      { activityKey: 'activity-b', content: activity('B') },
    ] }), 'forbidden-field'],
  ])('rejects %s atomically', async (_label, text, code) => {
    const service = authoring();

    await expect(stageUnitActivityImportBundle({
      text,
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
    })).rejects.toMatchObject({ code });
    expect(service.stage).not.toHaveBeenCalled();
  });

  it('stages, validates, and saves every slot through 12C with server binding context', async () => {
    const service = authoring();
    const result = await stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
    });

    expect(result.staged).toHaveLength(2);
    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedRevision: 0,
      sourceEvidenceRefs: ['source:full:page:2'],
      answerEvidenceRefs: ['pageGroup:pages-full-2'],
    }));
    expect(service.validate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      candidateId: 'candidate-activity-a', expectedRevision: 1,
    }));
    expect(service.saveDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({
      candidateId: 'candidate-activity-a', expectedRevision: 2,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    }));
  });

  it('sends logical slot identity and leaves canonical Activity target selection to the server', async () => {
    const service = authoring();
    await stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
    });

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    }));
    expect(vi.mocked(service.stage).mock.calls[0]?.[0]).not.toHaveProperty('targetActivityId');
  });

  it('surfaces the authoritative Activity target revision without overwriting it', async () => {
    const service = authoring();
    vi.mocked(service.stage).mockRejectedValueOnce(new ActivityAuthoringHttpError(409, {
      status: 'conflict',
      currentRevision: 1,
    }));

    await expect(stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
    })).rejects.toEqual(expect.objectContaining<UnitActivityImportConflictError>({
      code: 'activity-revision-conflict',
      activityKey: 'activity-a',
      currentRevision: 1,
    }));

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedRevision: 0,
    }));
    expect(service.stage).toHaveBeenCalledTimes(1);
    expect(service.validate).not.toHaveBeenCalled();
  });

  it('uses an explicitly supplied Activity revision for a teacher-approved replacement', async () => {
    const service = authoring();

    await stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
      expectedActivityRevisions: { 'activity-a': 1 },
    });

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      expectedRevision: 1,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    }));
    expect(service.saveDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({
      replaceExistingUnitActivityBinding: true,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    }));
  });

  it('discards already staged candidates when a later 12C stage fails', async () => {
    const service = authoring();
    vi.mocked(service.stage)
      .mockResolvedValueOnce({
        status: 'staged',
        candidateId: 'candidate-activity-a',
        targetActivityId: 'activity-a',
        revision: 7,
        lifecycle: 'staged',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
      })
      .mockRejectedValueOnce(new Error('stage failed'));

    await expect(stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
    })).rejects.toThrow('stage failed');
    expect(service.discard).toHaveBeenCalledWith({
      candidateId: 'candidate-activity-a',
      expectedRevision: 9,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    });
  });

  it('honors cancellation before staging a slot', async () => {
    const service = authoring();
    const controller = new AbortController();
    controller.abort();

    await expect(stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'canceled' });
    expect(service.stage).not.toHaveBeenCalled();
  });

  it('discards staged candidates during rollback helper', async () => {
    const service = authoring();
    await discardStagedUnitActivities(service, [{
      status: 'staged',
      candidateId: 'candidate-activity-a',
      targetActivityId: 'activity-a',
      revision: 2,
      lifecycle: 'staged',
      validation: { valid: true, errors: [] },
      diff: null,
      evidenceRefs: [],
    }]);

    expect(service.discard).toHaveBeenCalledWith({
      candidateId: 'candidate-activity-a',
      expectedRevision: 2,
    });
  });
});
