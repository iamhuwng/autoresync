import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2FullTestCompositionId,
  type ReadingV2MaterialId,
  type ReadingV2PassageRef,
  type ReadingV2ReadingPassageMaterialId,
  type ReadingV2SnapshotVersionId,
} from '../../types/readingV2.types';
import {
  type MaterialTestTypeId,
  type ReadingPassageVisibilityScope,
} from '../../types/materialCatalog.types';
import { type MaterialRefUpdateState } from '../../types/materialCatalog.types';
import {
  extractReadingV2PassageMaterials,
  type ReadingV2PassageExtractionIssue,
} from './readingV2PassageExtraction.service';
import type { MaterialTestTypeConfig } from '../../types/materialCatalog.types';
import { composeReadingV2CompositionNumbering } from './readingV2CompositionNumbering.service';

export type ReadingV2CompositionCompatibilityMode =
  | 'native-composition'
  | 'legacy-document-extraction';

export interface ReadingV2ResolvedFullTestComposition {
  readonly composition: ReadingV2FullTestComposition;
  readonly compatibilityMode: ReadingV2CompositionCompatibilityMode;
  readonly validationIssues: readonly ReadingV2PassageExtractionIssue[];
}

export type ReadingV2ReferencedPassageEditScope = 'test-specific' | 'shared-source';
export type ReadingV2ReferencedPassageEditMode = 'test-specific-fork' | 'shared-source-edit';

export interface ReadingV2ReferencedPassageEditPlan {
  readonly mode: ReadingV2ReferencedPassageEditMode;
  readonly compositionId: ReadingV2FullTestCompositionId;
  readonly refId: string;
  readonly sourcePassageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly targetPassageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly baseSnapshotVersionId: ReadingV2SnapshotVersionId;
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

export const READING_V2_REF_ONLY_MASTER_PROHIBITED_FIELDS = [
  'document',
  'sections',
  'stimuli',
  'taskGroups',
  'interactions',
  'optionSets',
  'answerKey',
  'correctAnswers',
] as const;

const assertNoEmbeddedMasterPayload = (value: unknown, path = ''): void => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedMasterPayload(entry, `${path}.${index}`));
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (READING_V2_REF_ONLY_MASTER_PROHIBITED_FIELDS.includes(
      key as typeof READING_V2_REF_ONLY_MASTER_PROHIBITED_FIELDS[number],
    )) {
      throw new Error(`Reading V2 ref-only master contains embedded master payload field: ${childPath}`);
    }
    assertNoEmbeddedMasterPayload(child, childPath);
  });
};

export function assertReadingV2RefOnlyFullTestComposition(
  value: unknown,
): asserts value is ReadingV2FullTestComposition {
  assertNoEmbeddedMasterPayload(value);
}

const assertUniqueCompositionRefs = (passageRefs: readonly ReadingV2PassageRef[]): void => {
  const refIds = new Set<string>();
  const orders = new Set<number>();

  passageRefs.forEach((ref) => {
    if (refIds.has(ref.refId)) {
      throw new Error(`Duplicate Reading V2 passage ref id: ${ref.refId}`);
    }

    if (orders.has(ref.order)) {
      throw new Error(`Duplicate Reading V2 passage ref order: ${ref.order}`);
    }

    if (!Number.isInteger(ref.order) || ref.order < 1) {
      throw new Error(`Reading V2 passage ref order must be a positive integer: ${ref.order}`);
    }

    refIds.add(ref.refId);
    orders.add(ref.order);
  });
};

