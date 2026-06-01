import { materialCatalogIds, type MaterialTestTypeId } from '../../types/materialCatalog.types';
import {
  readingV2Ids,
  type ReadingV2FullTestComposition,
  type ReadingV2MaterialId,
  type ReadingV2PassageRef,
} from '../../types/readingV2.types';
import { createReadingV2FullTestCompositionFromRefs } from './readingV2FullTestComposition.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2TeacherCompositionRepository {
  readonly write: (path: string, value: unknown) => Promise<void>;
}

export interface ReadingV2TeacherCompositionPassageInput {
  readonly id?: string;
  readonly materialId?: string;
  readonly title?: string;
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly publishedSnapshotVersionId?: string;
  readonly sourceOrderDisplay?: string;
  readonly sourceQuestionRange?: string;
  readonly primaryTestTypeId?: string;
  readonly testTypeIds?: readonly string[];
  readonly testTypes?: readonly {
    readonly testTypeId?: string;
  }[];
  readonly visibility?: string;
}

export interface CreateReadingV2TeacherCompositionResult {
  readonly composition: ReadingV2FullTestComposition;
  readonly paths: {
    readonly composition: string;
    readonly version: string;
  };
}

const sanitizeIdPart = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'reading-test';
};

const nowIso = (): string => new Date().toISOString();

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const getPassageMaterialId = (passage: ReadingV2TeacherCompositionPassageInput): string =>
  String(passage.materialId || passage.id || '').trim();

const getSnapshotVersionId = (passage: ReadingV2TeacherCompositionPassageInput): string =>
  String(passage.publishedSnapshotVersionId || '').trim();

const getTestTypeIds = (passage: ReadingV2TeacherCompositionPassageInput): MaterialTestTypeId[] => (
  unique([
    ...(passage.primaryTestTypeId ? [passage.primaryTestTypeId] : []),
    ...(passage.testTypeIds ?? []),
    ...(passage.testTypes ?? []).map((testType) => testType.testTypeId).filter(Boolean) as string[],
  ])
    .filter((testTypeId) => testTypeId.trim().length > 0)
    .map((testTypeId) => materialCatalogIds.testTypeId(testTypeId))
);

const getPrimaryTestTypeId = (
  passages: readonly ReadingV2TeacherCompositionPassageInput[],
): MaterialTestTypeId | undefined => getTestTypeIds(passages[0] ?? {})[0];

const getVisibility = (
  passages: readonly ReadingV2TeacherCompositionPassageInput[],
): 'private' | 'public' => (
  passages.every((passage) => passage.visibility === 'public') ? 'public' : 'private'
);

const buildPassageRefs = (
  passages: readonly ReadingV2TeacherCompositionPassageInput[],
): ReadingV2PassageRef[] => passages.map((passage, index) => {
  const passageMaterialId = getPassageMaterialId(passage);
  const snapshotVersionId = getSnapshotVersionId(passage);

  if (!passageMaterialId) {
    throw new Error('Selected Reading Passage is missing a material id.');
  }

  if (!snapshotVersionId) {
    throw new Error('Selected Reading Passage is missing a published snapshot version.');
  }

  const order = index + 1;

  return {
    refId: readingV2Ids.passageRefId(`selected-passage-${order}`),
    passageMaterialId: readingV2Ids.readingPassageMaterialId(passageMaterialId),
    snapshotVersionId: readingV2Ids.snapshotVersionId(snapshotVersionId),
    order,
    sourcePassageNumber: order,
    sourceOrderLabelSnapshot: 'Passage',
    sourceOrderDisplaySnapshot: passage.sourceOrderDisplay || `Passage ${order}`,
    titleSnapshot: passage.title || `Reading Passage ${order}`,
    questionRangeSnapshot: passage.sourceQuestionRange,
    questionCountSnapshot: Number(passage.questionCount || 0),
    durationSnapshot: passage.durationMinutes,
    testTypeIdsSnapshot: getTestTypeIds(passage),
  };
});

export const buildReadingV2TeacherSelectedPassageComposition = (input: {
  readonly teacherId: string;
  readonly passages: readonly ReadingV2TeacherCompositionPassageInput[];
  readonly now?: string;
}): ReadingV2FullTestComposition => {
  if (!input.teacherId) {
    throw new Error('Teacher id is required to create a Reading Passage composition.');
  }

  if (input.passages.length === 0) {
    throw new Error('Select at least one Reading Passage to create a full test.');
  }

  const createdAt = input.now ?? nowIso();
  const firstPassage = input.passages[0];
  const firstPassageId = firstPassage ? getPassageMaterialId(firstPassage) : '';
  const snapshotSeed = firstPassage ? getSnapshotVersionId(firstPassage) || createdAt : createdAt;
  const compositionId = readingV2Ids.fullTestCompositionId(
    `teacher-selected-${sanitizeIdPart(input.teacherId)}-${sanitizeIdPart(firstPassageId)}-${sanitizeIdPart(snapshotSeed)}`,
  );
  const testMaterialId = readingV2Ids.materialId(`composition-${compositionId}`) as ReadingV2MaterialId;
  const passageRefs = buildPassageRefs(input.passages);
  const testTypeIds = unique(passageRefs.flatMap((ref) => ref.testTypeIdsSnapshot));

  return createReadingV2FullTestCompositionFromRefs({
    compositionId,
    testMaterialId,
    title: 'Selected Reading Passages',
    ownerId: input.teacherId,
    publishedVersionId: readingV2Ids.snapshotVersionId(`selected-${sanitizeIdPart(createdAt)}`),
    primaryTestTypeId: getPrimaryTestTypeId(input.passages),
    testTypeIds,
    skill: 'reading',
    passageRefs,
    durationMinutes: passageRefs.reduce((total, ref) => total + Number(ref.durationSnapshot || 0), 0) || undefined,
    visibility: getVisibility(input.passages),
    createdAt,
  });
};

export const createReadingV2TeacherSelectedPassageComposition = async (input: {
  readonly teacherId: string;
  readonly passages: readonly ReadingV2TeacherCompositionPassageInput[];
  readonly repository: ReadingV2TeacherCompositionRepository;
  readonly now?: string;
}): Promise<CreateReadingV2TeacherCompositionResult> => {
  const composition = buildReadingV2TeacherSelectedPassageComposition(input);
  const paths = {
    composition: readingV2StoragePaths.fullTestCompositions(composition.compositionId),
    version: readingV2StoragePaths.fullTestCompositionVersions(
      composition.compositionId,
      composition.publishedVersionId,
    ),
  };
  const versionValue = {
    ...composition,
    publishedAt: composition.createdAt,
    publishedBy: input.teacherId,
  };

  await input.repository.write(paths.composition, composition);
  await input.repository.write(paths.version, versionValue);

  return { composition, paths };
};
