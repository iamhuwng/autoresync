// Reading V2 Projection boundary: generates derived delivery payloads from canonical snapshots.
// Projections are never editable source truth and must not import legacy Reading renderers.
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2MaterialId,
  type ReadingV2OptionSet,
  type ReadingV2ProjectionKind,
  type ReadingV2ProjectionPayload,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SnapshotVersionId,
  type ReadingV2StimulusContent,
  type ReadingV2StimulusNode,
  type ReadingV2TableCellContent,
  type ReadingV2TaskGroup,
} from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { deriveReadingV2VisibleNumbers } from './readingV2Numbering.service';
import { assertReadingV2PublishGate } from './readingV2Validation.service';

export interface ReadingV2ProjectedInteraction {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly displayNumber: number;
  readonly responseShape: ReadingV2Interaction['responseShape'];
  readonly promptText?: string;
  readonly primaryAnchorId?: string;
  readonly contextAnchorIds?: readonly string[];
}

export interface ReadingV2ProjectedTaskGroup {
  readonly taskGroupId: string;
  readonly officialTaskType: string;
  readonly engineeringFamily: string;
  readonly groupTitle?: string;
  readonly layoutHint?: string;
  readonly wordLimit?: number;
  readonly instructionBlocks: readonly { readonly id: string; readonly text: string }[];
  readonly stimulusRefs: readonly { readonly stimulusId: string; readonly anchorIds?: readonly string[] }[];
  readonly interactions: readonly ReadingV2ProjectedInteraction[];
}

export interface ReadingV2ProjectedStimulus {
  readonly stimulusId: string;
  readonly kind: ReadingV2StimulusNode['kind'];
  readonly title?: string;
  readonly content: ReadingV2StimulusContent;
  readonly anchorIds: readonly string[];
}

export interface ReadingV2ProjectedAnchor {
  readonly anchorId: string;
  readonly stimulusId: string;
  readonly kind: ReadingV2Anchor['kind'];
  readonly label?: string;
}

export interface ReadingV2ProjectedOptionSet {
  readonly optionSetId: string;
  readonly taskGroupId: string;
  readonly options: readonly ReadingV2OptionSet['options'][number][];
}

export interface ReadingV2ProjectionContent {
  readonly title: string;
  readonly materialId?: string;
  readonly sections: readonly {
    readonly sectionId: string;
    readonly title: string;
    readonly stimulusIds: readonly string[];
    readonly taskGroupIds: readonly string[];
  }[];
  readonly stimuli: readonly ReadingV2ProjectedStimulus[];
  readonly anchors: readonly ReadingV2ProjectedAnchor[];
  readonly taskGroups: readonly ReadingV2ProjectedTaskGroup[];
  readonly optionSets: readonly ReadingV2ProjectedOptionSet[];
}

export interface ReadingV2DerivedProjection extends ReadingV2ProjectionPayload {
  readonly projectionId: string;
  readonly sourceDocumentId: string;
  readonly materialId?: ReadingV2MaterialId;
  readonly content: ReadingV2ProjectionContent;
  readonly localOnlyAnswerState?: boolean;
  readonly runtimeContract?: 'teacher-preview' | 'student-runtime' | 'live-session' | 'review-shell' | 'analytics';
  readonly analytics?: {
    readonly taskGroupCount: number;
    readonly interactionCount: number;
    readonly familyCounts: Readonly<Record<string, number>>;
  };
}

const copy = <T>(value: T): T => structuredClone(value) as T;

const createProjectedTableCellContent = (
  cell: ReadingV2TableCellContent,
): ReadingV2TableCellContent => ({
  ...(cell.cellId !== undefined ? { cellId: cell.cellId } : {}),
  ...(cell.anchorId !== undefined ? { anchorId: cell.anchorId } : {}),
  ...(cell.anchorIds !== undefined ? { anchorIds: [...cell.anchorIds] } : {}),
  text: cell.text,
  ...(cell.role !== undefined ? { role: cell.role } : {}),
  ...(cell.isBlank !== undefined ? { isBlank: cell.isBlank } : {}),
  ...(cell.rowSpan !== undefined ? { rowSpan: cell.rowSpan } : {}),
  ...(cell.colSpan !== undefined ? { colSpan: cell.colSpan } : {}),
});

