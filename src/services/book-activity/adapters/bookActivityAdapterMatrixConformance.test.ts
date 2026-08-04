import activityCoverageMatrix from '../../../../documentation/architecture/data/prd0062-activity-coverage.matrix.json';
import type { ListeningPublishedVersionRecord } from '../../../../features/assessment/listening/public';
import type { ReadingV2DerivedProjection } from '../../../reading-v2/public';
import { describe, expect, it } from 'vitest';
import {
  adaptListeningVersionToBookActivities,
} from './listening/listeningActivityAdapter';
import {
  adaptReadingV2ProjectionToBookActivities,
} from './reading/readingV2ActivityAdapter';
import { bookActivityAdapterRegistrations } from '../runtime/registrations/bookActivityAdapterRegistrations';

type CoverageRow = (typeof activityCoverageMatrix.rows)[number];

const rows = activityCoverageMatrix.rows as readonly CoverageRow[];
const REDACTED_ANSWER = '__answer-redacted__';
const PRIVATE_SOURCE_URL = 'https://private.example/source?secret=do-not-copy';

const sourceContextFor = (row: CoverageRow) => ({
  available: true,
  description: `Book-owned source for ${row.fixtureId}`,
  sourceExerciseLabel: 'Exercise 1',
  sourcePartLabel: 'Part 1',
});

const imageAssetFor = (row: CoverageRow) => ({
  kind: 'image' as const,
  assetId: `${row.fixtureId}-image`,
  sourceRef: `book-source:${row.fixtureId}`,
});

const readingStimulusFor = (row: CoverageRow) => {
  const typeId = row.profile.typeId;
  if (typeId.includes('table')) {
    return {
      stimulusId: 'stimulus-1',
      kind: 'table' as const,
      content: {
        kind: 'table-content' as const,
        rows: [[{ text: 'Book table cell' }]],
      },
      anchorIds: [],
    };
  }
  if (typeId.includes('flowchart')) {
    return {
      stimulusId: 'stimulus-1',
      kind: 'flowchart' as const,
      content: {
        kind: 'flowchart-content' as const,
        steps: [{ stepId: 'step-1', text: 'Book flow step' }],
      },
      anchorIds: [],
    };
  }
  if (typeId.includes('diagram')) {
    return {
      stimulusId: 'stimulus-1',
      kind: 'diagram' as const,
      content: {
        kind: 'diagram-content' as const,
        imageAlt: 'Book-owned labelled diagram.',
        imageUrl: PRIVATE_SOURCE_URL,
        hotspots: [],
      },
      anchorIds: [],
    };
  }
  return {
    stimulusId: 'stimulus-1',
    kind: 'passage' as const,
    content: {
      kind: 'passage-content' as const,
      paragraphs: [{ paragraphId: 'paragraph-1', text: 'Book-owned passage context.' }],
    },
    anchorIds: [],
  };
};

const readingResponseShapeFor = (row: CoverageRow) => {
  const { family } = row.interaction;
  const typeId = row.profile.typeId;
  if (family === 'text-entry') {
    if (typeId.includes('table')) return { kind: 'structured-entry' as const, structure: 'table' as const };
    if (typeId.includes('flowchart')) return { kind: 'structured-entry' as const, structure: 'flowchart' as const };
    if (typeId.includes('diagram')) return { kind: 'structured-entry' as const, structure: 'diagram' as const };
    return { kind: 'free-text' as const };
  }
  if (family === 'matching') {
    return {
      kind: 'matching' as const,
      optionSetId: 'options-1',
      optionReuse: 'disallowed' as const,
    };
  }
  if (typeId === 'true-false-not-given' || typeId === 'yes-no-not-given') {
    return {
      kind: 'binary-judgement' as const,
      vocabulary: typeId === 'true-false-not-given' ? 'TFNG' as const : 'YNNG' as const,
    };
  }
  if (row.responseCodec === 'choice-multiple-v1') {
    return { kind: 'multi-select' as const, optionSetId: 'options-1', selectionLimit: 2 };
  }
  return { kind: 'single-choice' as const, optionSetId: 'options-1' };
};

