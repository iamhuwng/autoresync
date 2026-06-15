// Reading V2 Studio boundary: this shell owns canonical draft authoring for V2 only.
// Runtime, launch, results, and legacy Reading editor payloads must stay outside this component.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useClipboard } from '../../../core/platform';
import { READING_V2_ENGINE, READING_V2_PRODUCT_LABEL } from '../../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2OptionSet,
  type ReadingV2SectionId,
  type ReadingV2StimulusId,
  type ReadingV2StimulusNode,
  type ReadingV2TableCellContent,
  type ReadingV2TaskGroup,
  type ReadingV2TaskGroupId,
  type ReadingV2ValidationIssue,
} from '../../../types/readingV2.types';
import {
  getReadingV2TaskFamily,
  READING_V2_TASK_TAXONOMY,
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';
import {
  normalizeReadingV2ImportCandidate,
  type ReadingV2AutoImportCandidateDiagnostic,
} from '../../../services/reading-v2/readingV2ImportNormalization.service';
import { getReadingV2InstructionText } from '../../../services/reading-v2/readingV2InstructionTemplates.service';
import { deriveReadingV2VisibleNumbers } from '../../../services/reading-v2/readingV2Numbering.service';
import type { ReadingV2DerivedProjection } from '../../../services/reading-v2/readingV2Projection.service';
import type {
  ReadingV2AutoSplitDuplicateWarning,
} from '../../../services/reading-v2/readingV2PublishPipeline.service';
import type { ReadingV2DuplicateMatch } from '../../../services/reading-v2/readingV2PassageDuplicateGuard.service';
import { writeReadingV2AuditEvent } from '../../../services/reading-v2/readingV2AuditTrail.service';
import {
  deserializeReadingV2CanonicalToEditorDocument,
  serializeReadingV2EditorDocumentToCanonical,
  validateReadingV2EditorDocument,
} from '../../../services/reading-v2/readingV2EditorDocument.service';
import { readingV2StudioRepository } from '../../../services/reading-v2/readingV2StudioWorkflow.service';
import {
  buildReadingV2TeacherImportDiagnostics,
  buildReadingV2StudioParsingDiagnostics,
  formatReadingV2StudioParsingDiagnostics,
  type ReadingV2TeacherImportDiagnosticTarget,
} from '../../../services/reading-v2/readingV2StudioParsingDiagnostics.service';
import { validateReadingV2Draft } from '../../../services/reading-v2/readingV2Validation.service';
import {
  ReadingV2BuildWorkspace,
  getReadingV2BuildTaskTypeLabel,
  type ReadingV2BuildPassageSlot,
  type ReadingV2QuestionLinkTarget,
  type ReadingV2BuildValidationMessage,
} from './ReadingV2BuildWorkspace';
import { ReadingV2DeveloperDetailsModal } from './ReadingV2DeveloperDetailsModal';
import { ReadingV2ImportReviewPanel, type ReadingV2ImportCandidate } from './ReadingV2ImportReviewPanel';
import { ReadingV2MetadataPanel, type ReadingV2StudioMetadata } from './ReadingV2MetadataPanel';
import { ReadingV2PassageAssetPanel } from './ReadingV2PassageAssetPanel';
import { ReadingV2PreviewOverlay } from './ReadingV2PreviewOverlay';
import { ReadingV2SettingsPanel } from './ReadingV2SettingsPanel';
import { ReadingV2StimulusEditor } from './ReadingV2StimulusEditor';
import { ReadingV2TaskGroupEditor } from './ReadingV2TaskGroupEditor';
import { ReadingV2DuplicateWarningPanel } from './ReadingV2DuplicateWarningPanel';
import {
  type ReadingV2TeacherPassageBlockKind,
  type ReadingV2TeacherStudioStep,
} from './ReadingV2TeacherStudioPanels';
import {
  READING_V2_STUDIO_OPERATIONAL_STATES,
  type ReadingV2StudioOperationalStateId,
} from './ReadingV2StudioOperationalStates';
import './ReadingV2StudioShell.css';

export type ReadingV2StudioMode =
  | 'create-blank'
  | 'create-from-import'
  | 'create-from-auto'
  | 'resume-draft'
  | 'revise-published'
  | 'duplicate-material'
  | 'extract-task-group-material';

export type ReadingV2StudioTab = ReadingV2TeacherStudioStep;

export interface ReadingV2ReturnContext {
  readonly surface: 'teacher-lobby' | 'material-profile' | 'direct-studio-route';
  readonly label: string;
}

export interface ReadingV2StudioActionMetadata {
  readonly [key: string]: unknown;
  readonly mode: ReadingV2StudioMode;
  readonly tab?: ReadingV2StudioTab;
  readonly step?: ReadingV2TeacherStudioStep;
  readonly host?: 'page' | 'modal';
  readonly outcome?: string;
  readonly draftId?: string;
  readonly materialId?: string;
  readonly revisionToken?: string;
  readonly taskType?: ReadingV2CanonicalTaskType;
}

export type ReadingV2StudioActionHandler = (
  actionName: string,
  metadata?: ReadingV2StudioActionMetadata,
) => void;

export interface ReadingV2StudioWorkflowSnapshot {
  readonly draftId: string;
  readonly materialId?: string;
  readonly document: ReadingV2Document;
  readonly metadata: ReadingV2StudioMetadata;
  readonly revisionToken: string;
  readonly returnContext?: string;
}

export interface ReadingV2StudioSaveResult {
  readonly revisionToken: string;
}

export interface ReadingV2StudioConflictReloadResult {
  readonly document: ReadingV2Document;
  readonly revisionToken: string;
}

export interface ReadingV2StudioConflictDuplicateResult {
  readonly draftId: string;
  readonly materialId?: string;
  readonly revisionToken: string;
}

export interface ReadingV2StudioConflictDiffResult {
  readonly latestRevisionToken?: string;
  readonly changedTitle: boolean;
  readonly changedValidationIssueCount: boolean;
}

export interface ReadingV2StudioExtractionRequest {
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
  readonly materialKind: 'task-group-material' | 'extracted-task-group-material';
}

export interface ReadingV2StudioExtractionResult {
  readonly draftId: string;
  readonly materialId?: string;
  readonly document: ReadingV2Document;
  readonly revisionToken: string;
}

export interface ReadingV2StudioPublishResult {
  readonly snapshotVersionId: string;
  readonly firebaseCommitStatus?: 'committed' | 'already-committed';
  readonly firebaseCommitPath?: string;
  readonly firebaseOperationCount?: number;
  readonly publishOutcome?: 'success' | 'partial-failure';
  readonly duplicateWarnings?: readonly ReadingV2AutoSplitDuplicateWarning[];
}

const getInitialStudioStep = (mode: ReadingV2StudioMode): ReadingV2TeacherStudioStep =>
  mode === 'create-from-import' || mode === 'create-from-auto' ? 'Passages' : 'Test Info';

const getFirstTaskGroupId = (document: ReadingV2Document): string | null =>
  document.sectionIds
    .map((sectionId) => document.sections[sectionId]?.taskGroupIds[0])
    .find((taskGroupId) => taskGroupId !== undefined) ?? null;

const getFirstPassageStimulusId = (document: ReadingV2Document): ReadingV2StimulusId | null =>
  document.sectionIds
    .map((sectionId) => document.sections[sectionId]?.stimulusIds[0])
    .find((stimulusId): stimulusId is ReadingV2StimulusId => stimulusId !== undefined) ?? null;

const getSectionIdForStimulus = (
  document: ReadingV2Document,
  stimulusId: string | null,
): ReadingV2SectionId | undefined =>
  stimulusId
    ? document.sectionIds.find((sectionId) =>
        document.sections[sectionId]?.stimulusIds.includes(readingV2Ids.stimulusId(stimulusId)),
      )
    : undefined;

export interface ReadingV2StudioShellProps {
  readonly mode: ReadingV2StudioMode;
  readonly document?: ReadingV2Document;
  readonly metadata?: Partial<ReadingV2StudioMetadata>;
  readonly returnContext?: ReadingV2ReturnContext;
  readonly host?: 'page' | 'modal';
  readonly operationalState?: ReadingV2StudioOperationalStateId;
  readonly importCandidate?: ReadingV2ImportCandidate;
  readonly draftId?: string;
  readonly materialId?: string;
  readonly revisionToken?: string;
  readonly onAction?: ReadingV2StudioActionHandler;
  readonly onSaveDraft?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioSaveResult | Promise<ReadingV2StudioSaveResult>;
  readonly onDraftChange?: (snapshot: ReadingV2StudioWorkflowSnapshot) => void;
  readonly onReloadLatest?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioConflictReloadResult | Promise<ReadingV2StudioConflictReloadResult>;
  readonly onDuplicateDraft?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioConflictDuplicateResult | Promise<ReadingV2StudioConflictDuplicateResult>;
  readonly onCompareDiff?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioConflictDiffResult | Promise<ReadingV2StudioConflictDiffResult>;
  readonly onPreview?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2DerivedProjection | Promise<ReadingV2DerivedProjection>;
  readonly onPublish?: (snapshot: ReadingV2StudioWorkflowSnapshot) => ReadingV2StudioPublishResult | Promise<ReadingV2StudioPublishResult>;
  readonly onPublishSuccess?: (
    snapshot: ReadingV2StudioWorkflowSnapshot,
    result: ReadingV2StudioPublishResult,
  ) => void;
  readonly onDiscard?: (snapshot: ReadingV2StudioWorkflowSnapshot) => void | Promise<void>;
  readonly onExtract?: (
    snapshot: ReadingV2StudioWorkflowSnapshot,
    request: ReadingV2StudioExtractionRequest,
  ) => ReadingV2StudioExtractionResult | Promise<ReadingV2StudioExtractionResult>;
  readonly onExit?: () => void;
}

const parseImportReviewQuestionRange = (
  value: string | undefined,
): ReadingV2BuildValidationMessage['questionRange'] | undefined => {
  const match = value?.match(/Q?\s*(\d+)(?:\s*[-–—]\s*(\d+))?/i);
  if (!match) {
    return undefined;
  }

  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    return undefined;
  }

  return {
    start: Math.min(first, last),
    end: Math.max(first, last),
  };
};

const formatImportReviewQuestionLabel = (
  range: ReadingV2BuildValidationMessage['questionRange'],
): string | undefined => {
  if (!range) {
    return undefined;
  }

  return range.start === range.end ? `Question ${range.start}` : `Questions ${range.start}-${range.end}`;
};

const findDiagnosticForImportBlocker = (
  message: string,
  diagnostics: readonly ReadingV2AutoImportCandidateDiagnostic[] | undefined,
): ReadingV2AutoImportCandidateDiagnostic | undefined => {
  const normalizedMessage = message.replace(/^Auto import needs teacher review before publish:\s*/i, '').trim();
  return diagnostics?.find((diagnostic) => normalizedMessage.includes(diagnostic.message) || message.includes(diagnostic.message));
};

const getImportReviewDetail = (
  message: string,
  diagnostic: ReadingV2AutoImportCandidateDiagnostic | undefined,
): string => {
  const sourceMessage = diagnostic?.message ?? message.replace(/^Auto import needs teacher review before publish:\s*/i, '').trim();

  if (diagnostic?.code === 'groq-output-missing-group' || /omitted hinted group/i.test(sourceMessage)) {
    return 'Provider omitted this question group. Local repair rebuilt it from source; check task type, prompt text, blanks, and answers.';
  }

  if (diagnostic?.code === 'group-coverage-mismatch' || /omitted question\(s\)/i.test(sourceMessage)) {
    return 'Provider omitted questions inside this group. Local repair rebuilt them from source; check statements, option bank, and answers.';
  }

  return sourceMessage;
};

const buildImportReviewValidationMessage = (
  message: string,
  index: number,
  diagnostics: readonly ReadingV2AutoImportCandidateDiagnostic[] | undefined,
): ReadingV2BuildValidationMessage => {
  const diagnostic = findDiagnosticForImportBlocker(message, diagnostics);
  const questionRange = parseImportReviewQuestionRange(diagnostic?.groupRange)
    ?? parseImportReviewQuestionRange(diagnostic?.sourceRange)
    ?? (diagnostic?.questionNumber ? { start: diagnostic.questionNumber, end: diagnostic.questionNumber } : undefined);
  const reviewLabel = formatImportReviewQuestionLabel(questionRange);
  const reviewDetail = getImportReviewDetail(message, diagnostic);

  return {
    key: `import-candidate-blocker-${index}`,
    message: reviewLabel ? `${reviewLabel}: ${reviewDetail}` : message,
    reviewLabel,
    reviewDetail: reviewLabel ? reviewDetail : undefined,
    questionRange,
    source: 'import-review',
  };
};

const DIAG_PREFIX = '[Diag][ReadingV2Studio]';