const createProjectedStimulusContent = (
  content: ReadingV2StimulusContent,
): ReadingV2StimulusContent => {
  if (content.kind === 'table-content') {
    return {
      kind: 'table-content',
      rows: content.rows.map((row) => row.map(createProjectedTableCellContent)),
    };
  }

  return copy(content);
};

const orderedTaskGroups = (document: ReadingV2Document): ReadingV2TaskGroup[] =>
  document.sectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return section
      ? section.taskGroupIds
          .map((taskGroupId) => document.taskGroups[taskGroupId])
          .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
      : [];
  });

const createProjectionContent = (
  document: ReadingV2Document,
  materialId?: ReadingV2MaterialId,
): ReadingV2ProjectionContent => {
  const groups = orderedTaskGroups(document);
  const derivedNumbers = new Map(
    deriveReadingV2VisibleNumbers(groups, document.interactions).map((entry) => [
      entry.interactionId,
      entry.displayNumber,
    ]),
  );

  return {
    title: document.title,
    materialId,
    sections: document.sectionIds.map((sectionId) => {
      const section = document.sections[sectionId];
      if (!section) {
        throw new Error(`Cannot project missing Reading V2 section ${sectionId}.`);
      }

      return {
        sectionId,
        title: section.title,
        stimulusIds: [...section.stimulusIds],
        taskGroupIds: [...section.taskGroupIds],
      };
    }),
    stimuli: Object.values(document.stimuli).map((stimulus) => ({
      stimulusId: stimulus.stimulusId,
      kind: stimulus.kind,
      title: stimulus.title,
      content: createProjectedStimulusContent(stimulus.content),
      anchorIds: [...stimulus.anchorIds],
    })),
    anchors: Object.values(document.anchors).map((anchor) => ({
      anchorId: anchor.anchorId,
      stimulusId: anchor.stimulusId,
      kind: anchor.kind,
      label: anchor.label,
    })),
    taskGroups: groups.map((taskGroup) => ({
      taskGroupId: taskGroup.taskGroupId,
      officialTaskType: taskGroup.officialTaskType,
      engineeringFamily: taskGroup.engineeringFamily,
      groupTitle: taskGroup.groupTitle,
      layoutHint: taskGroup.layoutHint,
      wordLimit: taskGroup.answerRule.wordLimit,
      instructionBlocks: taskGroup.instructionBlocks.map((block) => ({
        id: block.id,
        text: block.text,
      })),
      stimulusRefs: taskGroup.stimulusRefs.map((stimulusRef) => ({
        stimulusId: stimulusRef.stimulusId,
        anchorIds: stimulusRef.anchorIds ? [...stimulusRef.anchorIds] : undefined,
      })),
      interactions: taskGroup.interactionIds.map((interactionId) => {
        const interaction = document.interactions[interactionId];
        if (!interaction) {
          throw new Error(`Cannot project missing Reading V2 interaction ${interactionId}.`);
        }

        return {
          interactionId: interaction.interactionId,
          taskGroupId: interaction.taskGroupId,
          displayNumber: derivedNumbers.get(interaction.interactionId) ?? 0,
          responseShape: copy(interaction.responseShape),
          promptText: interaction.promptText,
          primaryAnchorId: interaction.primaryAnchorId,
          contextAnchorIds: interaction.contextAnchorIds ? [...interaction.contextAnchorIds] : undefined,
        };
      }),
    })),
    optionSets: Object.values(document.optionSets).map((optionSet) => ({
      optionSetId: optionSet.optionSetId,
      taskGroupId: optionSet.taskGroupId,
      options: optionSet.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        text: option.text,
      })),
    })),
  };
};

const createProjectionBase = (
  projectionKind: ReadingV2ProjectionKind,
  ownerId: string,
  sourceSnapshotVersionId: ReadingV2SnapshotVersionId,
  generatedAt: string,
): Omit<ReadingV2DerivedProjection, 'projectionId' | 'sourceDocumentId' | 'content'> => ({
  deliveryEngine: READING_V2_ENGINE,
  plane: 'projection',
  schemaVersion: READING_V2_SCHEMA_VERSION,
  ownerId,
  projectionKind,
  sourceSnapshotVersionId,
  generatedAt,
});

const familyCounts = (
  taskGroups: readonly ReadingV2ProjectedTaskGroup[],
): Readonly<Record<string, number>> =>
  taskGroups.reduce<Record<string, number>>((counts, taskGroup) => {
    counts[taskGroup.engineeringFamily] = (counts[taskGroup.engineeringFamily] ?? 0) + 1;
    return counts;
  }, {});

