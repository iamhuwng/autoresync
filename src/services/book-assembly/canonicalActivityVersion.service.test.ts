import type { EditableActivity, NormalizedActivity } from '../../types/bookActivity.types';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalActivityVersionFingerprint,
  createCanonicalPublicBookForkPlacementSetFingerprint,
  validateCanonicalPublishedActivityVersion,
  type CanonicalPublishedActivityVersionRecord,
} from './canonicalActivityVersion.service';

const sourcePage = {
  sourceKey: 'full',
  sourceVersionId: 'source-v1',
  physicalPageNumber: 4,
} as const;

const normalizedActivity = (): NormalizedActivity => {
  const editable: EditableActivity = {
    schemaVersion: 1,
    title: 'Choose the correct answer',
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'none', acceptedKinds: [] },
    instructions: [{ text: 'Choose one answer.' }],
    stimulus: null,
    assetRefs: [],
    interaction: { family: 'choice', variant: 'single-choice' },
    answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
    interactions: [{
      prompt: 'Which answer is correct?',
      options: ['A', 'B'],
      acceptedOptionIndexes: [0],
    }],
    scoring: { mode: 'auto-where-possible' },
  };
  let nextId = 0;
  return normalizeActivity(editable, { createId: () => `id-${++nextId}` });
};

const withoutFingerprint = (
  record: CanonicalPublishedActivityVersionRecord,
): Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'> => {
  const copy = { ...record } as Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'> & { payloadFingerprint?: string };
  delete copy.payloadFingerprint;
  return copy;
};

const withFingerprint = (
  record: Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'>,
): CanonicalPublishedActivityVersionRecord => ({
  ...record,
  payloadFingerprint: createCanonicalActivityVersionFingerprint(record),
});

const initialRecord = (): CanonicalPublishedActivityVersionRecord => withFingerprint({
  schemaVersion: 1,
  lifecycle: 'published',
  activityId: 'activity-1',
  activityVersionId: 'activity-1-v1',
  activityVersion: 1,
  ownerId: 'teacher-1',
  activity: normalizedActivity(),
  projection: projectStudentActivity(normalizedActivity()),
  placementIds: ['placement-1'],
  evidenceRefs: ['import:activity-1'],
  sourceContextFingerprint: null,
  createdByOperationId: 'operation-1',
  publishedAt: '2026-07-30T00:00:00.000Z',
  provenance: {
    kind: 'initial-book-publication',
    bookId: 'book-1',
    manifestVersionId: 'manifest-v1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    unitKey: 'unit-1',
    activityKey: 'unit-1/activity-1',
    sourcePages: [sourcePage],
  },
});

const revisionRecord = (): CanonicalPublishedActivityVersionRecord => {
  const activity = normalizedActivity();
  return withFingerprint({
    ...withoutFingerprint(initialRecord()),
    activityVersionId: 'activity-1-v2',
    activityVersion: 2,
    activity,
    projection: projectStudentActivity(activity),
    predecessorActivityVersionId: 'activity-1-v1',
    createdByOperationId: 'operation-2',
    provenance: {
      kind: 'activity-revision',
      candidateId: 'candidate-1',
      candidateRevision: 3,
      evidenceRefs: ['import:activity-1'],
      context: {
        fingerprint: 'fnv1a64:0123456789abcdef',
        sourceVersionId: 'source-v1',
        pageGroupId: 'page-group-1',
        mappedBookPageRefs: ['source:full:page:4'],
      },
    },
  });
};

const publicForkRecord = (): CanonicalPublishedActivityVersionRecord => {
  const activity = normalizedActivity();
  const sourcePlacementIds = ['source-placement-1', 'source-placement-2'] as const;
  return withFingerprint({
    ...withoutFingerprint(initialRecord()),
    activityId: 'fork-activity-1',
    activityVersionId: 'fork-activity-1-v1',
    activityVersion: 1,
    ownerId: 'teacher-target',
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['target-placement-1'],
    sourceContextFingerprint: null,
    createdByOperationId: 'operation-fork-1',
    provenance: {
      kind: 'public-book-fork',
      sourceBookId: 'public-book-1',
      sourceOwnerId: 'teacher-source',
      sourceManifestVersionId: 'manifest-public-v1',
      sourcePublicationId: 'publication-public-1',
      sourcePublicationRevision: 3,
      sourceVersionId: 'source-version-1',
      sourcePublicationBinding: {
        manifestVersionId: 'manifest-public-v1',
        publicationId: 'publication-public-1',
        publicationRevision: 3,
      },
      sourceActivityId: 'activity-1',
      sourceActivityVersionId: 'activity-1-v3',
      sourceActivityVersion: 3,
      sourcePayloadFingerprint: initialRecord().payloadFingerprint,
      sourcePlacementIds,
      sourcePlacementSetFingerprint: createCanonicalPublicBookForkPlacementSetFingerprint(sourcePlacementIds),
      sourceNodeKey: 'node-unit-1',
      sourcePlacementId: 'source-placement-1',
      sourceUnitKey: 'unit-1',
      sourceActivityKey: 'unit-1/activity-1',
      selectionKind: 'activity',
      selectionPath: ['unit-1', 'activity-1'],
      selectionOrder: 0,
      sourcePages: [sourcePage],
      sourcePageGroupKeys: ['page-group-1'],
      sourceContextFingerprint: null,
      targetBookId: 'book-target-1',
      targetOwnerId: 'teacher-target',
      targetOriginalNodeId: 'node-target-1',
      targetPlacementId: 'target-placement-1',
      targetAppendOrder: 4,
      targetBookUpdatedAt: '2026-08-09T00:00:00.000Z',
    },
  });
};

