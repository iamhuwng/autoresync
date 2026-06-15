import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2FullTestComposition,
  type ReadingV2FullTestCompositionId,
  type ReadingV2FullTestId,
  type ReadingV2Interaction,
  type ReadingV2MaterialId,
  type ReadingV2OptionSet,
  type ReadingV2PublishedSnapshot,
  type ReadingV2ReadingPassageMaterial,
  type ReadingV2SectionId,
  type ReadingV2SnapshotVersionId,
  type ReadingV2SourceOrderSnapshot,
  type ReadingV2StimulusNode,
  type ReadingV2TaskGroup,
} from '../../types/readingV2.types';
import {
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
  type ReadingPassageVisibilityScope,
} from '../../types/materialCatalog.types';
import {
  assertReadingV2PublishGate,
  ReadingV2PublishGateError,
} from './readingV2Validation.service';
import { composeReadingV2CompositionNumbering } from './readingV2CompositionNumbering.service';

export type ReadingV2PassageExtractionIssueCode =
  | 'missing-source-input'
  | 'ambiguous-passage-boundary'
  | 'missing-task-group'
  | 'missing-interaction'
  | 'missing-answer-key'
  | 'missing-test-type'
  | 'publish-gate-blocked'
  | 'backfill-canonical-validation-blocked';

export type ReadingV2PassageExtractionIssueSeverity = 'warning' | 'error';

export interface ReadingV2PassageExtractionIssue {
  readonly code: ReadingV2PassageExtractionIssueCode;
  readonly severity: ReadingV2PassageExtractionIssueSeverity;
  readonly message: string;
  readonly sectionId?: ReadingV2SectionId;
  readonly interactionId?: string;
}

export interface ReadingV2PassageExtractionPublishPackage {
  readonly materialId: ReadingV2MaterialId;
  readonly title?: string;
  readonly snapshot: ReadingV2PublishedSnapshot;
}

export interface ReadingV2PassageExtractionInput {
  readonly document?: ReadingV2Document;
  readonly publishPackage?: ReadingV2PassageExtractionPublishPackage;
  readonly ownerId?: string;
  readonly sourceFullTestId?: ReadingV2FullTestId;
  readonly testMaterialId?: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId?: ReadingV2SnapshotVersionId;
  readonly sourceTitleSnapshot?: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly visibility?: ReadingPassageVisibilityScope;
  readonly durationMinutes?: number;
  readonly createdAt?: string;
}

export interface ReadingV2ExtractedPassageProvenance {
  readonly sourceSectionId: ReadingV2SectionId;
  readonly sourceStimulusId: string;
  readonly sourceTaskGroupIds: readonly string[];
  readonly sourceInteractionIds: readonly string[];
  readonly sourceFullTestId?: string;
  readonly sourceSnapshotVersionId: string;
  readonly extractionMethod: 'full-test-passage-extraction';
}

export interface ReadingV2ExtractedPassageCandidate {
  readonly material: ReadingV2ReadingPassageMaterial;
  readonly document: ReadingV2Document;
  readonly sectionId: ReadingV2SectionId;
  readonly stimulus: ReadingV2StimulusNode;
  readonly taskGroups: readonly ReadingV2TaskGroup[];
  readonly interactions: readonly ReadingV2Interaction[];
  readonly optionSets: readonly ReadingV2OptionSet[];
  readonly teacherAdminProvenance: ReadingV2ExtractedPassageProvenance;
  readonly validationIssues: readonly ReadingV2PassageExtractionIssue[];
}

export interface ReadingV2PassageExtractionResult {
  readonly passages: readonly ReadingV2ExtractedPassageCandidate[];
  readonly composition: ReadingV2FullTestComposition;
  readonly validationIssues: readonly ReadingV2PassageExtractionIssue[];
  readonly canPublish: boolean;
  readonly canSavePrivateDraft: boolean;
}

