import { describe, expect, it, vi } from 'vitest';
import type { ActivityAuthoringService } from '../book-activity/activityAuthoring.service';
import { ActivityAuthoringHttpError } from '../book-activity/activityStorage.service';
import type { EditableActivity } from '../../types/bookActivity.types';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';
import {
  bookScopedActivityTargetId,
  detectBulkUnitActivityPayload,
  discardStagedUnitActivities,
  parseBulkUnitActivityImportBundles,
  parseUnitActivityImportBundle,
  stageUnitActivityImportBundle,
  UnitActivityImportConflictError,
  UnitActivityImportError,
  UnitActivityImportPartialCommitError,
} from './unitActivityImport.service';
import {
  BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
  UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
} from './unitPrompt.service';

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
    candidateId: `candidate-${input.targetActivityId}`,
    targetActivityId: input.targetActivityId ?? 'generated',
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
  it('derives collision-free Activity targets from the Book and logical slot identities', () => {
    expect(bookScopedActivityTargetId('book-1', 'activity-a'))
      .toBe('ba_626f6f6b2d31_61637469766974792d61');
    expect(bookScopedActivityTargetId('book-2', 'activity-a'))
      .not.toBe(bookScopedActivityTargetId('book-1', 'activity-a'));
    expect(bookScopedActivityTargetId('book-1', 'activity:a'))
      .not.toBe(bookScopedActivityTargetId('book-1', 'activity_3aa'));
  });

  it('keeps long Book and Activity slot identifiers bounded and collision-free within the 160-char authoring ID contract', () => {
    const first = bookScopedActivityTargetId('b'.repeat(128), 'a'.repeat(128));
    const second = bookScopedActivityTargetId('b'.repeat(128), `${'a'.repeat(127)}c`);
    expect(first.length).toBeLessThanOrEqual(160);
    expect(first).toMatch(/^ba_h_[0-9a-f]{48}$/u);
    expect(first).not.toBe(second);
  });

  it('parses one bounded exact-slot bundle for the selected Unit', () => {
    const parsed = parseUnitActivityImportBundle(bundle(), manifest, 'unit-1');

    expect(parsed.slots.map((slot) => slot.activityKey)).toEqual(['activity-a', 'activity-b']);
    expect(parsed.slots[0]?.sourceEvidenceRefs).toEqual(['source:full:page:2']);
  });

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
      resolveActivityTargetId: (slot) => slot.activityKey,
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
      resolveActivityTargetId: (slot) => slot.activityKey,
    });

    expect(result.staged).toHaveLength(2);
    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetActivityId: 'activity-a',
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

  it('uses trusted slot-to-Activity target resolution instead of treating logical keys as the only authority', async () => {
    const service = authoring();
    await stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
      resolveActivityTargetId: (slot) => `resolved-${slot.activityKey}`,
    });

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetActivityId: 'resolved-activity-a',
    }));
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
      resolveActivityTargetId: (slot) => slot.activityKey,
    })).rejects.toEqual(expect.objectContaining<UnitActivityImportConflictError>({
      code: 'activity-revision-conflict',
      activityKey: 'activity-a',
      currentRevision: 1,
    }));

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetActivityId: 'activity-a',
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
      resolveActivityTargetId: (slot) => slot.activityKey,
    });

    expect(service.stage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetActivityId: 'activity-a',
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
      resolveActivityTargetId: (slot) => slot.activityKey,
    })).rejects.toThrow('stage failed');
    expect(service.saveDraft).not.toHaveBeenCalled();
    expect(service.discard).toHaveBeenCalledWith({
      candidateId: 'candidate-activity-a',
      expectedRevision: 8,
      unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
    });
  });

  it('rejects unresolved Activity target IDs before 12C staging', async () => {
    const service = authoring();

    await expect(stageUnitActivityImportBundle({
      text: bundle(),
      manifest,
      unitKey: 'unit-1',
      activityAuthoring: service,
      resolveActivityTargetId: () => null,
    })).rejects.toMatchObject({ code: 'unresolved-activity-target' });
    expect(service.stage).not.toHaveBeenCalled();
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
      resolveActivityTargetId: (slot) => slot.activityKey,
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

  describe('bulk Unit Activity JSON import', () => {
    const twoUnitManifest: BookAssemblyManifestCandidate = {
      ...manifest,
      nodes: [
        { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
        { nodeKey: 'unit-2', parentNodeKey: null, nodeType: 'unit', order: 2 },
      ],
      units: [
        manifest.units[0]!,
        {
          unitKey: 'unit-2',
          activitySlots: [{ activityKey: 'u2-a', order: 1, contextRequirement: 'required', pageGroupKeys: ['u2-p5'] }],
          pageGroups: [{ pageGroupKey: 'u2-p5', sourceKey: 'full', pages: [5], defaultPhysicalPageNumber: 5, activityKeys: ['u2-a'], mode: 'activity' }],
        },
      ],
    };

    const bulkEnvelope = JSON.stringify({
      promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
      schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
      bookId: 'book-1',
      units: [
        {
          unitKey: 'unit-1',
          slots: [
            { activityKey: 'activity-a', content: activity('U1 A'), sourceEvidenceRefs: ['source:full:page:2'] },
            { activityKey: 'activity-b', content: activity('U1 B'), sourceEvidenceRefs: ['source:full:page:3'] },
          ],
        },
        {
          unitKey: 'unit-2',
          slots: [
            { activityKey: 'u2-a', content: activity('U2 A'), sourceEvidenceRefs: ['source:full:page:5'] },
          ],
        },
      ],
    });

    it('detects bulk payloads and parses canonical bulk envelopes, fenced JSON, arrays of unit bundles, and single-unit bundles', () => {
      expect(detectBulkUnitActivityPayload(bulkEnvelope)).toBe(true);
      expect(detectBulkUnitActivityPayload(bundle())).toBe(false);

      const fromEnvelope = parseBulkUnitActivityImportBundles(`\`\`\`json\n${bulkEnvelope}\n\`\`\``, twoUnitManifest);
      expect(fromEnvelope.map((entry) => entry.unitKey)).toEqual(['unit-1', 'unit-2']);
      expect(fromEnvelope[1]?.slots[0]?.activityKey).toBe('u2-a');

      const fromArray = parseBulkUnitActivityImportBundles(JSON.stringify([
        JSON.parse(bundle()),
        {
          promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
          schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
          bookId: 'book-1',
          unitKey: 'unit-2',
          slots: [{ activityKey: 'u2-a', content: activity('U2 A'), sourceEvidenceRefs: ['source:full:page:5'] }],
        },
      ]), twoUnitManifest);
      expect(fromArray.map((entry) => entry.unitKey)).toEqual(['unit-1', 'unit-2']);

      const fromEnvelopeArray = parseBulkUnitActivityImportBundles(JSON.stringify([
        {
          promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
          schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
          bookId: 'book-1',
          units: [{
            unitKey: 'unit-1',
            slots: [
              { activityKey: 'activity-a', content: activity('U1 A'), sourceEvidenceRefs: ['source:full:page:2'] },
              { activityKey: 'activity-b', content: activity('U1 B'), sourceEvidenceRefs: ['source:full:page:3'] },
            ],
          }],
        },
        {
          promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
          schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
          bookId: 'book-1',
          units: [{
            unitKey: 'unit-2',
            slots: [{ activityKey: 'u2-a', content: activity('U2 A'), sourceEvidenceRefs: ['source:full:page:5'] }],
          }],
        },
      ]), twoUnitManifest);
      expect(fromEnvelopeArray.map((entry) => entry.unitKey)).toEqual(['unit-1', 'unit-2']);

      const fromSingle = parseBulkUnitActivityImportBundles(bundle(), twoUnitManifest);
      expect(fromSingle.map((entry) => entry.unitKey)).toEqual(['unit-1']);
    });

    it('rejects duplicate units, unknown units, missing metadata, foreign-book bulk envelopes in arrays, and book outline JSON', () => {
      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify({
        promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
        schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
        bookId: 'book-1',
        units: [
          { unitKey: 'unit-2', slots: [{ activityKey: 'u2-a', content: activity('A') }] },
          { unitKey: 'unit-2', slots: [{ activityKey: 'u2-a', content: activity('B') }] },
        ],
      }), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'duplicate-unit' }));

      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify({
        promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
        schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
        bookId: 'book-1',
        units: [{ unitKey: 'unit-99', slots: [{ activityKey: 'x', content: activity('A') }] }],
      }), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'unknown-unit' }));

      // Missing root metadata on bulk envelope or array items MUST fail closed
      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify({
        units: [{ unitKey: 'unit-2', slots: [{ activityKey: 'u2-a', content: activity('A') }] }],
      }), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'missing-field' }));

      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify([
        { unitKey: 'unit-2', slots: [{ activityKey: 'u2-a', content: activity('A') }] },
      ]), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'missing-field' }));

      // Foreign-book bulk envelope inside multi-file merged array MUST fail closed
      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify([
        JSON.parse(bundle()),
        {
          promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
          schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
          bookId: 'book-other',
          units: [{ unitKey: 'unit-2', slots: [{ activityKey: 'u2-a', content: activity('A') }] }],
        },
      ]), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'foreign-unit' }));

      expect(() => parseBulkUnitActivityImportBundles(JSON.stringify({
        nodes: [{ nodeKey: 'unit-1', nodeType: 'unit', order: 1 }],
        units: [{ unitKey: 'unit-1', activitySlots: [], pageGroups: [] }],
      }), twoUnitManifest)).toThrowError(expect.objectContaining({ code: 'wrong-import-surface' }));
    });

    it('accepts reference_only page groups (such as transcripts and answer keys) belonging to the same Unit in sourceEvidenceRefs and answerEvidenceRefs while still rejecting other units', () => {
      const listeningManifest: BookAssemblyManifestCandidate = {
        ...twoUnitManifest,
        units: [
          {
            ...twoUnitManifest.units[0]!,
            pageGroups: [
              ...twoUnitManifest.units[0]!.pageGroups,
              {
                pageGroupKey: 'pages-unit-1-transcript',
                sourceKey: 'full',
                pages: [88, 89],
                defaultPhysicalPageNumber: 88,
                activityKeys: [],
                mode: 'reference_only',
              },
            ],
          },
          {
            ...twoUnitManifest.units[1]!,
            pageGroups: [
              ...twoUnitManifest.units[1]!.pageGroups,
              {
                pageGroupKey: 'pages-unit-2-transcript',
                sourceKey: 'full',
                pages: [90],
                defaultPhysicalPageNumber: 90,
                activityKeys: [],
                mode: 'reference_only',
              },
            ],
          },
        ],
      };

      const parsed = parseUnitActivityImportBundle(bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: activity('A'),
            evidenceRefs: ['import:activity-a'],
            sourceEvidenceRefs: ['source:full:page:2', 'pageGroup:pages-unit-1-transcript'],
            answerEvidenceRefs: ['source:full:page:88'],
          },
          {
            activityKey: 'activity-b',
            content: activity('B'),
            evidenceRefs: ['import:activity-b'],
            sourceEvidenceRefs: ['source:full:page:3'],
            answerEvidenceRefs: ['pageGroup:pages-unit-1-transcript'],
          },
        ],
      }), listeningManifest, 'unit-1');
      expect(parsed.slots[0]?.sourceEvidenceRefs).toContain('pageGroup:pages-unit-1-transcript');
      expect(parsed.slots[0]?.answerEvidenceRefs).toContain('source:full:page:88');

      // Reference page group belonging to Unit 2 MUST still fail closed when cited in Unit 1
      expect(() => parseUnitActivityImportBundle(bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: activity('A'),
            sourceEvidenceRefs: ['pageGroup:pages-unit-2-transcript'],
          },
          { activityKey: 'activity-b', content: activity('B') },
        ],
      }), listeningManifest, 'unit-1')).toThrowError(expect.objectContaining({ code: 'cross-source-evidence' }));
    });

    it('accepts teacher_only page groups in answerEvidenceRefs, rejects them in sourceEvidenceRefs, and enforces the 64-ref evidence limit', () => {
      const pages65 = Array.from({ length: 65 }, (_, index) => index + 10);
      const manifestWithTeacherKey: BookAssemblyManifestCandidate = {
        ...twoUnitManifest,
        units: [
          {
            ...twoUnitManifest.units[0]!,
            pageGroups: [
              ...twoUnitManifest.units[0]!.pageGroups,
              {
                pageGroupKey: 'pages-unit-1-answer-key',
                sourceKey: 'full',
                pages: pages65,
                defaultPhysicalPageNumber: 10,
                activityKeys: [],
                mode: 'teacher_only',
              },
            ],
          },
          twoUnitManifest.units[1]!,
        ],
      };

      const accepted = parseUnitActivityImportBundle(bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: activity('A'),
            sourceEvidenceRefs: ['source:full:page:2'],
            answerEvidenceRefs: ['pageGroup:pages-unit-1-answer-key', 'source:full:page:10'],
          },
          { activityKey: 'activity-b', content: activity('B') },
        ],
      }), manifestWithTeacherKey, 'unit-1');
      expect(accepted.slots[0]?.answerEvidenceRefs).toEqual(['pageGroup:pages-unit-1-answer-key', 'source:full:page:10']);

      expect(() => parseUnitActivityImportBundle(bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: activity('A'),
            sourceEvidenceRefs: ['pageGroup:pages-unit-1-answer-key'],
          },
          { activityKey: 'activity-b', content: activity('B') },
        ],
      }), manifestWithTeacherKey, 'unit-1')).toThrowError(expect.objectContaining({ code: 'cross-source-evidence' }));

      expect(() => parseUnitActivityImportBundle(bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: activity('A'),
            answerEvidenceRefs: pages65.map((page) => `source:full:page:${page}`),
          },
          { activityKey: 'activity-b', content: activity('B') },
        ],
      }), manifestWithTeacherKey, 'unit-1')).toThrowError(expect.objectContaining({ code: 'evidence-limit-exceeded' }));
    });

    it('stages and validates all slots before saving any draft so a conflict on a later slot leaves earlier slots untouched', async () => {
      const saveDraft = vi.fn();
      const discard = vi.fn().mockResolvedValue({ status: 'discarded', candidateId: 'cand-a', revision: 3, lifecycle: 'discarded' });
      const stage = vi.fn()
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-a',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-a'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        })
        .mockRejectedValueOnce(new ActivityAuthoringHttpError(409, { status: 'conflict', currentRevision: 2 }));
      const validate = vi.fn().mockResolvedValue({
        status: 'validated',
        candidateId: 'cand-a',
        revision: 2,
        lifecycle: 'validated',
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
        sourceEvidenceRefs: [],
        answerEvidenceRefs: [],
      });

      await expect(stageUnitActivityImportBundle({
        text: bundle(),
        manifest,
        unitKey: 'unit-1',
        activityAuthoring: {
          stage,
          validate,
          saveDraft,
          discard,
          loadCandidate: vi.fn(),
        },
        resolveActivityTargetId: (slot) => bookScopedActivityTargetId('book-1', slot.activityKey),
      })).rejects.toThrow(UnitActivityImportConflictError);

      expect(saveDraft).not.toHaveBeenCalled();
      expect(discard).toHaveBeenCalledTimes(1);
      expect(discard).toHaveBeenCalledWith({
        candidateId: 'cand-a',
        expectedRevision: 2,
        unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
      });
    });

    it('discards only remaining uncommitted slots if Phase 2 saveDraft fails mid-way without touching committed slots', async () => {
      const discard = vi.fn().mockResolvedValue({ status: 'discarded', candidateId: 'cand-b', revision: 3, lifecycle: 'discarded' });
      const saveDraft = vi.fn()
        .mockResolvedValueOnce({
          status: 'saved',
          activityId: bookScopedActivityTargetId('book-1', 'activity-a'),
          candidateId: 'cand-a',
          candidateRevision: 3,
          revision: 1,
          lifecycle: 'saved',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        })
        .mockRejectedValueOnce(new Error('network_failure_slot_2'));
      const stage = vi.fn()
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-a',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-a'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        })
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-b',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-b'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        });
      const validate = vi.fn(async (input: { candidateId: string; expectedRevision: number }) => ({
        status: 'validated' as const,
        candidateId: input.candidateId,
        revision: input.expectedRevision + 1,
        lifecycle: 'validated' as const,
        validation: { valid: true, errors: [] },
        diff: null,
        evidenceRefs: [],
        sourceEvidenceRefs: [],
        answerEvidenceRefs: [],
      }));

      await expect(stageUnitActivityImportBundle({
        text: bundle(),
        manifest,
        unitKey: 'unit-1',
        activityAuthoring: { stage, validate, saveDraft, discard, loadCandidate: vi.fn() },
        resolveActivityTargetId: (slot) => bookScopedActivityTargetId('book-1', slot.activityKey),
      })).rejects.toThrow('network_failure_slot_2');

      expect(discard).toHaveBeenCalledTimes(1);
      expect(discard).toHaveBeenCalledWith({
        candidateId: 'cand-b',
        expectedRevision: 2,
        unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-b' },
      });
    });

    it('invokes onCommitPhaseStart before Phase 2 and compensates already-committed slots using previousSnapshotsBySlot on Phase 2 failure', async () => {
      const events: string[] = [];
      const discard = vi.fn().mockResolvedValue({ status: 'discarded', candidateId: 'cand-b', revision: 3, lifecycle: 'discarded' });
      const stage = vi.fn()
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-a',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-a'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        })
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-b',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-b'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        })
        .mockResolvedValueOnce({
          status: 'staged',
          candidateId: 'cand-a-rollback',
          targetActivityId: bookScopedActivityTargetId('book-1', 'activity-a'),
          revision: 1,
          lifecycle: 'staged',
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        });
      const validate = vi.fn(async (input: { candidateId: string; expectedRevision: number }) => {
        events.push(`validate:${input.candidateId}`);
        return {
          status: 'validated' as const,
          candidateId: input.candidateId,
          revision: input.expectedRevision + 1,
          lifecycle: 'validated' as const,
          validation: { valid: true, errors: [] },
          diff: null,
          evidenceRefs: [],
          sourceEvidenceRefs: [],
          answerEvidenceRefs: [],
        };
      });
      const saveDraft = vi.fn()
        .mockImplementationOnce(async () => {
          events.push('save:cand-a');
          return {
            status: 'saved' as const,
            activityId: bookScopedActivityTargetId('book-1', 'activity-a'),
            candidateId: 'cand-a',
            candidateRevision: 3,
            revision: 2,
            lifecycle: 'saved' as const,
            validation: { valid: true, errors: [] },
            diff: null,
            evidenceRefs: [],
            sourceEvidenceRefs: [],
            answerEvidenceRefs: [],
          };
        })
        .mockImplementationOnce(async () => {
          events.push('save:cand-b-fail');
          throw new Error('network_failure_slot_2');
        })
        .mockImplementationOnce(async () => {
          events.push('save:cand-a-rollback');
          return {
            status: 'saved' as const,
            activityId: bookScopedActivityTargetId('book-1', 'activity-a'),
            candidateId: 'cand-a-rollback',
            candidateRevision: 3,
            revision: 3,
            lifecycle: 'saved' as const,
            validation: { valid: true, errors: [] },
            diff: null,
            evidenceRefs: [],
            sourceEvidenceRefs: [],
            answerEvidenceRefs: [],
          };
        });

      const previousA = activity('Previous A');
      let caught: unknown;
      try {
        await stageUnitActivityImportBundle({
          text: bundle(),
          manifest,
          unitKey: 'unit-1',
          activityAuthoring: { stage, validate, saveDraft, discard, loadCandidate: vi.fn() },
          resolveActivityTargetId: (slot) => bookScopedActivityTargetId('book-1', slot.activityKey),
          expectedActivityRevisions: { 'activity-a': 1 },
          previousSnapshotsBySlot: {
            'activity-a': {
              content: previousA,
              evidenceRefs: ['import:prev-a'],
              sourceEvidenceRefs: ['source:full:page:2'],
              answerEvidenceRefs: ['pageGroup:pages-full-2'],
            },
          },
          onCommitPhaseStart: () => {
            events.push('commit-phase-start');
          },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnitActivityImportPartialCommitError);
      expect(caught).toMatchObject({
        code: 'partial-commit-rolled-back',
        committedActivityKeys: ['activity-a'],
        rolledBackActivityKeys: ['activity-a'],
        failedActivityKey: 'activity-b',
      });
      // onCommitPhaseStart runs strictly after Phase 1 validation and before Phase 2 saveDraft
      expect(events).toEqual([
        'validate:cand-a',
        'validate:cand-b',
        'commit-phase-start',
        'save:cand-a',
        'save:cand-b-fail',
        'validate:cand-a-rollback',
        'save:cand-a-rollback',
      ]);
      // Uncommitted slot 2 candidate discarded
      expect(discard).toHaveBeenCalledWith({
        candidateId: 'cand-b',
        expectedRevision: 2,
        unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-b' },
      });
      // Compensating rollback re-staged slot 1's previous content at the new revision (2) and saved with replaceExistingUnitActivityBinding: true
      expect(stage).toHaveBeenNthCalledWith(3, expect.objectContaining({
        targetActivityId: bookScopedActivityTargetId('book-1', 'activity-a'),
        expectedRevision: 2,
        content: previousA,
        sourceEvidenceRefs: ['source:full:page:2'],
      }));
      expect(saveDraft).toHaveBeenNthCalledWith(3, expect.objectContaining({
        candidateId: 'cand-a-rollback',
        replaceExistingUnitActivityBinding: true,
        unitActivityBinding: { unitKey: 'unit-1', activityKey: 'activity-a' },
      }));
    });

    it('allows ordinary textbook URLs in activity prompts while still blocking private storage URLs and script tags', () => {
      const textbookUrlBundle = bundle({
        slots: [
          {
            activityKey: 'activity-a',
            content: {
              ...activity('Check schedule'),
              instructions: [{ text: 'Read https://example.org/timetable before listening.' }],
            },
          },
          { activityKey: 'activity-b', content: activity('B') },
        ],
      });
      expect(parseUnitActivityImportBundle(textbookUrlBundle, manifest, 'unit-1').slots).toHaveLength(2);

      for (const badText of [
        'Download from b2://private-bucket/file.pdf',
        'Link https://f002.backblazeb2.com/file/secret',
        'Link https://mybucket.r2.cloudflarestorage.com/obj',
        '<script>alert(1)</script>',
      ]) {
        const forbiddenBundle = bundle({
          slots: [
            {
              activityKey: 'activity-a',
              content: { ...activity('Bad'), instructions: [{ text: badText }] },
            },
            { activityKey: 'activity-b', content: activity('B') },
          ],
        });
        expect(() => parseUnitActivityImportBundle(forbiddenBundle, manifest, 'unit-1'))
          .toThrowError(expect.objectContaining({ code: 'forbidden-field' }));
      }
    });
  });
});