const logStudioDiagnostic = (
  event: string,
  payload: Record<string, unknown>,
): void => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${DIAG_PREFIX} ${event}`, payload);
};

const createDefaultMetadata = (
  overrides: Partial<ReadingV2StudioMetadata> = {},
): ReadingV2StudioMetadata => ({
  title: overrides.title ?? '',
  productMarker: READING_V2_PRODUCT_LABEL,
  materialKind: overrides.materialKind ?? 'full-test',
  durationMinutes: overrides.durationMinutes ?? 60,
  difficulty: overrides.difficulty ?? 'intermediate',
  targetBand: overrides.targetBand ?? 'Band 6-7',
  description: overrides.description ?? '',
  tags: overrides.tags ?? [],
  visibility: overrides.visibility ?? 'private',
  ownerId: overrides.ownerId ?? 'current-teacher',
  provenanceSummary: overrides.provenanceSummary ?? 'Original Reading V2 draft',
  primaryTestTypeId: overrides.primaryTestTypeId,
  testTypeIds: overrides.testTypeIds ? [...overrides.testTypeIds] : undefined,
  testTypeConfigs: overrides.testTypeConfigs ? [...overrides.testTypeConfigs] : undefined,
});

const createBlankReadingV2Document = (): ReadingV2Document => {
  const documentId = readingV2Ids.documentId('blank-reading-v2-draft');
  const sectionId = readingV2Ids.sectionId('blank-passage-1');
  const stimulusId = readingV2Ids.stimulusId('blank-passage-1-content');
  const anchorId = readingV2Ids.anchorId('blank-passage-1-paragraph-1');

  return {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId,
    title: '',
    sectionIds: [sectionId],
    sections: {
      [sectionId]: {
        sectionId,
        title: '',
        stimulusIds: [stimulusId],
        taskGroupIds: [],
      },
    },
    stimuli: {
      [stimulusId]: {
        stimulusId,
        kind: 'passage',
        title: '',
        content: {
          kind: 'passage-content',
          paragraphs: [
            {
              anchorId,
              label: 'Paragraph 1',
              text: '',
            },
          ],
        },
        anchorIds: [anchorId],
      },
    },
    anchors: {
      [anchorId]: {
        anchorId,
        stimulusId,
        kind: 'paragraph',
        label: 'Paragraph 1',
      },
    },
    taskGroups: {},
    interactions: {},
    optionSets: {},
    validationState: { issues: [] },
  };
};

const moveItem = <T,>(items: readonly T[], fromIndex: number, toIndex: number): readonly T[] => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);

  if (moved === undefined) {
    return items;
  }

  next.splice(toIndex, 0, moved);
  return next;
};

export const reorderReadingV2TopLevelTaskGroups = (
  document: ReadingV2Document,
  sectionId: string,
  fromIndex: number,
  toIndex: number,
): ReadingV2Document => {
  const section = document.sections[sectionId];

  if (!section) {
    throw new Error(`Cannot reorder Reading V2 task groups for missing section ${sectionId}.`);
  }

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        taskGroupIds: moveItem(section.taskGroupIds, fromIndex, toIndex),
      },
    },
  };
};

export const reorderReadingV2LinkedStimuli = (
  document: ReadingV2Document,
  sectionId: string,
  fromIndex: number,
  toIndex: number,
): ReadingV2Document => {
  const section = document.sections[sectionId];

  if (!section) {
    throw new Error(`Cannot reorder Reading V2 stimuli for missing section ${sectionId}.`);
  }

  return {
    ...document,
    sections: {
      ...document.sections,
      [sectionId]: {
        ...section,
        stimulusIds: moveItem(section.stimulusIds, fromIndex, toIndex),
      },
    },
  };
};

const createResponseShapeForTaskType = (
  taskType: ReadingV2CanonicalTaskType,
  optionSetId: ReadingV2OptionSet['optionSetId'],
): ReadingV2Interaction['responseShape'] => {
  const family = getReadingV2TaskFamily(taskType);

  if (taskType === 'multiple-select') {
    return { kind: 'multi-select', optionSetId, selectionLimit: 2 };
  }

  if (family === 'choice') {
    return { kind: 'single-choice', optionSetId };
  }

  if (family === 'binary-judgement') {
    return {
      kind: 'binary-judgement',
      vocabulary: taskType === 'true-false-not-given' ? 'TFNG' : 'YNNG',
    };
  }

  if (family === 'matching') {
    return {
      kind: 'matching',
      optionSetId,
      optionReuse: taskType === 'matching-headings' || taskType === 'matching-sentence-endings'
        ? 'disallowed'
        : 'allowed',
    };
  }

  if (family === 'structured-layout') {
    return {
      kind: 'structured-entry',
      structure:
        taskType === 'table-completion'
          ? 'table'
          : taskType === 'flowchart-completion'
            ? 'flowchart'
            : 'diagram',
    };
  }

  return { kind: 'free-text', wordLimit: taskType === 'short-answer' ? 3 : 2 };
};

const createOptionSetForTaskType = (
  taskType: ReadingV2CanonicalTaskType,
  taskGroupId: ReadingV2TaskGroupId,
  optionSetId: ReadingV2OptionSet['optionSetId'],
): ReadingV2OptionSet | null => {
  const family = getReadingV2TaskFamily(taskType);

  if (family !== 'choice' && family !== 'matching') {
    return null;
  }

  const headingOptions = taskType === 'matching-headings';
  const labels = headingOptions
    ? ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']
    : taskType === 'summary-completion-list' || taskType === 'matching-information'
      ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      : taskType === 'matching-sentence-endings'
        ? ['A', 'B', 'C', 'D', 'E', 'F', 'G']
        : taskType === 'matching-features'
          ? ['A', 'B', 'C', 'D', 'E']
      : ['A', 'B', 'C', 'D'];

  return {
    optionSetId,
    taskGroupId,
    options: labels.map((label) => ({
      optionId: `${optionSetId}-${label.toLowerCase()}`,
      label,
      text: '',
    })),
  };
};

export const createManualReadingV2TaskGroup = (
  document: ReadingV2Document,
  taskType: ReadingV2CanonicalTaskType = 'sentence-completion',
  preferredSectionId?: ReadingV2SectionId,
): ReadingV2Document => {
  const canonicalTaskType = READING_V2_TASK_TAXONOMY[taskType] ? taskType : 'sentence-completion';
  const sectionId = preferredSectionId ?? document.sectionIds[0];

  if (!sectionId) {
    throw new Error('Cannot add a Reading V2 question group without a passage.');
  }

  const section = document.sections[sectionId];
  const stimulusId = section?.stimulusIds[0];

  if (!section || !stimulusId) {
    throw new Error('Cannot add a Reading V2 question group without linked passage context.');
  }

  const nextPosition = section.taskGroupIds.length + 1;
  const taskTypeLabel = READING_V2_TASK_TAXONOMY[canonicalTaskType].label;
  const safeSectionId = section.sectionId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const taskGroupId = readingV2Ids.taskGroupId(`${safeSectionId}-${canonicalTaskType}-question-group-${nextPosition}`);
  const family = getReadingV2TaskFamily(canonicalTaskType);
  const optionSetId = readingV2Ids.optionSetId(`${taskGroupId}-options`);
  const responseShape = createResponseShapeForTaskType(canonicalTaskType, optionSetId);
  const usesPerQuestionChoiceOptions = canonicalTaskType === 'multiple-choice' || canonicalTaskType === 'multiple-select';
  const isTableCompletion = canonicalTaskType === 'table-completion';
  const isFlowchartCompletion = canonicalTaskType === 'flowchart-completion';
  const isDiagramLabeling = canonicalTaskType === 'diagram-labeling';
  const isStructuredCompletion = isTableCompletion || isFlowchartCompletion || isDiagramLabeling;
  const structuredStimulusId = readingV2Ids.stimulusId(
    `${taskGroupId}-${isTableCompletion ? 'table' : isFlowchartCompletion ? 'flowchart' : 'diagram'}`,
  );
  const structuredAnchorKind: ReadingV2Anchor['kind'] = isTableCompletion
    ? 'table-cell'
    : isFlowchartCompletion
      ? 'flow-step'
      : 'diagram-hotspot';
  const structuredAnchorIds = isStructuredCompletion
    ? [1, 2].map((questionIndex) =>
        readingV2Ids.anchorId(`${taskGroupId}-${structuredAnchorKind}-${questionIndex}`),
      )
    : [];
  const linkedStimulusId = isStructuredCompletion ? structuredStimulusId : stimulusId;
  const interactionIds = [1, 2].map((questionIndex) =>
    readingV2Ids.interactionId(`${taskGroupId}-question-${questionIndex}`),
  );
  const interactionOptionSetIds = usesPerQuestionChoiceOptions
    ? interactionIds.map((interactionId) => readingV2Ids.optionSetId(`${interactionId}-options`))
    : [optionSetId];
  const getInteractionResponseShape = (questionIndex: number): ReadingV2Interaction['responseShape'] => {
    if (!usesPerQuestionChoiceOptions) {
      return responseShape;
    }

    return createResponseShapeForTaskType(canonicalTaskType, interactionOptionSetIds[questionIndex] ?? optionSetId);
  };
  const taskGroup: ReadingV2TaskGroup = {
    taskGroupId,
    sectionId: section.sectionId,
    officialTaskType: canonicalTaskType,
    engineeringFamily: family,
    groupTitle: taskTypeLabel,
    instructionBlocks: [
      {
        id: `${taskGroupId}-instruction-1`,
        text: getReadingV2InstructionText(canonicalTaskType, {
          wordLimit: responseShape.kind === 'free-text' ? responseShape.wordLimit : undefined,
        }),
      },
    ],
    answerRule: {
      responseShape,
      wordLimit: responseShape.kind === 'free-text' ? responseShape.wordLimit : undefined,
      optionReuse: responseShape.kind === 'matching' ? responseShape.optionReuse : undefined,
      casing: 'ignored',
      punctuation: 'ignored',
    },
    stimulusRefs: [
      {
        stimulusId: linkedStimulusId,
        anchorIds: structuredAnchorIds.length > 0 ? structuredAnchorIds : undefined,
      },
    ],
    optionSetRefs:
      responseShape.kind === 'single-choice' || responseShape.kind === 'multi-select' || responseShape.kind === 'matching'
        ? interactionOptionSetIds
        : [],
    interactionIds,
    validationState: { issues: [] },
  };
  const scaffoldedInteractions = Object.fromEntries(
    interactionIds.map((interactionId, index) => {
      const interactionResponseShape = getInteractionResponseShape(index);
      return [
        interactionId,
        {
          interactionId,
          taskGroupId,
          responseShape: interactionResponseShape,
          scoringRule: {
            maxScore: 1,
            acceptableAnswers: [],
            orderMatters: interactionResponseShape.kind === 'multi-select' ? false : undefined,
          },
          reviewLabel: {},
          promptText: isTableCompletion
            ? `Table blank ${index + 1}`
            : isFlowchartCompletion
              ? `Flowchart step ${index + 1}`
              : isDiagramLabeling
                ? `Diagram label ${index + 1}`
                : '',
          primaryAnchorId: structuredAnchorIds[index],
          contextAnchorIds: structuredAnchorIds[index] ? [structuredAnchorIds[index]] : undefined,
          placeholder: true,
        } satisfies ReadingV2Interaction,
      ];
    }),
  );
  const optionSets = usesPerQuestionChoiceOptions
    ? interactionOptionSetIds.map((currentOptionSetId) => createOptionSetForTaskType(canonicalTaskType, taskGroupId, currentOptionSetId))
    : [createOptionSetForTaskType(canonicalTaskType, taskGroupId, optionSetId)];
  const structuredStimulus: ReadingV2StimulusNode | null = isTableCompletion
    ? {
        stimulusId: structuredStimulusId,
        kind: 'table-shell',
        title: `${taskTypeLabel} Table`,
        content: {
          kind: 'table-content',
          rows: [
            [
              { cellId: `${taskGroupId}-table-cell-r1-c1`, text: 'Category', role: 'header', rowSpan: 1, colSpan: 1 },
              { cellId: `${taskGroupId}-table-cell-r1-c2`, text: 'Answer', role: 'header', rowSpan: 1, colSpan: 1 },
            ],
            [
              { cellId: `${taskGroupId}-table-cell-r2-c1`, text: 'Item 1', role: 'body', rowSpan: 1, colSpan: 1 },
              { cellId: `${taskGroupId}-table-cell-r2-c2`, anchorId: structuredAnchorIds[0]!, anchorIds: [structuredAnchorIds[0]!], text: '', role: 'body', isBlank: true, rowSpan: 1, colSpan: 1 },
            ],
            [
              { cellId: `${taskGroupId}-table-cell-r3-c1`, text: 'Item 2', role: 'body', rowSpan: 1, colSpan: 1 },
              { cellId: `${taskGroupId}-table-cell-r3-c2`, anchorId: structuredAnchorIds[1]!, anchorIds: [structuredAnchorIds[1]!], text: '', role: 'body', isBlank: true, rowSpan: 1, colSpan: 1 },
            ],
          ],
        },
        anchorIds: structuredAnchorIds,
      }
    : isFlowchartCompletion
      ? {
          stimulusId: structuredStimulusId,
          kind: 'flowchart-shell',
          title: `${taskTypeLabel} Flowchart`,
          content: {
            kind: 'flowchart-content',
            steps: [
              {
                stepId: `${taskGroupId}-flow-step-1`,
                text: 'Step 1',
                nextStepIds: [`${taskGroupId}-flow-step-2`],
              },
              {
                anchorId: structuredAnchorIds[0]!,
                stepId: `${taskGroupId}-flow-step-2`,
                text: 'Flowchart step 1',
                nextStepIds: [`${taskGroupId}-flow-step-3`],
              },
              {
                anchorId: structuredAnchorIds[1]!,
                stepId: `${taskGroupId}-flow-step-3`,
                text: 'Flowchart step 2',
              },
            ],
          },
          anchorIds: structuredAnchorIds,
        }
      : isDiagramLabeling
        ? {
            stimulusId: structuredStimulusId,
            kind: 'diagram-shell',
            title: `${taskTypeLabel} Diagram`,
            content: {
              kind: 'diagram-content',
              imageAlt: 'Diagram for labelling',
              hotspots: [
                { anchorId: structuredAnchorIds[0]!, label: 'Label 1', xPercent: 32, yPercent: 36 },
                { anchorId: structuredAnchorIds[1]!, label: 'Label 2', xPercent: 68, yPercent: 58 },
              ],
            },
            anchorIds: structuredAnchorIds,
          }
        : null;

  return {
    ...document,
    sections: {
      ...document.sections,
      [section.sectionId]: {
        ...section,
        taskGroupIds: [...section.taskGroupIds, taskGroupId],
        stimulusIds: structuredStimulus && !section.stimulusIds.includes(structuredStimulus.stimulusId)
          ? [...section.stimulusIds, structuredStimulus.stimulusId]
          : section.stimulusIds,
      },
    },
    stimuli: structuredStimulus
      ? {
          ...document.stimuli,
          [structuredStimulus.stimulusId]: structuredStimulus,
        }
      : document.stimuli,
    anchors: structuredStimulus
      ? {
          ...document.anchors,
          ...Object.fromEntries(
            structuredAnchorIds.map((anchorId, index) => [
              anchorId,
              {
                anchorId,
                stimulusId: structuredStimulus.stimulusId,
                kind: structuredAnchorKind,
                label: isTableCompletion
                  ? `Question blank ${index + 1}`
                  : isFlowchartCompletion
                    ? `Flowchart step ${index + 1}`
                    : `Diagram label ${index + 1}`,
              },
            ]),
          ),
        }
      : document.anchors,
    taskGroups: {
      ...document.taskGroups,
      [taskGroupId]: taskGroup,
    },
    interactions: {
      ...document.interactions,
      ...scaffoldedInteractions,
    },
    optionSets: optionSets.some(Boolean)
      ? {
          ...document.optionSets,
          ...Object.fromEntries(
            optionSets
              .filter((candidate): candidate is ReadingV2OptionSet => Boolean(candidate))
              .map((optionSet) => [optionSet.optionSetId, optionSet]),
          ),
        }
      : document.optionSets,
  };
};

export const createReadingV2ManualPassage = (
  document: ReadingV2Document,
  passageNumber: number,
): ReadingV2Document => {
  let nextDocument = document;

  for (let index = 0; index < passageNumber; index += 1) {
    const currentPassageNumber = index + 1;
    const existingSectionId = nextDocument.sectionIds[index];
    const existingSection = existingSectionId ? nextDocument.sections[existingSectionId] : undefined;

    if (existingSection?.stimulusIds[0]) {
      continue;
    }

    let sectionId = existingSectionId ?? readingV2Ids.sectionId(`manual-passage-${currentPassageNumber}`);
    let stimulusId = readingV2Ids.stimulusId(`manual-passage-${currentPassageNumber}-content`);
    let anchorId = readingV2Ids.anchorId(`manual-passage-${currentPassageNumber}-paragraph-1`);
    let uniqueSuffix = 2;

    while (!existingSectionId && nextDocument.sections[sectionId]) {
      sectionId = readingV2Ids.sectionId(`manual-passage-${currentPassageNumber}-${uniqueSuffix}`);
      uniqueSuffix += 1;
    }

    uniqueSuffix = 2;
    while (nextDocument.stimuli[stimulusId]) {
      stimulusId = readingV2Ids.stimulusId(`manual-passage-${currentPassageNumber}-content-${uniqueSuffix}`);
      uniqueSuffix += 1;
    }

    uniqueSuffix = 2;
    while (nextDocument.anchors[anchorId]) {
      anchorId = readingV2Ids.anchorId(`manual-passage-${currentPassageNumber}-paragraph-1-${uniqueSuffix}`);
      uniqueSuffix += 1;
    }
    const passage: ReadingV2StimulusNode = {
      stimulusId,
      kind: 'passage',
      title: '',
      content: {
        kind: 'passage-content',
        paragraphs: [
          {
            anchorId,
            label: 'Paragraph 1',
            text: '',
          },
        ],
      },
      anchorIds: [anchorId],
    };
    const section = {
      sectionId,
      title: '',
      stimulusIds: [stimulusId],
      taskGroupIds: existingSection?.taskGroupIds ?? [],
    };

    nextDocument = {
      ...nextDocument,
      sectionIds: existingSectionId
        ? nextDocument.sectionIds
        : [...nextDocument.sectionIds, sectionId],
      sections: {
        ...nextDocument.sections,
        [sectionId]: section,
      },
      stimuli: {
        ...nextDocument.stimuli,
        [stimulusId]: passage,
      },
      anchors: {
        ...nextDocument.anchors,
        [anchorId]: {
          anchorId,
          stimulusId,
          kind: 'paragraph',
          label: 'Paragraph 1',
        },
      },
    };
  }

  return nextDocument;
};

const getPassageIdsByNumber = (
  document: ReadingV2Document,
  passageNumber: number,
): { sectionId?: ReadingV2SectionId; stimulusId?: ReadingV2StimulusId } => {
  const sectionId = document.sectionIds[passageNumber - 1];
  const section = sectionId ? document.sections[sectionId] : undefined;
  return {
    sectionId,
    stimulusId: section?.stimulusIds[0],
  };
};

const getPassageText = (stimulus: ReadingV2StimulusNode | undefined): string => {
  if (!stimulus || stimulus.content.kind !== 'passage-content') {
    return '';
  }

  return stimulus.content.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
};

const ensurePassageDocument = (
  document: ReadingV2Document,
  passageNumber: number,
): { document: ReadingV2Document; sectionId?: ReadingV2SectionId; stimulusId?: ReadingV2StimulusId } => {
  const nextDocument = createReadingV2ManualPassage(document, passageNumber);
  const ids = getPassageIdsByNumber(nextDocument, passageNumber);
  return {
    document: nextDocument,
    ...ids,
  };
};

const normalizeThroughReadingV2EditorDocument = (document: ReadingV2Document): ReadingV2Document => {
  const normalized = normalizeStructuredDocumentThroughEditorBlocks(document);
  return normalized.document;
};

const normalizeStructuredDocumentThroughEditorBlocks = (
  document: ReadingV2Document,
): {
  readonly document: ReadingV2Document;
  readonly normalized: boolean;
  readonly issueCount: number;
  readonly firstIssue?: string;
} => {
  try {
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(document);
    const blockingIssues = validateReadingV2EditorDocument(editorDocument)
      .filter((candidate) => candidate.severity === 'error');

    if (blockingIssues.length > 0) {
      return {
        document,
        normalized: false,
        issueCount: blockingIssues.length,
        firstIssue: blockingIssues[0]?.message,
      };
    }

    return {
      document: serializeReadingV2EditorDocumentToCanonical(editorDocument),
      normalized: true,
      issueCount: 0,
    };
  } catch (error) {
    return {
      document,
      normalized: false,
      issueCount: 1,
      firstIssue: error instanceof Error ? error.message : 'Editor block normalization failed.',
    };
  }
};

const updateReadingV2PassageTitle = (
  document: ReadingV2Document,
  passageNumber: number,
  title: string,
): ReadingV2Document => {
  const ensured = ensurePassageDocument(document, passageNumber);
  const { sectionId, stimulusId } = ensured;
  const section = sectionId ? ensured.document.sections[sectionId] : undefined;
  const stimulus = stimulusId ? ensured.document.stimuli[stimulusId] : undefined;

  if (!section || !stimulus) {
    return ensured.document;
  }

  return {
    ...ensured.document,
    sections: {
      ...ensured.document.sections,
      [section.sectionId]: {
        ...section,
        title,
      },
    },
    stimuli: {
      ...ensured.document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        title,
      },
    },
  };
};

const updateReadingV2PassageText = (
  document: ReadingV2Document,
  passageNumber: number,
  text: string,
): ReadingV2Document => {
  const ensured = ensurePassageDocument(document, passageNumber);
  const { stimulusId } = ensured;
  const stimulus = stimulusId ? ensured.document.stimuli[stimulusId] : undefined;

  if (!stimulus) {
    return ensured.document;
  }

  const firstAnchorId = stimulus.anchorIds[0] ?? readingV2Ids.anchorId(`${stimulus.stimulusId}-paragraph-1`);
  const passageStimulus: ReadingV2StimulusNode = {
    ...stimulus,
    kind: 'passage',
    content: {
      kind: 'passage-content',
      paragraphs: [
        {
          anchorId: firstAnchorId,
          label: 'Paragraph 1',
          text,
        },
      ],
    },
    anchorIds: stimulus.anchorIds.includes(firstAnchorId)
      ? stimulus.anchorIds
      : [firstAnchorId, ...stimulus.anchorIds],
  };

  return normalizeThroughReadingV2EditorDocument({
    ...ensured.document,
    stimuli: {
      ...ensured.document.stimuli,
      [passageStimulus.stimulusId]: passageStimulus,
    },
    anchors: {
      ...ensured.document.anchors,
      [firstAnchorId]: ensured.document.anchors[firstAnchorId] ?? {
        anchorId: firstAnchorId,
        stimulusId: passageStimulus.stimulusId,
        kind: 'paragraph',
        label: 'Paragraph 1',
      },
    },
  });
};

const removeReadingV2ManualPassage = (
  document: ReadingV2Document,
  passageNumber: number,
): { document: ReadingV2Document; removed: boolean; reason?: string } => {
  if (document.sectionIds.length <= 1) {
    return { document, removed: false, reason: 'at-least-one-passage-required' };
  }

  const { sectionId } = getPassageIdsByNumber(document, passageNumber);
  const section = sectionId ? document.sections[sectionId] : undefined;

  if (!section) {
    return { document, removed: false, reason: 'passage-not-found' };
  }

  if (section.taskGroupIds.length > 0) {
    return { document, removed: false, reason: 'passage-has-question-groups' };
  }

  const stimulusIdsToRemove = new Set(section.stimulusIds);
  const anchorIdsToRemove = new Set(
    Object.values(document.anchors)
      .filter((anchor) => stimulusIdsToRemove.has(anchor.stimulusId))
      .map((anchor) => anchor.anchorId),
  );
  const nextSections = { ...document.sections };
  const nextStimuli = { ...document.stimuli };
  const nextAnchors = { ...document.anchors };

  delete nextSections[section.sectionId];
  stimulusIdsToRemove.forEach((stimulusId) => {
    delete nextStimuli[stimulusId];
  });
  anchorIdsToRemove.forEach((anchorId) => {
    delete nextAnchors[anchorId];
  });

  return {
    removed: true,
    document: {
      ...document,
      sectionIds: document.sectionIds.filter((currentSectionId) => currentSectionId !== section.sectionId),
      sections: nextSections,
      stimuli: nextStimuli,
      anchors: nextAnchors,
    },
  };
};

const createBlockAnchors = (
  document: ReadingV2Document,
  stimulusId: ReadingV2StimulusId,
  kind: ReadingV2Anchor['kind'],
  count: number,
): readonly ReadingV2Anchor[] => {
  const start = Object.keys(document.anchors).length + 1;

  return Array.from({ length: count }, (_, index) => {
    const anchorId = readingV2Ids.anchorId(`${stimulusId}-${kind}-${start + index}`);
    return {
      anchorId,
      stimulusId,
      kind,
      label: `${kind} ${index + 1}`,
    };
  });
};

export const convertReadingV2PassageBlock = (
  document: ReadingV2Document,
  stimulusId: ReadingV2StimulusId,
  kind: ReadingV2TeacherPassageBlockKind,
): ReadingV2Document => {
  const stimulus = document.stimuli[stimulusId];

  if (!stimulus) {
    return document;
  }

  const nextAnchors =
    kind === 'table'
      ? createBlockAnchors(document, stimulusId, 'table-cell', 2)
      : kind === 'flowchart'
        ? createBlockAnchors(document, stimulusId, 'flow-step', 2)
        : kind === 'diagram'
          ? createBlockAnchors(document, stimulusId, 'diagram-hotspot', 2)
          : createBlockAnchors(document, stimulusId, 'paragraph', 1);
  const nextAnchorIds = [
    ...stimulus.anchorIds,
    ...nextAnchors
      .map((anchor) => anchor.anchorId)
      .filter((anchorId) => !stimulus.anchorIds.includes(anchorId)),
  ];
  const nextStimulus: ReadingV2StimulusNode =
    kind === 'table'
      ? {
          ...stimulus,
          kind: 'table-shell',
          content: {
            kind: 'table-content',
            rows: [
              [
                { text: 'Heading', role: 'header' },
                { text: 'Answer', role: 'header' },
              ],
              [
                { anchorId: nextAnchors[0]?.anchorId, text: '', role: 'body' },
                { anchorId: nextAnchors[1]?.anchorId, text: '', role: 'body', isBlank: true },
              ],
            ],
          },
          anchorIds: nextAnchorIds,
        }
      : kind === 'flowchart'
        ? {
            ...stimulus,
            kind: 'flowchart-shell',
            content: {
              kind: 'flowchart-content',
              steps: [
                { anchorId: nextAnchors[0]?.anchorId, stepId: 'step-1', text: 'First step', nextStepIds: ['step-2'] },
                { anchorId: nextAnchors[1]?.anchorId, stepId: 'step-2', text: 'Second step' },
              ],
            },
            anchorIds: nextAnchorIds,
          }
        : kind === 'diagram'
          ? {
              ...stimulus,
              kind: 'diagram-shell',
              content: {
                kind: 'diagram-content',
                imageAlt: 'Diagram for this passage',
                hotspots: [
                  { anchorId: nextAnchors[0]?.anchorId ?? readingV2Ids.anchorId(`${stimulusId}-diagram-fallback-1`), label: 'Label 1', xPercent: 35, yPercent: 45 },
                  { anchorId: nextAnchors[1]?.anchorId ?? readingV2Ids.anchorId(`${stimulusId}-diagram-fallback-2`), label: 'Label 2', xPercent: 65, yPercent: 55 },
                ],
              },
              anchorIds: nextAnchorIds,
            }
          : {
              ...stimulus,
              kind: 'passage',
              content: {
                kind: 'passage-content',
                paragraphs: [
                  {
                    anchorId: nextAnchors[0]?.anchorId,
                    label: 'Paragraph 1',
                    text: '',
                  },
                ],
              },
              anchorIds: nextAnchorIds,
            };

  return {
    ...document,
    stimuli: {
      ...document.stimuli,
      [stimulusId]: nextStimulus,
    },
    anchors: {
      ...document.anchors,
      ...Object.fromEntries(nextAnchors.map((anchor) => [anchor.anchorId, anchor])),
    },
  };
};

const updateTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2Document => ({
  ...document,
  taskGroups: {
    ...document.taskGroups,
    [taskGroup.taskGroupId]: taskGroup,
  },
});

const updateInteraction = (
  document: ReadingV2Document,
  interaction: ReadingV2Interaction,
): ReadingV2Document => ({
  ...document,
  interactions: {
    ...document.interactions,
    [interaction.interactionId]: interaction,
  },
});

const removeInteraction = (
  document: ReadingV2Document,
  interactionId: string,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2Document => {
  const interaction = document.interactions[interactionId];
  const removableOptionSetId =
    (taskGroup.officialTaskType === 'multiple-choice' || taskGroup.officialTaskType === 'multiple-select')
    && interaction
    && (interaction.responseShape.kind === 'single-choice' || interaction.responseShape.kind === 'multi-select')
      ? interaction.responseShape.optionSetId
      : null;
  const removableStructuredAnchorId =
    (taskGroup.officialTaskType === 'flowchart-completion' || taskGroup.officialTaskType === 'diagram-labeling')
    && interaction?.primaryAnchorId
      ? interaction.primaryAnchorId
      : null;
  const nextInteractions = { ...document.interactions };
  const nextOptionSets = { ...document.optionSets };
  const nextStimuli = { ...document.stimuli };
  const nextAnchors = { ...document.anchors };
  delete nextInteractions[interactionId];
  if (removableOptionSetId) {
    delete nextOptionSets[removableOptionSetId];
  }
  let nextTaskGroup: ReadingV2TaskGroup = {
    ...taskGroup,
    interactionIds: taskGroup.interactionIds.filter((candidate) => candidate !== interactionId),
    optionSetRefs: removableOptionSetId
      ? taskGroup.optionSetRefs.filter((candidate) => candidate !== removableOptionSetId)
      : taskGroup.optionSetRefs,
    validationState: {
      issues: [
        ...taskGroup.validationState.issues.filter((issue) => issue.objectId !== interactionId),
        ...(taskGroup.interactionIds.length <= 1
          ? [
              {
                code: 'missing-scoring-response-shape',
                severity: 'error' as const,
                message: `Task group ${taskGroup.taskGroupId} needs at least one scoring-bearing interaction.`,
                objectId: taskGroup.taskGroupId,
              },
            ]
          : []),
      ],
    },
  };

  if (removableStructuredAnchorId) {
    const stimulusRef = taskGroup.stimulusRefs.find((candidate) =>
      candidate.anchorIds?.includes(removableStructuredAnchorId),
    );
    const stimulus = stimulusRef ? document.stimuli[stimulusRef.stimulusId] : undefined;

    if (stimulus?.content.kind === 'flowchart-content') {
      nextStimuli[stimulus.stimulusId] = {
        ...stimulus,
        anchorIds: stimulus.anchorIds.filter((anchorId) => anchorId !== removableStructuredAnchorId),
        content: {
          ...stimulus.content,
          steps: stimulus.content.steps
            .filter((step) => step.anchorId !== removableStructuredAnchorId)
            .map((step) => ({
              ...step,
              nextStepIds: step.nextStepIds?.filter((nextStepId) =>
                stimulus.content.kind === 'flowchart-content'
                  ? stimulus.content.steps.some((candidate) =>
                      candidate.stepId === nextStepId && candidate.anchorId !== removableStructuredAnchorId,
                    )
                  : true,
              ),
            })),
        },
      };
      delete nextAnchors[removableStructuredAnchorId];
      nextTaskGroup = {
        ...nextTaskGroup,
        stimulusRefs: nextTaskGroup.stimulusRefs.map((candidate) =>
          candidate.stimulusId === stimulus.stimulusId
            ? {
                ...candidate,
                anchorIds: candidate.anchorIds?.filter((anchorId) => anchorId !== removableStructuredAnchorId),
              }
            : candidate,
        ),
      };
    }

    if (stimulus?.content.kind === 'diagram-content') {
      nextStimuli[stimulus.stimulusId] = {
        ...stimulus,
        anchorIds: stimulus.anchorIds.filter((anchorId) => anchorId !== removableStructuredAnchorId),
        content: {
          ...stimulus.content,
          hotspots: stimulus.content.hotspots.filter((hotspot) => hotspot.anchorId !== removableStructuredAnchorId),
        },
      };
      delete nextAnchors[removableStructuredAnchorId];
      nextTaskGroup = {
        ...nextTaskGroup,
        stimulusRefs: nextTaskGroup.stimulusRefs.map((candidate) =>
          candidate.stimulusId === stimulus.stimulusId
            ? {
                ...candidate,
                anchorIds: candidate.anchorIds?.filter((anchorId) => anchorId !== removableStructuredAnchorId),
              }
            : candidate,
        ),
      };
    }
  }

  return updateTaskGroup(
    {
      ...document,
      interactions: nextInteractions,
      optionSets: nextOptionSets,
      stimuli: nextStimuli,
      anchors: nextAnchors,
      validationState: {
        issues: document.validationState.issues.filter((issue) => issue.objectId !== interactionId),
      },
    },
    nextTaskGroup,
  );
};

const createQuestionForTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): { document: ReadingV2Document; interactionId: ReadingV2Interaction['interactionId'] } => {
  const base = `${taskGroup.taskGroupId}-manual-question-${taskGroup.interactionIds.length + 1}`;
  let interactionId = readingV2Ids.interactionId(base);
  let suffix = 2;

  while (document.interactions[interactionId]) {
    interactionId = readingV2Ids.interactionId(`${base}-${suffix}`);
    suffix += 1;
  }

  const usesPerQuestionChoiceOptions =
    taskGroup.officialTaskType === 'multiple-choice'
    || taskGroup.officialTaskType === 'multiple-select';
  const optionSetId = usesPerQuestionChoiceOptions
    ? readingV2Ids.optionSetId(`${interactionId}-options`)
    : undefined;
  const responseShape = optionSetId
    ? createResponseShapeForTaskType(taskGroup.officialTaskType, optionSetId)
    : taskGroup.answerRule.responseShape;
  let documentWithStructuredQuestion = document;
  let taskGroupWithStructuredRef = taskGroup;
  let structuredAnchorId: ReadingV2Anchor['anchorId'] | undefined;
  let structuredPromptText = '';

  if (taskGroup.officialTaskType === 'flowchart-completion' || taskGroup.officialTaskType === 'diagram-labeling') {
    const stimulusRef = taskGroup.stimulusRefs[0];
    const stimulus = stimulusRef ? document.stimuli[stimulusRef.stimulusId] : undefined;
    const anchorKind: ReadingV2Anchor['kind'] =
      taskGroup.officialTaskType === 'flowchart-completion' ? 'flow-step' : 'diagram-hotspot';
    structuredAnchorId = readingV2Ids.anchorId(`${interactionId}-${anchorKind}`);
    const anchor: ReadingV2Anchor = {
      anchorId: structuredAnchorId,
      stimulusId: stimulus?.stimulusId ?? readingV2Ids.stimulusId(`${taskGroup.taskGroupId}-${anchorKind}-missing-stimulus`),
      kind: anchorKind,
      label: taskGroup.officialTaskType === 'flowchart-completion'
        ? `Flowchart step ${taskGroup.interactionIds.length + 1}`
        : `Diagram label ${taskGroup.interactionIds.length + 1}`,
    };

    if (stimulus?.content.kind === 'flowchart-content') {
      const currentSteps = stimulus.content.steps;
      const nextStepIndex = currentSteps.length + 1;
      const stepId = `${taskGroup.taskGroupId}-flow-step-${nextStepIndex}`;
      structuredPromptText = `Flowchart step ${taskGroup.interactionIds.length + 1}`;
      const chainedSteps = currentSteps.map((step, index) =>
        index === currentSteps.length - 1
          ? {
              ...step,
              nextStepIds: [...new Set([...(step.nextStepIds ?? []), stepId])],
            }
          : step,
      );
      const nextStimulus: ReadingV2StimulusNode = {
        ...stimulus,
        anchorIds: [...stimulus.anchorIds, structuredAnchorId],
        content: {
          ...stimulus.content,
          steps: [
            ...chainedSteps,
            {
              anchorId: structuredAnchorId,
              stepId,
              text: structuredPromptText,
            },
          ],
        },
      };
      documentWithStructuredQuestion = {
        ...documentWithStructuredQuestion,
        stimuli: {
          ...documentWithStructuredQuestion.stimuli,
          [nextStimulus.stimulusId]: nextStimulus,
        },
        anchors: {
          ...documentWithStructuredQuestion.anchors,
          [structuredAnchorId]: anchor,
        },
      };
      taskGroupWithStructuredRef = {
        ...taskGroupWithStructuredRef,
        stimulusRefs: taskGroupWithStructuredRef.stimulusRefs.map((candidate) =>
          candidate.stimulusId === nextStimulus.stimulusId
            ? {
                ...candidate,
                anchorIds: [...new Set([...(candidate.anchorIds ?? []), structuredAnchorId!])],
              }
            : candidate,
        ),
      };
    }

    if (stimulus?.content.kind === 'diagram-content') {
      const nextLabelIndex = stimulus.content.hotspots.length + 1;
      structuredPromptText = `Label ${nextLabelIndex}`;
      const nextStimulus: ReadingV2StimulusNode = {
        ...stimulus,
        anchorIds: [...stimulus.anchorIds, structuredAnchorId],
        content: {
          ...stimulus.content,
          hotspots: [
            ...stimulus.content.hotspots,
            {
              anchorId: structuredAnchorId,
              label: structuredPromptText,
              xPercent: 50,
              yPercent: 50,
            },
          ],
        },
      };
      documentWithStructuredQuestion = {
        ...documentWithStructuredQuestion,
        stimuli: {
          ...documentWithStructuredQuestion.stimuli,
          [nextStimulus.stimulusId]: nextStimulus,
        },
        anchors: {
          ...documentWithStructuredQuestion.anchors,
          [structuredAnchorId]: anchor,
        },
      };
      taskGroupWithStructuredRef = {
        ...taskGroupWithStructuredRef,
        stimulusRefs: taskGroupWithStructuredRef.stimulusRefs.map((candidate) =>
          candidate.stimulusId === nextStimulus.stimulusId
            ? {
                ...candidate,
                anchorIds: [...new Set([...(candidate.anchorIds ?? []), structuredAnchorId!])],
              }
            : candidate,
        ),
      };
    }
  }
  const interaction: ReadingV2Interaction = {
    interactionId,
    taskGroupId: taskGroup.taskGroupId,
    responseShape,
    scoringRule: {
      maxScore: 1,
      acceptableAnswers: [],
      orderMatters: responseShape.kind === 'multi-select' ? false : undefined,
    },
    reviewLabel: {},
    promptText: structuredPromptText,
    primaryAnchorId: structuredAnchorId,
    contextAnchorIds: structuredAnchorId ? [structuredAnchorId] : undefined,
    placeholder: true,
  };
  const optionSet = optionSetId
    ? createOptionSetForTaskType(taskGroup.officialTaskType, taskGroup.taskGroupId, optionSetId)
    : null;
  const nextDocument = optionSet
    ? {
        ...documentWithStructuredQuestion,
        optionSets: {
          ...documentWithStructuredQuestion.optionSets,
          [optionSet.optionSetId]: optionSet,
        },
      }
    : documentWithStructuredQuestion;

  return {
    interactionId,
    document: updateTaskGroup(
      updateInteraction(nextDocument, interaction),
      {
        ...taskGroupWithStructuredRef,
        interactionIds: [...taskGroupWithStructuredRef.interactionIds, interactionId],
        optionSetRefs: optionSet && !taskGroupWithStructuredRef.optionSetRefs.includes(optionSet.optionSetId)
          ? [...taskGroupWithStructuredRef.optionSetRefs, optionSet.optionSetId]
          : taskGroupWithStructuredRef.optionSetRefs,
        validationState: {
          issues: [
            ...taskGroup.validationState.issues,
            {
              code: 'unresolved-draft-placeholder',
              severity: 'error',
              message: `Question ${interactionId} needs an answer key.`,
              objectId: interactionId,
            },
          ],
        },
      },
    ),
  };
};

const removeTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): ReadingV2Document => {
  const nextTaskGroups = { ...document.taskGroups };
  const nextInteractions = { ...document.interactions };
  const nextOptionSets = { ...document.optionSets };
  const nextStimuli = { ...document.stimuli };
  const nextAnchors = { ...document.anchors };
  delete nextTaskGroups[taskGroup.taskGroupId];
  taskGroup.interactionIds.forEach((interactionId) => {
    delete nextInteractions[interactionId];
  });
  taskGroup.optionSetRefs.forEach((optionSetId) => {
    delete nextOptionSets[optionSetId];
  });
  const removableStimulusIds = taskGroup.stimulusRefs
    .map((stimulusRef) => stimulusRef.stimulusId)
    .filter((stimulusId) => {
      const stimulus = document.stimuli[stimulusId];
      return stimulus?.kind === 'table-shell'
        || stimulus?.kind === 'flowchart-shell'
        || stimulus?.kind === 'diagram-shell';
    });
  removableStimulusIds.forEach((stimulusId) => {
    delete nextStimuli[stimulusId];
    Object.values(document.anchors)
      .filter((anchor) => anchor.stimulusId === stimulusId)
      .forEach((anchor) => {
        delete nextAnchors[anchor.anchorId];
      });
  });

  const section = document.sections[taskGroup.sectionId];

  return {
    ...document,
    sections: section
      ? {
          ...document.sections,
          [section.sectionId]: {
            ...section,
            taskGroupIds: section.taskGroupIds.filter((candidate) => candidate !== taskGroup.taskGroupId),
            stimulusIds: section.stimulusIds.filter((stimulusId) => !removableStimulusIds.includes(stimulusId)),
          },
        }
      : document.sections,
    stimuli: nextStimuli,
    anchors: nextAnchors,
    taskGroups: nextTaskGroups,
    interactions: nextInteractions,
    optionSets: nextOptionSets,
    validationState: {
      issues: document.validationState.issues.filter((issue) => issue.objectId !== taskGroup.taskGroupId),
    },
  };
};

const makeUniqueReadingV2Id = <T extends string>(
  base: string,
  exists: (candidate: string) => boolean,
  makeId: (candidate: string) => T,
): T => {
  let suffix = 1;
  let candidate = makeId(base);

  while (exists(candidate)) {
    suffix += 1;
    candidate = makeId(`${base}-${suffix}`);
  }

  return candidate;
};

const remapOptionResponseShape = (
  responseShape: ReadingV2Interaction['responseShape'],
  optionSetIdMap: ReadonlyMap<string, ReadingV2OptionSet['optionSetId']>,
): ReadingV2Interaction['responseShape'] => {
  if (responseShape.kind === 'single-choice' || responseShape.kind === 'matching') {
    return {
      ...responseShape,
      optionSetId: optionSetIdMap.get(responseShape.optionSetId) ?? responseShape.optionSetId,
    };
  }

  if (responseShape.kind === 'multi-select') {
    return {
      ...responseShape,
      optionSetId: optionSetIdMap.get(responseShape.optionSetId) ?? responseShape.optionSetId,
    };
  }

  return responseShape;
};

const duplicateTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): { readonly document: ReadingV2Document; readonly taskGroupId: ReadingV2TaskGroupId } => {
  const section = document.sections[taskGroup.sectionId];
  const originalIndex = section?.taskGroupIds.indexOf(taskGroup.taskGroupId) ?? -1;
  const nextTaskGroupId = makeUniqueReadingV2Id(
    `${taskGroup.taskGroupId}-copy`,
    (candidate) => Boolean(document.taskGroups[candidate]),
    readingV2Ids.taskGroupId,
  );
  const structuredStimulusIds = new Set(
    taskGroup.stimulusRefs
      .map((stimulusRef) => stimulusRef.stimulusId)
      .filter((stimulusId) => {
        const stimulus = document.stimuli[stimulusId];
        return stimulus?.kind === 'table-shell'
          || stimulus?.kind === 'flowchart-shell'
          || stimulus?.kind === 'diagram-shell';
      }),
  );
  const stimulusIdMap = new Map<ReadingV2StimulusId, ReadingV2StimulusId>();
  structuredStimulusIds.forEach((stimulusId) => {
    const stimulus = document.stimuli[stimulusId];
    const stimulusSuffix = stimulus?.kind === 'table-shell'
      ? 'table'
      : stimulus?.kind === 'flowchart-shell'
        ? 'flowchart'
        : 'diagram';
    stimulusIdMap.set(
      stimulusId,
      makeUniqueReadingV2Id(
        `${nextTaskGroupId}-${stimulusSuffix}`,
        (candidate) => Boolean(document.stimuli[candidate]),
        readingV2Ids.stimulusId,
      ),
    );
  });

  const sourceAnchorIds = new Set(
    [
      ...[...structuredStimulusIds].flatMap((stimulusId) => document.stimuli[stimulusId]?.anchorIds ?? []),
      ...taskGroup.stimulusRefs.flatMap((stimulusRef) => stimulusRef.anchorIds ?? []),
      ...taskGroup.interactionIds.flatMap((interactionId) => {
        const interaction = document.interactions[interactionId];
        return interaction ? [interaction.primaryAnchorId, ...(interaction.contextAnchorIds ?? [])] : [];
      }),
    ].filter((anchorId): anchorId is ReadingV2Anchor['anchorId'] => {
      if (!anchorId) {
        return false;
      }

      const anchor = document.anchors[anchorId];
      return Boolean(anchor && structuredStimulusIds.has(anchor.stimulusId));
    }),
  );
  const anchorIdMap = new Map<ReadingV2Anchor['anchorId'], ReadingV2Anchor['anchorId']>();
  [...sourceAnchorIds].forEach((anchorId, index) => {
    anchorIdMap.set(
      anchorId,
      makeUniqueReadingV2Id(
        `${nextTaskGroupId}-anchor-${index + 1}`,
        (candidate) => Boolean(document.anchors[candidate]),
        readingV2Ids.anchorId,
      ),
    );
  });
  const remapAnchorId = (anchorId: ReadingV2Anchor['anchorId'] | undefined) =>
    anchorId ? anchorIdMap.get(anchorId) ?? anchorId : undefined;
  const remapAnchorIds = (anchorIds: readonly ReadingV2Anchor['anchorId'][] | undefined) =>
    anchorIds?.map((anchorId) => remapAnchorId(anchorId)).filter((anchorId): anchorId is ReadingV2Anchor['anchorId'] => Boolean(anchorId));

  const sourceOptionSetIds = new Set([
    ...taskGroup.optionSetRefs,
    ...taskGroup.interactionIds.flatMap((interactionId) => {
      const responseShape = document.interactions[interactionId]?.responseShape;
      return responseShape?.kind === 'single-choice' || responseShape?.kind === 'multi-select' || responseShape?.kind === 'matching'
        ? [responseShape.optionSetId]
        : [];
    }),
  ]);
  const optionSetIdMap = new Map<ReadingV2OptionSet['optionSetId'], ReadingV2OptionSet['optionSetId']>();
  [...sourceOptionSetIds].forEach((optionSetId, index) => {
    if (!document.optionSets[optionSetId]) {
      return;
    }

    optionSetIdMap.set(
      optionSetId,
      makeUniqueReadingV2Id(
        `${nextTaskGroupId}-option-set-${index + 1}`,
        (candidate) => Boolean(document.optionSets[candidate]),
        readingV2Ids.optionSetId,
      ),
    );
  });
  const interactionIdMap = new Map<ReadingV2Interaction['interactionId'], ReadingV2Interaction['interactionId']>();
  taskGroup.interactionIds.forEach((interactionId, index) => {
    interactionIdMap.set(
      interactionId,
      makeUniqueReadingV2Id(
        `${nextTaskGroupId}-question-${index + 1}`,
        (candidate) => Boolean(document.interactions[candidate]),
        readingV2Ids.interactionId,
      ),
    );
  });

  const remapTableCell = (cell: ReadingV2TableCellContent, rowIndex: number, cellIndex: number): ReadingV2TableCellContent => ({
    ...cell,
    cellId: cell.cellId ? `${nextTaskGroupId}-${cell.cellId}` : `${nextTaskGroupId}-table-cell-r${rowIndex + 1}-c${cellIndex + 1}`,
    anchorId: remapAnchorId(cell.anchorId),
    anchorIds: remapAnchorIds(cell.anchorIds),
    splitSourceCells: cell.splitSourceCells?.map((snapshot) => ({
      ...snapshot,
      anchorId: remapAnchorId(snapshot.anchorId),
      anchorIds: remapAnchorIds(snapshot.anchorIds),
    })),
  });

  const clonedStimuli = Object.fromEntries(
    [...stimulusIdMap.entries()].map(([sourceStimulusId, nextStimulusId]) => {
      const stimulus = document.stimuli[sourceStimulusId]!;
      const clonedAnchorIds = remapAnchorIds(stimulus.anchorIds) ?? [];
      let clonedStimulus: ReadingV2StimulusNode = {
        ...stimulus,
        stimulusId: nextStimulusId,
        title: stimulus.title ? `${stimulus.title} Copy` : stimulus.title,
        anchorIds: clonedAnchorIds,
      };

      if (stimulus.content.kind === 'table-content') {
        clonedStimulus = {
          ...clonedStimulus,
          content: {
            ...stimulus.content,
            rows: stimulus.content.rows.map((row, rowIndex) =>
              row.map((cell, cellIndex) => remapTableCell(cell, rowIndex, cellIndex)),
            ),
          },
        };
      }

      if (stimulus.content.kind === 'flowchart-content') {
        const stepIdMap = new Map(
          stimulus.content.steps.map((step, index) => [step.stepId, `${nextTaskGroupId}-flow-step-${index + 1}`]),
        );
        clonedStimulus = {
          ...clonedStimulus,
          content: {
            ...stimulus.content,
            steps: stimulus.content.steps.map((step) => ({
              ...step,
              stepId: stepIdMap.get(step.stepId) ?? step.stepId,
              nextStepIds: step.nextStepIds?.map((stepId) => stepIdMap.get(stepId) ?? stepId),
              anchorId: remapAnchorId(step.anchorId),
            })),
          },
        };
      }

      if (stimulus.content.kind === 'diagram-content') {
        clonedStimulus = {
          ...clonedStimulus,
          content: {
            ...stimulus.content,
            hotspots: stimulus.content.hotspots.map((hotspot) => ({
              ...hotspot,
              anchorId: remapAnchorId(hotspot.anchorId) ?? hotspot.anchorId,
            })),
          },
        };
      }

      return [nextStimulusId, clonedStimulus];
    }),
  );
  const clonedAnchors = Object.fromEntries(
    [...anchorIdMap.entries()].map(([sourceAnchorId, nextAnchorId]) => {
      const anchor = document.anchors[sourceAnchorId]!;
      return [
        nextAnchorId,
        {
          ...anchor,
          anchorId: nextAnchorId,
          stimulusId: stimulusIdMap.get(anchor.stimulusId) ?? anchor.stimulusId,
        },
      ];
    }),
  );
  const clonedOptionSets = Object.fromEntries(
    [...optionSetIdMap.entries()].map(([sourceOptionSetId, nextOptionSetId]) => {
      const optionSet = document.optionSets[sourceOptionSetId]!;
      return [
        nextOptionSetId,
        {
          ...optionSet,
          optionSetId: nextOptionSetId,
          taskGroupId: nextTaskGroupId,
          options: optionSet.options.map((option) => ({
            ...option,
            optionId: `${nextOptionSetId}-${option.label.toLowerCase()}`,
          })),
        },
      ];
    }),
  );
  const clonedInteractions = Object.fromEntries(
    taskGroup.interactionIds.flatMap((sourceInteractionId) => {
      const interaction = document.interactions[sourceInteractionId];
      const nextInteractionId = interactionIdMap.get(sourceInteractionId);

      if (!interaction || !nextInteractionId) {
        return [];
      }

      return [[
        nextInteractionId,
        {
          ...interaction,
          interactionId: nextInteractionId,
          taskGroupId: nextTaskGroupId,
          responseShape: remapOptionResponseShape(interaction.responseShape, optionSetIdMap),
          primaryAnchorId: remapAnchorId(interaction.primaryAnchorId),
          contextAnchorIds: remapAnchorIds(interaction.contextAnchorIds),
        },
      ]];
    }),
  );
  const remapValidationObjectId = (objectId: string | undefined) => {
    if (!objectId) {
      return objectId;
    }

    return interactionIdMap.get(readingV2Ids.interactionId(objectId))
      ?? anchorIdMap.get(readingV2Ids.anchorId(objectId))
      ?? optionSetIdMap.get(readingV2Ids.optionSetId(objectId))
      ?? (objectId === taskGroup.taskGroupId ? nextTaskGroupId : objectId);
  };
  const clonedTaskGroup: ReadingV2TaskGroup = {
    ...taskGroup,
    taskGroupId: nextTaskGroupId,
    groupTitle: taskGroup.groupTitle ? `${taskGroup.groupTitle} Copy` : `${getReadingV2BuildTaskTypeLabel(taskGroup.officialTaskType)} Copy`,
    instructionBlocks: taskGroup.instructionBlocks.map((block, index) => ({
      ...block,
      id: `${nextTaskGroupId}-instruction-${index + 1}`,
    })),
    answerRule: {
      ...taskGroup.answerRule,
      responseShape: remapOptionResponseShape(taskGroup.answerRule.responseShape, optionSetIdMap),
    },
    stimulusRefs: taskGroup.stimulusRefs.map((stimulusRef) => ({
      ...stimulusRef,
      stimulusId: stimulusIdMap.get(stimulusRef.stimulusId) ?? stimulusRef.stimulusId,
      anchorIds: remapAnchorIds(stimulusRef.anchorIds),
    })),
    optionSetRefs: taskGroup.optionSetRefs.map((optionSetId) => optionSetIdMap.get(optionSetId) ?? optionSetId),
    interactionIds: taskGroup.interactionIds
      .map((interactionId) => interactionIdMap.get(interactionId))
      .filter((interactionId): interactionId is ReadingV2Interaction['interactionId'] => Boolean(interactionId)),
    validationState: {
      issues: taskGroup.validationState.issues.map((issue) => ({
        ...issue,
        objectId: remapValidationObjectId(issue.objectId),
      })),
    },
  };

  return {
    taskGroupId: nextTaskGroupId,
    document: {
      ...document,
      sections: section
        ? {
            ...document.sections,
            [section.sectionId]: {
              ...section,
              taskGroupIds: [
                ...section.taskGroupIds.slice(0, originalIndex >= 0 ? originalIndex + 1 : section.taskGroupIds.length),
                nextTaskGroupId,
                ...section.taskGroupIds.slice(originalIndex >= 0 ? originalIndex + 1 : section.taskGroupIds.length),
              ],
              stimulusIds: [
                ...section.stimulusIds,
                ...[...stimulusIdMap.values()].filter((stimulusId) => !section.stimulusIds.includes(stimulusId)),
              ],
            },
          }
        : document.sections,
      stimuli: {
        ...document.stimuli,
        ...clonedStimuli,
      },
      anchors: {
        ...document.anchors,
        ...clonedAnchors,
      },
      taskGroups: {
        ...document.taskGroups,
        [nextTaskGroupId]: clonedTaskGroup,
      },
      interactions: {
        ...document.interactions,
        ...clonedInteractions,
      },
      optionSets: {
        ...document.optionSets,
        ...clonedOptionSets,
      },
    },
  };
};

const updateOptionSet = (
  document: ReadingV2Document,
  optionSet: ReadingV2OptionSet,
): ReadingV2Document => ({
  ...document,
  optionSets: {
    ...document.optionSets,
    [optionSet.optionSetId]: optionSet,
  },
});

const hasTeacherAnswerKey = (interaction: ReadingV2Interaction): boolean =>
  interaction.scoringRule.maxScore > 0
  && (interaction.scoringRule.acceptableAnswers ?? []).some((answer) => answer.trim().length > 0);

interface ReadingV2StructuredTaskStateSummary {
  readonly tableGroupCount: number;
  readonly flowchartGroupCount: number;
  readonly diagramGroupCount: number;
  readonly tableBlankCount: number;
  readonly flowchartStepCount: number;
  readonly diagramHotspotCount: number;
  readonly diagramImageCount: number;
}

const summarizeStructuredTaskState = (document: ReadingV2Document): ReadingV2StructuredTaskStateSummary => {
  const taskGroups = Object.values(document.taskGroups);
  const structuredStimuli = taskGroups
    .flatMap((taskGroup) => taskGroup.stimulusRefs.map((stimulusRef) => document.stimuli[stimulusRef.stimulusId]))
    .filter((stimulus): stimulus is ReadingV2StimulusNode => Boolean(stimulus));

  return {
    tableGroupCount: taskGroups.filter((taskGroup) => taskGroup.officialTaskType === 'table-completion').length,
    flowchartGroupCount: taskGroups.filter((taskGroup) => taskGroup.officialTaskType === 'flowchart-completion').length,
    diagramGroupCount: taskGroups.filter((taskGroup) => taskGroup.officialTaskType === 'diagram-labeling').length,
    tableBlankCount: structuredStimuli.reduce(
      (count, stimulus) =>
        count + (stimulus.content.kind === 'table-content'
          ? stimulus.content.rows.flatMap((row) => row).filter((cell) => cell.isBlank).length
          : 0),
      0,
    ),
    flowchartStepCount: structuredStimuli.reduce(
      (count, stimulus) => count + (stimulus.content.kind === 'flowchart-content' ? stimulus.content.steps.length : 0),
      0,
    ),
    diagramHotspotCount: structuredStimuli.reduce(
      (count, stimulus) => count + (stimulus.content.kind === 'diagram-content' ? stimulus.content.hotspots.length : 0),
      0,
    ),
    diagramImageCount: structuredStimuli.filter(
      (stimulus) => stimulus.content.kind === 'diagram-content' && Boolean(stimulus.content.imageUrl?.trim()),
    ).length,
  };
};

const getModeLabel = (mode: ReadingV2StudioMode): string => {
  switch (mode) {
    case 'create-blank':
      return 'Create blank';
    case 'create-from-import':
      return 'Create from import';
    case 'create-from-auto':
      return 'Create from Auto';
    case 'resume-draft':
      return 'Resume draft';
    case 'revise-published':
      return 'Edit published test';
    case 'duplicate-material':
      return 'Duplicate test';
    case 'extract-task-group-material':
      return 'Extract questions';
  }
};

export function ReadingV2StudioShell({
  mode,
  document: documentOverride,
  metadata: metadataOverrides,
  returnContext = { surface: 'direct-studio-route', label: 'Studio route' },
  host = 'page',
  operationalState = 'ready',
  importCandidate,
  draftId,
  materialId,
  revisionToken = 'local-rev-1',
  onAction,
  onSaveDraft,
  onDraftChange,
  onReloadLatest,
  onDuplicateDraft,
  onCompareDiff,
  onPreview,
  onPublish,
  onPublishSuccess,
  onExtract,
  onExit,
}: ReadingV2StudioShellProps) {
  const { writeText: writeClipboardText } = useClipboard();
  const initialDocument = useMemo(
    () => documentOverride ?? createBlankReadingV2Document(),
    [documentOverride],
  );
  const initialMetadata = useMemo(
    () => createDefaultMetadata(metadataOverrides),
    [metadataOverrides],
  );
  const [activeStep, setActiveStep] = useState<ReadingV2TeacherStudioStep>(() => getInitialStudioStep(mode));
  const [draftDocument, setDraftDocument] = useState<ReadingV2Document>(initialDocument);
  const [currentImportCandidate, setCurrentImportCandidate] = useState(importCandidate);
  const [metadata, setMetadata] = useState<ReadingV2StudioMetadata>(initialMetadata);
  const [currentDraftId, setCurrentDraftId] = useState(draftId ?? initialDocument.documentId);
  const [currentMaterialId, setCurrentMaterialId] = useState(materialId);
  const [currentRevisionToken, setCurrentRevisionToken] = useState(revisionToken);
  const [previewProjection, setPreviewProjection] = useState<ReadingV2DerivedProjection | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<
    'idle' | 'pending' | 'success' | 'failure' | 'partial-failure' | 'permission-denied' | 'retry'
  >('idle');
  const [lastPublishCommitPath, setLastPublishCommitPath] = useState<string | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<readonly ReadingV2AutoSplitDuplicateWarning[]>([]);
  const [showDeveloperDetails, setShowDeveloperDetails] = useState(false);
  const [showImportReviewDetails, setShowImportReviewDetails] = useState(false);
  const [diagnosticCopyState, setDiagnosticCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [extractionTaskGroupIds, setExtractionTaskGroupIds] = useState<readonly ReadingV2TaskGroupId[]>([]);
  const [extractionMaterialKind, setExtractionMaterialKind] = useState<
    ReadingV2StudioExtractionRequest['materialKind']
  >('extracted-task-group-material');
  const draftChangeHydratedRef = useRef(false);
  const [selectedTaskGroupId, setSelectedTaskGroupId] = useState<string | null>(() =>
    getFirstTaskGroupId(initialDocument),
  );
  const [selectedPassageId, setSelectedPassageId] = useState<ReadingV2StimulusId | null>(() =>
    getFirstPassageStimulusId(initialDocument),
  );
  const [selectedQuestionLink, setSelectedQuestionLink] = useState<ReadingV2QuestionLinkTarget | null>(null);

  const orderedTaskGroups = useMemo(
    () =>
      draftDocument.sectionIds.flatMap((sectionId) => {
        const section = draftDocument.sections[sectionId];
        return section
          ? section.taskGroupIds
              .map((taskGroupId) => draftDocument.taskGroups[taskGroupId])
              .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
          : [];
      }),
    [draftDocument],
  );
  const visibleNumbers = useMemo(
    () => deriveReadingV2VisibleNumbers(orderedTaskGroups, draftDocument.interactions),
    [draftDocument.interactions, orderedTaskGroups],
  );
  const authoringNumbers = useMemo(() => {
    let nextNumber = 1;
    return orderedTaskGroups.flatMap((taskGroup) =>
      taskGroup.interactionIds.map((interactionId) => ({
        interactionId,
        displayNumber: nextNumber++,
        label: `Q${nextNumber - 1}`,
      })),
    );
  }, [orderedTaskGroups]);
  const selectedTaskGroup = selectedTaskGroupId ? draftDocument.taskGroups[selectedTaskGroupId] : orderedTaskGroups[0];
  const selectedPassageSectionId = getSectionIdForStimulus(draftDocument, selectedPassageId);
  const selectedPassageNumber = Math.max(
    1,
    selectedPassageSectionId ? draftDocument.sectionIds.indexOf(selectedPassageSectionId) + 1 : 1,
  );
  const passageSlots = useMemo<readonly ReadingV2BuildPassageSlot[]>(() =>
    Array.from({ length: Math.max(1, draftDocument.sectionIds.length) }, (_, index) => {
      const passageNumber = index + 1;
      const sectionId = draftDocument.sectionIds[index];
      const section = sectionId ? draftDocument.sections[sectionId] : undefined;
      const stimulusId = section?.stimulusIds[0];
      const stimulus = stimulusId ? draftDocument.stimuli[stimulusId] : undefined;
      const text = getPassageText(stimulus);
      const title = stimulus?.title ?? section?.title ?? '';
      const questionGroups = section
        ? section.taskGroupIds
            .map((taskGroupId) => draftDocument.taskGroups[taskGroupId])
            .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
        : [];

      return {
        passageNumber,
        sectionId,
        stimulusId,
        title,
        text,
        hasTitle: title.trim().length > 0,
        hasText: text.trim().length > 0,
        questionGroupCount: questionGroups.length,
        questionCount: questionGroups.reduce((total, taskGroup) => total + taskGroup.interactionIds.length, 0),
      };
    }),
  [draftDocument]);
  const selectedPassageTaskGroups = selectedPassageSectionId
    ? orderedTaskGroups.filter((taskGroup) => taskGroup.sectionId === selectedPassageSectionId)
    : [];
  const canEditPassageCollection =
    metadata.materialKind !== 'reading-passage' &&
    (mode === 'create-blank' || mode === 'create-from-import' || mode === 'create-from-auto');
  const selectedExtractionTaskGroupIds =
    extractionTaskGroupIds.length > 0
      ? extractionTaskGroupIds
      : selectedTaskGroup
        ? [selectedTaskGroup.taskGroupId]
        : [];
  const validationResult = useMemo(() => validateReadingV2Draft(draftDocument), [draftDocument]);
  const teacherImportDiagnostics = useMemo(() => buildReadingV2TeacherImportDiagnostics({
    document: draftDocument,
    metadata,
    importCandidate: currentImportCandidate,
    validationResult,
    mode,
    activeStep,
    draftId: currentDraftId,
    materialId: currentMaterialId,
    revisionToken: currentRevisionToken,
  }), [
    activeStep,
    currentDraftId,
    currentImportCandidate,
    currentMaterialId,
    currentRevisionToken,
    draftDocument,
    metadata,
    mode,
    validationResult,
  ]);
  const hasImportCandidate = currentImportCandidate !== undefined;
  const blockingIssues = validationResult.blockingIssues;
  const metadataPublishBlocked = metadata.title.trim().length === 0;
  const getQuestionLabelForObject = (objectId?: string): string => {
    if (!objectId) {
      return 'A question';
    }

    let nextNumber = 1;
    for (const taskGroup of orderedTaskGroups) {
      if (taskGroup.taskGroupId === objectId) {
        return taskGroup.groupTitle ? `${taskGroup.groupTitle}` : 'A question group';
      }

      for (const interactionId of taskGroup.interactionIds) {
        if (interactionId === objectId) {
          return `Question ${nextNumber}`;
        }

        nextNumber += 1;
      }
    }

    return 'A question';
  };
  const teacherMessageForIssue = (issue: ReadingV2ValidationIssue): string => {
    switch (issue.code) {
      case 'missing-scoring-response-shape':
        if (/visible blank marker/i.test(issue.message)) {
          return `${getQuestionLabelForObject(issue.objectId)} needs a visible blank marker such as [blank] or ___.`;
        }
        return `${getQuestionLabelForObject(issue.objectId)} has no answer key.`;
      case 'unresolved-draft-placeholder':
        return `${getQuestionLabelForObject(issue.objectId)} has no answer key.`;
      case 'missing-primary-stimulus-reference':
        return `${getQuestionLabelForObject(issue.objectId)} needs to be linked to a passage.`;
      case 'unresolved-import-uncertainty':
        return 'Imported questions need review before publishing.';
      case 'deleted-stimulus-or-anchor-reference':
      case 'orphan-anchor-reference':
        return 'A question is linked to passage content that was removed or changed.';
      case 'duplicate-numbering':
        return 'Question numbering needs to be checked.';
      case 'unsupported-import-structure':
        return 'Some imported content could not be placed into the test.';
      case 'invalid-packaged-material-assembly':
        if (/wrong judgement vocabulary/i.test(issue.message)) {
          return `${getQuestionLabelForObject(issue.objectId)}: Wrong judgement vocabulary.`;
        }
        return 'The test structure needs review before publishing.';
      case 'orphan-interaction':
        return 'A question is not inside a question group.';
      default:
        return issue.message
          .replace(/canonical draft/gi, 'draft')
          .replace(/canonical/gi, 'test')
          .replace(/task group/gi, 'question group')
          .replace(/interaction/gi, 'question')
          .replace(/stimulus/gi, 'passage')
          .replace(/publish-blocking/gi, 'missing');
    }
  };
  const publishBlockingMessages = [
    ...(metadataPublishBlocked
      ? [
          {
            key: 'metadata-title-required',
            message: 'Add a test title before publishing.',
          },
        ]
      : []),
    ...(currentImportCandidate?.publishBlockingPlaceholders.map((message, index) =>
      buildImportReviewValidationMessage(message, index, currentImportCandidate.autoImportDiagnostics),
    ) ?? []),
    ...passageSlots.flatMap((passage) => [
      ...(passage.hasTitle
        ? []
        : [
            {
              key: `passage-${passage.passageNumber}-title`,
              message: `Passage ${passage.passageNumber} needs a title.`,
            },
          ]),
      ...(passage.hasText
        ? []
        : [
            {
              key: `passage-${passage.passageNumber}-text`,
              message: `Passage ${passage.passageNumber} has no passage text.`,
            },
          ]),
      ...(passage.questionGroupCount > 0
        ? []
        : [
            {
              key: `passage-${passage.passageNumber}-question-groups`,
              message: `Passage ${passage.passageNumber} has no question groups.`,
            },
          ]),
    ]),
    ...orderedTaskGroups.flatMap((taskGroup) => {
      const optionSetsForGroup = taskGroup.optionSetRefs
        .map((optionSetId) => draftDocument.optionSets[optionSetId])
        .filter((optionSet): optionSet is ReadingV2OptionSet => optionSet !== undefined);
      const emptyOptions = taskGroup.officialTaskType === 'matching-information'
        ? []
        : optionSetsForGroup.flatMap((optionSet) =>
            optionSet.options
              .filter((option) => option.text.trim().length === 0)
              .map((option) => ({
                key: `${optionSet.optionSetId}-${option.optionId}-text`,
                message: `${getReadingV2BuildTaskTypeLabel(taskGroup.officialTaskType)} option ${option.label} needs text.`,
              })),
          );
      const promptIssues = taskGroup.officialTaskType === 'table-completion'
        || taskGroup.officialTaskType === 'flowchart-completion'
        || taskGroup.officialTaskType === 'diagram-labeling'
        ? []
        : taskGroup.interactionIds
            .map((interactionId) => draftDocument.interactions[interactionId])
            .filter((interaction): interaction is ReadingV2Interaction => interaction !== undefined)
            .filter((interaction) => (interaction.promptText ?? '').trim().length === 0)
            .map((interaction) => ({
              key: `${interaction.interactionId}-prompt`,
              message: `${getQuestionLabelForObject(interaction.interactionId)} needs question text.`,
            }));

      return [
        ...emptyOptions,
        ...promptIssues,
      ];
    }),
    ...blockingIssues.map((issue) => ({
      key: `${issue.code}-${issue.objectId ?? issue.message}`,
      message: teacherMessageForIssue(issue),
    })),
  ].filter((issue, index, issues) =>
    issues.findIndex((candidate) => candidate.message === issue.message) === index,
  ) satisfies readonly ReadingV2BuildValidationMessage[];
  const stateContract = READING_V2_STUDIO_OPERATIONAL_STATES[operationalState];
  const publishBlocked = publishBlockingMessages.length > 0 || !validationResult.canPublish;
  useEffect(() => {
    setActiveStep(getInitialStudioStep(mode));
  }, [mode]);

  useEffect(() => {
    setDraftDocument(initialDocument);
    setCurrentDraftId(draftId ?? initialDocument.documentId);
    setSelectedTaskGroupId(getFirstTaskGroupId(initialDocument));
    setSelectedPassageId(getFirstPassageStimulusId(initialDocument));
    setSelectedQuestionLink(null);
    setExtractionTaskGroupIds([]);
  }, [draftId, initialDocument]);

  useEffect(() => {
    setCurrentMaterialId(materialId);
  }, [materialId]);

  useEffect(() => {
    setCurrentImportCandidate(importCandidate);
  }, [importCandidate]);

  useEffect(() => {
    setMetadata(initialMetadata);
  }, [initialMetadata]);

  useEffect(() => {
    setCurrentRevisionToken(revisionToken);
  }, [revisionToken]);

  useEffect(() => {
    setDiagnosticCopyState('idle');
  }, [currentImportCandidate, draftDocument, metadata]);

  useEffect(() => {
    logStudioDiagnostic('studio_context_ready', {
      mode,
      host,
      activeStep,
      taskGroupCount: orderedTaskGroups.length,
      validationIssueCount: validationResult.issues.length,
      publishBlocked,
    });
  }, [activeStep, host, mode, orderedTaskGroups.length, publishBlocked, validationResult.issues.length]);

  const emitAction = (actionName: string, metadataPatch: Partial<ReadingV2StudioActionMetadata> = {}) => {
    onAction?.(actionName, {
      mode,
      tab: activeStep,
      step: activeStep,
      host,
      draftId: currentDraftId,
      materialId: currentMaterialId,
      returnSurface: returnContext.surface,
      returnLabel: returnContext.label,
      revisionToken: currentRevisionToken,
      ...metadataPatch,
    });
  };

  const workflowSnapshot = (): ReadingV2StudioWorkflowSnapshot => ({
    draftId: currentDraftId,
    materialId: currentMaterialId,
    document: draftDocument,
    metadata,
    revisionToken: currentRevisionToken,
    returnContext: returnContext.surface,
  });

  const emitDuplicateWarningAction = (
    actionName: string,
    match: ReadingV2DuplicateMatch,
    warning: ReadingV2AutoSplitDuplicateWarning,
  ) => {
    emitAction(actionName, {
      passageMaterialId: warning.passageMaterialId,
      materialId: match.materialId,
      duplicateMaterialId: match.materialId,
      duplicateState: match.state,
      similarity: match.combinedSimilarityPercent,
      combinedSimilarityPercent: match.combinedSimilarityPercent,
      source: 'studio_publish_duplicate_warning',
    });

    const auditActionByFeatureAction = {
      reading_passage_duplicate_use_existing: 'reading_duplicate_warning_existing_used',
      reading_passage_duplicate_restore_and_use: 'reading_duplicate_warning_restore_used',
      reading_passage_duplicate_create_new_anyway: 'reading_duplicate_warning_bypassed',
    } as const;
    const auditAction = auditActionByFeatureAction[actionName as keyof typeof auditActionByFeatureAction];

    if (!auditAction) {
      return;
    }

    const createdAt = new Date().toISOString();
    const actorUserId = String(metadata.ownerId || 'current-teacher');
    const eventId = `${currentDraftId}:${auditAction}:${warning.passageMaterialId}:${match.materialId}:${Date.now()}`;

    void writeReadingV2AuditEvent({
      eventId,
      createdAt,
      actorUserId,
      actorRole: 'teacher',
      action: auditAction,
      entityType: 'duplicate-warning',
      entityId: `${warning.passageMaterialId}:${match.materialId}`,
      ownerId: actorUserId,
      materialId: warning.passageMaterialId,
      titleSnapshot: match.title,
      before: {
        duplicateMaterialId: match.materialId,
        duplicateState: match.state,
        similarity: match.combinedSimilarityPercent,
      },
      after: {
        decision: actionName,
      },
      correlationId: eventId,
      sourceFeatureId: 'readingV2Studio',
      sourceRoute: `reading-v2-studio:${returnContext.surface}`,
    }).catch((error) => {
      emitAction('reading_passage_duplicate_audit_failed', {
        passageMaterialId: warning.passageMaterialId,
        duplicateMaterialId: match.materialId,
        message: error instanceof Error ? error.message : 'unknown',
        source: 'studio_publish_duplicate_warning',
      });
    });
  };

  const handleCopyParsingDiagnostics = async () => {
    const diagnostics = buildReadingV2StudioParsingDiagnostics({
      document: draftDocument,
      metadata,
      importCandidate: currentImportCandidate,
      validationResult,
      mode,
      activeStep,
      draftId: currentDraftId,
      materialId: currentMaterialId,
      revisionToken: currentRevisionToken,
    });
    const text = formatReadingV2StudioParsingDiagnostics(diagnostics);
    const copied = await writeClipboardText(text);
    setDiagnosticCopyState(copied ? 'copied' : 'failed');
    setWorkflowMessage(copied ? 'Parsing diagnostics copied.' : 'Parsing diagnostics could not be copied.');
    logStudioDiagnostic('parsing_diagnostics_exported', {
      copied,
      mode,
      activeStep,
      importSourceKind: currentImportCandidate?.sourceKind ?? 'none',
      validationIssueCount: validationResult.issues.length,
    });
    emitAction('copyParsingDiagnostics', {
      outcome: copied ? 'success' : 'failure',
      importSourceKind: currentImportCandidate?.sourceKind ?? 'none',
      validationIssueCount: validationResult.issues.length,
    });
  };

  useEffect(() => {
    if (!draftChangeHydratedRef.current) {
      draftChangeHydratedRef.current = true;
      return;
    }

    onDraftChange?.(workflowSnapshot());
  }, [draftDocument, metadata]);

  const handleSaveDraft = async () => {
    emitAction('saveDraft', { outcome: 'requested', revisionToken: currentRevisionToken });

    if (!onSaveDraft) {
      return;
    }

    try {
      const result = await onSaveDraft(workflowSnapshot());
      setCurrentRevisionToken(result.revisionToken);
      setWorkflowMessage('Draft saved.');
      emitAction('saveDraft', { outcome: 'success', revisionToken: result.revisionToken });
    } catch {
      setWorkflowMessage('Draft save failed. Open Advanced Details if this keeps happening.');
      emitAction('saveDraft', { outcome: 'failure', revisionToken: currentRevisionToken });
    }
  };

  const handleReloadLatest = async () => {
    emitAction('conflictRecovery', { outcome: 'reload-latest-requested' });

    if (!onReloadLatest) {
      setWorkflowMessage('Reload latest needs a draft repository handler.');
      return;
    }

    try {
      const result = await onReloadLatest(workflowSnapshot());
      setDraftDocument(result.document);
      setCurrentRevisionToken(result.revisionToken);
      setWorkflowMessage('Reloaded the latest persisted draft revision.');
      emitAction('conflictRecovery', { outcome: 'reload-latest-success', revisionToken: result.revisionToken });
    } catch {
      setWorkflowMessage('Reload latest failed. The current draft view was not changed.');
      emitAction('conflictRecovery', { outcome: 'reload-latest-failure' });
    }
  };

  const handleDuplicateDraft = async () => {
    emitAction('conflictRecovery', { outcome: 'duplicate-draft-requested' });

    if (!onDuplicateDraft) {
      setWorkflowMessage('Duplicate draft needs a draft repository handler.');
      return;
    }

    try {
      const result = await onDuplicateDraft(workflowSnapshot());
      setCurrentDraftId(result.draftId);
      if (result.materialId) {
        setCurrentMaterialId(result.materialId);
      }
      setCurrentRevisionToken(result.revisionToken);
      setWorkflowMessage(`Duplicated draft ${result.draftId}.`);
      emitAction('conflictRecovery', {
        outcome: 'duplicate-draft-success',
        draftId: result.draftId,
        revisionToken: result.revisionToken,
      });
    } catch {
      setWorkflowMessage('Duplicate draft failed. The source draft was not changed.');
      emitAction('conflictRecovery', { outcome: 'duplicate-draft-failure' });
    }
  };

  const handleCompareDiff = async () => {
    emitAction('conflictRecovery', { outcome: 'compare-diff-requested' });

    if (!onCompareDiff) {
      setWorkflowMessage('Compare diff needs a draft repository handler.');
      return;
    }

    try {
      const result = await onCompareDiff(workflowSnapshot());
      setWorkflowMessage(
        `Compared with ${result.latestRevisionToken ?? 'missing latest revision'}: title changed ${String(result.changedTitle)}, validation changed ${String(result.changedValidationIssueCount)}.`,
      );
      emitAction('conflictRecovery', {
        outcome: 'compare-diff-success',
        revisionToken: result.latestRevisionToken,
      });
    } catch {
      setWorkflowMessage('Compare diff failed. The current draft view was not changed.');
      emitAction('conflictRecovery', { outcome: 'compare-diff-failure' });
    }
  };

  const handlePreview = async () => {
    emitAction('preview', { outcome: 'requested' });

    if (!onPreview) {
      emitAction('preview', { outcome: 'teacher-local-only' });
      return;
    }

    try {
      const projection = await onPreview(workflowSnapshot());
      setPreviewProjection(projection);
      setWorkflowMessage('Preview generated from the current test.');
      emitAction('preview', { outcome: 'teacher-local-only' });
    } catch {
      setWorkflowMessage('Preview failed because the current draft cannot generate a safe projection.');
      emitAction('preview', { outcome: 'failure' });
    }
  };

  const handlePublish = async () => {
    emitAction('publish', { outcome: publishBlocked ? 'blocked' : 'requested' });

    if (publishBlocked) {
      setWorkflowMessage('Publish blocked. Fix the checklist items before publishing.');
      setPublishState('failure');
      return;
    }

    if (!onPublish) {
      emitAction('publish', { outcome: 'handoff-to-task-5' });
      setWorkflowMessage('Publish needs a configured publish connection before students can use this test.');
      setPublishState('retry');
      return;
    }

    setPublishState('pending');
    setWorkflowMessage('Publishing. Preparing the test for students.');

    try {
      const snapshot = workflowSnapshot();
      const result = await onPublish(snapshot);
      const nextDuplicateWarnings = result.duplicateWarnings ?? [];
      setLastPublishCommitPath(result.firebaseCommitPath ?? null);
      setDuplicateWarnings(nextDuplicateWarnings);
      nextDuplicateWarnings.forEach((warning) => {
        warning.result.matches.forEach((match) => {
          emitDuplicateWarningAction('reading_passage_duplicate_warning_shown', match, warning);
        });
      });

      if (result.publishOutcome === 'partial-failure') {
        setPublishState('partial-failure');
        setWorkflowMessage('Publish partially failed. You can retry without changing the draft.');
        emitAction('publish', { outcome: 'partial-failure' });
        return;
      }

      setPublishState('success');
      setWorkflowMessage('Published successfully.');
      emitAction('publish', { outcome: 'success' });
      onPublishSuccess?.(snapshot, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const permissionDenied = /permission|denied/i.test(message);
      if (import.meta.env.DEV && !import.meta.env.VITEST) {
        console.error('[Diag][ReadingV2Studio] publish_failed', {
          message,
          name: error instanceof Error ? error.name : typeof error,
          materialId,
          draftId,
        });
      }
      setPublishState(permissionDenied ? 'permission-denied' : 'failure');
      setWorkflowMessage(
        permissionDenied
          ? 'Publish permission denied. The previous live snapshot remains active and the write can be retried.'
          : 'Publish failed. The previous live snapshot remains active.',
      );
      emitAction('publish', { outcome: permissionDenied ? 'permission-denied' : 'failure' });
    }
  };

  const toggleExtractionTaskGroup = (taskGroupId: ReadingV2TaskGroupId, checked: boolean) => {
    setExtractionTaskGroupIds((current) => {
      const currentSet = new Set(current);
      if (checked) {
        currentSet.add(taskGroupId);
      } else {
        currentSet.delete(taskGroupId);
      }
      return Array.from(currentSet).map(readingV2Ids.taskGroupId);
    });
  };

  const handleExtract = async () => {
    emitAction('extractTaskGroupMaterial', { outcome: 'requested' });

    if (!onExtract) {
      setWorkflowMessage('Extraction needs a task-group material adapter.');
      emitAction('extractTaskGroupMaterial', { outcome: 'adapter-missing' });
      return;
    }

    try {
      const result = await onExtract(workflowSnapshot(), {
        taskGroupIds: selectedExtractionTaskGroupIds.map(readingV2Ids.taskGroupId),
        materialKind: extractionMaterialKind,
      });
      setCurrentDraftId(result.draftId);
      if (result.materialId) {
        setCurrentMaterialId(result.materialId);
      }
      setDraftDocument(result.document);
      setCurrentRevisionToken(result.revisionToken);
      setSelectedTaskGroupId(getFirstTaskGroupId(result.document));
      setMetadata((current) => ({
        ...current,
        title: result.document.title,
        materialKind: extractionMaterialKind,
        provenanceSummary: `Extracted from ${draftDocument.title}`,
      }));
      setWorkflowMessage(`Opened extracted draft ${result.draftId}. Source material remains unchanged.`);
      emitAction('extractTaskGroupMaterial', {
        outcome: 'opened-extracted-draft',
        draftId: result.draftId,
        revisionToken: result.revisionToken,
      });
    } catch {
      setWorkflowMessage('Extraction failed. The source material remains unchanged.');
      emitAction('extractTaskGroupMaterial', { outcome: 'failure' });
    }
  };

  const handleJumpImportDiagnostic = (target: ReadingV2TeacherImportDiagnosticTarget) => {
    const objectId = target.objectId;
    const interactionFromQuestionNumber = target.questionNumber
      ? visibleNumbers.find((entry) => entry.displayNumber === target.questionNumber)?.interactionId
      : undefined;
    const interactionId = objectId && draftDocument.interactions[objectId]
      ? objectId
      : interactionFromQuestionNumber;
    const taskGroupId = interactionId
      ? draftDocument.interactions[interactionId]?.taskGroupId
      : objectId && draftDocument.taskGroups[objectId]
        ? readingV2Ids.taskGroupId(objectId)
        : objectId && draftDocument.optionSets[objectId]
          ? draftDocument.optionSets[objectId]?.taskGroupId
          : undefined;
    const taskGroup = taskGroupId ? draftDocument.taskGroups[taskGroupId] : undefined;
    const anchorStimulusId = objectId && draftDocument.anchors[objectId]
      ? draftDocument.anchors[objectId]?.stimulusId
      : undefined;
    const explicitStimulusId = objectId && draftDocument.stimuli[objectId]
      ? readingV2Ids.stimulusId(objectId)
      : undefined;
    const sectionId = taskGroup?.sectionId
      ?? (anchorStimulusId ? getSectionIdForStimulus(draftDocument, anchorStimulusId) : undefined)
      ?? (explicitStimulusId ? getSectionIdForStimulus(draftDocument, explicitStimulusId) : undefined)
      ?? (objectId && draftDocument.sections[objectId] ? readingV2Ids.sectionId(objectId) : undefined);
    const stimulusId = explicitStimulusId
      ?? anchorStimulusId
      ?? (sectionId ? draftDocument.sections[sectionId]?.stimulusIds[0] : undefined);
    const nextStep = target.kind === 'publish'
      ? 'Publish'
      : target.kind === 'source' || target.kind === 'section' || target.kind === 'stimulus' || target.kind === 'anchor'
        ? 'Passages'
        : target.step;

    setActiveStep(nextStep);
    if (taskGroupId) {
      setSelectedTaskGroupId(taskGroupId);
    }
    if (stimulusId) {
      setSelectedPassageId(stimulusId);
    }
    setSelectedQuestionLink(
      interactionId || target.kind === 'anchor'
        ? {
            anchorId: target.kind === 'anchor' && objectId ? objectId : draftDocument.interactions[interactionId ?? '']?.primaryAnchorId,
            interactionId,
            taskGroupId,
            source: 'diagnostic',
          }
        : null,
    );
    setWorkflowMessage(
      target.kind === 'answer-key-line' && target.sourceLine
        ? `Opened answer-key issue from line ${target.sourceLine}.`
        : 'Opened the related review area.',
    );
    emitAction('jumpImportDiagnostic', {
      outcome: target.kind,
      targetObjectId: target.objectId,
      targetStep: nextStep,
    });
  };

  const handleQuestionLinkNavigation = (target: ReadingV2QuestionLinkTarget) => {
    const interaction = target.interactionId ? draftDocument.interactions[target.interactionId] : undefined;
    const taskGroupId = target.taskGroupId ?? interaction?.taskGroupId;
    const taskGroup = taskGroupId ? draftDocument.taskGroups[taskGroupId] : undefined;
    const anchor = target.anchorId ? draftDocument.anchors[target.anchorId] : undefined;
    const sectionId = anchor?.stimulusId
      ? getSectionIdForStimulus(draftDocument, anchor.stimulusId)
      : taskGroup?.sectionId;
    const stimulusId = anchor?.stimulusId ?? (sectionId ? draftDocument.sections[sectionId]?.stimulusIds[0] : undefined);

    setSelectedQuestionLink({
      ...target,
      interactionId: target.interactionId ?? interaction?.interactionId,
      taskGroupId,
    });

    if (taskGroupId) {
      setSelectedTaskGroupId(taskGroupId);
    }

    if (stimulusId) {
      setSelectedPassageId(stimulusId);
    }

    setWorkflowMessage('Highlighted linked question and source block.');
    emitAction('questionLinkNavigate', {
      outcome: target.source,
      anchorId: target.anchorId,
      interactionId: target.interactionId,
      taskGroupId,
    });
  };

  const handleQuestionLinkRepair = (
    outcome: string,
    metadataPatch: Record<string, string | number | boolean | undefined> = {},
  ) => {
    setWorkflowMessage('Question link repaired. Validate to confirm publish readiness.');
    emitAction('questionLinkRepair', {
      outcome,
      ...metadataPatch,
    });
  };

  const handleAnalyzeImportSource = (candidate: ReadingV2ImportCandidate) => {
    setCurrentImportCandidate(candidate);
    logStudioDiagnostic('import_source_analyzed', {
      sourceKind: candidate.sourceKind,
      fileName: candidate.fileName,
      rawTextCharCount: candidate.rawText?.length ?? 0,
      answerKeyCharCount: candidate.answerKeyText?.length ?? 0,
      evidenceCount: candidate.evidence.length,
      uncertaintyCount: candidate.uncertaintyMarkers.length,
      blockerCount: candidate.publishBlockingPlaceholders.length,
    });
    emitAction('inspectImportEvidence', { outcome: 'source-analyzed' });
  };

  const handleAcceptImport = (candidate: ReadingV2ImportCandidate) => {
    try {
      const result = normalizeReadingV2ImportCandidate(candidate);
      const editorNormalization = normalizeStructuredDocumentThroughEditorBlocks(result.document);
      const normalizedDocument = editorNormalization.document;
      const normalizedTaskGroups = Object.values(normalizedDocument.taskGroups);
      const normalizedInteractions = Object.values(normalizedDocument.interactions);
      logStudioDiagnostic('import_normalized_to_draft', {
        passageCount: normalizedDocument.sectionIds.length,
        taskGroupCount: normalizedTaskGroups.length,
        questionCount: normalizedInteractions.length,
        taskTypeCounts: normalizedTaskGroups.reduce<Record<string, number>>((counts, taskGroup) => {
          counts[taskGroup.officialTaskType] = (counts[taskGroup.officialTaskType] ?? 0) + 1;
          return counts;
        }, {}),
        answeredQuestionCount: normalizedInteractions.filter((interaction) => hasTeacherAnswerKey(interaction)).length,
        placeholderQuestionCount: normalizedInteractions.filter((interaction) => interaction.placeholder === true).length,
        importEvidenceCount: result.importEvidenceIds.length,
        editorBlockNormalized: editorNormalization.normalized,
        editorBlockIssueCount: editorNormalization.issueCount,
        firstEditorBlockIssue: editorNormalization.firstIssue,
      });
      setDraftDocument(normalizedDocument);
      setSelectedTaskGroupId(getFirstTaskGroupId(normalizedDocument));
      setSelectedPassageId(getFirstPassageStimulusId(normalizedDocument));
      setMetadata((current) => ({
        ...current,
        title: current.title.trim().length > 0 ? current.title : normalizedDocument.title,
        provenanceSummary: `Imported from ${candidate.fileName ?? candidate.sourceKind}`,
      }));
      setCurrentImportCandidate(undefined);
      setShowImportReviewDetails(false);
      setWorkflowMessage('Import added to your draft. Review questions and answer keys before publishing.');
      emitAction('importMaterial', { outcome: 'normalized-to-canonical-draft' });
    } catch {
      setWorkflowMessage('Import failed closed. Choose a supported source or repair the pasted content.');
      emitAction('importMaterial', { outcome: 'failed-closed' });
    }
  };

  const handleValidate = () => {
    const outcome = publishBlocked ? 'blocked' : 'clear';
    setWorkflowMessage(
      publishBlocked
        ? 'Publish is blocked until required issues are fixed.'
        : 'No required issues found.',
    );
    emitAction('validate', { outcome });
  };

  const handleToggleImportReviewDetails = () => {
    setShowImportReviewDetails((current) => {
      const next = !current;
      emitAction('toggleImportReviewDetails', { outcome: next ? 'expanded' : 'collapsed' });
      return next;
    });
  };

  const handleSelectPassage = (passageNumber: number) => {
    const ensured = ensurePassageDocument(draftDocument, passageNumber);
    setDraftDocument(ensured.document);
    setSelectedPassageId(ensured.stimulusId ?? getFirstPassageStimulusId(ensured.document));
    setSelectedTaskGroupId(ensured.sectionId ? ensured.document.sections[ensured.sectionId]?.taskGroupIds[0] ?? null : null);
    emitAction('metadataEdit', { outcome: `passage-${passageNumber}-selected` });
  };

  const handleAddPassage = () => {
    const passageNumber = Math.max(1, draftDocument.sectionIds.length) + 1;
    const ensured = ensurePassageDocument(draftDocument, passageNumber);
    setDraftDocument(ensured.document);
    setSelectedPassageId(ensured.stimulusId ?? getFirstPassageStimulusId(ensured.document));
    setSelectedTaskGroupId(null);
    setWorkflowMessage(`Passage ${passageNumber} added.`);
    emitAction('metadataEdit', { outcome: `passage-${passageNumber}-added` });
  };

  const handleRemovePassage = (passageNumber: number) => {
    const result = removeReadingV2ManualPassage(draftDocument, passageNumber);

    if (!result.removed) {
      setWorkflowMessage(
        result.reason === 'passage-has-question-groups'
          ? 'Remove the question groups in this passage before deleting it.'
          : 'At least one passage is required.',
      );
      emitAction('metadataEdit', { outcome: `passage-${passageNumber}-remove-blocked`, reason: result.reason });
      return;
    }

    const nextPassageNumber = Math.min(passageNumber, Math.max(1, result.document.sectionIds.length));
    const ids = getPassageIdsByNumber(result.document, nextPassageNumber);
    setDraftDocument(result.document);
    setSelectedPassageId(ids.stimulusId ?? getFirstPassageStimulusId(result.document));
    setSelectedTaskGroupId(ids.sectionId ? result.document.sections[ids.sectionId]?.taskGroupIds[0] ?? null : null);
    setWorkflowMessage(`Passage ${passageNumber} removed.`);
    emitAction('metadataEdit', { outcome: `passage-${passageNumber}-removed` });
  };

  const handlePassageTitleChange = (passageNumber: number, title: string) => {
    const nextDocument = updateReadingV2PassageTitle(draftDocument, passageNumber, title);
    const ids = getPassageIdsByNumber(nextDocument, passageNumber);
    setDraftDocument(nextDocument);
    setSelectedPassageId(ids.stimulusId ?? selectedPassageId);
    emitAction('metadataEdit', { outcome: `passage-${passageNumber}-title-updated` });
  };

  const handlePassageTextChange = (passageNumber: number, text: string) => {
    const nextDocument = updateReadingV2PassageText(draftDocument, passageNumber, text);
    const ids = getPassageIdsByNumber(nextDocument, passageNumber);
    setDraftDocument(nextDocument);
    setSelectedPassageId(ids.stimulusId ?? selectedPassageId);
    logStudioDiagnostic('passage_editor_text_changed', {
      passageNumber,
      stimulusId: ids.stimulusId,
      characterCount: text.length,
      paragraphCount: text.trim().length > 0 ? text.split(/\n{2,}/).length : 0,
      hasInlineFormattingMarkers: /\*\*[^*]+\*\*|__[^_]+__|_[^_\n]+_/.test(text),
    });
    emitAction('metadataEdit', { outcome: `passage-${passageNumber}-text-updated` });
  };

  const handleAddTaskGroup = (taskType: ReadingV2CanonicalTaskType) => {
    const sectionId = getSectionIdForStimulus(draftDocument, selectedPassageId);
    const nextDocument = createManualReadingV2TaskGroup(draftDocument, taskType, sectionId);
    const nextGroupId = Object.keys(nextDocument.taskGroups).find((taskGroupId) => !draftDocument.taskGroups[taskGroupId]);
    const nextGroup = nextGroupId ? nextDocument.taskGroups[nextGroupId] : undefined;
    setDraftDocument(nextDocument);
    setSelectedTaskGroupId(nextGroupId ?? selectedTaskGroupId);
    setWorkflowMessage(`${getReadingV2BuildTaskTypeLabel(taskType)} question group added.`);
    logStudioDiagnostic('task_group_created', {
      taskType,
      taskGroupId: nextGroupId,
      questionCount: nextGroup?.interactionIds.length ?? 0,
      ...summarizeStructuredTaskState(nextDocument),
    });
    emitAction('answerKeyEdit', { outcome: 'manual-question-group-created', taskType });
  };

  const handleReorderTaskGroup = (direction: 'up' | 'down') => {
    const firstSectionId = draftDocument.sectionIds[0];
    const section = firstSectionId ? draftDocument.sections[firstSectionId] : undefined;

    if (!firstSectionId || !section || !selectedTaskGroupId) {
      return;
    }

    const currentIndex = section.taskGroupIds.indexOf(readingV2Ids.taskGroupId(selectedTaskGroupId));
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const nextDocument = reorderReadingV2TopLevelTaskGroups(draftDocument, firstSectionId, currentIndex, nextIndex);
    setDraftDocument(nextDocument);
    emitAction('answerKeyEdit', { outcome: `task-group-moved-${direction}` });
  };

  const handleAddQuestionToGroup = (taskGroup: ReadingV2TaskGroup) => {
    const result = createQuestionForTaskGroup(draftDocument, taskGroup);
    setDraftDocument(result.document);
    setSelectedTaskGroupId(taskGroup.taskGroupId);
    setWorkflowMessage('Question added to group.');
    emitAction('answerKeyEdit', { outcome: 'question-added' });
  };

  const handleDeleteQuestionGroup = (taskGroup: ReadingV2TaskGroup) => {
    const nextDocument = removeTaskGroup(draftDocument, taskGroup);
    const nextSelectedTaskGroupId = getFirstTaskGroupId(nextDocument);
    setDraftDocument(nextDocument);
    setSelectedTaskGroupId(nextSelectedTaskGroupId);
    setWorkflowMessage(`${getReadingV2BuildTaskTypeLabel(taskGroup.officialTaskType)} question group deleted.`);
    emitAction('answerKeyEdit', { outcome: 'question-group-deleted', taskType: taskGroup.officialTaskType });
  };

  const handleDuplicateQuestionGroup = (taskGroup: ReadingV2TaskGroup) => {
    const result = duplicateTaskGroup(draftDocument, taskGroup);
    const nextGroup = result.document.taskGroups[result.taskGroupId];
    setDraftDocument(result.document);
    setSelectedTaskGroupId(result.taskGroupId);
    setWorkflowMessage(`${getReadingV2BuildTaskTypeLabel(taskGroup.officialTaskType)} question group duplicated.`);
    logStudioDiagnostic('task_group_duplicated', {
      sourceTaskGroupId: taskGroup.taskGroupId,
      taskGroupId: result.taskGroupId,
      taskType: taskGroup.officialTaskType,
      questionCount: nextGroup?.interactionIds.length ?? 0,
      ...summarizeStructuredTaskState(result.document),
    });
    emitAction('answerKeyEdit', { outcome: 'question-group-duplicated', taskType: taskGroup.officialTaskType });
  };

  const handleDocumentChange = (nextDocument: ReadingV2Document) => {
    const normalization = normalizeStructuredDocumentThroughEditorBlocks(nextDocument);
    const structuredState = summarizeStructuredTaskState(normalization.document);
    if (
      structuredState.tableGroupCount > 0
      || structuredState.flowchartGroupCount > 0
      || structuredState.diagramGroupCount > 0
    ) {
      logStudioDiagnostic('structured_document_changed', {
        ...structuredState,
        editorBlockNormalized: normalization.normalized,
        editorBlockIssueCount: normalization.issueCount,
        firstEditorBlockIssue: normalization.firstIssue,
      });
    }
    setDraftDocument(normalization.document);
  };

  const handleOpenQuestionGroupModal = () => {
    emitAction('openModal', { outcome: 'add-question-group-opened' });
  };

  const handleCloseQuestionGroupModal = () => {
    emitAction('openModal', { outcome: 'add-question-group-closed' });
  };

  const handleExitWorkspace = () => {
    emitAction('exitStudio', { outcome: 'requested' });
    onExit?.();
  };

  const handleReorderStimulus = (
    sectionId: string,
    stimulusId: string,
    direction: 'up' | 'down',
  ) => {
    const section = draftDocument.sections[sectionId];

    if (!section) {
      return;
    }

    const currentIndex = section.stimulusIds.indexOf(readingV2Ids.stimulusId(stimulusId));
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= section.stimulusIds.length) {
      return;
    }

    setDraftDocument(reorderReadingV2LinkedStimuli(draftDocument, sectionId, currentIndex, nextIndex));
    emitAction('metadataEdit', { outcome: `stimulus-moved-${direction}` });
  };

  const handleTaskGroupChange = (taskGroup: ReadingV2TaskGroup) => {
    setDraftDocument((current) => updateTaskGroup(current, taskGroup));
    emitAction('answerKeyEdit', { outcome: 'task-group-updated' });
  };

  const handleInteractionChange = (interaction: ReadingV2Interaction) => {
    const originalTaskGroup = draftDocument.taskGroups[interaction.taskGroupId];
    logStudioDiagnostic('interaction_answer_key_changed', {
      taskType: originalTaskGroup?.officialTaskType,
      taskGroupId: interaction.taskGroupId,
      interactionId: interaction.interactionId,
      answerCount: interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0,
      placeholder: interaction.placeholder === true,
    });
    setDraftDocument((current) => {
      const nextInteraction = hasTeacherAnswerKey(interaction)
        ? { ...interaction, placeholder: false }
        : interaction;
      const taskGroup = current.taskGroups[nextInteraction.taskGroupId];
      const nextDocument = {
        ...current,
        validationState: {
          issues: current.validationState.issues.filter((issue) => issue.objectId !== nextInteraction.interactionId),
        },
      };

      if (!taskGroup) {
        return updateInteraction(nextDocument, nextInteraction);
      }

      return updateInteraction(
        updateTaskGroup(nextDocument, {
          ...taskGroup,
          validationState: {
            issues: taskGroup.validationState.issues.filter((issue) => issue.objectId !== nextInteraction.interactionId),
          },
        }),
        nextInteraction,
      );
    });
    emitAction('answerKeyEdit', { outcome: 'interaction-updated' });
  };

  const handleOperationalStateAction = () => {
    emitAction('operationalStateAction', {
      outcome: operationalState,
    });
  };

  const handleTableCompletionAction = (
    outcome: string,
    metadata: Record<string, string | number | boolean | undefined> = {},
  ) => {
    logStudioDiagnostic('table_completion_action', {
      outcome,
      taskGroupId: metadata.taskGroupId,
      rowCount: metadata.rowCount,
      blankCount: metadata.blankCount,
      selectedCellCount: metadata.selectedCellCount,
    });
    emitAction('tableCompletionEdit', {
      outcome,
      ...metadata,
    });
  };

  const handlePassageEditorAction = (
    action: string,
    actionMetadata: Record<string, string | number | boolean | undefined> = {},
  ) => {
    logStudioDiagnostic('passage_editor_action', {
      action,
      passageNumber: actionMetadata.passageNumber,
      stimulusId: actionMetadata.stimulusId,
    });
    emitAction('passageEditorAction', { outcome: action, ...actionMetadata });
  };

  const handleBuildWorkspaceMetadataChange = (nextMetadata: ReadingV2StudioMetadata) => {
    setMetadata(nextMetadata);
    emitAction('metadataEdit', {
      outcome: 'workspaceVisibilityChange',
      visibility: nextMetadata.visibility,
    });
  };

  return (
    <main className="reading-v2-studio reading-v2-studio--build" data-host={host} data-mode={mode}>
      <ReadingV2BuildWorkspace
        document={draftDocument}
        metadata={metadata}
        modeLabel={getModeLabel(mode)}
        passageSlots={passageSlots}
        selectedPassageNumber={selectedPassageNumber}
        selectedPassageTaskGroups={selectedPassageTaskGroups}
        allTaskGroups={orderedTaskGroups}
        interactions={draftDocument.interactions}
        optionSets={draftDocument.optionSets}
        authoringNumbers={authoringNumbers}
        selectedTaskGroupId={selectedTaskGroup?.taskGroupId}
        selectedQuestionLink={selectedQuestionLink}
        validationMessages={publishBlockingMessages}
        publishBlocked={publishBlocked}
        workflowMessage={workflowMessage}
        publishState={publishState}
        operationalActionLabel={stateContract.actionLabel && operationalState !== 'conflict' ? stateContract.actionLabel : undefined}
        onSaveDraft={() => void handleSaveDraft()}
        onValidate={handleValidate}
        onPreview={() => void handlePreview()}
        onPublish={() => void handlePublish()}
        onExit={handleExitWorkspace}
        onOperationalAction={handleOperationalStateAction}
        onToolbarMoreToggle={(outcome) => emitAction('toolbarMoreMenu', { outcome })}
        onSelectPassage={handleSelectPassage}
        onAddPassage={canEditPassageCollection ? handleAddPassage : undefined}
        onRemovePassage={canEditPassageCollection ? handleRemovePassage : undefined}
        onMetadataChange={handleBuildWorkspaceMetadataChange}
        onPassageTitleChange={handlePassageTitleChange}
        onPassageTextChange={handlePassageTextChange}
        onAddQuestionGroup={handleAddTaskGroup}
        onSelectTaskGroup={(taskGroupId) => setSelectedTaskGroupId(taskGroupId)}
        onTaskGroupChange={handleTaskGroupChange}
        onInteractionChange={handleInteractionChange}
        onInteractionRemove={(interactionId, taskGroup) =>
          setDraftDocument((current) => removeInteraction(current, interactionId, taskGroup))
        }
        onOptionSetChange={(optionSet) =>
          setDraftDocument((current) => updateOptionSet(current, optionSet))
        }
        onDocumentChange={handleDocumentChange}
        onPassageEditorAction={handlePassageEditorAction}
        onTableCompletionAction={handleTableCompletionAction}
        onQuestionLinkNavigation={handleQuestionLinkNavigation}
        onQuestionLinkRepair={handleQuestionLinkRepair}
        onReviewIssuesAction={(action, actionMetadata) => emitAction(action, {
          outcome: actionMetadata?.outcome,
          issueId: actionMetadata?.issueId,
          issueType: actionMetadata?.issueType,
          questionStart: actionMetadata?.questionStart,
          questionEnd: actionMetadata?.questionEnd,
          issueCount: actionMetadata?.issueCount,
        })}
        onAddQuestion={handleAddQuestionToGroup}
        onDuplicateQuestionGroup={handleDuplicateQuestionGroup}
        onDeleteQuestionGroup={handleDeleteQuestionGroup}
        onOpenQuestionGroupModal={handleOpenQuestionGroupModal}
        onCloseQuestionGroupModal={handleCloseQuestionGroupModal}
      />

      <ReadingV2DuplicateWarningPanel
        warnings={duplicateWarnings}
        onUseExisting={(match, warning) =>
          emitDuplicateWarningAction('reading_passage_duplicate_use_existing', match, warning)
        }
        onRestoreAndUse={(match, warning) =>
          emitDuplicateWarningAction('reading_passage_duplicate_restore_and_use', match, warning)
        }
        onCreateNewAnyway={(match, warning) =>
          emitDuplicateWarningAction('reading_passage_duplicate_create_new_anyway', match, warning)
        }
      />

      {mode === 'revise-published' ? (
        <section className="reading-v2-build__revision-note" aria-label="Published revision safety">
          <h2>Published Version Safety</h2>
          <p>The live material remains active until this draft is published again.</p>
        </section>
      ) : null}

      <section className="reading-v2-studio__advanced" aria-label="Developer details">
        <div className="reading-v2-studio__advanced-actions">
          {currentImportCandidate ? (
            <button
              className="reading-v2-studio__button reading-v2-studio__button--secondary"
              type="button"
              onClick={() => handleAcceptImport(currentImportCandidate)}
            >
              Accept into Draft
            </button>
          ) : null}
          {hasImportCandidate ? (
            <button
              className="reading-v2-studio__button reading-v2-studio__button--quiet"
              type="button"
              aria-expanded={showImportReviewDetails}
              onClick={handleToggleImportReviewDetails}
            >
              {showImportReviewDetails ? 'Hide import review' : 'Review import details'}
            </button>
          ) : null}
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            onClick={() => void handleCopyParsingDiagnostics()}
          >
            Copy parsing diagnostics
          </button>
          <button
            className="reading-v2-studio__button reading-v2-studio__button--quiet"
            type="button"
            aria-expanded={showDeveloperDetails}
            onClick={() => setShowDeveloperDetails(true)}
          >
            Developer details
          </button>
        </div>
        {hasImportCandidate && showImportReviewDetails ? (
          <section className="reading-v2-studio__metadata" aria-label="Import review and source verification">
            <ReadingV2ImportReviewPanel
              candidate={currentImportCandidate}
              teacherFacing
              diagnostics={teacherImportDiagnostics}
              showAcceptAction={false}
              onInspectEvidence={() => emitAction('inspectImportEvidence')}
              onAnalyzeSource={handleAnalyzeImportSource}
              onAcceptImport={handleAcceptImport}
              onJumpToDiagnostic={handleJumpImportDiagnostic}
            />
          </section>
        ) : null}
        {diagnosticCopyState !== 'idle' ? (
          <p
            className={diagnosticCopyState === 'copied' ? 'reading-v2-studio__copy-status' : 'reading-v2-alert'}
            role="status"
          >
            {diagnosticCopyState === 'copied'
              ? 'Parsing diagnostics copied.'
              : 'Parsing diagnostics could not be copied.'}
          </p>
        ) : null}
      </section>

      <ReadingV2DeveloperDetailsModal
        open={showDeveloperDetails}
        onClose={() => setShowDeveloperDetails(false)}
      >
        <section className="reading-v2-studio__state-card" aria-label="Draft autosave and conflict recovery">
          <h2>Draft Autosave</h2>
          <p>Revision token: <strong>{currentRevisionToken}</strong></p>
          <p>Mode: {getModeLabel(mode)} | Schema v{READING_V2_SCHEMA_VERSION} | Engine: {READING_V2_ENGINE}</p>
          {lastPublishCommitPath ? <p>Firebase commit path: {lastPublishCommitPath}</p> : null}
          {operationalState === 'conflict' ? (
            <div className="reading-v2-studio__inline-actions" aria-label="Conflict recovery actions">
              <button className="reading-v2-studio__button" type="button" onClick={() => void handleReloadLatest()}>
                Reload latest
              </button>
              <button className="reading-v2-studio__button" type="button" onClick={() => void handleDuplicateDraft()}>
                Duplicate draft
              </button>
              <button className="reading-v2-studio__button" type="button" onClick={() => void handleCompareDiff()}>
                Compare diff
              </button>
            </div>
          ) : null}
        </section>

      <section className="reading-v2-studio__metadata" aria-label="Metadata readiness">
        <ReadingV2MetadataPanel
          metadata={metadata}
          validationIssues={draftDocument.validationState.issues}
          onMetadataChange={(nextMetadata) => {
            setMetadata(nextMetadata);
            emitAction('metadataEdit');
          }}
        />
      </section>

      <section className="reading-v2-studio__state-card" aria-label="Publish readiness">
        <h2>Publish Readiness</h2>
        <p>{publishBlocked ? 'Publish is blocked until validation issues are resolved.' : 'Ready for Task 5 publish handoff.'}</p>
        <p>Teacher answer key is authoritative for marking; Auto source verifier details remain teacher-only.</p>
        <p>Issues: {validationResult.issues.length}</p>
      </section>

      <section className="reading-v2-studio__columns" aria-label="Two-column Studio workspace">
        <aside className="reading-v2-studio__left" aria-label="Left column stimulus and reference">
          <div className="reading-v2-studio__panel-heading">
            <div>
              <p>Context</p>
              <h2>Structure Outline</h2>
            </div>
          </div>
          <ol className="reading-v2-studio__outline" aria-label="Structure outline">
            {draftDocument.sectionIds.map((sectionId) => {
              const section = draftDocument.sections[sectionId];
              return section ? (
                <li key={section.sectionId}>
                  {section.title}
                  <ul>
                    {section.stimulusIds.map((stimulusId, stimulusIndex) => {
                      const stimulusTitle = draftDocument.stimuli[stimulusId]?.title ?? stimulusId;
                      return (
                        <li key={stimulusId}>
                          <span>{stimulusTitle}</span>
                          <button
                            className="reading-v2-studio__button reading-v2-studio__button--quiet"
                            type="button"
                            disabled={stimulusIndex === 0}
                            onClick={() => handleReorderStimulus(section.sectionId, stimulusId, 'up')}
                          >
                            Move stimulus {stimulusTitle} up
                          </button>
                          <button
                            className="reading-v2-studio__button reading-v2-studio__button--quiet"
                            type="button"
                            disabled={stimulusIndex === section.stimulusIds.length - 1}
                            onClick={() => handleReorderStimulus(section.sectionId, stimulusId, 'down')}
                          >
                            Move stimulus {stimulusTitle} down
                          </button>
                        </li>
                      );
                    })}
                    {section.taskGroupIds.map((taskGroupId) => (
                      <li key={taskGroupId}>{draftDocument.taskGroups[taskGroupId]?.groupTitle ?? taskGroupId}</li>
                    ))}
                  </ul>
                </li>
              ) : null;
            })}
          </ol>
          <ReadingV2PassageAssetPanel
            repository={readingV2StudioRepository}
            ownerId={metadata.ownerId}
            document={draftDocument}
            onDocumentChange={handleDocumentChange}
            onInspectProvenance={() => emitAction('inspectProvenance')}
            onExtract={() => void handleExtract()}
          />
          <section className="reading-v2-editor-section" aria-label="Extraction scope">
            <h3>Extraction Scope</h3>
            <label>
              Material kind
              <select
                aria-label="Extraction material kind"
                value={extractionMaterialKind}
                onChange={(event) =>
                  setExtractionMaterialKind(event.currentTarget.value as ReadingV2StudioExtractionRequest['materialKind'])
                }
              >
                <option value="extracted-task-group-material">Extracted task-group material</option>
                <option value="task-group-material">Task-group material</option>
              </select>
            </label>
            <fieldset>
              <legend>Selected task groups</legend>
              {orderedTaskGroups.map((taskGroup) => (
                <label key={taskGroup.taskGroupId}>
                  <input
                    aria-label={`Extract ${taskGroup.groupTitle ?? taskGroup.officialTaskType}`}
                    type="checkbox"
                    checked={selectedExtractionTaskGroupIds.includes(taskGroup.taskGroupId)}
                    onChange={(event) => toggleExtractionTaskGroup(taskGroup.taskGroupId, event.currentTarget.checked)}
                  />
                  {taskGroup.groupTitle ?? taskGroup.officialTaskType}
                </label>
              ))}
            </fieldset>
            <section aria-label="Extraction metadata confirmation">
              <h4>Confirm Extraction Metadata</h4>
              <dl>
                <dt>Title</dt>
                <dd>{metadata.title || draftDocument.title}</dd>
                <dt>Material kind</dt>
                <dd>{extractionMaterialKind}</dd>
                <dt>Duration</dt>
                <dd>{metadata.durationMinutes} minutes</dd>
                <dt>Difficulty</dt>
                <dd>{metadata.difficulty}</dd>
                <dt>Target band</dt>
                <dd>{metadata.targetBand}</dd>
                <dt>Visibility</dt>
                <dd>{metadata.visibility}</dd>
              </dl>
            </section>
            <button className="reading-v2-studio__button" type="button" onClick={() => void handleExtract()}>
              Create Extracted Draft
            </button>
          </section>
        </aside>

        <section className="reading-v2-studio__right" aria-label="Right column task logic and questions">
          {activeStep === 'Questions' ? (
            <ReadingV2TaskGroupEditor
              document={draftDocument}
              taskGroups={orderedTaskGroups}
              interactions={draftDocument.interactions}
              optionSets={draftDocument.optionSets}
              visibleNumbers={visibleNumbers}
              selectedTaskGroupId={selectedTaskGroup?.taskGroupId}
              onSelectTaskGroup={(taskGroupId) => setSelectedTaskGroupId(taskGroupId)}
              onAddTaskGroup={() => handleAddTaskGroup('sentence-completion')}
              onMoveSelectedTaskGroup={handleReorderTaskGroup}
              onTaskGroupChange={handleTaskGroupChange}
              onInteractionChange={handleInteractionChange}
              onInteractionRemove={(interactionId, taskGroup) =>
                setDraftDocument((current) => removeInteraction(current, interactionId, taskGroup))
              }
              onOptionSetChange={(optionSet) =>
                setDraftDocument((current) => updateOptionSet(current, optionSet))
              }
            />
          ) : null}

          {activeStep === 'Publish' ? (
            <ReadingV2SettingsPanel
              metadata={metadata}
              validationIssues={draftDocument.validationState.issues}
              publishBlocked={publishBlocked}
              answerKeyAuthority={hasImportCandidate ? teacherImportDiagnostics.authority : undefined}
              onMetadataChange={(nextMetadata) => {
                setMetadata(nextMetadata);
                emitAction('settingsEdit');
              }}
            />
          ) : null}

          {activeStep === 'Passages' ? (
            <ReadingV2StimulusEditor
              document={draftDocument}
              onDocumentChange={handleDocumentChange}
            />
          ) : null}
        </section>
      </section>

      <footer className="reading-v2-studio__utility" aria-label="Bottom utility rail">
        <span>Warnings: {validationResult.issues.length}</span>
        <span>Provenance visible to author only</span>
        <span>Import evidence publish-blocking until resolved</span>
        <span>Preview is teacher-only local state</span>
      </footer>
      </ReadingV2DeveloperDetailsModal>

      {previewProjection ? (
        <ReadingV2PreviewOverlay
          projection={previewProjection}
          onClose={() => setPreviewProjection(null)}
        />
      ) : null}
    </main>
  );
}
