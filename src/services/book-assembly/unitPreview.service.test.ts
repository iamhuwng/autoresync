import { describe, expect, it } from 'vitest';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { bookActivityRendererRegistry } from '../book-activity/runtime/activityRendererRegistry';
import type { BookAssemblyCandidateRecord } from './unitAssembly.types';
import {
  UnitPreviewError,
  createCandidateUnitPreview,
  createPreviewApproval,
} from './unitPreview.service';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose safely',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read source.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1', accessiblePrompt: 'Choose one answer.', responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 3,
  sourceSetRevision: 4, unitKey: 'unit-1', revision: 5, lifecycle: 'validated',
  validation: { valid: true, errors: [] }, updatedAt: '2026-07-27T00:00:00.000Z',
  manifest: {
    bookId: 'book-1',
    sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }] },
    nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
    units: [{
      unitKey: 'unit-1',
      activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
      pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: 'full', pages: [2], activityKeys: ['activity-1'], mode: 'activity' }],
    }],
  },
});

const input = () => ({
  candidate: candidate(),
  sourceVersions: [{ sourceVersionId: 'source-1', bookId: 'book-1', physicalPageCount: 4, verifiedUsable: true }],
  sourceIsPreviewReady: () => true,
  activitiesByKey: { 'activity-1': activity() },
  registryVersion: 'registry-v1',
});

const activityForRegistration = (
  registration: ReturnType<typeof bookActivityRendererRegistry.registrations>[number],
  activityKey: string,
): NormalizedActivity => {
  const sourceAssisted = registration.presentationMode === 'source-assisted';
  const base = {
    schemaVersion: 1 as const,
    title: `Preview ${activityKey}`,
    taskProfile: registration.taskProfile ? { ...registration.taskProfile } : null,
    presentationMode: registration.presentationMode,
    contextRequirement: sourceAssisted
      ? { mode: 'required' as const, acceptedKinds: ['book-pages'] }
      : { mode: 'none' as const, acceptedKinds: [] },
    instructions: [{ text: 'Preview fixture.' }],
    interaction: { family: registration.family, variant: registration.variant },
    answerRule: { defaultPoints: 1, normalization: 'exact' as const },
    stimulus: null,
    assetRefs: [],
    scoring: registration.family === 'long-response'
      ? { mode: 'review-required' as const }
      : { mode: 'auto-where-possible' as const },
  };
  const source = sourceAssisted ? {
    sourceAssisted: { questionLabel: '1', accessiblePrompt: 'Preview source.', sourceExerciseLabel: 'Preview exercise', responseShape: registration.family === 'choice' ? 'single-choice' : registration.family === 'text-entry' ? 'text' : registration.family },
  } : {};
  if (registration.family === 'choice') return {
    ...base,
    answerRule: { ...base.answerRule, requiredSelectionCount: 1 },
    interactions: [{ family: 'choice', interactionId: activityKey, prompt: 'Choose.', options: ['A'],
      ...source, itemIdentities: { family: 'choice', optionIds: ['a'] }, answerKey: { family: 'choice', acceptedOptionItemIds: ['a'] } }],
  } as NormalizedActivity;
  if (registration.family === 'text-entry') return {
    ...base,
    interactions: [{ family: 'text-entry', interactionId: activityKey, prompt: 'Write.', ...source,
      itemIdentities: { family: 'text-entry', itemIds: [] }, answerKey: { family: 'text-entry', acceptedAnswers: ['answer'] } }],
  } as NormalizedActivity;
  if (registration.family === 'matching') return {
    ...base,
    interactions: [{ family: 'matching', interactionId: activityKey, prompt: 'Match.', ...source, leftItems: ['Left'], rightItems: ['Right'],
      itemIdentities: { family: 'matching', leftItemIds: ['left'], rightItemIds: ['right'] }, answerKey: { family: 'matching', acceptedPairs: [{ leftItemId: 'left', rightItemId: 'right' }] } }],
  } as NormalizedActivity;
  if (registration.family === 'ordering') return {
    ...base,
    interactions: [{ family: 'ordering', interactionId: activityKey, prompt: 'Order.', ...source, orderingItems: ['One'],
      itemIdentities: { family: 'ordering', itemIds: ['one'] }, answerKey: { family: 'ordering', acceptedOrderItemIds: ['one'] } }],
  } as NormalizedActivity;
  return {
    ...base,
    interactions: [{ family: 'long-response', interactionId: activityKey, prompt: 'Respond.', ...source,
      itemIdentities: { family: 'long-response', itemIds: [] }, answerKey: { family: 'long-response', rubric: { criteria: ['Clear'] } } }],
  } as NormalizedActivity;
};

