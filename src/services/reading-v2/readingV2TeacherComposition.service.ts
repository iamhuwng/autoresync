import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  buildMaterialCatalogIndexWrites,
  listMaterialCatalogIndexPaths,
} from '../materialCatalog/materialCatalogIndexes.service';
import { materialCatalogIds, type MaterialTestTypeId } from '../../types/materialCatalog.types';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
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
import {
  type ReadingV2AuditActorRole,
  buildReadingV2AuditEvent,
  getReadingV2AuditEventPath,
} from './readingV2AuditTrail.service';

export interface ReadingV2TeacherCompositionRepository {
  readonly read?: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly update?: (updates: Readonly<Record<string, unknown>>) => Promise<void>;
}

export interface ReadingV2MasterRemoveRepository {
  readonly write: (path: string, value: unknown) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
}

export interface ReadingV2TeacherCompositionPassageInput {
  readonly id?: string;
  readonly materialId?: string;
  readonly ownerId?: string;
  readonly title?: string;
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly publishedSnapshotVersionId?: string;
  readonly currentVersionId?: string;
  readonly sourceOrderDisplay?: string;
  readonly sourceQuestionRange?: string;
  readonly primaryTestTypeId?: string;
  readonly testTypeIds?: readonly string[];
  readonly testTypes?: readonly {
    readonly testTypeId?: string;
  }[];
  readonly visibility?: string;
  readonly state?: string;
  readonly archivedAt?: string | null;
  readonly archived?: boolean;
  readonly accessible?: boolean;
  readonly selectable?: boolean;
}

export interface CreateReadingV2TeacherCompositionResult {
  readonly composition: ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition>;
  readonly paths: {
    readonly composition: string;
    readonly version: string;
  };
}

export interface PublishReadingV2TeacherCompositionEditResult {
  readonly composition: ReadingV2FullTestComposition;
  readonly paths: {
    readonly composition: string;
    readonly version: string;
  };
}

type ReadingV2TeacherSelectedPassageDraftComposition =
  ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition> & {
    readonly mode: 'draft';
    readonly state: 'draft';
    readonly updatedAt: string;
  };

