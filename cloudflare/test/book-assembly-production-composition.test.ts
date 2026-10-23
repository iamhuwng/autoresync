import { describe, expect, it } from 'vitest';
import {
  createProductionBookAssemblyRouteOptions,
  isFullPdfPublicationSourceReady,
  readExactSavedActivityContent,
  readVerifiedDraftActivityKeys,
  readVerifiedDraftActivities,
} from '../src/upload-worker/book-assembly/production-composition.ts';
import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service.ts';
import { fingerprintComponentPdfActivationValue } from '../../src/services/book-assembly/componentPdfActivation.service.ts';

const source = (overrides: Record<string, unknown> = {}) => ({
  sourceVersionId: 'source-v1',
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  purpose: 'book-source',
  studentSafeStatus: 'ready',
  studentSafeDecision: {
    decidedBy: 'teacher-1',
    decidedAt: '2026-08-01T00:00:00.000Z',
    sourceVersionId: 'source-v1',
    sha256Hex: 'a'.repeat(64),
    reasonCode: 'teacher-reviewed',
  },
  physicalPageCount: 1,
  verifiedUsable: true,
  ...overrides,
});

describe('production source publication boundary', () => {
  it('restores only exact saved owner draft slots and omits stale or forged Activity proofs', async () => {
    const manifest = {
      bookId: 'book-1', sourceSet: { sourceStrategy: 'component_pdfs', sources: [
        { sourceKey: 'part-a', sourceVersionId: 'source-a-v1', sourceOrder: 1 },
        { sourceKey: 'part-b', sourceVersionId: 'source-b-v1', sourceOrder: 2 },
      ] }, nodes: [], units: [{ unitKey: 'unit-1',
        activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
        pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'part-a', pages: [1], activityKeys: ['activity-1'], mode: 'activity' }],
      }],
    };
    const assembly = { ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1',
      candidateId: 'assembly-1', revision: 2, lifecycle: 'validated', manifest };
    const editable = {
      schemaVersion: 1, title: 'Saved content', taskProfile: null, presentationMode: 'source-assisted',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Choose.' }],
      interaction: { family: 'choice', variant: 'single-choice' },
      answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 }, stimulus: null,
      assetRefs: [], interactions: [{ prompt: 'Pick', options: ['A', 'B'], acceptedOptionIndexes: [0],
        sourceAssisted: { questionLabel: 'Question 1', accessiblePrompt: 'Choose.', responseShape: 'single-choice', sourceExerciseLabel: 'Exercise 1' } }],
      scoring: { mode: 'auto-where-possible' },
    };
    const binding = { schemaVersion: 1, ownerId: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1',
      activityKey: 'activity-1', activityId: 'activity-id-1', candidateId: 'activity-candidate-1',
      candidateRevision: 3, candidateLifecycle: 'saved' };
    const saved = { candidateId: binding.candidateId, targetActivityId: binding.activityId, targetRevision: 0,
      ownerId: binding.ownerId, bookId: binding.bookId, revision: 3, lifecycle: 'saved', validation: { valid: true },
      content: editable, assemblyDraft: { bookId: 'book-1', unitKey: 'unit-1', activityKey: 'activity-1',
        candidateId: 'assembly-1', candidateRevision: 2, manifestFingerprint: fingerprintComponentPdfActivationValue(manifest) },
      evidenceRefs: ['source:part-a:page:1'] };
    const activity = { ownerId: binding.ownerId, activityId: binding.activityId, lifecycle: 'draft', revision: 1,
      editableDraft: editable, draft: normalizeActivity(editable, undefined, undefined, { mappedBookPageRefs: ['source:part-a:page:1'] }) };
    const read = async (savedValue = saved, bindingValue = binding, activityValue = activity, assemblyValue = assembly) =>
      readVerifiedDraftActivityKeys(assemblyValue as never,
        { read: async () => bindingValue as never },
        { readOwnerRoot: async () => ({ candidates: { [binding.candidateId]: savedValue }, activities: { [binding.activityId]: activityValue } }) });
    await expect(read()).resolves.toEqual(['activity-1']);
    const revised = { ...saved, revision: 4, content: { ...editable, title: 'Revised content' } };
    const revisedActivity = { ...activity, editableDraft: revised.content,
      draft: normalizeActivity(revised.content, undefined, undefined, { mappedBookPageRefs: ['source:part-a:page:1'] }) };
    const revisedBinding = { ...binding, candidateRevision: 4 };
    const snapshot = await readVerifiedDraftActivities(assembly as never,
      { read: async () => revisedBinding as never },
      { readOwnerRoot: async () => ({ candidates: { [binding.candidateId]: revised }, activities: { [binding.activityId]: revisedActivity } }) });
    expect(snapshot['activity-1']).toMatchObject({ activityId: binding.activityId,
      activityCandidateRevision: 4, content: { title: 'Revised content' } });
    expect(saved.content.title).toBe('Saved content');
    const editedAssembly = { ...assembly, candidateId: 'edited-assembly', revision: 4, manifest: {
      ...manifest, nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, title: 'Reviewed outline' }],
      units: manifest.units.map((unit) => ({ ...unit, pageGroups: unit.pageGroups.map((group) => ({ ...group, defaultPhysicalPageNumber: 1 })) })),
    } };
    const requalify = (original = assembly, current = editedAssembly) => readVerifiedDraftActivities(current as never,
      { read: async () => revisedBinding as never },
      { readOwnerRoot: async () => ({ candidates: { [binding.candidateId]: revised }, activities: { [binding.activityId]: revisedActivity } }) },
      { [assembly.candidateId]: original as never });
    expect(await requalify()).toMatchObject({ 'activity-1': { activityCandidateRevision: 4, content: { title: 'Revised content' } } });
    expect(await requalify({ ...assembly, revision: 1 })).toEqual({});
    expect(await requalify({ ...assembly, ownerId: 'teacher-2' })).toEqual({});
    expect(await requalify(assembly, { ...editedAssembly, manifest: { ...editedAssembly.manifest,
      units: editedAssembly.manifest.units.map((unit) => ({ ...unit,
        pageGroups: unit.pageGroups.map((group) => ({ ...group, pages: [2], defaultPhysicalPageNumber: 2 })),
      })),
    } })).toEqual({});
    expect(await requalify({ ...assembly, manifest: { ...manifest, sourceSet: { ...manifest.sourceSet,
      sources: manifest.sourceSet.sources.map((source) => ({ ...source, sourceVersionId: 'replacement' })),
    } } })).toEqual({});

    for (const changed of [
      { ...saved, ownerId: 'teacher-2' }, { ...saved, revision: 4 }, { ...saved, lifecycle: 'validated' },
      { ...saved, assemblyDraft: { ...saved.assemblyDraft, candidateRevision: 1 } },
      { ...saved, evidenceRefs: ['source:part-b:page:1'] },
      { ...saved, content: { ...editable, interactions: [] } },
    ]) await expect(read(changed as typeof saved)).resolves.toEqual([]);
    await expect(read(saved, { ...binding, candidateLifecycle: 'validated' })).resolves.toEqual([]);
    await expect(read(saved, { ...binding, activityId: 'other-activity' })).resolves.toEqual([]);
    await expect(read(saved, binding, { ...activity, editableDraft: { ...editable, title: 'Changed' } })).resolves.toEqual([]);
    await expect(read(saved, binding, activity, { ...assembly, manifest: { ...manifest,
      sourceSet: { ...manifest.sourceSet, sources: manifest.sourceSet.sources.map((entry) => ({ ...entry, sourceVersionId: 'changed-source' })) } } })).resolves.toEqual([]);
  });

  it('reads the exact persisted normalized Activity and rejects changed saved identity or content', () => {
    const expected = { ownerId: 'teacher-1', bookId: 'book-1', candidateId: 'activity-candidate-1', activityId: 'activity-1', revision: 3 };
    const content = { title: 'Editable', interactions: [{ acceptedOptionIndexes: [0] }] };
    const candidate = { ...expected, targetActivityId: expected.activityId, targetRevision: 0,
      lifecycle: 'saved', validation: { valid: true }, content };
    const saved = { ownerId: expected.ownerId, activityId: expected.activityId, lifecycle: 'draft', revision: 1,
      editableDraft: content, draft: { title: 'Editable', interactions: [{ answerKey: { acceptedOptionItemIds: ['option-1'] } }] } };
    expect(readExactSavedActivityContent(candidate, expected, saved)).toEqual(saved.draft);
    for (const changed of [
      { ...saved, ownerId: 'teacher-2' }, { ...saved, activityId: 'activity-2' },
      { ...saved, revision: 2 }, { ...saved, editableDraft: { ...content, title: 'Changed' } },
    ]) expect(readExactSavedActivityContent(candidate, expected, changed)).toBeNull();
  });

  it('rejects a saved Activity candidate from another Book before activation', () => {
    const candidate = {
      candidateId: 'candidate-1',
      targetActivityId: 'activity-1',
      ownerId: 'teacher-1',
      bookId: 'book-2',
      revision: 1,
      lifecycle: 'saved',
      validation: { valid: true },
      content: { prompt: 'Prompt' },
    };

    expect(readExactSavedActivityContent(candidate, {
      ownerId: 'teacher-1',
      bookId: 'book-1',
      candidateId: 'candidate-1',
      activityId: 'activity-1',
      revision: 1,
    })).toBeNull();
  });

  it.each([
    ['ready and bound', source(), true],
    ['unreviewed private source', source({ studentSafeStatus: 'unreviewed', studentSafeDecision: undefined }), false],
    ['stale decision version', source({ studentSafeDecision: { ...source().studentSafeDecision, sourceVersionId: 'source-old' } }), false],
    ['mismatched decision checksum', source({ studentSafeDecision: { ...source().studentSafeDecision, sha256Hex: 'b'.repeat(64) } }), false],
    ['private component purpose', source({ purpose: 'student-document' }), false],
  ])('%s gates full-PDF publication', (_label, value, expected) => {
    expect(isFullPdfPublicationSourceReady(value as never)).toBe(expected);
  });

  it('creates component publication dependencies separately for each request', async () => {
    const options = createProductionBookAssemblyRouteOptions();
    expect(typeof options.assemblyPublication!.componentPdf).toBe('function');
  });
});