interface ResolvedSourceInput {
  readonly document: ReadingV2Document;
  readonly ownerId: string;
  readonly sourceFullTestId?: ReadingV2FullTestId;
  readonly testMaterialId: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly sourceTitleSnapshot: string;
}

const SOURCE_UNKNOWN_LABEL = 'Source';

const sanitizeIdPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'reading-v2';

export const buildReadingV2ExtractedFullTestCompositionId = (
  testMaterialId: string,
  sourceSnapshotVersionId: string,
): ReadingV2FullTestCompositionId =>
  readingV2Ids.fullTestCompositionId(
    `composition-${sanitizeIdPart(testMaterialId)}-${sanitizeIdPart(sourceSnapshotVersionId)}`,
  );

const cloneRecord = <T>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);

const issue = (
  code: ReadingV2PassageExtractionIssueCode,
  message: string,
  details: Omit<ReadingV2PassageExtractionIssue, 'code' | 'message' | 'severity'> = {},
  severity: ReadingV2PassageExtractionIssueSeverity = 'error',
): ReadingV2PassageExtractionIssue => ({
  code,
  severity,
  message,
  ...details,
});

const resolveSourceInput = (input: ReadingV2PassageExtractionInput): ResolvedSourceInput => {
  const document = input.document ?? input.publishPackage?.snapshot.document;
  const ownerId = input.ownerId ?? input.publishPackage?.snapshot.ownerId;
  const sourceSnapshotVersionId =
    input.sourceSnapshotVersionId ?? input.publishPackage?.snapshot.snapshotVersionId;
  const testMaterialId =
    input.testMaterialId ??
    input.publishPackage?.materialId ??
    (input.sourceFullTestId
      ? readingV2Ids.materialId(input.sourceFullTestId)
      : undefined);

  if (!document || !ownerId || !sourceSnapshotVersionId || !testMaterialId) {
    throw new Error(
      'Reading V2 passage extraction requires a document or publish package, owner, material id, and source snapshot version.',
    );
  }

  return {
    document,
    ownerId,
    sourceFullTestId: input.sourceFullTestId,
    testMaterialId,
    sourceSnapshotVersionId,
    sourceTitleSnapshot:
      input.sourceTitleSnapshot?.trim() ||
      input.publishPackage?.title?.trim() ||
      document.title.trim() ||
      'Untitled Reading V2 source',
  };
};

const resolvePrimaryTestTypeConfig = (
  primaryTestTypeId: MaterialTestTypeId | undefined,
  configs: readonly MaterialTestTypeConfig[] | undefined,
): MaterialTestTypeConfig | null => {
  if (!primaryTestTypeId || !configs) {
    return null;
  }

  return configs.find((config) => config.testTypeId === primaryTestTypeId) ?? null;
};

const resolveSourceOrderLabel = (
  config: MaterialTestTypeConfig | null,
): string =>
  config?.readingSourceOrderLabel.trim() || SOURCE_UNKNOWN_LABEL;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseSourceOrder = (
  sectionTitle: string,
  labelSnapshot: string,
): ReadingV2SourceOrderSnapshot => {
  const match = sectionTitle.match(
    new RegExp(`\\b${escapeRegex(labelSnapshot)}\\s+([A-Za-z0-9]+)\\b`, 'i'),
  );

  if (!match?.[1]) {
    return {
      kind: 'unknown',
      value: null,
      labelSnapshot,
      displaySnapshot: `${labelSnapshot} unknown`,
    };
  }

  const rawValue = match[1].trim();
  const numericValue = Number(rawValue);

  if (/^\d+$/.test(rawValue) && Number.isFinite(numericValue)) {
    return {
      kind: 'numeric',
      value: numericValue,
      labelSnapshot,
      displaySnapshot: `${labelSnapshot} ${numericValue}`,
    };
  }

  return {
    kind: 'label',
    value: rawValue,
    labelSnapshot,
    displaySnapshot: `${labelSnapshot} ${rawValue}`,
  };
};

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const getSectionTaskGroups = (
  document: ReadingV2Document,
  sectionId: ReadingV2SectionId,
): readonly ReadingV2TaskGroup[] => {
  const section = document.sections[sectionId];

  if (!section) {
    return [];
  }

  const listedIds = section.taskGroupIds;
  const inferredIds = Object.values(document.taskGroups)
    .filter((taskGroup) => taskGroup.sectionId === sectionId)
    .map((taskGroup) => taskGroup.taskGroupId);

  return unique([...listedIds, ...inferredIds])
    .map((taskGroupId) => document.taskGroups[taskGroupId])
    .filter((taskGroup): taskGroup is ReadingV2TaskGroup => Boolean(taskGroup));
};

