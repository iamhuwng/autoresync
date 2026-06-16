import { describe, expect, it } from 'vitest';
import {
  buildReadingV2DuplicateIndexRow,
  calculateReadingV2DuplicateSimilarity,
  createReadingV2DuplicateShingleHashes,
  findReadingV2PassageDuplicateMatches,
  getReadingV2DuplicateIndexPath,
  normalizeReadingV2DuplicateText,
  validateReadingV2DuplicateIndexRow,
} from './readingV2PassageDuplicateGuard.service';

const matchingBody =
  'Ancient libraries preserved fragile records for public scholars during long winters. ' +
  'Careful catalogues helped readers compare local histories with reliable details.';

const matchingQuestions =
  'Which records did scholars preserve? Choose fragile records. ' +
  'What helped readers compare histories? Select careful catalogues.';

const unrelatedBody =
  'Modern gardens use recycled water for citrus trees beside shaded walkways. ' +
  'Visitors photograph bright flowers during weekend workshops.';

const unrelatedQuestions =
  'Which trees grow near walkways? Choose citrus trees. What do visitors photograph? Choose flowers.';

describe('readingV2PassageDuplicateGuard.service', () => {
  it('normalizes Unicode, case, punctuation, and whitespace deterministically', () => {
    expect(normalizeReadingV2DuplicateText('  CAFÉ, library!\nArchive\tRecords.  ')).toEqual([
      'cafe',
      'library',
      'archive',
      'records',
    ]);
  });

  it('uses five-word body shingles and three-word question shingles', () => {
    const bodyHashes = createReadingV2DuplicateShingleHashes('one two three four five six', 5);
    const questionHashes = createReadingV2DuplicateShingleHashes('one two three four five six', 3);

    expect(bodyHashes).toHaveLength(2);
    expect(questionHashes).toHaveLength(4);
    expect(bodyHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
  });

  it('computes exact Sorensen-Dice body, question, and combined scores', () => {
    const left = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-left',
      currentVersionId: 'snapshot-left',
      title: 'Left',
      state: 'published',
      visibility: 'private',
      source: { sourceFullTestId: 'full-test-1' },
      testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: 'one two three four five six',
      questionText: 'alpha beta gamma delta',
    });
    const right = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-right',
      currentVersionId: 'snapshot-right',
      title: 'Right',
      state: 'published',
      visibility: 'private',
      source: { sourceFullTestId: 'full-test-1' },
      testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: 'one two three four five seven',
      questionText: 'alpha beta gamma epsilon',
    });

    expect(calculateReadingV2DuplicateSimilarity(left, right)).toMatchObject({
      bodySimilarityPercent: 50,
      questionSimilarityPercent: 50,
      combinedSimilarityPercent: 50,
      shouldWarn: false,
    });
  });

  it('warns at or above 80 percent and stays warning-only', () => {
    const row = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-existing',
      currentVersionId: 'snapshot-existing',
      title: 'Existing',
      state: 'published',
      visibility: 'public',
      source: { sourceFullTestId: 'full-test-1' },
      testType: { primaryTestTypeId: 'ielts', testTypeIds: ['ielts'] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: matchingBody,
      questionText: matchingQuestions,
    });

    const result = findReadingV2PassageDuplicateMatches({
      teacherId: 'teacher-1',
      candidate: {
        title: 'Candidate',
        bodyText: matchingBody.toUpperCase(),
        questionText: matchingQuestions,
      },
      rows: [row],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      materialId: 'passage-existing',
      combinedSimilarityPercent: 100,
      shouldWarn: true,
      actions: ['use-existing', 'create-new-anyway'],
    });
    expect(result.shouldWarn).toBe(true);
    expect(result.blockPublish).toBe(false);
  });

  it('does not warn below the approved threshold', () => {
    const row = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-unrelated',
      currentVersionId: 'snapshot-unrelated',
      title: 'Unrelated',
      state: 'published',
      visibility: 'public',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: unrelatedBody,
      questionText: unrelatedQuestions,
    });

    const result = findReadingV2PassageDuplicateMatches({
      teacherId: 'teacher-1',
      candidate: {
        title: 'Candidate',
        bodyText: matchingBody,
        questionText: matchingQuestions,
      },
      rows: [row],
    });

    expect(result.matches).toEqual([]);
    expect(result.shouldWarn).toBe(false);
  });

  it('excludes current material id, includes owned archived rows, and excludes non-owned archived rows', () => {
    const active = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-2',
      passageMaterialId: 'passage-public-active',
      currentVersionId: 'snapshot-public-active',
      title: 'Public active',
      state: 'published',
      visibility: 'public',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: matchingBody,
      questionText: matchingQuestions,
    });
    const ownArchived = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-own-archived',
      currentVersionId: 'snapshot-own-archived',
      title: 'Own archived',
      state: 'archived',
      visibility: 'public',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: matchingBody,
      questionText: matchingQuestions,
    });
    const otherArchived = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-2',
      passageMaterialId: 'passage-other-archived',
      currentVersionId: 'snapshot-other-archived',
      title: 'Other archived',
      state: 'archived',
      visibility: 'public',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: matchingBody,
      questionText: matchingQuestions,
    });

    const result = findReadingV2PassageDuplicateMatches({
      teacherId: 'teacher-1',
      currentMaterialId: 'passage-public-active',
      candidate: {
        title: 'Candidate',
        bodyText: matchingBody,
        questionText: matchingQuestions,
      },
      rows: [active, ownArchived, otherArchived],
    });

    expect(result.matches.map((match) => match.materialId)).toEqual(['passage-own-archived']);
    expect(result.matches[0]?.actions).toEqual(['restore-and-use', 'create-new-anyway']);
  });

  it('builds safe owner-scoped index rows and rejects unsafe payload fields', () => {
    const row = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-safe',
      currentVersionId: 'snapshot-safe',
      title: 'Safe',
      state: 'published',
      visibility: 'private',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 2,
      updatedAt: '2026-06-09T12:00:00.000Z',
      bodyText: matchingBody,
      questionText: matchingQuestions,
    });

    expect(getReadingV2DuplicateIndexPath('teacher-1', 'passage-safe')).toBe(
      'reading_v2/duplicate_indexes/passages_by_owner/teacher-1/passage-safe',
    );
    expect(row).toMatchObject({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-safe',
      currentVersionId: 'snapshot-safe',
      bodyShingleSize: 5,
      questionShingleSize: 3,
    });
    expect(JSON.stringify(row)).not.toMatch(/matchingBody|matchingQuestions|answerKey|document|scoringRule/);

    expect(() =>
      validateReadingV2DuplicateIndexRow({
        ...row,
        document: { hidden: true },
      }),
    ).toThrow(/unsafe duplicate index field.*document/);
  });

  it('persists a sentinel for empty shingle sets without making empty passages duplicates', () => {
    const row = buildReadingV2DuplicateIndexRow({
      ownerId: 'teacher-1',
      passageMaterialId: 'passage-short',
      currentVersionId: 'snapshot-short',
      title: 'Short',
      state: 'published',
      visibility: 'private',
      source: {},
      testType: { testTypeIds: [] },
      questionCount: 0,
      updatedAt: '2026-06-16T00:00:00.000Z',
      bodyText: 'short',
      questionText: 'tiny',
    });

    expect(row.bodyShingleHashes).toEqual(['__empty_shingle_set__']);
    expect(row.questionShingleHashes).toEqual(['__empty_shingle_set__']);
    expect(calculateReadingV2DuplicateSimilarity(row, row)).toMatchObject({
      bodySimilarityPercent: 0,
      questionSimilarityPercent: 0,
      combinedSimilarityPercent: 0,
      shouldWarn: false,
    });
  });
});
