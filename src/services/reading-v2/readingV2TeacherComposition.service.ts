import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { buildMaterialCatalogIndexWrites } from '../materialCatalog/materialCatalogIndexes.service';
import { materialCatalogIds, type MaterialTestTypeId } from '../../types/materialCatalog.types';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2MaterialId,
  type ReadingV2OptionSet,
  type ReadingV2PassageParagraph,
  type ReadingV2PassageRef,
  type ReadingV2PublishedSnapshot,
  type ReadingV2ResponseShape,
  type ReadingV2StimulusContent,
  type ReadingV2StimulusNode,
  type ReadingV2TableCellContent,
  type ReadingV2TableSplitSourceCellContent,
  type ReadingV2TaskGroup,
} from '../../types/readingV2.types';
import { createReadingV2FullTestCompositionFromRefs } from './readingV2FullTestComposition.service';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { buildReadingV2FirebasePublishUpdates } from './readingV2FirebasePublishAdapter.service';
import { publishReadingV2Material } from './readingV2PublishPipeline.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2TeacherCompositionRepository {
  readonly read?: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly update?: (updates: Readonly<Record<string, unknown>>) => Promise<void>;
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
  readonly composition: ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition>;
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

const clone = <T>(value: T): T => structuredClone(value) as T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === 'string' ? record[key] : undefined;

const normalizeFirebaseDocumentRoundTrip = (document: ReadingV2Document): ReadingV2Document => ({
  ...document,
  sectionIds: Array.isArray(document.sectionIds) ? document.sectionIds : [],
  sections: Object.fromEntries(
    Object.entries(document.sections ?? {}).map(([sectionId, section]) => [
      sectionId,
      {
        ...section,
        stimulusIds: Array.isArray(section.stimulusIds) ? section.stimulusIds : [],
        taskGroupIds: Array.isArray(section.taskGroupIds) ? section.taskGroupIds : [],
      },
    ]),
  ),
  stimuli: Object.fromEntries(
    Object.entries(document.stimuli ?? {}).map(([stimulusId, stimulus]) => [
      stimulusId,
      {
        ...stimulus,
        anchorIds: Array.isArray(stimulus.anchorIds) ? stimulus.anchorIds : [],
      },
    ]),
  ),
  anchors: document.anchors ?? {},
  taskGroups: Object.fromEntries(
    Object.entries(document.taskGroups ?? {}).map(([taskGroupId, taskGroup]) => [
      taskGroupId,
      {
        ...taskGroup,
        instructionBlocks: Array.isArray(taskGroup.instructionBlocks) ? taskGroup.instructionBlocks : [],
        stimulusRefs: Array.isArray(taskGroup.stimulusRefs) ? taskGroup.stimulusRefs : [],
        optionSetRefs: Array.isArray(taskGroup.optionSetRefs) ? taskGroup.optionSetRefs : [],
        interactionIds: Array.isArray(taskGroup.interactionIds) ? taskGroup.interactionIds : [],
        validationState: {
          ...taskGroup.validationState,
          issues: Array.isArray(taskGroup.validationState?.issues) ? taskGroup.validationState.issues : [],
        },
      },
    ]),
  ),
  interactions: document.interactions ?? {},
  optionSets: document.optionSets ?? {},
  validationState: {
    ...document.validationState,
    issues: Array.isArray(document.validationState?.issues) ? document.validationState.issues : [],
  },
});

const omitUndefinedForFirebase = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : omitUndefinedForFirebase(entry)));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefinedForFirebase(entry)]),
    );
  }

  return value;
};

const sanitizeFirebaseUpdates = (
  updates: Readonly<Record<string, unknown>>,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(updates).map(([path, value]) => [path, omitUndefinedForFirebase(value)]),
);

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

const prefixString = (prefix: string, value: string): string => `${prefix}:${value}`;

const prefixSectionId = (prefix: string, value: string) =>
  readingV2Ids.sectionId(prefixString(prefix, value));

