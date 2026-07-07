import type {
  MaterialBookMetadata,
  MaterialCatalogMaterialKind,
  MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import type { ReadingV2MaterialMetadata } from '../reading-v2/readingV2MaterialMetadata.service';
import { isReadingV2PublicVisibility } from '../reading-v2/readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from '../reading-v2/readingV2Projection.service';
import {
  MATERIAL_SUMMARY_SCHEMA_VERSION,
  type MaterialSummary,
} from './materialSummaryPort.service';

const nonEmptyUnique = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];

const withFallback = <T extends string>(
  values: readonly T[],
  fallback: T,
): T[] => {
  const normalized = nonEmptyUnique(values);
  return normalized.length > 0 ? normalized : [fallback];
};

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const readingMaterialKind = (
  metadata: ReadingV2MaterialMetadata,
): MaterialCatalogMaterialKind | null => {
  if (metadata.materialKind === 'reading-passage') {
    return 'reading-passage';
  }

  if (
    metadata.materialKind === 'full-test' ||
    metadata.materialKind === 'reading-v2-full-test-composition'
  ) {
    return 'full-test';
  }

  return null;
};

const readingLifecycleState = (
  state: ReadingV2MaterialMetadata['state'],
): MaterialSummary['lifecycleState'] => {
  if (state === 'archived') {
    return 'archived';
  }
  if (state === 'removed') {
    return 'removed';
  }
  return 'active';
};

export interface ReadingV2PassageSummarySource {
  readonly materialId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly description?: string;
  readonly visibility: string;
  readonly lifecycleState: MaterialSummary['lifecycleState'];
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly tags?: readonly string[];
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly sourceSnapshotVersionId?: string;
  readonly sourceFullTestId?: string;
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly updatedAt: string;
}

export const createReadingV2PassageMaterialSummary = (
  source: ReadingV2PassageSummarySource,
): MaterialSummary => withoutUndefined({
  schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
  materialId: source.materialId,
  producerId: 'reading-v2-passage',
  materialKind: 'reading-passage',
  surfaceFamily: 'passage',
  ownerId: source.ownerId,
  title: source.title,
  description: source.description || undefined,
  visibility: isReadingV2PublicVisibility(source.visibility)
    ? 'public'
    : 'private',
  lifecycleState: source.lifecycleState,
  skillId: 'reading',
  primaryTestTypeId: source.primaryTestTypeId,
  testTypeIds: withFallback(
    source.testTypeIds,
    'custom' as MaterialTestTypeId,
  ),
  tags: withFallback(source.tags ?? [], 'reading-passage'),
  questionCount: source.questionCount,
  durationMinutes: source.durationMinutes,
  sourceSnapshotVersionId: source.sourceSnapshotVersionId,
  sourceFullTestId: source.sourceFullTestId,
  hasBrokenRefs: source.hasBrokenRefs,
  brokenRefCount: source.brokenRefCount,
  updatedAt: source.updatedAt,
}) as unknown as MaterialSummary;

export interface ReadingV2FullTestSummarySource {
  readonly materialId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly description?: string;
  readonly visibility: string;
  readonly lifecycleState: MaterialSummary['lifecycleState'];
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly tags?: readonly string[];
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly sourceSnapshotVersionId?: string;
  readonly sourceFullTestId?: string;
  readonly hasBrokenRefs?: boolean;
  readonly brokenRefCount?: number;
  readonly updatedAt: string;
}

export const createReadingV2FullTestMaterialSummary = (
  source: ReadingV2FullTestSummarySource,
): MaterialSummary => withoutUndefined({
  schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
  materialId: source.materialId,
  producerId: 'reading-v2-full-test',
  materialKind: 'full-test',
  surfaceFamily: 'assessment',
  ownerId: source.ownerId,
  title: source.title,
  description: source.description || undefined,
  visibility: isReadingV2PublicVisibility(source.visibility)
    ? 'public'
    : 'private',
  lifecycleState: source.lifecycleState,
  skillId: 'reading',
  primaryTestTypeId: source.primaryTestTypeId,
  testTypeIds: withFallback(
    source.testTypeIds,
    'custom' as MaterialTestTypeId,
  ),
  tags: withFallback(source.tags ?? [], 'reading'),
  questionCount: source.questionCount,
  durationMinutes: source.durationMinutes,
  sourceSnapshotVersionId: source.sourceSnapshotVersionId,
  sourceFullTestId: source.sourceFullTestId,
  hasBrokenRefs: source.hasBrokenRefs,
  brokenRefCount: source.brokenRefCount,
  updatedAt: source.updatedAt,
}) as unknown as MaterialSummary;