const resultErrors = (value: unknown): readonly string[] => {
  const result = validateCanonicalPublishedActivityVersion(value);
  expect(result.valid).toBe(false);
  return result.valid ? [] : result.errors;
};

describe('canonicalActivityVersion.service', () => {
  it('accepts and freezes an initial Book publication record', () => {
    const result = validateCanonicalPublishedActivityVersion(initialRecord());

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.activity)).toBe(true);
    expect(result.value.provenance.kind).toBe('initial-book-publication');
  });

  it('accepts an Activity revision with bounded candidate evidence/context', () => {
    const result = validateCanonicalPublishedActivityVersion(revisionRecord());

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.value.provenance.kind).toBe('activity-revision');
  });

  it('accepts a version-1 public Book fork provenance snapshot', () => {
    const result = validateCanonicalPublishedActivityVersion(publicForkRecord());

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.activityVersion).toBe(1);
    expect(result.value.provenance).toMatchObject({
      kind: 'public-book-fork',
      sourceActivityId: 'activity-1',
      targetPlacementId: 'target-placement-1',
    });
    expect(result.value.activity.interactions[0]?.answerKey).toEqual({
      family: 'choice',
      acceptedOptionItemIds: ['id-1'],
    });
    expect(result.value.projection).toEqual(projectStudentActivity(result.value.activity));
  });

  it('accepts the canonical SHA-256 source-context fingerprint and rejects context drift', () => {
    const record = publicForkRecord();
    if (record.provenance.kind !== 'public-book-fork') throw new Error('test fixture provenance mismatch');
    const sourceContextFingerprint = 'sha256:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const withoutFingerprintRecord = {
      ...withoutFingerprint(record),
      sourceContextFingerprint,
      provenance: {
        ...record.provenance,
        sourceContextFingerprint,
      },
    };
    const result = validateCanonicalPublishedActivityVersion({
      ...withoutFingerprintRecord,
      payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprintRecord),
    });

    expect(result.valid).toBe(true);
    expect(resultErrors({
      ...record,
      sourceContextFingerprint,
    })).toEqual(expect.arrayContaining([expect.stringContaining('context-mismatch')]));
  });

  it('rejects public fork provenance outside version 1 or with a predecessor', () => {
    const record = publicForkRecord();
    expect(resultErrors({
      ...record,
      activityVersion: 2,
      predecessorActivityVersionId: 'activity-1-v1',
    })).toEqual(expect.arrayContaining([expect.stringContaining('cross-family-mismatch')]));
    expect(resultErrors({
      ...record,
      predecessorActivityVersionId: 'activity-1-v1',
    })).toEqual(expect.arrayContaining([expect.stringContaining('cross-family-mismatch')]));
  });

  it('rejects public fork provenance when source pins or destination identity drift', () => {
    const record = publicForkRecord();
    if (record.provenance.kind !== 'public-book-fork') throw new Error('test fixture provenance mismatch');
    const provenance = record.provenance;
    expect(resultErrors({
      ...record,
      activityId: 'activity-1',
    })).toEqual(expect.arrayContaining([expect.stringContaining('cross-family-mismatch')]));
    expect(resultErrors({
      ...record,
      provenance: {
        ...provenance,
        sourcePlacementIds: ['source-placement-2', 'source-placement-1'],
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('not-sorted')]));
    expect(resultErrors({
      ...record,
      provenance: {
        ...provenance,
        sourcePlacementSetFingerprint: 'fnv1a64:0000000000000000',
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('fingerprint-mismatch')]));
    expect(resultErrors({
      ...record,
      provenance: {
        ...provenance,
        sourcePublicationBinding: {
          ...provenance.sourcePublicationBinding,
          publicationRevision: 4,
        },
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('binding-mismatch')]));
    expect(resultErrors({
      ...record,
      provenance: {
        ...provenance,
        forkedFromMaterialId: 'legacy-material-1',
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('unknown-field')]));
  });

  it('rejects payload tampering and a changed projection', () => {
    const tampered = structuredClone(initialRecord()) as unknown as Record<string, unknown>;
    tampered.activity = { ...(tampered.activity as object), title: 'Tampered title' };
    expect(resultErrors(tampered).some((error) => error.includes('fingerprint-mismatch'))).toBe(true);

    const projectionTampered = structuredClone(initialRecord()) as unknown as Record<string, unknown>;
    projectionTampered.projection = {
      ...(projectionTampered.projection as object),
      title: 'Tampered projection',
    };
    expect(resultErrors(projectionTampered).some((error) => error.includes('projection-mismatch'))).toBe(true);
  });

  it('rejects duplicate interaction/item identities and sensitive answer fields', () => {
    const record = initialRecord();
    const activity = structuredClone(record.activity) as Record<string, unknown>;
    const interactions = [...(activity.interactions as Array<Record<string, unknown>>)].map((interaction) => ({
      ...interaction,
      interactionId: 'duplicate-interaction',
      options: ['A', 'B'],
      itemIdentities: {
        ...(interaction.itemIdentities as object),
        optionIds: ['duplicate-item', 'duplicate-item'],
      },
    }));
    activity.interactions = [...interactions, ...interactions];
    const duplicate = { ...record, activity };
    expect(resultErrors(duplicate).some((error) => error.includes('duplicate-identity'))).toBe(true);

    const sensitiveActivity = structuredClone(record.activity) as Record<string, unknown>;
    (sensitiveActivity.interactions as Array<Record<string, unknown>>)[0]!.answers = ['secret'];
    expect(resultErrors({ ...record, activity: sensitiveActivity })).toEqual(
      expect.arrayContaining([expect.stringContaining('sensitive-field')]),
    );
  });

  it('rejects bad fingerprint, lifecycle, provenance, and cross-family lineage', () => {
    const record = initialRecord();
    expect(resultErrors({ ...record, payloadFingerprint: 'fnv1a64:0000000000000000' })).toEqual(
      expect.arrayContaining([expect.stringContaining('fingerprint-mismatch')]),
    );
    expect(resultErrors({ ...record, lifecycle: 'draft' })).toEqual(
      expect.arrayContaining([expect.stringContaining('invalid-lifecycle')]),
    );
    expect(resultErrors({
      ...record,
      provenance: {
        kind: 'activity-revision',
        candidateId: 'candidate-1',
        evidenceRefs: [],
        context: null,
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('cross-family-mismatch')]));
    expect(resultErrors({
      ...revisionRecord(),
      provenance: {
        kind: 'initial-book-publication',
        bookId: 'book-1',
        manifestVersionId: 'manifest-v1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        unitKey: 'unit-1',
        activityKey: 'unit-1/activity-1',
        sourcePages: [sourcePage],
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('cross-family-mismatch')]));
  });

  it('rejects malformed IDs, oversized arrays, and oversized payloads', () => {
    expect(resultErrors({ ...initialRecord(), activityId: 'bad id' })).toEqual(
      expect.arrayContaining([expect.stringContaining('invalid-path-id')]),
    );
    expect(resultErrors({ ...initialRecord(), activityVersionId: 'activity/version-1' })).toEqual(
      expect.arrayContaining([expect.stringContaining('invalid-path-id')]),
    );
    expect(resultErrors({
      ...initialRecord(),
      placementIds: Array.from({ length: 513 }, (_, index) => `placement-${index}`),
    })).toEqual(expect.arrayContaining([expect.stringContaining('array-limit-exceeded')]));
    expect(resultErrors({
      ...initialRecord(),
      activity: {
        ...initialRecord().activity,
        title: 'x'.repeat(1_100_000),
      },
    })).toEqual(expect.arrayContaining([expect.stringContaining('invalid-string')]));
  });

  it('asserts with the required error prefix and returns the canonical frozen value', () => {
    expect(assertCanonicalPublishedActivityVersion(initialRecord()).payloadFingerprint)
      .toMatch(/^fnv1a64:[0-9a-f]{16}$/u);
    expect(() => assertCanonicalPublishedActivityVersion({})).toThrow(
      'invalid_canonical_activity_version:',
    );
  });

  it('keeps fingerprinting stable across object property order', () => {
    const record = initialRecord();
    const reordered = JSON.parse(JSON.stringify(withoutFingerprint(record))) as Omit<CanonicalPublishedActivityVersionRecord, 'payloadFingerprint'>;
    expect(createCanonicalActivityVersionFingerprint(reordered))
      .toBe(record.payloadFingerprint);
  });
});
