import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  READING_V2_PROJECTION_FIXTURES,
  READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE,
} from './fixtures/readingV2ProjectionFixtures';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  generateReadingV2AnalyticsProjection,
  generateReadingV2PreviewProjection,
  generateReadingV2ReviewProjection,
  generateReadingV2SessionSafeProjection,
  generateReadingV2StudentSafeProjection,
} from './readingV2Projection.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

const fixtureDocumentFor = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES[taskType]) as ReadingV2Document;

const snapshot = () => ({
  snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-projection-test'),
  materialId: readingV2Ids.materialId('material-projection-test'),
  ownerId: 'teacher-1',
  document: fixtureDocument(),
  publishedAt: '2026-04-25T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

const snapshotFor = (taskType: keyof typeof READING_V2_CANONICAL_FIXTURES) => ({
  ...snapshot(),
  document: fixtureDocumentFor(taskType),
});

const tableDocumentWithSplitSourceMetadata = (): ReadingV2Document => {
  const document = fixtureDocumentFor('table-completion');
  const stimulus = Object.values(document.stimuli).find((candidate) => candidate.content.kind === 'table-content');

  if (!stimulus || stimulus.content.kind !== 'table-content') {
    throw new Error('Expected table-completion fixture to contain table stimulus.');
  }

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        content: {
          kind: 'table-content',
          rows: stimulus.content.rows.map((row, rowIndex) =>
            row.map((cell, cellIndex) =>
              rowIndex === 0 && cellIndex === 0
                ? {
                    ...cell,
                    splitSourceCells: [
                      { text: 'Feature', role: 'header' },
                      { text: 'Detail', role: 'header', isBlank: false },
                    ],
                  }
                : cell,
            ),
          ),
        },
      },
    },
  };
};