export const createReadingV2MaterialSummary = (
  metadata: ReadingV2MaterialMetadata,
  projection?: ReadingV2DerivedProjection | null,
): MaterialSummary | null => {
  const materialKind = readingMaterialKind(metadata);
  if (!materialKind) {
    return null;
  }

  const questionCount = projection?.analytics?.interactionCount ??
    projection?.content.taskGroups.reduce(
      (total, group) => total + group.interactions.length,
      0,
    );

  if (materialKind === 'reading-passage') {
    return createReadingV2PassageMaterialSummary({
      materialId: metadata.materialId,
      ownerId: metadata.ownerId,
      title: metadata.title,
      description: metadata.description,
      visibility: metadata.visibility,
      lifecycleState: readingLifecycleState(metadata.state),
      primaryTestTypeId: metadata.primaryTestTypeId,
      testTypeIds: metadata.testTypeIds,
      tags: metadata.tags,
      questionCount,
      durationMinutes: metadata.durationMinutes,
      sourceSnapshotVersionId:
        metadata.publishedSnapshotVersionId ?? metadata.sourceSnapshotVersionId,
      sourceFullTestId: metadata.sourceFullTestId,
      hasBrokenRefs: metadata.hasBrokenRefs,
      brokenRefCount: metadata.brokenRefCount,
      updatedAt: metadata.updatedAt,
    });
  }

  return createReadingV2FullTestMaterialSummary({
    materialId: metadata.materialId,
    ownerId: metadata.ownerId,
    title: metadata.title,
    description: metadata.description,
    visibility: metadata.visibility,
    lifecycleState: readingLifecycleState(metadata.state),
    primaryTestTypeId: metadata.primaryTestTypeId,
    testTypeIds: nonEmptyUnique(metadata.testTypeIds),
    tags: withFallback(metadata.tags, 'reading'),
    questionCount,
    durationMinutes: metadata.durationMinutes,
    sourceSnapshotVersionId:
      metadata.publishedSnapshotVersionId ?? metadata.sourceSnapshotVersionId,
    sourceFullTestId: metadata.sourceFullTestId,
    hasBrokenRefs: metadata.hasBrokenRefs,
    brokenRefCount: metadata.brokenRefCount,
    updatedAt: metadata.updatedAt,
  });
};

const bookTestTypeIds = (
  book: MaterialBookMetadata,
): readonly MaterialTestTypeId[] =>
  withFallback([
    ...(book.primaryTestTypeId ? [book.primaryTestTypeId] : []),
    ...book.testTypeIds,
  ], 'custom' as MaterialTestTypeId);

export const createMaterialBookSummary = (
  book: MaterialBookMetadata,
): MaterialSummary => withoutUndefined({
  schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
  materialId: book.bookId,
  producerId: 'material-book',
  materialKind: 'book',
  surfaceFamily: 'book',
  ownerId: book.ownerId,
  title: book.title,
  description: book.description || undefined,
  visibility: book.visibility === 'public-library-published'
    ? 'public'
    : 'private',
  lifecycleState: book.status === 'archived' ? 'archived' : 'active',
  primaryTestTypeId: book.primaryTestTypeId,
  testTypeIds: bookTestTypeIds(book),
  tags: withFallback(book.tags, 'book'),
  hasBrokenRefs: book.hasBrokenRefs,
  brokenRefCount: book.brokenRefCount,
  updatedAt: book.updatedAt,
}) as unknown as MaterialSummary;