const prefixStimulusId = (prefix: string, value: string) =>
  readingV2Ids.stimulusId(prefixString(prefix, value));

const prefixTaskGroupId = (prefix: string, value: string) =>
  readingV2Ids.taskGroupId(prefixString(prefix, value));

const prefixInteractionId = (prefix: string, value: string) =>
  readingV2Ids.interactionId(prefixString(prefix, value));

const prefixAnchorId = (prefix: string, value: string) =>
  readingV2Ids.anchorId(prefixString(prefix, value));

const prefixOptionSetId = (prefix: string, value: string) =>
  readingV2Ids.optionSetId(prefixString(prefix, value));

const prefixImportEvidenceId = (prefix: string, value: string) =>
  readingV2Ids.importEvidenceId(prefixString(prefix, value));

const prefixResponseShape = (
  prefix: string,
  responseShape: ReadingV2ResponseShape,
): ReadingV2ResponseShape => {
  if (responseShape.kind === 'single-choice') {
    return {
      ...responseShape,
      optionSetId: prefixOptionSetId(prefix, responseShape.optionSetId),
    };
  }

  if (responseShape.kind === 'multi-select') {
    return {
      ...responseShape,
      optionSetId: prefixOptionSetId(prefix, responseShape.optionSetId),
    };
  }

  if (responseShape.kind === 'matching') {
    return {
      ...responseShape,
      optionSetId: prefixOptionSetId(prefix, responseShape.optionSetId),
    };
  }

  return clone(responseShape);
};

const getResponseShapeOptionSetId = (responseShape: ReadingV2ResponseShape): string | undefined => {
  if (
    responseShape.kind === 'single-choice' ||
    responseShape.kind === 'multi-select' ||
    responseShape.kind === 'matching'
  ) {
    return responseShape.optionSetId;
  }

  return undefined;
};

const prefixScoringRule = (
  prefix: string,
  interaction: ReadingV2Interaction,
  optionSets: ReadingV2Document['optionSets'],
): ReadingV2Interaction['scoringRule'] => {
  const scoringRule = clone(interaction.scoringRule);
  const acceptableAnswers = scoringRule.acceptableAnswers;
  const optionSetId = getResponseShapeOptionSetId(interaction.responseShape);
  const optionSet = optionSetId ? optionSets[optionSetId] : undefined;

  if (!acceptableAnswers || !optionSet) {
    return scoringRule;
  }

  const optionIds = new Set(optionSet.options.map((option) => option.optionId));
  return {
    ...scoringRule,
    acceptableAnswers: acceptableAnswers.map((answer) =>
      optionIds.has(answer) ? prefixString(prefix, answer) : answer,
    ),
  };
};

const prefixPassageParagraph = (
  prefix: string,
  paragraph: ReadingV2PassageParagraph,
): ReadingV2PassageParagraph => ({
  ...paragraph,
  ...(paragraph.anchorId ? { anchorId: prefixAnchorId(prefix, paragraph.anchorId) } : {}),
  ...(paragraph.itemId ? { itemId: prefixString(prefix, paragraph.itemId) } : {}),
});

const prefixTableSplitSourceCell = (
  prefix: string,
  cell: ReadingV2TableSplitSourceCellContent,
): ReadingV2TableSplitSourceCellContent => ({
  ...cell,
  ...(cell.anchorId ? { anchorId: prefixAnchorId(prefix, cell.anchorId) } : {}),
  ...(cell.anchorIds ? { anchorIds: cell.anchorIds.map((anchorId) => prefixAnchorId(prefix, anchorId)) } : {}),
});