export const generateReadingV2PreviewProjection = (input: {
  readonly draftId: string;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly generatedAt?: string;
}): ReadingV2DerivedProjection => {
  assertValidReadingV2CanonicalDocument(input.document);

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sourceSnapshotVersionId = `preview-${input.draftId}` as ReadingV2SnapshotVersionId;

  return {
    ...createProjectionBase('preview', input.ownerId, sourceSnapshotVersionId, generatedAt),
    projectionId: `preview:${input.draftId}`,
    sourceDocumentId: input.document.documentId,
    content: createProjectionContent(input.document),
    localOnlyAnswerState: true,
    runtimeContract: 'teacher-preview',
  };
};

export const generateReadingV2StudentSafeProjection = (
  snapshot: ReadingV2PublishedSnapshot,
  generatedAt = new Date().toISOString(),
): ReadingV2DerivedProjection => {
  assertReadingV2PublishGate(snapshot.document);

  return {
    ...createProjectionBase('student-safe', snapshot.ownerId, snapshot.snapshotVersionId, generatedAt),
    projectionId: `student-safe:${snapshot.materialId}:${snapshot.snapshotVersionId}`,
    sourceDocumentId: snapshot.document.documentId,
    materialId: snapshot.materialId,
    content: createProjectionContent(snapshot.document, snapshot.materialId),
    runtimeContract: 'student-runtime',
  };
};

export const generateReadingV2SessionSafeProjection = (input: {
  readonly sessionCode: string;
  readonly studentSafeProjection: ReadingV2DerivedProjection;
  readonly generatedAt?: string;
}): ReadingV2DerivedProjection => ({
  ...input.studentSafeProjection,
  content: copy(input.studentSafeProjection.content),
  projectionKind: 'session-safe',
  generatedAt: input.generatedAt ?? new Date().toISOString(),
  projectionId: `session-safe:${input.sessionCode}:${input.studentSafeProjection.sourceSnapshotVersionId}`,
  runtimeContract: 'live-session',
});

export const generateReadingV2ReviewProjection = (
  snapshot: ReadingV2PublishedSnapshot,
  generatedAt = new Date().toISOString(),
): ReadingV2DerivedProjection => ({
  ...createProjectionBase('review', snapshot.ownerId, snapshot.snapshotVersionId, generatedAt),
  projectionId: `review:${snapshot.materialId}:${snapshot.snapshotVersionId}`,
  sourceDocumentId: snapshot.document.documentId,
  materialId: snapshot.materialId,
  content: createProjectionContent(snapshot.document, snapshot.materialId),
  runtimeContract: 'review-shell',
});

export const generateReadingV2AnalyticsProjection = (
  snapshot: ReadingV2PublishedSnapshot,
  generatedAt = new Date().toISOString(),
): ReadingV2DerivedProjection => {
  const content = createProjectionContent(snapshot.document, snapshot.materialId);
  const interactionCount = content.taskGroups.reduce(
    (total, taskGroup) => total + taskGroup.interactions.length,
    0,
  );

  return {
    ...createProjectionBase('analytics', snapshot.ownerId, snapshot.snapshotVersionId, generatedAt),
    projectionId: `analytics:${snapshot.materialId}:${snapshot.snapshotVersionId}`,
    sourceDocumentId: snapshot.document.documentId,
    materialId: snapshot.materialId,
    content,
    runtimeContract: 'analytics',
    analytics: {
      taskGroupCount: content.taskGroups.length,
      interactionCount,
      familyCounts: familyCounts(content.taskGroups),
    },
  };
};

export const assertReadingV2ProjectionIsStudentSanitized = (
  projection: ReadingV2DerivedProjection,
): void => {
  const serialized = JSON.stringify(projection);
  const forbiddenTokens = [
    'acceptableAnswers',
    'scoringRule',
    'answerKeys',
    'answerKeyText',
    'authorDiagnostics',
    'importEvidence',
    'importEvidenceRefs',
    'parsedAnswerValues',
    'rawAnswerText',
    'teacherAnswerKey',
    'hiddenProvenance',
    'teacherOnlyReview',
    'splitSourceCells',
  ];
  const leakedToken = forbiddenTokens.find((token) => serialized.includes(token));

  if (leakedToken) {
    throw new Error(`Reading V2 projection leaks forbidden student/session field: ${leakedToken}`);
  }
};
