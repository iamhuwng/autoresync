import type {
  ReadingPassageHomeworkSet,
  ReadingPassageHomeworkSetItem,
  ReadingPassageHomeworkSnapshot,
} from '../../types/homework.types';
import type { MaterialTestTypeId } from '../../types/materialCatalog.types';

export interface ReadingPassageHomeworkCandidate {
  readonly materialId: string;
  readonly title: string;
  readonly questionCount: number;
  readonly testTypeIds: readonly MaterialTestTypeId[] | readonly string[];
  readonly publishedSnapshotVersionId?: string;
  readonly sourceOrderDisplay?: string;
  readonly sourceFullTestTitle?: string;
  readonly hasStudentSafeProjection?: boolean;
  readonly accessible?: boolean;
  readonly archived?: boolean;
}

const requireAssignableReadingPassage = (
  candidate: ReadingPassageHomeworkCandidate,
): string => {
  const snapshotVersionId = candidate.publishedSnapshotVersionId?.trim();

  if (!snapshotVersionId) {
    throw new Error(`Reading Passage ${candidate.materialId} requires a published snapshot before assignment.`);
  }

  if (candidate.archived === true) {
    throw new Error(`Reading Passage ${candidate.materialId} is archived and cannot be assigned.`);
  }

  if (candidate.accessible === false) {
    throw new Error(`Reading Passage ${candidate.materialId} is inaccessible and cannot be assigned.`);
  }

  if (candidate.hasStudentSafeProjection === false) {
    throw new Error(`Reading Passage ${candidate.materialId} is missing a student-safe projection.`);
  }

  return snapshotVersionId;
};

export const createReadingPassageHomeworkSnapshot = (
  candidate: ReadingPassageHomeworkCandidate,
): ReadingPassageHomeworkSnapshot => {
  const snapshotVersionId = requireAssignableReadingPassage(candidate);

  return {
    passageMaterialId: candidate.materialId,
    snapshotVersionId,
    titleSnapshot: candidate.title,
    questionCount: candidate.questionCount,
    testTypeIds: [...candidate.testTypeIds],
    sourceOrderDisplay: candidate.sourceOrderDisplay,
    sourceFullTestTitle: candidate.sourceFullTestTitle,
  };
};

export const createReadingPassageSetHomework = (
  candidates: readonly ReadingPassageHomeworkCandidate[],
  title = 'Reading Passage set',
): ReadingPassageHomeworkSet => {
  if (candidates.length === 0) {
    throw new Error('Reading Passage set requires at least one selected passage.');
  }

  const items: ReadingPassageHomeworkSetItem[] = candidates.map((candidate, index) => ({
    ...createReadingPassageHomeworkSnapshot(candidate),
    order: index + 1,
  }));

  return {
    titleSnapshot: title,
    items,
  };
};
