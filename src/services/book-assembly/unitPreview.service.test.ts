import { describe, expect, it } from 'vitest';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { bookActivityRendererRegistry } from '../book-activity/runtime/activityRendererRegistry';
import type { BookAssemblyCandidateRecord } from './unitAssembly.types';
import {
  UnitPreviewError,
  createCandidateUnitPreview,
  createPreviewApproval,
  previewInputFingerprint,
  wholeActivationApprovalFingerprint,
} from './unitPreview.service';
import { createComponentStudentDocument } from './componentStudentDocument.types';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from './componentPdfActivation.service';

describe('whole activation approval fingerprint', () => {
  it('binds every stable activation input and has no transport or lifecycle input', () => {
    const sourceSet = { sourceStrategy: 'component_pdfs' as const, sources: [
      { sourceKey: 'a', sourceVersionId: 'sv-1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'b', sourceVersionId: 'sv-2', sourceOrder: 2, ownerNodeKey: 'unit-2' },
    ] };
    const studentDocument = createComponentStudentDocument({
      sourceVersionId: 'doc-1', descriptorRevision: 4, sha256Hex: 'a'.repeat(64), byteSize: 10,
      physicalPageCount: 2, compositionFingerprint: 'composition-1', components: [
        { sourceKey: 'a', sourceVersionId: 'sv-1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
        { sourceKey: 'b', sourceVersionId: 'sv-2', sourceOrder: 2, ownerNodeKey: 'unit-2', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
      ],
    });
    const manifest = { bookId: 'book-1', sourceSet, nodes: [], units: [
      { unitKey: 'unit-1', pageGroups: [{ pageGroupKey: 'pg-1', sourceKey: 'a', pages: [1], defaultPhysicalPageNumber: 1, activityKeys: ['activity-1'], mode: 'activity' as const }], activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pg-1'] }] },
      { unitKey: 'unit-2', pageGroups: [{ pageGroupKey: 'pg-2', sourceKey: 'b', pages: [1], defaultPhysicalPageNumber: 1, activityKeys: ['activity-2'], mode: 'activity' as const }], activitySlots: [{ activityKey: 'activity-2', order: 1, contextRequirement: 'required' as const, pageGroupKeys: ['pg-2'] }] },
    ] };
    const manifestFingerprint = fingerprintComponentPdfActivationValue(manifest);
    const activationReceipt = createComponentPdfActivationReceipt({
      operationId: 'activation-1', ownerId: 'teacher-1', bookId: 'book-1',
      expectedBookRevision: 2, expectedSourceSetRevision: 3, sourceSet,
      unitCandidates: [
        { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 1, manifestFingerprint },
        { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 2, manifestFingerprint },
      ],
      studentDocument: { sourceVersionId: 'doc-1', descriptorRevision: 4, descriptorFingerprint: fingerprintComponentPdfActivationValue(studentDocument) },
      activities: [
        { unitKey: 'unit-1', activityKey: 'activity-1', activityId: 'activity-id-1', activityCandidateId: 'activity-candidate-1', activityCandidateRevision: 1, activityPayloadFingerprint: fingerprintComponentPdfActivationValue('payload-1') },
        { unitKey: 'unit-2', activityKey: 'activity-2', activityId: 'activity-id-2', activityCandidateId: 'activity-candidate-2', activityCandidateRevision: 2, activityPayloadFingerprint: fingerprintComponentPdfActivationValue('payload-2') },
      ],
      activatedAt: '2026-09-21T00:00:00.000Z',
    });
    const base = { ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 3, sourceSetRevision: 4,
      sourceSet, activationReceipt, studentDocument, registryVersion: 'registry-1',
      units: activationReceipt.unitCandidates.map((unit) => ({ ...unit, manifest })),
      activities: activationReceipt.activities,
    };
    const original = wholeActivationApprovalFingerprint(base);
    const changes = [
      { ...base, ownerId: 'teacher-2' }, { ...base, bookId: 'book-2' },
      { ...base, bookRevision: 4 }, { ...base, sourceSetRevision: 5 },
      { ...base, sourceSet: { ...sourceSet, sources: sourceSet.sources.map((source, index) => index ? source : { ...source, sourceVersionId: 'sv-changed' }) } },
      { ...base, activationReceipt: { ...activationReceipt, sourceSetRevision: 5 } },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, candidateId: 'candidate-changed' }) },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, candidateRevision: 3 }) },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, manifestFingerprint: fingerprintComponentPdfActivationValue('manifest-changed') }) },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, manifest: { ...manifest, units: manifest.units.map((entry, unitIndex) => unitIndex ? entry : { ...entry, pageGroups: [{ ...entry.pageGroups[0]!, pages: [2] }] }) } }) },
      { ...base, studentDocument: { ...studentDocument, sha256Hex: 'b'.repeat(64) } },
      { ...base, studentDocument: { ...studentDocument, byteSize: 11 } },
      { ...base, studentDocument: { ...studentDocument, physicalPageCount: 3 } },
      { ...base, studentDocument: { ...studentDocument, descriptorRevision: 5 } },
      { ...base, studentDocument: { ...studentDocument, compositionFingerprint: 'composition-2' } },
      { ...base, studentDocument: { ...studentDocument, components: studentDocument.components.map((component, index) => index ? component : { ...component, combinedEndPage: 2 }) } },
      { ...base, registryVersion: 'registry-2' },
      { ...base, activities: base.activities.map((entry, index) => index ? entry : { ...entry, activityCandidateId: 'activity-candidate-changed' }) },
      { ...base, activities: base.activities.map((entry, index) => index ? entry : { ...entry, activityCandidateRevision: 3 }) },
      { ...base, activities: base.activities.map((entry, index) => index ? entry : { ...entry, activityPayloadFingerprint: fingerprintComponentPdfActivationValue('payload-changed') }) },
    ];
    for (const changed of changes) expect(wholeActivationApprovalFingerprint(changed)).not.toBe(original);
    const transient = { ...structuredClone(base), opaqueRouteKey: 'new-route', url: 'https://elsewhere.invalid',
      requestId: 'request-2', publicationOperationId: 'publication-operation-2', headers: { Authorization: 'Bearer changed' },
      expectedEtag: 'etag-2', expiresAt: '2099-01-01T00:00:00.000Z', refreshToken: 'refresh-2',
      uiState: { selectedTab: 'other' }, approvalId: 'approval-2', approvedAt: 'later', lifecycle: 'revoked' };
    expect(wholeActivationApprovalFingerprint(transient)).toBe(original);
    expect(wholeActivationApprovalFingerprint({ ...base, activationReceipt: {
      ...activationReceipt, operationId: 'activation-2', inputFingerprint: fingerprintComponentPdfActivationValue('operation-2'),
    } })).toBe(original);
    expect(wholeActivationApprovalFingerprint({ ...base, activationReceipt: {
      ...activationReceipt, activatedAt: '2099-01-01T00:00:00.000Z',
    } })).toBe(original);

    const invalidRelationships = [
      { ...base, units: base.units.slice(0, 1) },
      { ...base, units: [...base.units, { ...base.units[1]!, unitKey: 'unit-extra' }] },
      { ...base, units: [...base.units, base.units[0]!] },
      { ...base, activities: base.activities.slice(0, 1) },
      { ...base, activities: [...base.activities, { ...base.activities[1]!, activityKey: 'activity-extra' }] },
      { ...base, activities: [...base.activities, base.activities[0]!] },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, manifest: { ...manifest, units: manifest.units.map((entry, unitIndex) => unitIndex ? entry : { ...entry, activitySlots: [{ ...entry.activitySlots[0]!, pageGroupKeys: [] }] }) } }) },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, manifest: { ...manifest, units: manifest.units.map((entry, unitIndex) => unitIndex ? entry : { ...entry, pageGroups: [] }) } }) },
      { ...base, units: base.units.map((unit, index) => index ? unit : { ...unit, manifest: { ...manifest, units: manifest.units.map((entry, unitIndex) => unitIndex ? entry : { ...entry, pageGroups: [...entry.pageGroups, entry.pageGroups[0]!] }) } }) },
    ];
    for (const invalid of invalidRelationships) {
      expect(() => wholeActivationApprovalFingerprint(invalid)).toThrow(/whole_activation/u);
    }
  });
});

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
  sourceVersions: [{ sourceKey: 'full', sourceVersionId: 'source-1', bookId: 'book-1', physicalPageCount: 4, verifiedUsable: true }],
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
  it('projects component preview as one combined request and source-free Page Group map', () => {
    const baseCandidate = candidate();
    const componentCandidate: BookAssemblyCandidateRecord = { ...baseCandidate, manifest: {
      ...baseCandidate.manifest!,
      sourceSet: { sourceStrategy: 'component_pdfs', sources: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-1' },
      ] },
      units: [{ ...baseCandidate.manifest!.units[0]!, pageGroups: [
        { ...baseCandidate.manifest!.units[0]!.pageGroups[0]!, sourceKey: 'component-b', pages: [2] },
      ] }],
    } };
    const componentInput = {
      ...input(), candidate: componentCandidate,
      sourceVersions: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a', bookId: 'book-1', physicalPageCount: 2, verifiedUsable: true },
        { sourceKey: 'component-b', sourceVersionId: 'source-b', bookId: 'book-1', physicalPageCount: 3, verifiedUsable: true },
      ],
      studentDocument: {
        descriptor: createComponentStudentDocument({
          sourceVersionId: 'student-v1', descriptorRevision: 4, sha256Hex: 'a'.repeat(64), byteSize: 123,
          physicalPageCount: 5, compositionFingerprint: 'composition-1', components: [
            { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 2, combinedStartPage: 1, combinedEndPage: 2 },
            { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 3, combinedStartPage: 3, combinedEndPage: 5 },
          ],
        }),
        request: { opaqueRouteKey: 'student-document', expectedByteLength: 123, expectedEtag: `"${'a'.repeat(64)}"` },
      },
    };
    const preview = createCandidateUnitPreview(componentInput);
    expect(preview.runtime).toMatchObject({
      sourceSet: { strategy: 'component_pdfs', sources: [] },
      documentRequests: [{ opaqueRouteKey: 'student-document', expectedByteLength: 123 }],
      pageGroups: [{ pageGroupKey: 'pages-1', combinedPhysicalPages: [4] }],
    });
    expect(JSON.stringify(preview.runtime)).not.toMatch(/component-a|component-b|source-a|source-b/iu);
    const refreshedRoute = createCandidateUnitPreview({ ...componentInput, studentDocument: {
      ...componentInput.studentDocument,
      request: { ...componentInput.studentDocument.request,
        opaqueRouteKey: 'refreshed-route', expectedEtag: `"${'b'.repeat(64)}"` },
    } });
    const changedBytes = createCandidateUnitPreview({ ...componentInput, studentDocument: {
      ...componentInput.studentDocument,
      descriptor: { ...componentInput.studentDocument.descriptor, sha256Hex: 'b'.repeat(64) },
    } });
    expect(previewInputFingerprint(refreshedRoute)).toBe(previewInputFingerprint(preview));
    expect(previewInputFingerprint(changedBytes)).not.toBe(previewInputFingerprint(preview));
    expect(JSON.stringify(preview.runtime)).not.toContain(preview.studentDocumentContentFingerprint);
  });
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
    expect(preview.runtime).toMatchObject({
      projectionKind: 'book-runtime-candidate-preview',
      unitKey: 'unit-1',
      sourceSet: { strategy: 'full_pdf' },
      activities: [{ activityId: 'activity-1', nodeKey: 'pages-1' }],
    });
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

  it('excludes ephemeral route keys and ETags from approval identity', () => {
    const preview = createCandidateUnitPreview(input());
    const request = preview.runtime!.documentRequests[0]!;
    const refreshed = { ...preview, runtime: { ...preview.runtime!, documentRequests: [{
      ...request, opaqueRouteKey: 'refreshed-route', expectedEtag: `"${'b'.repeat(64)}"`,
    }] } };
    expect(previewInputFingerprint(refreshed)).toBe(previewInputFingerprint(preview));
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