export const createReadingV2FullTestCompositionFromRefs = (input: {
  readonly compositionId: ReadingV2FullTestCompositionId;
  readonly testMaterialId: ReadingV2MaterialId;
  readonly title: string;
  readonly ownerId: string;
  readonly publishedVersionId: ReadingV2SnapshotVersionId;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly skill?: string;
  readonly passageRefs: readonly ReadingV2PassageRef[];
  readonly durationMinutes?: number;
  readonly visibility?: ReadingPassageVisibilityScope;
  readonly createdAt: string;
}): ReadingV2FullTestComposition => {
  assertUniqueCompositionRefs(input.passageRefs);

  const sortedRefs = [...input.passageRefs].sort((left, right) => left.order - right.order);
  const numbering = composeReadingV2CompositionNumbering({
    passages: sortedRefs.map((ref) => ({
      order: ref.order,
      passageMaterialId: ref.passageMaterialId,
      snapshotVersionId: ref.snapshotVersionId,
      interactions: Array.from({ length: ref.questionCountSnapshot }, (_value, index) => ({
        interactionId: `${ref.refId}:q${index + 1}`,
      })),
    })),
  });
  const composition: ReadingV2FullTestComposition = {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'packaging',
    schemaVersion: 1,
    compositionId: input.compositionId,
    testMaterialId: input.testMaterialId,
    title: input.title,
    primaryTestTypeId: input.primaryTestTypeId,
    testTypeIds: unique([
      ...(input.primaryTestTypeId ? [input.primaryTestTypeId] : []),
      ...(input.testTypeIds ?? []),
      ...sortedRefs.flatMap((ref) => ref.testTypeIdsSnapshot),
    ]),
    skill: input.skill ?? 'reading',
    passageRefs: sortedRefs,
    questionCount: numbering.totalQuestionCount,
    numbering,
    durationMinutes: input.durationMinutes,
    visibility: input.visibility ?? 'private',
    ownerId: input.ownerId,
    publishedVersionId: input.publishedVersionId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };

  assertReadingV2RefOnlyFullTestComposition(composition);
  return composition;
};

export const resolveReadingV2FullTestComposition = (input: {
  readonly composition?: ReadingV2FullTestComposition | null;
  readonly legacyDocument?: ReadingV2Document;
  readonly ownerId?: string;
  readonly testMaterialId?: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId?: ReadingV2SnapshotVersionId;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly createdAt?: string;
}): ReadingV2ResolvedFullTestComposition => {
  if (input.composition) {
    return {
      composition: input.composition,
      compatibilityMode: 'native-composition',
      validationIssues: [],
    };
  }

  if (!input.legacyDocument || !input.ownerId || !input.testMaterialId || !input.sourceSnapshotVersionId) {
    throw new Error(
      'Reading V2 full-test composition compatibility read requires native composition or legacy document, owner, material id, and snapshot version.',
    );
  }

  const extracted = extractReadingV2PassageMaterials({
    document: input.legacyDocument,
    ownerId: input.ownerId,
    testMaterialId: input.testMaterialId,
    sourceSnapshotVersionId: input.sourceSnapshotVersionId,
    sourceTitleSnapshot: input.legacyDocument.title,
    primaryTestTypeId: input.primaryTestTypeId,
    testTypeIds: input.primaryTestTypeId ? [input.primaryTestTypeId] : [],
    testTypeConfigs: input.testTypeConfigs,
    visibility: 'private',
    createdAt: input.createdAt,
  });

  return {
    composition: extracted.composition,
    compatibilityMode: 'legacy-document-extraction',
    validationIssues: extracted.validationIssues,
  };
};

export const planReadingV2PassageEditFromCompositionRef = (input: {
  readonly compositionId: ReadingV2FullTestCompositionId;
  readonly ref: ReadingV2PassageRef;
  readonly editScope?: ReadingV2ReferencedPassageEditScope;
  readonly confirmSharedSourceEdit?: boolean;
}): ReadingV2ReferencedPassageEditPlan => {
  if (input.editScope === 'shared-source') {
    if (!input.confirmSharedSourceEdit) {
      throw new Error('Reading V2 shared passage edit requires explicit shared-source edit confirmation.');
    }

    return {
      mode: 'shared-source-edit',
      compositionId: input.compositionId,
      refId: input.ref.refId,
      sourcePassageMaterialId: input.ref.passageMaterialId,
      targetPassageMaterialId: input.ref.passageMaterialId,
      baseSnapshotVersionId: input.ref.snapshotVersionId,
    };
  }

  return {
    mode: 'test-specific-fork',
    compositionId: input.compositionId,
    refId: input.ref.refId,
    sourcePassageMaterialId: input.ref.passageMaterialId,
    targetPassageMaterialId: readingV2Ids.readingPassageMaterialId(
      `${input.compositionId}-${input.ref.refId}-fork`,
    ),
    baseSnapshotVersionId: input.ref.snapshotVersionId,
  };
};

export const getReadingV2PassageRefUpdateState = (
  ref: ReadingV2PassageRef,
  currentSnapshotVersionByPassageId: Readonly<Record<string, ReadingV2SnapshotVersionId | undefined>>,
): MaterialRefUpdateState => {
  const current = currentSnapshotVersionByPassageId[ref.passageMaterialId];

  if (!current) {
    return 'unknown';
  }

  return current === ref.snapshotVersionId ? 'current' : 'newer-version-available';
};