const prefixTableCell = (
  prefix: string,
  cell: ReadingV2TableCellContent,
): ReadingV2TableCellContent => ({
  ...cell,
  ...(cell.cellId ? { cellId: prefixString(prefix, cell.cellId) } : {}),
  ...(cell.anchorId ? { anchorId: prefixAnchorId(prefix, cell.anchorId) } : {}),
  ...(cell.anchorIds ? { anchorIds: cell.anchorIds.map((anchorId) => prefixAnchorId(prefix, anchorId)) } : {}),
  ...(cell.splitSourceCells
    ? { splitSourceCells: cell.splitSourceCells.map((sourceCell) => prefixTableSplitSourceCell(prefix, sourceCell)) }
    : {}),
});

const prefixStimulusContent = (
  prefix: string,
  content: ReadingV2StimulusContent,
): ReadingV2StimulusContent => {
  if (content.kind === 'passage-content') {
    return {
      kind: 'passage-content',
      paragraphs: content.paragraphs.map((paragraph) => prefixPassageParagraph(prefix, paragraph)),
    };
  }

  if (content.kind === 'table-content') {
    return {
      kind: 'table-content',
      rows: content.rows.map((row) => row.map((cell) => prefixTableCell(prefix, cell))),
    };
  }

  if (content.kind === 'flowchart-content') {
    return {
      kind: 'flowchart-content',
      steps: content.steps.map((step) => ({
        ...step,
        stepId: prefixString(prefix, step.stepId),
        ...(step.anchorId ? { anchorId: prefixAnchorId(prefix, step.anchorId) } : {}),
        ...(step.nextStepIds ? { nextStepIds: step.nextStepIds.map((stepId) => prefixString(prefix, stepId)) } : {}),
      })),
    };
  }

  if (content.kind === 'diagram-content') {
    return {
      ...content,
      hotspots: content.hotspots.map((hotspot) => ({
        ...hotspot,
        anchorId: prefixAnchorId(prefix, hotspot.anchorId),
      })),
    };
  }

  return clone(content);
};

const prefixSection = (prefix: string, section: ReadingV2Document['sections'][string]) => ({
  ...section,
  sectionId: prefixSectionId(prefix, section.sectionId),
  stimulusIds: section.stimulusIds.map((stimulusId) => prefixStimulusId(prefix, stimulusId)),
  taskGroupIds: section.taskGroupIds.map((taskGroupId) => prefixTaskGroupId(prefix, taskGroupId)),
});

const prefixStimulus = (prefix: string, stimulus: ReadingV2StimulusNode): ReadingV2StimulusNode => ({
  ...stimulus,
  stimulusId: prefixStimulusId(prefix, stimulus.stimulusId),
  content: prefixStimulusContent(prefix, stimulus.content),
  anchorIds: stimulus.anchorIds.map((anchorId) => prefixAnchorId(prefix, anchorId)),
});

const prefixAnchor = (prefix: string, anchor: ReadingV2Anchor): ReadingV2Anchor => ({
  ...anchor,
  anchorId: prefixAnchorId(prefix, anchor.anchorId),
  stimulusId: prefixStimulusId(prefix, anchor.stimulusId),
});

const prefixTaskGroup = (prefix: string, taskGroup: ReadingV2TaskGroup): ReadingV2TaskGroup => ({
  ...taskGroup,
  taskGroupId: prefixTaskGroupId(prefix, taskGroup.taskGroupId),
  sectionId: prefixSectionId(prefix, taskGroup.sectionId),
  instructionBlocks: taskGroup.instructionBlocks.map((block) => ({
    ...block,
    id: prefixString(prefix, block.id),
  })),
  answerRule: {
    ...taskGroup.answerRule,
    responseShape: prefixResponseShape(prefix, taskGroup.answerRule.responseShape),
  },
  stimulusRefs: taskGroup.stimulusRefs.map((stimulusRef) => ({
    ...stimulusRef,
    stimulusId: prefixStimulusId(prefix, stimulusRef.stimulusId),
    ...(stimulusRef.anchorIds
      ? { anchorIds: stimulusRef.anchorIds.map((anchorId) => prefixAnchorId(prefix, anchorId)) }
      : {}),
  })),
  optionSetRefs: taskGroup.optionSetRefs.map((optionSetId) => prefixOptionSetId(prefix, optionSetId)),
  interactionIds: taskGroup.interactionIds.map((interactionId) => prefixInteractionId(prefix, interactionId)),
  importEvidenceRefs: taskGroup.importEvidenceRefs?.map((evidenceId) => prefixImportEvidenceId(prefix, evidenceId)),
  validationState: clone(taskGroup.validationState),
});