const readingProjectionFor = (row: CoverageRow): ReadingV2DerivedProjection => {
  const options = [
    { optionId: 'option-a', label: 'A', text: 'First option' },
    { optionId: 'option-b', label: 'B', text: 'Second option' },
    { optionId: 'option-c', label: 'C', text: 'Third option' },
  ];
  const needsOptions = row.interaction.family === 'choice' || row.interaction.family === 'matching';
  const responseShape = readingResponseShapeFor(row);
  return {
    deliveryEngine: 'reading-v2',
    plane: 'projection',
    schemaVersion: 1,
    ownerId: 'owner-1',
    projectionKind: 'student-safe',
    sourceSnapshotVersionId: 'version-1',
    generatedAt: '2026-07-26T00:00:00.000Z',
    projectionId: `projection-${row.fixtureId}`,
    sourceDocumentId: `document-${row.fixtureId}`,
    runtimeContract: 'student-runtime',
    content: {
      title: `Reading ${row.fixtureId}`,
      sections: [],
      stimuli: [readingStimulusFor(row)],
      anchors: [],
      taskGroups: [{
        taskGroupId: 'group-1',
        officialTaskType: row.profile.typeId,
        engineeringFamily: row.interaction.family,
        instructionBlocks: [{ id: 'instruction-1', text: 'Complete this fixture.' }],
        stimulusRefs: [{ stimulusId: 'stimulus-1' }],
        interactions: [{
          interactionId: 'interaction-1',
          taskGroupId: 'group-1',
          displayNumber: 1,
          promptText: `Prompt for ${row.fixtureId}`,
          responseShape,
        }],
      }],
      optionSets: needsOptions ? [{
        optionSetId: 'options-1',
        taskGroupId: 'group-1',
        options,
      }] : [],
    },
  } as unknown as ReadingV2DerivedProjection;
};

const listeningQuestionTypeFor = (row: CoverageRow): string =>
  row.profile.typeId.replace(/^ielts-listening-/u, '');

const listeningVersionFor = (row: CoverageRow): ListeningPublishedVersionRecord => {
  const needsOptions = row.interaction.family === 'choice' || row.interaction.family === 'matching';
  const needsImage = row.stimulus.assetKinds.includes('image');
  return {
    path: 'listening_authoring/versions',
    versionId: `version-${row.fixtureId}`,
    draftId: 'draft-1',
    ownerId: 'owner-1',
    testId: 'test-1',
    state: 'published',
    versionNumber: 1,
    sourceDraftPath: 'drafts',
    documentHash: 'hash',
    retainedPins: {},
    publishedAt: 1,
    document: {
      title: `Listening ${row.fixtureId}`,
      type: 'IELTS',
      skill: 'Listening',
      duration: 30,
      difficulty: 'Intermediate',
      questionCount: 1,
      isPublic: false,
      isComplete: true,
      displayMode: needsImage ? 'image' : 'text',
      metadata: {
        description: 'Conformance fixture',
        instructions: 'Listen and answer.',
        tags: [],
      },
      audioSections: [{
        number: 1,
        name: 'Part 1',
        audioUrl: PRIVATE_SOURCE_URL,
        assetId: `${row.fixtureId}-audio`,
        startQuestion: 1,
        endQuestion: 1,
      }],
      ...(needsImage ? {
        questionImages: [{
          sectionNumber: 1,
          imageUrl: PRIVATE_SOURCE_URL,
          questionRange: { start: 1, end: 1 },
        }],
      } : {}),
      questions: [{
        number: 1,
        type: listeningQuestionTypeFor(row),
        question: `Prompt for ${row.fixtureId}`,
        ...(needsOptions ? { options: ['Option A', 'Option B', 'Option C'] } : {}),
        answer: REDACTED_ANSWER,
        sectionNumber: 1,
        points: 1,
        ...(needsImage ? { imageUrl: PRIVATE_SOURCE_URL } : {}),
      }],
      settings: {
        allowPause: false,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'after-submission',
        allowReview: true,
        passingScore: 1,
        allowReplay: false,
      },
    },
  };
};