const getTaskGroupInteractions = (
  document: ReadingV2Document,
  taskGroups: readonly ReadingV2TaskGroup[],
): readonly ReadingV2Interaction[] =>
  taskGroups.flatMap((taskGroup) =>
    taskGroup.interactionIds
      .map((interactionId) => document.interactions[interactionId])
      .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction)),
  );

const getTaskGroupOptionSets = (
  document: ReadingV2Document,
  taskGroups: readonly ReadingV2TaskGroup[],
): readonly ReadingV2OptionSet[] =>
  unique(taskGroups.flatMap((taskGroup) => taskGroup.optionSetRefs))
    .map((optionSetId) => document.optionSets[optionSetId])
    .filter((optionSet): optionSet is ReadingV2OptionSet => Boolean(optionSet));

const detectPassageStimulus = (
  document: ReadingV2Document,
  sectionId: ReadingV2SectionId,
): { stimulus?: ReadingV2StimulusNode; issues: readonly ReadingV2PassageExtractionIssue[] } => {
  const section = document.sections[sectionId];

  if (!section) {
    return {
      issues: [
        issue(
          'ambiguous-passage-boundary',
          `Section ${sectionId} is referenced by document order but missing from section map.`,
          { sectionId },
        ),
      ],
    };
  }

  const stimuli = section.stimulusIds
    .map((stimulusId) => document.stimuli[stimulusId])
    .filter((stimulus): stimulus is ReadingV2StimulusNode => Boolean(stimulus));
  const passageStimuli = stimuli.filter((stimulus) => stimulus.kind === 'passage');

  if (passageStimuli.length === 1) {
    return { stimulus: passageStimuli[0], issues: [] };
  }

  if (passageStimuli.length === 0 && stimuli.length === 1) {
    return { stimulus: stimuli[0], issues: [] };
  }

  return {
    issues: [
      issue(
        'ambiguous-passage-boundary',
        `Section ${sectionId} must contain exactly one passage/stimulus boundary before publish.`,
        { sectionId },
      ),
    ],
  };
};

const hasAnswerKey = (interaction: ReadingV2Interaction): boolean =>
  Array.isArray(interaction.scoringRule.acceptableAnswers) &&
  interaction.scoringRule.acceptableAnswers.length > 0;

const getMissingAnswerKeyIssues = (
  interactions: readonly ReadingV2Interaction[],
  sectionId: ReadingV2SectionId,
): readonly ReadingV2PassageExtractionIssue[] =>
  interactions
    .filter((interaction) => !hasAnswerKey(interaction))
    .map((interaction) =>
      issue(
        'missing-answer-key',
        `Interaction ${interaction.interactionId} is missing answer-key acceptableAnswers.`,
        { sectionId, interactionId: interaction.interactionId },
      ),
    );