describe('readingV2Projection.service', () => {
  it('generates teacher-only preview projections with local-only answer state and no permanent write contract', () => {
    const projection = generateReadingV2PreviewProjection({
      draftId: 'draft-preview',
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      generatedAt: '2026-04-25T00:00:00.000Z',
    });

    expect(projection.projectionKind).toBe('preview');
    expect(projection.localOnlyAnswerState).toBe(true);
    expect(projection.runtimeContract).toBe('teacher-preview');
  });

  it('generates student-safe and session-safe projections without answer keys or author-only fields', () => {
    const studentSafe = generateReadingV2StudentSafeProjection(snapshot());
    const sessionSafe = generateReadingV2SessionSafeProjection({
      sessionCode: 'ABC123',
      studentSafeProjection: studentSafe,
    });

    expect(studentSafe.projectionKind).toBe('student-safe');
    expect(sessionSafe.projectionKind).toBe('session-safe');
    expect(() => assertReadingV2ProjectionIsStudentSanitized(studentSafe)).not.toThrow();
    expect(() => assertReadingV2ProjectionIsStudentSanitized(sessionSafe)).not.toThrow();
    expect(JSON.stringify(studentSafe)).not.toContain('acceptableAnswers');
    expect(JSON.stringify(sessionSafe)).not.toContain('importEvidence');
  });

  it('keeps student-safe and session-safe projections sanitized for every canonical task type', () => {
    Object.keys(READING_V2_CANONICAL_FIXTURES).forEach((taskType) => {
      const studentSafe = generateReadingV2StudentSafeProjection(
        snapshotFor(taskType as keyof typeof READING_V2_CANONICAL_FIXTURES),
      );
      const sessionSafe = generateReadingV2SessionSafeProjection({
        sessionCode: `SESSION-${taskType}`,
        studentSafeProjection: studentSafe,
      });

      expect(() => assertReadingV2ProjectionIsStudentSanitized(studentSafe)).not.toThrow();
      expect(() => assertReadingV2ProjectionIsStudentSanitized(sessionSafe)).not.toThrow();
      expect(JSON.stringify(studentSafe)).not.toContain('acceptableAnswers');
      expect(JSON.stringify(sessionSafe)).not.toContain('scoringRule');
    });
  });

  it('strips table split authoring metadata from generated projections', () => {
    const document = tableDocumentWithSplitSourceMetadata();
    const tableSnapshot = {
      ...snapshotFor('table-completion'),
      document,
    };
    const preview = generateReadingV2PreviewProjection({
      draftId: 'draft-table-split-metadata',
      ownerId: 'teacher-1',
      document,
    });
    const studentSafe = generateReadingV2StudentSafeProjection(tableSnapshot);
    const sessionSafe = generateReadingV2SessionSafeProjection({
      sessionCode: 'ABC123',
      studentSafeProjection: studentSafe,
    });
    const review = generateReadingV2ReviewProjection(tableSnapshot);
    const analytics = generateReadingV2AnalyticsProjection(tableSnapshot);

    [preview, studentSafe, sessionSafe, review, analytics].forEach((projection) => {
      expect(JSON.stringify(projection)).not.toContain('splitSourceCells');
    });
    expect(() => assertReadingV2ProjectionIsStudentSanitized(studentSafe)).not.toThrow();
    expect(() => assertReadingV2ProjectionIsStudentSanitized(sessionSafe)).not.toThrow();
  });

  it('generates review and analytics projections as derived outputs with grouped context and stable IDs', () => {
    const review = generateReadingV2ReviewProjection(snapshot());
    const analytics = generateReadingV2AnalyticsProjection(snapshot());

    expect(review.projectionKind).toBe('review');
    expect(review.content.taskGroups[0].instructionBlocks[0].text).toContain('sentence-completion');
    expect(review.content.taskGroups[0].interactions[0].interactionId).toContain('interaction-sentence-completion');
    expect(analytics.projectionKind).toBe('analytics');
    expect(analytics.analytics?.interactionCount).toBe(2);
  });

  it('projects group-level word limits needed by runtime IELTS instructions', () => {
    const document = fixtureDocumentFor('table-completion');
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const projection = generateReadingV2PreviewProjection({
      draftId: 'draft-table-word-limit',
      ownerId: 'teacher-1',
      document: {
        ...document,
        taskGroups: {
          ...document.taskGroups,
          [taskGroup.taskGroupId]: {
            ...taskGroup,
            answerRule: {
              ...taskGroup.answerRule,
              wordLimit: 1,
            },
          },
        },
      },
    });

    expect(projection.content.taskGroups[0]).toEqual(expect.objectContaining({ wordLimit: 1 }));
  });

  it('preserves safe anchor and option-set context needed by runtime renderers', () => {
    const choiceProjection = generateReadingV2StudentSafeProjection(snapshotFor('multiple-choice'));
    const matchingProjection = generateReadingV2StudentSafeProjection(snapshotFor('matching-headings'));

    expect(choiceProjection.content.anchors[0]).toMatchObject({
      kind: 'paragraph',
      label: 'Anchor 1',
    });
    expect(choiceProjection.content.stimuli[0].content).toMatchObject({
      kind: 'passage-content',
      paragraphs: expect.arrayContaining([
        expect.objectContaining({
          label: 'Paragraph A',
          text: expect.stringContaining('multiple-choice'),
        }),
      ]),
    });
    expect(choiceProjection.content.optionSets[0].options).toEqual([
      { optionId: 'multiple-choice-option-a', label: 'A', text: 'Option A' },
      { optionId: 'multiple-choice-option-b', label: 'B', text: 'Option B' },
      { optionId: 'multiple-choice-option-c', label: 'C', text: 'Option C' },
    ]);
    expect(choiceProjection.content.taskGroups[0].interactions[0].promptText).toBe(
      'Fixture multiple-choice prompt one.',
    );
    expect(matchingProjection.content.optionSets[0].taskGroupId).toContain('task-group-matching-headings');
    expect(() => assertReadingV2ProjectionIsStudentSanitized(choiceProjection)).not.toThrow();
    expect(() => assertReadingV2ProjectionIsStudentSanitized(matchingProjection)).not.toThrow();
  });

  it('exports projection fixtures for every required projection class', () => {
    expect(Object.keys(READING_V2_PROJECTION_FIXTURES).sort()).toEqual([
      'analytics',
      'preview',
      'review',
      'sessionSafe',
      'studentSafe',
    ]);
  });

  it('exports generated projection fixture sets for every official task type', () => {
    expect(Object.keys(READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE).sort()).toEqual(
      Object.keys(READING_V2_CANONICAL_FIXTURES).sort(),
    );
    expect(
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['table-completion'].studentSafe.content.taskGroups[0]
        .engineeringFamily,
    ).toBe('structured-layout');
    expect(
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['table-completion'].studentSafe.content.stimuli[0]
        .content.kind,
    ).toBe('table-content');
    expect(
      READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-choice'].studentSafe.content.optionSets[0]
        .options,
    ).toHaveLength(3);
  });

  it('regenerates projections from canonical source instead of preserving manual projection edits', () => {
    const baseSnapshot = snapshot();
    const first = generateReadingV2StudentSafeProjection(baseSnapshot, '2026-04-25T00:00:00.000Z');
    const manuallyEdited = {
      ...first,
      content: {
        ...first.content,
        title: 'Manual projection edit that must not be source truth',
      },
    };
    const regenerated = generateReadingV2StudentSafeProjection(baseSnapshot, '2026-04-25T00:00:00.000Z');
    const changedCanonical = generateReadingV2StudentSafeProjection(
      {
        ...baseSnapshot,
        document: {
          ...baseSnapshot.document,
          title: 'Canonical title change',
        },
      },
      '2026-04-25T00:00:00.000Z',
    );

    expect(manuallyEdited.content.title).not.toBe(regenerated.content.title);
    expect(regenerated.content.title).toBe(baseSnapshot.document.title);
    expect(changedCanonical.content.title).toBe('Canonical title change');
  });

  it('fails projection safety checks when forbidden fields are manually introduced', () => {
    const unsafeProjection = {
      ...generateReadingV2StudentSafeProjection(snapshot()),
      answerKeys: ['leaked'],
    };

    expect(() => assertReadingV2ProjectionIsStudentSanitized(unsafeProjection as never)).toThrow(/answerKeys/);
  });

  it('fails projection safety checks when Auto import diagnostics are manually introduced', () => {
    const unsafeProjection = {
      ...generateReadingV2StudentSafeProjection(snapshot()),
      autoImportDiagnostics: [{ message: 'Auto source verifier diagnostics must stay teacher-only.' }],
    };

    expect(() => assertReadingV2ProjectionIsStudentSanitized(unsafeProjection as never)).toThrow(/autoImportDiagnostics/);
  });
});
