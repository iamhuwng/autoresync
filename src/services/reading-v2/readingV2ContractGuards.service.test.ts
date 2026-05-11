import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2ProjectionPayload,
} from '../../types/readingV2.types';
import {
  assertReadingV2ProjectionInput,
  assertSupportedReadingV2SchemaVersion,
  assertValidReadingV2CanonicalDocument,
  isReadingV2PublishBlocked,
} from './readingV2ContractGuards.service';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { assertReadingV2RuntimeProjection } from './readingV2RuntimeBoundary.service';

const cloneDocument = (document: ReadingV2Document): ReadingV2Document =>
  structuredClone(document) as ReadingV2Document;

describe('readingV2ContractGuards.service', () => {
  it('accepts canonical fixtures for every official task type', () => {
    Object.values(READING_V2_CANONICAL_FIXTURES).forEach((fixture) => {
      expect(() => assertValidReadingV2CanonicalDocument(fixture)).not.toThrow();
    });
  });

  it('rejects unsupported schema versions instead of falling back', () => {
    expect(() => assertSupportedReadingV2SchemaVersion(READING_V2_SCHEMA_VERSION + 1)).toThrow(
      /Unsupported Reading V2 schema version/,
    );
  });

  it('rejects task groups whose frozen taxonomy family is overridden', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['summary-completion-list']);
    const taskGroupId = Object.keys(fixture.taskGroups)[0] ?? '';
    const taskGroup = fixture.taskGroups[taskGroupId];

    expect(taskGroup).toBeDefined();

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      taskGroups: {
        ...fixture.taskGroups,
        [taskGroupId]: {
          ...taskGroup,
          engineeringFamily: 'completion',
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /summary-completion-list requires choice/,
    );
  });

  it('rejects invalid interaction ownership', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['sentence-completion']);
    const interactionId = Object.keys(fixture.interactions)[0] ?? '';
    const interaction = fixture.interactions[interactionId];

    expect(interaction).toBeDefined();

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      interactions: {
        ...fixture.interactions,
        [interactionId]: {
          ...interaction,
          taskGroupId: readingV2Ids.taskGroupId('different-task-group'),
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /belongs to different-task-group/,
    );
  });

  it('rejects orphan anchor references', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['table-completion']);
    const anchorId = Object.keys(fixture.anchors)[0] ?? '';
    const { [anchorId]: _removedAnchor, ...remainingAnchors } = fixture.anchors;
    const invalidFixture: ReadingV2Document = {
      ...fixture,
      anchors: remainingAnchors,
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /invalid anchor/,
    );
  });

  it('rejects section references to missing stimuli before Studio can save broken drafts', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['multiple-choice']);
    const sectionId = fixture.sectionIds[0];
    const section = fixture.sections[sectionId];

    expect(section).toBeDefined();

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      sections: {
        ...fixture.sections,
        [sectionId]: {
          ...section,
          stimulusIds: [readingV2Ids.stimulusId('missing-stimulus')],
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /references missing stimulus/,
    );
  });

  it('rejects orphan interactions that are not owned by any task group', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['sentence-completion']);
    const taskGroup = Object.values(fixture.taskGroups)[0];
    const orphanInteraction = fixture.interactions[taskGroup.interactionIds[0]];
    const orphanInteractionId = readingV2Ids.interactionId('orphan-interaction');

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      interactions: {
        ...fixture.interactions,
        [orphanInteractionId]: {
          ...orphanInteraction,
          interactionId: orphanInteractionId,
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /is not owned by any task group/,
    );
  });

  it('rejects orphan option sets that are not owned by any task group', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['multiple-choice']);
    const existingOptionSet = Object.values(fixture.optionSets)[0];
    const orphanOptionSetId = readingV2Ids.optionSetId('orphan-option-set');

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      optionSets: {
        ...fixture.optionSets,
        [orphanOptionSetId]: {
          ...existingOptionSet,
          optionSetId: orphanOptionSetId,
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /is not owned by any task group/,
    );
  });

  it('rejects section and task-group ownership mismatches', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['matching-headings']);
    const sectionId = fixture.sectionIds[0];
    const taskGroupId = Object.keys(fixture.taskGroups)[0] ?? '';
    const taskGroup = fixture.taskGroups[taskGroupId];

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      taskGroups: {
        ...fixture.taskGroups,
        [taskGroupId]: {
          ...taskGroup,
          sectionId: readingV2Ids.sectionId('different-section'),
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      new RegExp(`belongs to different-section, not ${sectionId}`),
    );
  });

  it('rejects duplicate interaction references so visible numbering stays derived-only', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['short-answer']);
    const taskGroupId = Object.keys(fixture.taskGroups)[0] ?? '';
    const taskGroup = fixture.taskGroups[taskGroupId];

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      taskGroups: {
        ...fixture.taskGroups,
        [taskGroupId]: {
          ...taskGroup,
          interactionIds: [taskGroup.interactionIds[0], taskGroup.interactionIds[0]],
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /referenced by more than one task group position/,
    );
  });

  it('rejects interaction anchors outside the task-group stimulus scope', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['true-false-not-given']);
    const taskGroupId = Object.keys(fixture.taskGroups)[0] ?? '';
    const taskGroup = fixture.taskGroups[taskGroupId];
    const interactionId = taskGroup.interactionIds[0];
    const interaction = fixture.interactions[interactionId];
    const extraStimulusId = readingV2Ids.stimulusId('unlinked-stimulus');
    const extraAnchorId = readingV2Ids.anchorId('unlinked-anchor');

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      stimuli: {
        ...fixture.stimuli,
        [extraStimulusId]: {
          stimulusId: extraStimulusId,
          kind: 'passage',
          content: {
            kind: 'passage-content',
            paragraphs: [{ anchorId: extraAnchorId, label: 'Paragraph X', text: 'Unlinked passage text.' }],
          },
          anchorIds: [extraAnchorId],
        },
      },
      anchors: {
        ...fixture.anchors,
        [extraAnchorId]: {
          anchorId: extraAnchorId,
          stimulusId: extraStimulusId,
          kind: 'paragraph',
        },
      },
      sections: {
        ...fixture.sections,
        [fixture.sectionIds[0]]: {
          ...fixture.sections[fixture.sectionIds[0]],
          stimulusIds: [...fixture.sections[fixture.sectionIds[0]].stimulusIds, extraStimulusId],
        },
      },
      interactions: {
        ...fixture.interactions,
        [interactionId]: {
          ...interaction,
          primaryAnchorId: extraAnchorId,
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /outside task group stimulus scope/,
    );
  });

  it('rejects stimuli that lack kind-compatible display content', () => {
    const fixture = cloneDocument(READING_V2_CANONICAL_FIXTURES['table-completion']);
    const stimulusId = Object.keys(fixture.stimuli)[0] ?? '';
    const stimulus = fixture.stimuli[stimulusId];

    const invalidFixture: ReadingV2Document = {
      ...fixture,
      stimuli: {
        ...fixture.stimuli,
        [stimulusId]: {
          ...stimulus,
          content: {
            kind: 'passage-content',
            paragraphs: [{ text: 'This cannot stand in for table structure.' }],
          },
        },
      },
    };

    expect(() => assertValidReadingV2CanonicalDocument(invalidFixture)).toThrow(
      /requires table display content/,
    );
  });

  it('blocks publish only for error severity issues', () => {
    expect(
      isReadingV2PublishBlocked([
        { code: 'mobile-advisory', severity: 'warning', message: 'Use focused mobile entry.' },
        { code: 'note', severity: 'info', message: 'Advisory.' },
      ]),
    ).toBe(false);

    expect(
      isReadingV2PublishBlocked([
        {
          code: 'orphan-anchor-reference',
          severity: 'error',
          message: 'Anchor is missing.',
        },
      ]),
    ).toBe(true);
  });

  it('rejects canonical drafts where projection-only APIs are required', () => {
    const canonical = READING_V2_CANONICAL_FIXTURES['multiple-choice'];

    expect(() =>
      assertReadingV2ProjectionInput(canonical as unknown as ReadingV2ProjectionPayload),
    ).toThrow(/require derived projection payloads/);
  });

  it('accepts explicit projection payloads for runtime and review boundaries', () => {
    const projection: ReadingV2ProjectionPayload = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'projection',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      ownerId: 'teacher-1',
      projectionKind: 'student-safe',
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      generatedAt: '2026-04-25T00:00:00.000Z',
    };

    expect(() => assertReadingV2ProjectionInput(projection)).not.toThrow();
    expect(() => assertReadingV2RuntimeProjection(projection)).not.toThrow();
  });

  it('rejects review and analytics projections at the student runtime boundary', () => {
    const projection: ReadingV2ProjectionPayload = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'projection',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      ownerId: 'teacher-1',
      projectionKind: 'review',
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      generatedAt: '2026-04-25T00:00:00.000Z',
    };

    expect(() => assertReadingV2ProjectionInput(projection)).not.toThrow();
    expect(() => assertReadingV2RuntimeProjection(projection)).toThrow(
      /runtime requires preview, student-safe, or session-safe projections/,
    );

    expect(() =>
      assertReadingV2RuntimeProjection({
        ...projection,
        projectionKind: 'analytics',
      }),
    ).toThrow(/runtime requires preview, student-safe, or session-safe projections/);
  });
});