describe('createCandidateUnitPreview', () => {
  it('projects only selected candidate Unit and strips Activity answer keys', () => {
    const withAuthoringOnlyFields = activity() as NormalizedActivity & Record<string, unknown>;
    withAuthoringOnlyFields.authoringNote = 'private authoring note';
    withAuthoringOnlyFields.providerUrl = 'https://provider.invalid/private-object';
    const preview = createCandidateUnitPreview({ ...input(), activitiesByKey: { 'activity-1': withAuthoringOnlyFields } });
    expect(preview.activities).toHaveLength(1);
    expect(preview.activities[0]?.sourceContext.description).toContain('full page 2');
    expect(JSON.stringify(preview)).not.toContain('answerKey');
    expect(JSON.stringify(preview)).not.toContain('acceptedOptionItemIds');
    expect(JSON.stringify(preview)).not.toContain('authoringNote');
    expect(JSON.stringify(preview)).not.toContain('providerUrl');
    expect(JSON.stringify(preview)).not.toContain('source-1');
  });

  it('fails closed for a stale source or missing Activity candidate', () => {
    const failureCode = (action: () => unknown): UnitPreviewError['code'] => {
      try {
        action();
      } catch (error) {
        expect(error).toBeInstanceOf(UnitPreviewError);
        return (error as UnitPreviewError).code;
      }
      throw new Error('Expected preview construction to fail.');
    };
    expect(failureCode(() => createCandidateUnitPreview({ ...input(), sourceIsPreviewReady: () => false })))
      .toBe('source-not-previewable');
    expect(failureCode(() => createCandidateUnitPreview({ ...input(), activitiesByKey: {} })))
      .toBe('activity-missing');
  });

  it('binds approval to exact candidate, source-set, registry, actor, expiry, and fingerprint', () => {
    const preview = createCandidateUnitPreview(input());
    const approval = createPreviewApproval({
      approvalId: 'approval-1', approvalRevision: 1, actorId: 'teacher-1',
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z', preview,
      canonicalActivitiesByKey: { 'activity-1': activity() },
    });
    expect(approval).toMatchObject({
      bookId: 'book-1', bookRevision: 3, unitKey: 'unit-1', candidateId: 'candidate-1',
      candidateRevision: 5, sourceSetRevision: 4, registryVersion: 'registry-v1', actorId: 'teacher-1',
    });
    expect(approval.inputFingerprint).toMatch(/^fnv1a64:/u);
    expect(approval.canonicalActivityFingerprintsByKey).toEqual({
      'activity-1': expect.stringMatching(/^fnv1a64:/u),
    });
    expect(JSON.stringify(approval)).not.toContain('answerKey');
    expect(JSON.stringify(approval)).not.toContain('providerUrl');
    const sourceMutation = createCandidateUnitPreview({
      ...input(), candidate: { ...candidate(), sourceSetRevision: 5 },
    });
    const registryMutation = createCandidateUnitPreview({ ...input(), registryVersion: 'registry-v2' });
    expect(approval.inputFingerprint).not.toBe(createPreviewApproval({
      approvalId: 'approval-2', approvalRevision: 1, actorId: 'teacher-1',
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z', preview: sourceMutation,
      canonicalActivitiesByKey: { 'activity-1': activity() },
    }).inputFingerprint);
    expect(approval.inputFingerprint).not.toBe(createPreviewApproval({
      approvalId: 'approval-3', approvalRevision: 1, actorId: 'teacher-1',
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z', preview: registryMutation,
      canonicalActivitiesByKey: { 'activity-1': activity() },
    }).inputFingerprint);
  });

  it('requires complete canonical activity bindings and a current Book revision', () => {
    const preview = createCandidateUnitPreview(input());
    expect(() => createPreviewApproval({
      approvalId: 'approval-missing-canonical', approvalRevision: 1, actorId: 'teacher-1',
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z',
      preview, canonicalActivitiesByKey: {},
    })).toThrowError(new UnitPreviewError('approval-invalid', 'Preview approval identity, binding, fingerprint, or expiry is invalid.'));
    expect(() => createPreviewApproval({
      approvalId: 'approval-missing-book-revision', approvalRevision: 1, actorId: 'teacher-1',
      approvedAt: '2026-07-27T00:00:00.000Z', expiresAt: '2026-07-27T01:00:00.000Z',
      preview: { ...preview, bookRevision: undefined } as never, canonicalActivitiesByKey: { 'activity-1': activity() },
    })).toThrowError('Preview approval identity, binding, fingerprint, or expiry is invalid.');
  });

  it('keeps every shared runtime registry registration resolvable in candidate preview', () => {
    const registrations = bookActivityRendererRegistry.registrations();
    const activitiesByKey = Object.fromEntries(registrations.map((registration, index) => [
      `activity-${index + 1}`,
      activityForRegistration(registration, `interaction-${index + 1}`),
    ]));
    const parityCandidate = { ...candidate() } as BookAssemblyCandidateRecord & {
      manifest: NonNullable<BookAssemblyCandidateRecord['manifest']>;
    };
    const unit = parityCandidate.manifest!.units[0]!;
    parityCandidate.manifest = {
      ...parityCandidate.manifest!,
      units: [{
        ...unit,
        activitySlots: registrations.map((registration, index) => ({
          activityKey: `activity-${index + 1}`,
          order: index + 1,
          contextRequirement: registration.presentationMode === 'source-assisted' ? 'required' as const : 'none' as const,
          pageGroupKeys: ['pages-1'],
        })),
        pageGroups: [{ ...unit.pageGroups[0]!, activityKeys: registrations.map((_, index) => `activity-${index + 1}`) }],
      }],
    };
    const preview = createCandidateUnitPreview({
      ...input(), candidate: parityCandidate, activitiesByKey, registryVersion: 'registry-parity-v1',
    });
    expect(preview.activities).toHaveLength(registrations.length);
    preview.activities.forEach((entry) => {
      const resolution = bookActivityRendererRegistry.resolve(entry.projection, {
        surface: 'assembly-preview', mode: 'editable', sourceContext: entry.sourceContext,
      });
      if (!resolution.supported) {
        throw new Error(`${entry.activityKey}: ${JSON.stringify(resolution.diagnostic)}`);
      }
      expect(resolution.supported).toBe(true);
    });
  });
});