const getMissingInteractionIssues = (
  document: ReadingV2Document,
  taskGroups: readonly ReadingV2TaskGroup[],
  sectionId: ReadingV2SectionId,
): readonly ReadingV2PassageExtractionIssue[] =>
  taskGroups.flatMap((taskGroup) =>
    taskGroup.interactionIds
      .filter((interactionId) => !document.interactions[interactionId])
      .map((interactionId) =>
        issue(
          'missing-interaction',
          `Task group ${taskGroup.taskGroupId} references missing interaction ${interactionId}.`,
          { sectionId, interactionId },
        ),
      ),
  );

const deriveQuestionRange = (
  interactions: readonly ReadingV2Interaction[],
): string | undefined => {
  const numbers = interactions
    .map((interaction) => interaction.reviewLabel.displayNumber)
    .filter((displayNumber): displayNumber is number =>
      typeof displayNumber === 'number' && Number.isFinite(displayNumber),
    );

  if (numbers.length === 0) {
    return undefined;
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);

  return min === max ? String(min) : `${min}-${max}`;
};

const normalizeTitleForComparison = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isGenericPassageTitle = (
  title: string | undefined,
  sourceOrder: ReadingV2SourceOrderSnapshot,
): boolean => {
  const normalized = normalizeTitleForComparison(title ?? '');

  if (!normalized) {
    return true;
  }

  return (
    normalized === normalizeTitleForComparison(sourceOrder.displaySnapshot) ||
    normalized === 'source unknown' ||
    normalized === 'section unknown' ||
    /^reading passage [a-z0-9]+$/.test(normalized) ||
    /^passage [a-z0-9]+$/.test(normalized) ||
    /^fixture stimulus for /.test(normalized) ||
    normalized.startsWith('you should spend about ')
  );
};

const fallbackPassageTitle = (sourceTitle: string, passageIndex: number): string => {
  const baseTitle = (sourceTitle.trim() || 'Untitled Reading V2 source').replace(/:\s*$/, '');

  return `${baseTitle}: Passage ${passageIndex + 1}`;
};

const buildPassageTitle = (
  stimulus: ReadingV2StimulusNode,
  sourceTitle: string,
  sourceOrder: ReadingV2SourceOrderSnapshot,
  passageIndex: number,
): string => {
  const ownTitle = stimulus.title?.trim();

  return !isGenericPassageTitle(ownTitle, sourceOrder)
    ? ownTitle!
    : fallbackPassageTitle(sourceTitle, passageIndex);
};

const buildSinglePassageDocument = (
  sourceDocument: ReadingV2Document,
  sectionId: ReadingV2SectionId,
  stimulus: ReadingV2StimulusNode,
  taskGroups: readonly ReadingV2TaskGroup[],
  interactions: readonly ReadingV2Interaction[],
  optionSets: readonly ReadingV2OptionSet[],
  title: string,
): ReadingV2Document => {
  const section = sourceDocument.sections[sectionId];
  if (!section) {
    throw new Error(`Reading V2 section ${sectionId} is missing from source document.`);
  }

  const anchorIds = new Set<string>();
  stimulus.anchorIds.forEach((anchorId) => anchorIds.add(anchorId));
  interactions.forEach((interaction) => {
    if (interaction.primaryAnchorId) {
      anchorIds.add(interaction.primaryAnchorId);
    }
    (interaction.contextAnchorIds ?? []).forEach((anchorId) => anchorIds.add(anchorId));
  });
  taskGroups.forEach((taskGroup) => {
    taskGroup.stimulusRefs.forEach((stimulusRef) => {
      (stimulusRef.anchorIds ?? []).forEach((anchorId) => anchorIds.add(anchorId));
    });
  });
  const anchors: Record<string, ReadingV2Anchor> = {};
  anchorIds.forEach((anchorId) => {
    const anchor = sourceDocument.anchors[anchorId];
    if (anchor) {
      anchors[anchorId] = cloneRecord(anchor);
    }
  });

  return {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: 1,
    documentId: readingV2Ids.documentId(`${sourceDocument.documentId}-${sectionId}`),
    title,
    sectionIds: [sectionId],
    sections: {
      [sectionId]: cloneRecord(section),
    },
    stimuli: {
      [stimulus.stimulusId]: cloneRecord(stimulus),
    },
    anchors,
    taskGroups: Object.fromEntries(
      taskGroups.map((taskGroup) => [
        taskGroup.taskGroupId,
        {
          ...cloneRecord(taskGroup),
          optionSetRefs: taskGroup.optionSetRefs ?? [],
          validationState: taskGroup.validationState ?? { issues: [] },
        },
      ]),
    ),
    interactions: Object.fromEntries(
      interactions.map((interaction) => [interaction.interactionId, cloneRecord(interaction)]),
    ),
    optionSets: Object.fromEntries(
      optionSets.map((optionSet) => [optionSet.optionSetId, cloneRecord(optionSet)]),
    ),
    validationState: { issues: [] },
  };
};