const prefixInteraction = (
  prefix: string,
  interaction: ReadingV2Interaction,
  displayNumber: number | undefined,
  optionSets: ReadingV2Document['optionSets'],
): ReadingV2Interaction => ({
  ...interaction,
  interactionId: prefixInteractionId(prefix, interaction.interactionId),
  taskGroupId: prefixTaskGroupId(prefix, interaction.taskGroupId),
  responseShape: prefixResponseShape(prefix, interaction.responseShape),
  scoringRule: prefixScoringRule(prefix, interaction, optionSets),
  reviewLabel: {
    ...clone(interaction.reviewLabel),
    ...(displayNumber !== undefined ? { displayNumber } : {}),
  },
  ...(interaction.primaryAnchorId ? { primaryAnchorId: prefixAnchorId(prefix, interaction.primaryAnchorId) } : {}),
  ...(interaction.contextAnchorIds
    ? { contextAnchorIds: interaction.contextAnchorIds.map((anchorId) => prefixAnchorId(prefix, anchorId)) }
    : {}),
});

const prefixOptionSet = (prefix: string, optionSet: ReadingV2OptionSet): ReadingV2OptionSet => ({
  ...optionSet,
  optionSetId: prefixOptionSetId(prefix, optionSet.optionSetId),
  taskGroupId: prefixTaskGroupId(prefix, optionSet.taskGroupId),
  options: optionSet.options.map((option) => ({
    ...option,
    optionId: prefixString(prefix, option.optionId),
  })),
});

const assignDisplayNumbers = (
  document: ReadingV2Document,
  startAt: number,
): {
  readonly displayNumbers: ReadonlyMap<string, number>;
  readonly nextDisplayNumber: number;
} => {
  let nextDisplayNumber = startAt;
  const displayNumbers = new Map<string, number>();

  document.sectionIds.forEach((sectionId) => {
    const section = document.sections[sectionId];
    if (!section) {
      throw new Error(`Selected Reading Passage snapshot is missing section ${sectionId}.`);
    }

    section.taskGroupIds.forEach((taskGroupId) => {
      const taskGroup = document.taskGroups[taskGroupId];
      if (!taskGroup) {
        throw new Error(`Selected Reading Passage snapshot is missing task group ${taskGroupId}.`);
      }

      taskGroup.interactionIds.forEach((interactionId) => {
        const interaction = document.interactions[interactionId];
        if (!interaction) {
          throw new Error(`Selected Reading Passage snapshot is missing interaction ${interactionId}.`);
        }

        if (interaction.placeholder === true) {
          return;
        }

        displayNumbers.set(interactionId, nextDisplayNumber);
        nextDisplayNumber += 1;
      });
    });
  });

  return { displayNumbers, nextDisplayNumber };
};