export interface CreateReadingV2TeacherCompositionDraftResult {
  readonly draft: ReadingV2TeacherSelectedPassageDraftComposition;
  readonly composition: ReadingV2TeacherSelectedPassageDraftComposition;
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

const isTeacherCompositionDiagnosticsEnabled = (): boolean =>
  Boolean(import.meta.env.DEV) && !Boolean(import.meta.env.VITEST);

const getStringArray = (record: Record<string, unknown>, key: string): string[] | undefined =>
  Array.isArray(record[key])
    ? record[key].filter((entry): entry is string => typeof entry === 'string')
    : undefined;

const getPathFamily = (path: string): string => {
  if (path.startsWith('material_catalog/material_indexes/')) {
    const [, , bucket] = path.split('/');
    return `material_catalog/${bucket || 'unknown'}`;
  }

  if (path.startsWith('reading_v2/projections/')) {
    const [, , projectionKind] = path.split('/');
    return `reading_v2/projections/${projectionKind || 'unknown'}`;
  }

  if (path.startsWith('reading_v2/relationship_indexes/')) {
    return 'reading_v2/relationship_indexes';
  }

  if (path.startsWith('tests/')) {
    return 'tests';
  }

  return path.split('/').slice(0, 2).join('/') || path;
};

const summarizeDiagnosticValue = (path: string, value: unknown): Record<string, unknown> => {
  if (value === null) {
    return { path, valueType: 'null' };
  }

  if (!isRecord(value)) {
    return { path, valueType: typeof value };
  }

  if (path.startsWith('material_catalog/material_indexes/')) {
    const [, , bucket, bucketKey] = path.split('/');

    return {
      path,
      bucket,
      bucketKey,
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      visibility: getString(value, 'visibility'),
      materialKind: getString(value, 'materialKind'),
      sourceFullTestId: getString(value, 'sourceFullTestId'),
      testTypeIds: getStringArray(value, 'testTypeIds'),
    };
  }

  if (path.startsWith('reading_v2/material_metadata/')) {
    return {
      path,
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      compositionId: getString(value, 'compositionId'),
      visibility: getString(value, 'visibility'),
      materialKind: getString(value, 'materialKind'),
      state: getString(value, 'state'),
      publishedSnapshotVersionId: getString(value, 'publishedSnapshotVersionId'),
    };
  }

  if (path.startsWith('tests/')) {
    return {
      path,
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      compositionId: getString(value, 'compositionId'),
      deliveryEngine: getString(value, 'deliveryEngine'),
      materialKind: getString(value, 'materialKind'),
      publishedSnapshotVersionId: getString(value, 'publishedSnapshotVersionId'),
      isPublic: typeof value.isPublic === 'boolean' ? value.isPublic : undefined,
    };
  }

  if (path.startsWith('reading_v2/full_test_compositions/')) {
    return {
      path,
      compositionId: getString(value, 'compositionId'),
      ownerId: getString(value, 'ownerId'),
      testMaterialId: getString(value, 'testMaterialId'),
      visibility: getString(value, 'visibility'),
      state: getString(value, 'state'),
      mode: getString(value, 'mode'),
      publishedVersionId: getString(value, 'publishedVersionId'),
      passageRefCount: Array.isArray(value.passageRefs) ? value.passageRefs.length : undefined,
    };
  }

  if (path.startsWith('reading_v2/projections/')) {
    return {
      path,
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      projectionKind: getString(value, 'projectionKind'),
      sourceSnapshotVersionId: getString(value, 'sourceSnapshotVersionId'),
    };
  }

  if (path.startsWith('reading_v2/relationship_indexes/')) {
    return {
      path,
      surface: getString(value, 'surface'),
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      source: getString(value, 'source'),
      snapshotVersionId: getString(value, 'snapshotVersionId'),
    };
  }

  if (path.startsWith('reading_v2/publish_commits/')) {
    return {
      path,
      commitKey: getString(value, 'commitKey'),
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      snapshotVersionId: getString(value, 'snapshotVersionId'),
      writePathCount: Array.isArray(value.writePaths) ? value.writePaths.length : undefined,
      operationKeyCount: Array.isArray(value.operationKeys) ? value.operationKeys.length : undefined,
    };
  }

  if (path.startsWith('reading_v2/published_snapshots/')) {
    return {
      path,
      materialId: getString(value, 'materialId'),
      ownerId: getString(value, 'ownerId'),
      snapshotVersionId: getString(value, 'snapshotVersionId'),
      documentPresent: isRecord(value.document),
    };
  }

  return {
    path,
    keys: Object.keys(value).sort(),
  };
};

const buildTeacherCompositionWriteDiagnostics = (
  updates: Readonly<Record<string, unknown>>,
  error?: unknown,
): Record<string, unknown> => {
  const paths = Object.keys(updates).sort();
  const pathFamilyCounts = paths.reduce<Record<string, number>>((counts, path) => {
    const family = getPathFamily(path);
    counts[family] = (counts[family] ?? 0) + 1;
    return counts;
  }, {});
  const materialCatalogVisibilityRows = paths
    .filter((path) => path.startsWith('material_catalog/material_indexes/by_visibility/'))
    .map((path) => summarizeDiagnosticValue(path, updates[path]));

  return {
    pathCount: paths.length,
    pathFamilyCounts,
    paths,
    materialCatalogVisibilityRows,
    suspiciousPaths: paths.filter((path) =>
      path.startsWith('material_catalog/material_indexes/by_visibility/library-eligible/'),
    ),
    pathSummaries: paths.map((path) => summarizeDiagnosticValue(path, updates[path])),
    error: error instanceof Error
      ? { name: error.name, message: error.message }
      : undefined,
  };
};

const logTeacherCompositionWriteDiagnostics = (
  event: 'publish_update_prepare' | 'publish_update_failed',
  updates: Readonly<Record<string, unknown>>,
  error?: unknown,
): void => {
  if (!isTeacherCompositionDiagnosticsEnabled()) {
    return;
  }

  try {
    const payload = JSON.stringify(buildTeacherCompositionWriteDiagnostics(updates, error));
    const logMethod = event === 'publish_update_failed' ? console.error : console.info;
    logMethod(`[Diag][ReadingV2TeacherComposition] ${event}`, payload);
  } catch (logError) {
    console.warn('[Diag][ReadingV2TeacherComposition] publish_update_diagnostic_failed', logError);
  }
};

const getPassageMaterialId = (passage: ReadingV2TeacherCompositionPassageInput): string =>
  String(passage.materialId || passage.id || '').trim();

const getSnapshotVersionId = (passage: ReadingV2TeacherCompositionPassageInput): string =>
  String(passage.publishedSnapshotVersionId || passage.currentVersionId || '').trim();

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
  teacherId: string,
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
  const title = passage.title || `Reading Passage ${order}`;
  const sourceOrderDisplay = passage.sourceOrderDisplay || `Passage ${order}`;
  const testTypeIds = getTestTypeIds(passage);
  const primaryTestTypeId = testTypeIds[0];
  const visibility = passage.visibility === 'public' ? 'public' : 'private';