const listeningContextFor = (row: CoverageRow) => ({
  sourceContext: sourceContextFor(row),
  ...(row.stimulus.assetKinds.includes('image') ? {
    authorizedAssetRefs: [imageAssetFor(row)],
  } : {}),
  ...(row.responseCodec === 'choice-multiple-v1' ? { requiredSelectionCount: 2 } : {}),
  ...(row.interaction.family === 'matching' ? { allowOptionReuse: false } : {}),
});

const readingContextFor = (row: CoverageRow) => ({
  sourceContext: sourceContextFor(row),
  ...(row.stimulus.assetKinds.includes('image') ? {
    authorizedAssetRefs: [imageAssetFor(row)],
  } : {}),
});

const expectedAnswerRuleFor = (row: CoverageRow) => ({
  defaultPoints: 1,
  normalization: 'trim-case-and-spacing',
  ...(row.responseCodec === 'choice-multiple-v1' ? { requiredSelectionCount: 2 } : {}),
  ...(row.responseCodec === 'matching-pairs-v1' ? { allowOptionReuse: false } : {}),
});

describe('Book Activity adapter matrix conformance', () => {
  it('keeps matrix cardinality and Reading/Listening split explicit', () => {
    expect(rows).toHaveLength(32);
    expect(rows.filter((row) => row.profile.taxonomyId === 'ielts-reading')).not.toHaveLength(0);
    expect(rows.filter((row) => row.profile.taxonomyId === 'ielts-listening')).not.toHaveLength(0);
  });

  it.each(rows)('$fixtureId converts through its registered adapter', (row) => {
    const registration = bookActivityAdapterRegistrations.find(
      (entry) => entry.profile.taxonomyId === row.profile.taxonomyId &&
        entry.profile.typeId === row.profile.typeId &&
        entry.family === row.interaction.family &&
        entry.variant === row.interaction.variant,
    );
    expect(registration).toMatchObject({
      profile: row.profile,
      family: row.interaction.family,
      variant: row.interaction.variant,
      presentationMode: row.presentationMode,
      responseCodec: row.responseCodec,
    });

    const result = row.profile.taxonomyId === 'ielts-reading'
      ? adaptReadingV2ProjectionToBookActivities({
          projection: readingProjectionFor(row),
          contextForTaskGroup: () => readingContextFor(row),
        })
      : adaptListeningVersionToBookActivities({
          version: listeningVersionFor(row),
          contextForQuestion: () => listeningContextFor(row),
        });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`${row.fixtureId}: ${result.code} ${result.path}`);

    expect(result.projections).toHaveLength(1);
    const [projection] = result.projections;
    expect(projection).toMatchObject({
      taskProfile: row.profile,
      interaction: row.interaction,
      presentationMode: row.presentationMode,
      contextRequirement: row.contextRequirement,
      answerRule: expectedAnswerRuleFor(row),
      assetRefs: row.stimulus.assetKinds.map((kind) => ({
        kind,
        assetId: kind === 'audio' ? `${row.fixtureId}-audio` : `${row.fixtureId}-image`,
      })),
    });
    expect(projection.scoring.mode).toBe(row.scoringReview.mode);
    expect(projection.presentationMode === 'source-assisted')
      .toBe(row.presentationMode === 'source-assisted');
    if (row.presentationMode === 'source-assisted') {
      expect(projection.stimulus).toBeNull();
      expect(projection.interactions[0]?.sourceAssisted).toMatchObject({
        sourceExerciseLabel: 'Exercise 1',
        sourcePartLabel: 'Part 1',
      });
    } else {
      expect(projection.stimulus).not.toBeNull();
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(REDACTED_ANSWER);
    expect(serialized).not.toContain(PRIVATE_SOURCE_URL);
    expect(serialized).not.toContain('owner-1');
  });
});