const appendPrefixedSnapshotDocument = (
  target: {
    readonly sectionIds: ReadingV2Document['sectionIds'][number][];
    readonly sections: Record<string, ReadingV2Document['sections'][string]>;
    readonly stimuli: Record<string, ReadingV2StimulusNode>;
    readonly anchors: Record<string, ReadingV2Anchor>;
    readonly taskGroups: Record<string, ReadingV2TaskGroup>;
    readonly interactions: Record<string, ReadingV2Interaction>;
    readonly optionSets: Record<string, ReadingV2OptionSet>;
  },
  snapshot: ReadingV2PublishedSnapshot,
  prefix: string,
  startDisplayNumber: number,
): number => {
  const { displayNumbers, nextDisplayNumber } = assignDisplayNumbers(snapshot.document, startDisplayNumber);

  snapshot.document.sectionIds.forEach((sectionId) => {
    target.sectionIds.push(prefixSectionId(prefix, sectionId));
  });

  Object.values(snapshot.document.sections).forEach((section) => {
    const prefixed = prefixSection(prefix, section);
    target.sections[prefixed.sectionId] = prefixed;
  });

  Object.values(snapshot.document.stimuli).forEach((stimulus) => {
    const prefixed = prefixStimulus(prefix, stimulus);
    target.stimuli[prefixed.stimulusId] = prefixed;
  });

  Object.values(snapshot.document.anchors).forEach((anchor) => {
    const prefixed = prefixAnchor(prefix, anchor);
    target.anchors[prefixed.anchorId] = prefixed;
  });

  Object.values(snapshot.document.taskGroups).forEach((taskGroup) => {
    const prefixed = prefixTaskGroup(prefix, taskGroup);
    target.taskGroups[prefixed.taskGroupId] = prefixed;
  });

  Object.values(snapshot.document.interactions).forEach((interaction) => {
    const prefixed = prefixInteraction(
      prefix,
      interaction,
      displayNumbers.get(interaction.interactionId),
      snapshot.document.optionSets,
    );
    target.interactions[prefixed.interactionId] = prefixed;
  });

  Object.values(snapshot.document.optionSets).forEach((optionSet) => {
    const prefixed = prefixOptionSet(prefix, optionSet);
    target.optionSets[prefixed.optionSetId] = prefixed;
  });

  return nextDisplayNumber;
};

const toPublishedSnapshot = (value: unknown): ReadingV2PublishedSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const snapshotVersionId = getString(value, 'snapshotVersionId');
  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const publishedAt = getString(value, 'publishedAt');
  const publishedBy = getString(value, 'publishedBy');

  if (!snapshotVersionId || !materialId || !ownerId || !publishedAt || !publishedBy || !isRecord(value.document)) {
    return null;
  }

  const rawSnapshot = clone(value as unknown as ReadingV2PublishedSnapshot);
  const snapshot: ReadingV2PublishedSnapshot = {
    ...rawSnapshot,
    document: normalizeFirebaseDocumentRoundTrip(rawSnapshot.document),
  };
  assertValidReadingV2CanonicalDocument(snapshot.document);
  return snapshot;
};

const readSelectedPassageSnapshots = async (
  repository: ReadingV2TeacherCompositionRepository,
  passageRefs: readonly ReadingV2PassageRef[],
): Promise<ReadingV2PublishedSnapshot[]> => {
  const read = repository.read;
  if (!read) {
    throw new Error('Reading Passage full-test creation requires published snapshot reads.');
  }

  return Promise.all(passageRefs.map(async (passageRef) => {
    const snapshotPath = readingV2StoragePaths.publishedSnapshots(
      passageRef.passageMaterialId,
      passageRef.snapshotVersionId,
    );
    const snapshot = toPublishedSnapshot(await read(snapshotPath));

    if (!snapshot) {
      throw new Error(`Selected Reading Passage ${passageRef.passageMaterialId} published snapshot was not found.`);
    }

    return snapshot;
  }));
};