  return {
    refId: readingV2Ids.passageRefId(`selected-passage-${order}`),
    passageMaterialId: readingV2Ids.readingPassageMaterialId(passageMaterialId),
    materialId: readingV2Ids.readingPassageMaterialId(passageMaterialId),
    snapshotVersionId: readingV2Ids.snapshotVersionId(snapshotVersionId),
    order,
    sourcePassageNumber: order,
    sourceOrderLabelSnapshot: 'Passage',
    sourceOrderDisplaySnapshot: sourceOrderDisplay,
    titleSnapshot: title,
    title,
    source: {
      sourceOrderLabel: 'Passage',
      sourceOrderDisplay,
    },
    questionRangeSnapshot: passage.sourceQuestionRange,
    questionCountSnapshot: Number(passage.questionCount || 0),
    questionCount: Number(passage.questionCount || 0),
    durationSnapshot: passage.durationMinutes,
    ownerId: passage.ownerId || teacherId,
    visibility,
    currentVersionId: readingV2Ids.snapshotVersionId(snapshotVersionId),
    testType: {
      ...(primaryTestTypeId ? { primaryTestTypeId } : {}),
      testTypeIds,
    },
    testTypeIdsSnapshot: testTypeIds,
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

const remapLayoutQuestionNumbers = (
  value: unknown,
  questionNumberMap: ReadonlyMap<number, number>,
): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => remapLayoutQuestionNumbers(entry, questionNumberMap));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === 'questionNumber' && typeof entry === 'number') {
        return [key, questionNumberMap.get(entry) ?? entry];
      }

      if (key === 'questionNumbers' && Array.isArray(entry)) {
        return [
          key,
          entry.map((questionNumber) =>
            typeof questionNumber === 'number'
              ? questionNumberMap.get(questionNumber) ?? questionNumber
              : questionNumber,
          ),
        ];
      }

      return [key, remapLayoutQuestionNumbers(entry, questionNumberMap)];
    }),
  );
};