const getPublishGateIssues = (
  document: ReadingV2Document,
  sectionId: ReadingV2SectionId,
): readonly ReadingV2PassageExtractionIssue[] => {
  try {
    assertReadingV2PublishGate(document);
    return [];
  } catch (error) {
    if (!(error instanceof ReadingV2PublishGateError)) {
      throw error;
    }

    return error.result.blockingIssues.map((blockingIssue) =>
      issue(
        'publish-gate-blocked',
        `Extracted Reading Passage failed publish gate: ${blockingIssue.message}`,
        {
          sectionId,
          interactionId: blockingIssue.objectId,
        },
      ),
    );
  }
};

export const extractReadingV2PassageMaterials = (
  input: ReadingV2PassageExtractionInput,
): ReadingV2PassageExtractionResult => {
  const source = resolveSourceInput(input);
  const requestedVisibility = input.visibility ?? 'private';
  const primaryConfig = resolvePrimaryTestTypeConfig(input.primaryTestTypeId, input.testTypeConfigs);
  const sourceOrderLabel = resolveSourceOrderLabel(primaryConfig);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const testTypeIds = unique([
    ...(input.primaryTestTypeId ? [input.primaryTestTypeId] : []),
    ...(input.testTypeIds ?? []),
  ]);
  const missingTestTypeIssue =
    requestedVisibility === 'public' && !input.primaryTestTypeId
      ? issue(
          'missing-test-type',
          'Public Reading Passage extraction requires a Test Type before library eligibility.',
        )
      : null;
  const materialVisibility: ReadingPassageVisibilityScope = missingTestTypeIssue
    ? 'private'
    : requestedVisibility;

  const boundaryIssues: ReadingV2PassageExtractionIssue[] = [];
  const sectionRows = source.document.sectionIds.map((sectionId) => {
    const boundary = detectPassageStimulus(source.document, sectionId);
    boundaryIssues.push(...boundary.issues);
    return {
      sectionId,
      stimulus: boundary.stimulus,
    };
  });

  if (boundaryIssues.length > 0) {
    const validationIssues = missingTestTypeIssue
      ? [missingTestTypeIssue, ...boundaryIssues]
      : boundaryIssues;

    return {
      passages: [],
      composition: {
        deliveryEngine: READING_V2_ENGINE,
        plane: 'packaging',
        schemaVersion: 1,
        compositionId: buildReadingV2ExtractedFullTestCompositionId(
          source.testMaterialId,
          source.sourceSnapshotVersionId,
        ),
        testMaterialId: source.testMaterialId,
        title: source.sourceTitleSnapshot,
        primaryTestTypeId: input.primaryTestTypeId,
        testTypeIds,
        skill: 'reading',
        passageRefs: [],
        questionCount: 0,
        numbering: composeReadingV2CompositionNumbering({ passages: [] }),
        durationMinutes: input.durationMinutes,
        visibility: materialVisibility,
        ownerId: source.ownerId,
        publishedVersionId: source.sourceSnapshotVersionId,
        createdAt,
        updatedAt: createdAt,
      },
      validationIssues,
      canPublish: false,
      canSavePrivateDraft: true,
    };
  }

  const candidates = sectionRows.flatMap((sectionRow, index): ReadingV2ExtractedPassageCandidate[] => {
    if (!sectionRow.stimulus) {
      return [];
    }

    const section = source.document.sections[sectionRow.sectionId];
    if (!section) {
      return [];
    }
    const sourceOrder = parseSourceOrder(section.title, sourceOrderLabel);
    const taskGroups = getSectionTaskGroups(source.document, sectionRow.sectionId);
    const interactions = getTaskGroupInteractions(source.document, taskGroups);
    const optionSets = getTaskGroupOptionSets(source.document, taskGroups);
    const sourcePassageIssues = [
      ...(taskGroups.length === 0
        ? [
            issue(
              'missing-task-group',
              `Section ${sectionRow.sectionId} has no task groups to extract.`,
              { sectionId: sectionRow.sectionId },
            ),
          ]
        : []),
      ...getMissingInteractionIssues(source.document, taskGroups, sectionRow.sectionId),
      ...getMissingAnswerKeyIssues(interactions, sectionRow.sectionId),
    ];
    const passageMaterialId = readingV2Ids.readingPassageMaterialId(
      `${sanitizeIdPart(source.testMaterialId)}-passage-${index + 1}`,
    );
    const interactionIds = interactions.map((interaction) => interaction.interactionId);
    const taskGroupIds = taskGroups.map((taskGroup) => taskGroup.taskGroupId);
    const sourceQuestionRange = deriveQuestionRange(interactions);
    const title = buildPassageTitle(
      sectionRow.stimulus,
      source.sourceTitleSnapshot,
      sourceOrder,
      index,
    );
    const singlePassageDocument = buildSinglePassageDocument(
      source.document,
      sectionRow.sectionId,
      sectionRow.stimulus,
      taskGroups,
      interactions,
      optionSets,
      title,
    );
    const passageIssues = [
      ...sourcePassageIssues,
      ...getPublishGateIssues(singlePassageDocument, sectionRow.sectionId),
    ];
    const hasBlockingIssue = passageIssues.some((entry) => entry.severity === 'error') || Boolean(missingTestTypeIssue);

    return [
      {
        material: {
          deliveryEngine: READING_V2_ENGINE,
          plane: 'canonical',
          schemaVersion: 1,
          passageMaterialId,
          ownerId: source.ownerId,
          visibility: materialVisibility,
          state: hasBlockingIssue ? 'draft' : 'published',
          currentSnapshotVersionId: source.sourceSnapshotVersionId,
          title,
          primaryTestTypeId: input.primaryTestTypeId,
          testTypeIds,
          stimulusId: sectionRow.stimulus.stimulusId,
          taskGroupIds,
          interactionIds,
          answerKeyLocation: 'canonical',
          scoringRuleLocation: 'canonical',
          sourceFullTestId: source.sourceFullTestId,
          sourceSnapshotVersionId: source.sourceSnapshotVersionId,
          sourceOrder,
          sourceQuestionRange,
          sourceTitleSnapshot: source.sourceTitleSnapshot,
          durationMinutes: input.durationMinutes,
          provenance: {
            sourceTestId: source.sourceFullTestId,
            sourceMaterialId: source.testMaterialId,
            sourceSnapshotVersionId: source.sourceSnapshotVersionId,
            sourceTaskGroupIds: taskGroupIds,
            extractedAt: createdAt,
            extractionMethod: 'import',
          },
          createdAt,
          updatedAt: createdAt,
        },
        document: singlePassageDocument,
        sectionId: sectionRow.sectionId,
        stimulus: cloneRecord(sectionRow.stimulus),
        taskGroups: cloneRecord(taskGroups),
        interactions: cloneRecord(interactions),
        optionSets: cloneRecord(optionSets),
        teacherAdminProvenance: {
          sourceSectionId: sectionRow.sectionId,
          sourceStimulusId: sectionRow.stimulus.stimulusId,
          sourceTaskGroupIds: taskGroupIds,
          sourceInteractionIds: interactionIds,
          sourceFullTestId: source.sourceFullTestId,
          sourceSnapshotVersionId: source.sourceSnapshotVersionId,
          extractionMethod: 'full-test-passage-extraction',
        },
        validationIssues: passageIssues,
      },
    ];
  });

  const validationIssues = [
    ...(missingTestTypeIssue ? [missingTestTypeIssue] : []),
    ...candidates.flatMap((candidate) => candidate.validationIssues),
  ];
  const passageRefs = candidates.map((candidate, index) => ({
    refId: readingV2Ids.passageRefId(
      `${sanitizeIdPart(source.testMaterialId)}-passage-ref-${index + 1}`,
    ),
    passageMaterialId: candidate.material.passageMaterialId,
    materialId: candidate.material.passageMaterialId,
    snapshotVersionId: candidate.material.currentSnapshotVersionId,
    order: index + 1,
    sourcePassageNumber:
      candidate.material.sourceOrder.kind === 'numeric' &&
      typeof candidate.material.sourceOrder.value === 'number'
        ? candidate.material.sourceOrder.value
        : null,
    sourceOrderLabelSnapshot: candidate.material.sourceOrder.labelSnapshot,
    sourceOrderDisplaySnapshot: candidate.material.sourceOrder.displaySnapshot,
    titleSnapshot: candidate.material.title,
    title: candidate.material.title,
    source: {
      sourceOrderLabel: candidate.material.sourceOrder.labelSnapshot,
      sourceOrderDisplay: candidate.material.sourceOrder.displaySnapshot,
      sourceFullTestId: candidate.material.sourceFullTestId,
      sourceFullTestTitle: candidate.material.sourceTitleSnapshot,
    },
    questionRangeSnapshot: candidate.material.sourceQuestionRange,
    questionCountSnapshot: candidate.material.interactionIds.length,
    questionCount: candidate.material.interactionIds.length,
    durationSnapshot: candidate.material.durationMinutes,
    ownerId: source.ownerId,
    visibility: materialVisibility,
    currentVersionId: candidate.material.currentSnapshotVersionId,
    testType: {
      ...(candidate.material.primaryTestTypeId ? { primaryTestTypeId: candidate.material.primaryTestTypeId } : {}),
      testTypeIds: candidate.material.testTypeIds,
    },
    testTypeIdsSnapshot: candidate.material.testTypeIds,
  }));
  const numbering = composeReadingV2CompositionNumbering({
    passages: candidates.map((candidate, index) => ({
      order: index + 1,
      passageMaterialId: candidate.material.passageMaterialId,
      snapshotVersionId: candidate.material.currentSnapshotVersionId,
      interactions: candidate.material.interactionIds.map((interactionId) => ({ interactionId })),
    })),
  });

  return {
    passages: candidates,
    composition: {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'packaging',
      schemaVersion: 1,
      compositionId: buildReadingV2ExtractedFullTestCompositionId(
        source.testMaterialId,
        source.sourceSnapshotVersionId,
      ),
      testMaterialId: source.testMaterialId,
      title: source.sourceTitleSnapshot,
      primaryTestTypeId: input.primaryTestTypeId,
      testTypeIds,
      skill: 'reading',
      passageRefs,
      questionCount: numbering.totalQuestionCount,
      numbering,
      durationMinutes: input.durationMinutes,
      visibility: materialVisibility,
      ownerId: source.ownerId,
      publishedVersionId: source.sourceSnapshotVersionId,
      createdAt,
      updatedAt: createdAt,
    },
    validationIssues,
    canPublish: validationIssues.every((entry) => entry.severity !== 'error'),
    canSavePrivateDraft: true,
  };
};