const buildReadingV2TeacherSelectedPassageDocument = (input: {
  readonly composition: ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition>;
  readonly snapshots: readonly ReadingV2PublishedSnapshot[];
}): ReadingV2Document => {
  let nextDisplayNumber = 1;
  const sectionIds: ReadingV2Document['sectionIds'][number][] = [];
  const target = {
    sectionIds,
    sections: {} as Record<string, ReadingV2Document['sections'][string]>,
    stimuli: {} as Record<string, ReadingV2StimulusNode>,
    anchors: {} as Record<string, ReadingV2Anchor>,
    taskGroups: {} as Record<string, ReadingV2TaskGroup>,
    interactions: {} as Record<string, ReadingV2Interaction>,
    optionSets: {} as Record<string, ReadingV2OptionSet>,
  };

  input.snapshots.forEach((snapshot, index) => {
    nextDisplayNumber = appendPrefixedSnapshotDocument(
      target,
      snapshot,
      `passage-${index + 1}`,
      nextDisplayNumber,
    );
  });

  const document: ReadingV2Document = {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId: readingV2Ids.documentId(
      `${input.composition.testMaterialId}-${input.composition.publishedVersionId}`,
    ),
    title: input.composition.title,
    sectionIds,
    sections: target.sections,
    stimuli: target.stimuli,
    anchors: target.anchors,
    taskGroups: target.taskGroups,
    interactions: target.interactions,
    optionSets: target.optionSets,
    validationState: { issues: [] },
  };

  assertValidReadingV2CanonicalDocument(document);
  return document;
};

const buildMaterialCatalogUpdates = (input: {
  readonly composition: ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition>;
  readonly updatedAt: string;
}): Record<string, unknown> => Object.fromEntries(
  buildMaterialCatalogIndexWrites({
    materialId: input.composition.testMaterialId,
    ownerId: input.composition.ownerId,
    title: input.composition.title,
    visibility: input.composition.visibility === 'public' ? 'library-eligible' : 'private',
    materialKind: 'full-test',
    testTypeIds: input.composition.testTypeIds,
    updatedAt: input.updatedAt,
  }).map((write) => [write.path, write.value]),
);

const writeUpdates = async (
  repository: ReadingV2TeacherCompositionRepository,
  updates: Readonly<Record<string, unknown>>,
): Promise<void> => {
  const sanitized = sanitizeFirebaseUpdates(updates);

  if (repository.update) {
    await repository.update(sanitized);
    return;
  }

  await Promise.all(
    Object.entries(sanitized).map(([path, value]) => repository.write(path, value)),
  );
};

export const buildReadingV2TeacherSelectedPassageComposition = (input: {
  readonly teacherId: string;
  readonly passages: readonly ReadingV2TeacherCompositionPassageInput[];
  readonly now?: string;
}) => {
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
    `teacher-selected-${sanitizeIdPart(input.teacherId)}-${sanitizeIdPart(firstPassageId)}-${sanitizeIdPart(snapshotSeed)}-${sanitizeIdPart(createdAt)}`,
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
  const snapshots = await readSelectedPassageSnapshots(input.repository, composition.passageRefs);
  const document = buildReadingV2TeacherSelectedPassageDocument({ composition, snapshots });
  const publishResult = publishReadingV2Material({
    repository: createReadingV2Repository(),
    materialId: composition.testMaterialId,
    ownerId: input.teacherId,
    document,
    publishedBy: input.teacherId,
    snapshotVersionId: composition.publishedVersionId,
    publishedAt: composition.createdAt,
    skipReadingPassageExtraction: true,
    metadata: {
      title: composition.title,
      materialKind: 'full-test',
      durationMinutes: composition.durationMinutes,
      visibility: composition.visibility === 'public' ? 'library-eligible' : 'private',
      primaryTestTypeId: composition.primaryTestTypeId,
      testTypeIds: composition.testTypeIds,
      description: 'Created from selected Reading Passages.',
      tags: ['reading-passage-selection'],
    },
  });
  const firebaseUpdates = buildReadingV2FirebasePublishUpdates(
    publishResult.commitPlan,
    composition.createdAt,
  );
  const versionValue = {
    ...composition,
    publishedAt: composition.createdAt,
    publishedBy: input.teacherId,
  };

  await writeUpdates(input.repository, {
    ...firebaseUpdates.updates,
    ...buildMaterialCatalogUpdates({
      composition,
      updatedAt: composition.createdAt,
    }),
    [paths.composition]: composition,
    [paths.version]: versionValue,
  });

  return { composition, paths };
};