const remapLayoutHintQuestionNumbers = (
  layoutHint: string | undefined,
  questionNumberMap: ReadonlyMap<number, number>,
): string | undefined => {
  if (!layoutHint || questionNumberMap.size === 0) {
    return layoutHint;
  }

  try {
    return JSON.stringify(remapLayoutQuestionNumbers(JSON.parse(layoutHint), questionNumberMap));
  } catch {
    return layoutHint;
  }
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

const prefixTaskGroup = (
  prefix: string,
  taskGroup: ReadingV2TaskGroup,
  questionNumberMap: ReadonlyMap<number, number>,
): ReadingV2TaskGroup => ({
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
  layoutHint: remapLayoutHintQuestionNumbers(taskGroup.layoutHint, questionNumberMap),
  validationState: { issues: [] },
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
    const questionNumberMap = new Map<number, number>();

    taskGroup.interactionIds.forEach((interactionId) => {
      const sourceDisplayNumber = snapshot.document.interactions[interactionId]?.reviewLabel.displayNumber;
      const nextDisplayNumber = displayNumbers.get(interactionId);

      if (
        typeof sourceDisplayNumber === 'number' &&
        Number.isFinite(sourceDisplayNumber) &&
        typeof nextDisplayNumber === 'number' &&
        Number.isFinite(nextDisplayNumber)
      ) {
        questionNumberMap.set(sourceDisplayNumber, nextDisplayNumber);
      }
    });

    const prefixed = prefixTaskGroup(prefix, taskGroup, questionNumberMap);
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
    visibility: input.composition.visibility === 'public' ? 'public' : 'private',
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
  logTeacherCompositionWriteDiagnostics('publish_update_prepare', sanitized);

  if (repository.update) {
    try {
      await repository.update(sanitized);
    } catch (error) {
      logTeacherCompositionWriteDiagnostics('publish_update_failed', sanitized, error);
      throw error;
    }
    return;
  }

  try {
    await Promise.all(
      Object.entries(sanitized).map(([path, value]) => repository.write(path, value)),
    );
  } catch (error) {
    logTeacherCompositionWriteDiagnostics('publish_update_failed', sanitized, error);
    throw error;
  }
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
  const passageRefs = buildPassageRefs(input.teacherId, input.passages);
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

const assertPublishedUnarchivedSelectablePassages = (
  passages: readonly ReadingV2TeacherCompositionPassageInput[],
): void => {
  passages.forEach((passage, index) => {
    const state = String(passage.state || '').trim().toLowerCase();
    const hasArchivedMarker = Boolean(passage.archivedAt) || passage.archived === true || state === 'archived';
    const isPublished = !state || state === 'published';
    const isSelectable = passage.accessible !== false && passage.selectable !== false;

    if (!isPublished || hasArchivedMarker || !isSelectable) {
      throw new Error(`Selected Reading Passage ${index + 1} must be published, unarchived, and accessible.`);
    }
  });
};

export const createReadingV2TeacherSelectedPassageDraft = async (input: {
  readonly teacherId: string;
  readonly passages: readonly ReadingV2TeacherCompositionPassageInput[];
  readonly repository: ReadingV2TeacherCompositionRepository;
  readonly now?: string;
  readonly metadata?: {
    readonly title?: string;
    readonly durationMinutes?: number;
    readonly visibility?: 'private' | 'public' | string;
  };
}): Promise<CreateReadingV2TeacherCompositionDraftResult> => {
  assertPublishedUnarchivedSelectablePassages(input.passages);

  const composition = buildReadingV2TeacherSelectedPassageComposition(input);
  const title = String(input.metadata?.title || composition.title).trim() || composition.title;
  const visibility = input.metadata?.visibility === 'public' ? 'public' : composition.visibility;
  const draft = {
    ...composition,
    title,
    durationMinutes: Number(input.metadata?.durationMinutes || composition.durationMinutes || 0) || undefined,
    visibility,
    mode: 'draft' as const,
    state: 'draft' as const,
    updatedAt: composition.createdAt,
  };
  const paths = {
    composition: readingV2StoragePaths.fullTestCompositions(draft.compositionId),
    version: readingV2StoragePaths.fullTestCompositionVersions(
      draft.compositionId,
      draft.publishedVersionId,
    ),
  };

  await writeUpdates(input.repository, {
    [paths.composition]: draft,
    [paths.version]: {
      ...draft,
      draftCreatedAt: draft.createdAt,
      draftCreatedBy: input.teacherId,
    },
  });

  return { draft, composition: draft, paths };
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
      compositionId: composition.compositionId,
      materialKind: 'full-test',
      durationMinutes: composition.durationMinutes,
      visibility: composition.visibility === 'public' ? 'public' : 'private',
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

export const publishReadingV2TeacherSelectedPassageCompositionEdit = async (input: {
  readonly teacherId: string;
  readonly composition: ReadingV2FullTestComposition;
  readonly passages: readonly ReadingV2TeacherCompositionPassageInput[];
  readonly repository: ReadingV2TeacherCompositionRepository;
  readonly now?: string;
  readonly metadata?: {
    readonly title?: string;
    readonly durationMinutes?: number;
    readonly visibility?: 'private' | 'public' | string;
  };
}): Promise<PublishReadingV2TeacherCompositionEditResult> => {
  if (input.composition.ownerId !== input.teacherId) {
    throw new Error('Only the owner teacher can publish this Reading V2 master edit.');
  }

  assertPublishedUnarchivedSelectablePassages(input.passages);

  const publishedAt = input.now ?? nowIso();
  const passageRefs = buildPassageRefs(input.teacherId, input.passages);
  const title = String(input.metadata?.title || input.composition.title || 'Selected Reading Passages').trim() ||
    'Selected Reading Passages';
  const visibility = input.metadata?.visibility === 'public' ? 'public' : 'private';
  const publishedVersionId = readingV2Ids.snapshotVersionId(
    `edit-${sanitizeIdPart(input.composition.compositionId)}-${sanitizeIdPart(publishedAt)}`,
  );
  const baseComposition = createReadingV2FullTestCompositionFromRefs({
    compositionId: input.composition.compositionId,
    testMaterialId: input.composition.testMaterialId,
    title,
    ownerId: input.teacherId,
    publishedVersionId,
    primaryTestTypeId: getPrimaryTestTypeId(input.passages) ?? input.composition.primaryTestTypeId,
    testTypeIds: unique([
      ...(input.composition.testTypeIds ?? []),
      ...passageRefs.flatMap((ref) => ref.testTypeIdsSnapshot),
    ]),
    skill: input.composition.skill,
    passageRefs,
    durationMinutes: Number(input.metadata?.durationMinutes || 0) ||
      passageRefs.reduce((total, ref) => total + Number(ref.durationSnapshot || 0), 0) ||
      input.composition.durationMinutes,
    visibility,
    createdAt: input.composition.createdAt || publishedAt,
  });
  const composition: ReadingV2FullTestComposition = {
    ...baseComposition,
    mode: 'published',
    updatedAt: publishedAt,
    state: 'published',
  } as ReadingV2FullTestComposition;
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
    publishedAt,
    skipReadingPassageExtraction: true,
    metadata: {
      title: composition.title,
      compositionId: composition.compositionId,
      materialKind: 'full-test',
      durationMinutes: composition.durationMinutes,
      visibility: composition.visibility === 'public' ? 'public' : 'private',
      primaryTestTypeId: composition.primaryTestTypeId,
      testTypeIds: composition.testTypeIds,
      description: 'Updated from Reading V2 master editor.',
      tags: ['reading-passage-selection'],
    },
  });
  const firebaseUpdates = buildReadingV2FirebasePublishUpdates(
    publishResult.commitPlan,
    publishedAt,
  );
  const versionValue = {
    ...composition,
    publishedAt,
    publishedBy: input.teacherId,
  };

  await writeUpdates(input.repository, {
    ...firebaseUpdates.updates,
    ...buildMaterialCatalogUpdates({
      composition,
      updatedAt: publishedAt,
    }),
    [paths.composition]: composition,
    [paths.version]: versionValue,
  });

  return { composition, paths };
};

export const removeReadingV2MasterComposition = async (input: {
  readonly actorUserId: string;
  readonly actorRole: ReadingV2AuditActorRole;
  readonly composition: ReturnType<typeof buildReadingV2TeacherSelectedPassageComposition>;
  readonly repository: ReadingV2MasterRemoveRepository;
  readonly now?: string;
  readonly correlationId: string;
  readonly sourceFeatureId: string;
  readonly sourceRoute: string;
}): Promise<{ readonly changedPaths: readonly string[] }> => {
  if (input.actorRole !== 'super_admin' && input.actorUserId !== input.composition.ownerId) {
    throw new Error('Only the owner teacher can remove this Reading V2 master.');
  }

  const removedAt = input.now ?? new Date().toISOString();
  const changedPaths: string[] = [];
  const compositionPath = readingV2StoragePaths.fullTestCompositions(input.composition.compositionId);
  const metadataPath = readingV2StoragePaths.materialMetadata(input.composition.testMaterialId);
  const materialStateWrites = [
    { path: `${compositionPath}/state`, value: 'removed' },
    { path: `${compositionPath}/removedAt`, value: removedAt },
    { path: `${compositionPath}/removedBy`, value: input.actorUserId },
    { path: `${compositionPath}/updatedAt`, value: removedAt },
    { path: `${metadataPath}/state`, value: 'removed' },
    { path: `${metadataPath}/removedAt`, value: removedAt },
    { path: `${metadataPath}/removedBy`, value: input.actorUserId },
    { path: `${metadataPath}/updatedAt`, value: removedAt },
  ];

  for (const write of materialStateWrites) {
    await input.repository.write(write.path, write.value);
    changedPaths.push(write.path);
  }

  const indexSummary = {
    materialId: input.composition.testMaterialId,
    ownerId: input.composition.ownerId,
    title: input.composition.title,
    visibility: input.composition.visibility === 'public' ? 'public' : 'private',
    materialKind: 'full-test' as const,
    testTypeIds: input.composition.testTypeIds,
    updatedAt: input.composition.updatedAt,
  };

  for (const path of listMaterialCatalogIndexPaths(indexSummary)) {
    await input.repository.remove(path);
    changedPaths.push(path);
  }

  const legacyTestPath = `tests/${input.composition.testMaterialId}`;
  await input.repository.remove(legacyTestPath);
  changedPaths.push(legacyTestPath);

  const eventId = `${input.correlationId}:reading_master_removed:${input.composition.compositionId}`;
  const auditPath = getReadingV2AuditEventPath(eventId);
  const event = buildReadingV2AuditEvent({
    eventId,
    createdAt: removedAt,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'reading_master_removed',
    entityType: 'reading-master',
    entityId: input.composition.compositionId,
    ownerId: input.composition.ownerId,
    materialId: input.composition.testMaterialId,
    versionId: input.composition.publishedVersionId,
    titleSnapshot: input.composition.title,
    after: {
      state: 'removed',
      passageRefCount: input.composition.passageRefs.length,
    },
    adminOverride: input.actorRole === 'super_admin' || undefined,
    correlationId: input.correlationId,
    sourceFeatureId: input.sourceFeatureId,
    sourceRoute: input.sourceRoute,
  });
  await input.repository.write(auditPath, event);
  changedPaths.push(auditPath);

  return { changedPaths };
};
