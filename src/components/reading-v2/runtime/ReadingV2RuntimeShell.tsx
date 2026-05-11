// Reading V2 runtime boundary: renders derived V2 projections only.
// V1 Reading runtime files are visual references; legacy flat-question payloads are rejected before rendering.
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useScreenSize } from '../../../core/platform/hooks/useScreenSize';
import { storage } from '../../../core/platform/storage';
import {
  assertReadingV2RuntimeProjection,
} from '../../../services/reading-v2/readingV2RuntimeBoundary.service';
import type {
  ReadingV2DerivedProjection,
  ReadingV2ProjectedInteraction,
  ReadingV2ProjectedOptionSet,
  ReadingV2ProjectedStimulus,
  ReadingV2ProjectedTaskGroup,
} from '../../../services/reading-v2/readingV2Projection.service';
import {
  getReadingV2InstructionText,
  readingV2InstructionLooksStandard,
  type ReadingV2InstructionSemantics,
} from '../../../services/reading-v2/readingV2InstructionTemplates.service';
import {
  READING_V2_TASK_TAXONOMY,
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';
import {
  ReadingV2ChoiceOption,
  ReadingV2QuestionBadge,
  ReadingV2ReferenceBank,
  ReadingV2TaskFrame,
} from './task-type-components/ReadingV2TaskTypeComponents';
import { ReadingV2InstructionText } from '../shared/ReadingV2InstructionText';
import { ReadingV2FormattedText } from '../shared/ReadingV2FormattedText';
import './ReadingV2RuntimeShell.css';

export type ReadingV2RuntimeState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'missing-projection'
  | 'permission-denied'
  | 'network-failure'
  | 'submit-pending'
  | 'submit-failure'
  | 'duplicate-submit'
  | 'submit-success';

export type ReadingV2AnswerValue = string | readonly string[];

export interface ReadingV2RuntimeAnswerRecord {
  readonly interactionId: string;
  readonly taskGroupId: string;
  readonly visibleNumber: number;
  readonly value: ReadingV2AnswerValue;
}

export interface ReadingV2RuntimeSubmitPayload {
  readonly projectionId: string;
  readonly sourceSnapshotVersionId: string;
  readonly materialId?: string;
  readonly answers: readonly ReadingV2RuntimeAnswerRecord[];
}

export interface ReadingV2RuntimeLifecycle {
  readonly status?: 'waiting' | 'in-progress' | 'paused' | 'completed';
  readonly message?: string;
  readonly forceSubmitToken?: string | number | null;
}

export interface ReadingV2RuntimeTimer {
  readonly durationMinutes?: number | null;
  readonly startedAt?: number | null;
  readonly pausedDurationMs?: number;
  readonly running?: boolean;
  readonly autoSubmitOnExpiry?: boolean;
}

type ReadingV2RuntimeSubmitHandler = (
  payload: ReadingV2RuntimeSubmitPayload,
) => void | Promise<void>;

export interface ReadingV2RuntimeShellProps {
  readonly projection?: ReadingV2DerivedProjection;
  readonly state?: ReadingV2RuntimeState;
  readonly onSubmit?: ReadingV2RuntimeSubmitHandler;
  readonly initialAnswers?: Readonly<Record<string, ReadingV2AnswerValue>>;
  readonly onAnswersChange?: (answers: Readonly<Record<string, ReadingV2AnswerValue>>) => void;
  readonly persistenceKey?: string;
  readonly lifecycle?: ReadingV2RuntimeLifecycle;
  readonly timer?: ReadingV2RuntimeTimer;
}

type ReadingV2ProjectedSection = ReadingV2DerivedProjection['content']['sections'][number];

interface PassageHighlight {
  readonly id: string;
  readonly text: string;
  readonly color: string;
}

const RUNTIME_STATES: Record<ReadingV2RuntimeState, { title: string; message: string }> = {
  ready: {
    title: 'Ready',
    message: 'Reading runtime is ready.',
  },
  loading: {
    title: 'Loading Reading material',
    message: 'Preparing the Reading passage and questions.',
  },
  empty: {
    title: 'No Reading content',
    message: 'This projection has no sections, passages, or task groups.',
  },
  'missing-projection': {
    title: 'Reading material unavailable',
    message: 'The launch surface did not provide a Reading V2 projection.',
  },
  'permission-denied': {
    title: 'Permission required',
    message: 'This Reading material is not available for the current student.',
  },
  'network-failure': {
    title: 'Connection problem',
    message: 'The Reading projection could not be loaded. Try again from the existing launch surface.',
  },
  'submit-pending': {
    title: 'Submitting answers',
    message: 'Your Reading answers are being submitted.',
  },
  'submit-failure': {
    title: 'Submit failed',
    message: 'Your answers are still on this device. Try submitting again.',
  },
  'duplicate-submit': {
    title: 'Already submitted',
    message: 'This Reading attempt has already been submitted.',
  },
  'submit-success': {
    title: 'Submitted',
    message: 'Your Reading answers were submitted.',
  },
};

const DIAG_PREFIX = '[Diag][ReadingV2Runtime]';

const logRuntimeDiagnostic = (
  event: string,
  payload: Record<string, unknown>,
): void => {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return;
  }

  console.log(`${DIAG_PREFIX} ${event}`, payload);
};

const asArray = (value: ReadingV2AnswerValue | undefined): readonly string[] =>
  typeof value === 'string' ? [value] : value ?? [];

const isAnswered = (value: ReadingV2AnswerValue | undefined): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : Boolean(value?.length);

const isInteractionComplete = (
  interaction: ReadingV2ProjectedInteraction,
  value: ReadingV2AnswerValue | undefined,
): boolean => {
  if (interaction.responseShape.kind === 'multi-select') {
    return asArray(value).length === interaction.responseShape.selectionLimit;
  }

  return isAnswered(value);
};

const getOptionSet = (
  optionSets: readonly ReadingV2ProjectedOptionSet[],
  optionSetId: string,
): ReadingV2ProjectedOptionSet | undefined =>
  optionSets.find((optionSet) => optionSet.optionSetId === optionSetId);

const getOptionSubmissionValue = (
  optionSets: readonly ReadingV2ProjectedOptionSet[],
  optionSetId: string,
  optionId: string,
): string => {
  const option = getOptionSet(optionSets, optionSetId)?.options.find((entry) => entry.optionId === optionId);
  return option?.label?.trim() || option?.text?.trim() || optionId;
};

const getSubmissionAnswerValue = (
  interaction: ReadingV2ProjectedInteraction,
  value: ReadingV2AnswerValue,
  optionSets: readonly ReadingV2ProjectedOptionSet[],
): ReadingV2AnswerValue => {
  const { responseShape } = interaction;

  switch (responseShape.kind) {
    case 'single-choice':
    case 'matching':
      return typeof value === 'string'
        ? getOptionSubmissionValue(optionSets, responseShape.optionSetId, value)
        : value;
    case 'multi-select':
      return asArray(value).map((optionId) => getOptionSubmissionValue(
        optionSets,
        responseShape.optionSetId,
        optionId,
      ));
    default:
      return value;
  }
};

const getPrimaryStimulus = (
  taskGroup: ReadingV2ProjectedTaskGroup,
  stimuli: readonly ReadingV2ProjectedStimulus[],
): ReadingV2ProjectedStimulus | undefined => {
  const primaryRef = taskGroup.stimulusRefs[0];
  return primaryRef ? stimuli.find((stimulus) => stimulus.stimulusId === primaryRef.stimulusId) : undefined;
};

const getSectionStimulus = (
  section: ReadingV2ProjectedSection,
  stimuli: readonly ReadingV2ProjectedStimulus[],
): ReadingV2ProjectedStimulus | undefined => {
  const stimulusId = section.stimulusIds[0];
  return stimulusId ? stimuli.find((stimulus) => stimulus.stimulusId === stimulusId) : undefined;
};

const getSectionTaskGroups = (
  section: ReadingV2ProjectedSection,
  taskGroups: readonly ReadingV2ProjectedTaskGroup[],
): readonly ReadingV2ProjectedTaskGroup[] =>
  section.taskGroupIds
    .map((taskGroupId) => taskGroups.find((taskGroup) => taskGroup.taskGroupId === taskGroupId))
    .filter((taskGroup): taskGroup is ReadingV2ProjectedTaskGroup => Boolean(taskGroup));

const getTaskGroupRange = (taskGroup: ReadingV2ProjectedTaskGroup): string => {
  const first = taskGroup.interactions[0]?.displayNumber;
  const last = taskGroup.interactions[taskGroup.interactions.length - 1]?.displayNumber;
  if (!first) {
    return 'Questions';
  }
  return first === last ? `Question ${first}` : `Questions ${first}-${last}`;
};

const getSectionRange = (taskGroups: readonly ReadingV2ProjectedTaskGroup[]): string => {
  const interactions = taskGroups.flatMap((taskGroup) => taskGroup.interactions);
  const first = interactions[0]?.displayNumber;
  const last = interactions[interactions.length - 1]?.displayNumber;
  if (!first) {
    return 'Questions';
  }
  return first === last ? `Q${first}` : `Q${first}-${last}`;
};

const getQuestionAnchorId = (displayNumber: number): string => `reading-v2-question-${displayNumber}`;

const getPassageLabel = (index: number): string => `Passage ${index + 1}`;

const getParagraphDisplayLabel = (label: string | undefined): string | null => {
  const trimmed = label?.trim();
  if (!trimmed) {
    return null;
  }

  const letterMatch = trimmed.match(/^(?:paragraph\s*)?([a-z])$/i);
  if (letterMatch?.[1]) {
    return letterMatch[1].toUpperCase();
  }

  const numericMatch = trimmed.match(/^(?:paragraph\s*)?\d+$/i);
  if (numericMatch) {
    return null;
  }

  return trimmed;
};

const getPromptText = (
  interaction: ReadingV2ProjectedInteraction,
  taskGroup: ReadingV2ProjectedTaskGroup,
  stimulus?: ReadingV2ProjectedStimulus,
): string => {
  if (interaction.promptText?.trim()) {
    return interaction.promptText.trim();
  }

  if (taskGroup.engineeringFamily === 'completion' || taskGroup.engineeringFamily === 'binary-judgement') {
    return `Question ${interaction.displayNumber}`;
  }

  if (!stimulus) {
    return `Question ${interaction.displayNumber}`;
  }

  if (stimulus.content.kind === 'passage-content') {
    const paragraph = stimulus.content.paragraphs.find(
      (entry) => entry.anchorId === interaction.primaryAnchorId,
    );
    return paragraph?.text ?? `Question ${interaction.displayNumber}`;
  }

  if (stimulus.content.kind === 'table-content') {
    const cell = stimulus.content.rows.flat().find(
      (entry) => entry.anchorId === interaction.primaryAnchorId
        || Boolean(entry.anchorIds?.some((anchorId) => anchorId === interaction.primaryAnchorId)),
    );
    return cell?.text || `Table blank ${interaction.displayNumber}`;
  }

  if (stimulus.content.kind === 'flowchart-content') {
    const step = stimulus.content.steps.find((entry) => entry.anchorId === interaction.primaryAnchorId);
    return step?.text ?? `Flow step ${interaction.displayNumber}`;
  }

  if (stimulus.content.kind === 'diagram-content') {
    const hotspot = stimulus.content.hotspots.find(
      (entry) => entry.anchorId === interaction.primaryAnchorId,
    );
    return hotspot?.label ?? `Diagram target ${interaction.displayNumber}`;
  }

  return `Question ${interaction.displayNumber}`;
};

interface ProjectedSummaryListLayout {
  readonly kind: 'summary-list';
  readonly segments: readonly string[];
}

interface ProjectedSummaryTextLayout {
  readonly kind: 'summary-text';
  readonly segments: readonly string[];
}

interface ProjectedNoteCompletionLayout {
  readonly kind: 'note-completion-layout';
  readonly subheading?: string;
  readonly sections?: readonly {
    readonly heading?: string;
    readonly questionNumbers?: readonly number[];
  }[];
}

const splitProjectedSummaryPrompt = (source?: string): { before: string; after: string } => {
  const text = source ?? '';
  const match = /(\[blank\]|_{3,})/i.exec(text);
  if (!match || match.index === undefined) {
    return { before: text, after: '' };
  }

  return {
    before: text.slice(0, match.index).trimEnd(),
    after: text.slice(match.index + match[0].length).trimStart(),
  };
};

const joinProjectedSummarySegments = (left: string | undefined, right: string | undefined): string =>
  [left?.trim(), right?.trim()].filter(Boolean).join(' ');

const deriveProjectedSummaryListSegments = (
  interactions: readonly ReadingV2ProjectedInteraction[],
): readonly string[] => {
  if (interactions.length === 0) {
    return [''];
  }

  const segments: string[] = [];
  interactions.forEach((interaction, index) => {
    const promptParts = splitProjectedSummaryPrompt(interaction.promptText);
    if (index === 0) {
      segments.push(promptParts.before);
    } else {
      segments[index] = joinProjectedSummarySegments(segments[index], promptParts.before);
    }
    segments[index + 1] = joinProjectedSummarySegments(segments[index + 1], promptParts.after);
  });

  return segments;
};

const normalizeProjectedSummarySegments = (
  segments: readonly string[] | undefined,
  interactions: readonly ReadingV2ProjectedInteraction[],
): readonly string[] => {
  const fallback = deriveProjectedSummaryListSegments(interactions);
  return Array.from({ length: interactions.length + 1 }, (_, index) =>
    (segments?.[index] ?? fallback[index] ?? '').trim(),
  );
};

const parseProjectedSummaryListLayout = (
  taskGroup: ReadingV2ProjectedTaskGroup,
): ProjectedSummaryListLayout | null => {
  if (taskGroup.officialTaskType !== 'summary-completion-list') {
    return null;
  }

  if (taskGroup.layoutHint) {
    try {
      const parsed = JSON.parse(taskGroup.layoutHint) as Partial<ProjectedSummaryListLayout> & { readonly kind?: string };
      if (parsed.kind === 'summary-list' && Array.isArray(parsed.segments)) {
        return {
          kind: 'summary-list',
          segments: normalizeProjectedSummarySegments(parsed.segments, taskGroup.interactions),
        };
      }
    } catch {
      // Student runtime can still render from interaction prompts when an authoring hint is malformed.
    }
  }

  return {
    kind: 'summary-list',
    segments: normalizeProjectedSummarySegments(undefined, taskGroup.interactions),
  };
};

const parseProjectedSummaryTextLayout = (
  taskGroup: ReadingV2ProjectedTaskGroup,
): ProjectedSummaryTextLayout | null => {
  if (taskGroup.officialTaskType !== 'summary-completion-text') {
    return null;
  }

  if (taskGroup.layoutHint) {
    try {
      const parsed = JSON.parse(taskGroup.layoutHint) as Partial<ProjectedSummaryTextLayout> & { readonly kind?: string };
      if (parsed.kind === 'summary-text' && Array.isArray(parsed.segments)) {
        return {
          kind: 'summary-text',
          segments: normalizeProjectedSummarySegments(parsed.segments, taskGroup.interactions),
        };
      }
    } catch {
      // Student runtime can still render from interaction prompts when an authoring hint is malformed.
    }
  }

  return {
    kind: 'summary-text',
    segments: normalizeProjectedSummarySegments(undefined, taskGroup.interactions),
  };
};

const parseProjectedNoteCompletionLayout = (
  taskGroup: ReadingV2ProjectedTaskGroup,
): ProjectedNoteCompletionLayout | null => {
  if (taskGroup.officialTaskType !== 'note-completion') {
    return null;
  }

  if (taskGroup.layoutHint) {
    try {
      const parsed = JSON.parse(taskGroup.layoutHint) as Partial<ProjectedNoteCompletionLayout> & { readonly kind?: string };
      if (parsed.kind === 'note-completion-layout') {
        return {
          kind: 'note-completion-layout',
          subheading: parsed.subheading,
          sections: Array.isArray(parsed.sections)
            ? parsed.sections
                .map((section) => ({
                  heading: typeof section.heading === 'string' ? section.heading : undefined,
                  questionNumbers: Array.isArray(section.questionNumbers)
                    ? section.questionNumbers.filter((value: unknown): value is number =>
                        typeof value === 'number' && Number.isFinite(value),
                      )
                    : [],
                }))
                .filter((section) => section.heading?.trim() || section.questionNumbers.length > 0)
            : undefined,
        };
      }
    } catch {
      // Notes can still render from prompt text if the layout hint is unavailable.
    }
  }

  return { kind: 'note-completion-layout' };
};

const getInteractionAnchorIds = (
  interaction: ReadingV2ProjectedInteraction,
): readonly string[] => [
  ...(interaction.primaryAnchorId ? [interaction.primaryAnchorId] : []),
  ...(interaction.contextAnchorIds ?? []),
];

const getAnchoredInteraction = (
  taskGroup: ReadingV2ProjectedTaskGroup,
  anchorId: string | undefined,
): ReadingV2ProjectedInteraction | undefined => {
  if (!anchorId) {
    return undefined;
  }

  return taskGroup.interactions.find((interaction) =>
    getInteractionAnchorIds(interaction).some((candidate) => candidate === anchorId),
  );
};

const getWordLimitText = (taskGroup: ReadingV2ProjectedTaskGroup): string => {
  if (typeof taskGroup.wordLimit === 'number') {
    return String(taskGroup.wordLimit);
  }

  const freeTextInteraction = taskGroup.interactions.find(
    (interaction) => interaction.responseShape.kind === 'free-text',
  );
  if (freeTextInteraction?.responseShape.kind === 'free-text' && freeTextInteraction.responseShape.wordLimit) {
    return String(freeTextInteraction.responseShape.wordLimit);
  }

  return 'as instructed';
};

const getTaskGroupWordLimit = (taskGroup: ReadingV2ProjectedTaskGroup): number | undefined => {
  if (typeof taskGroup.wordLimit === 'number') {
    return taskGroup.wordLimit;
  }

  const freeTextInteraction = taskGroup.interactions.find(
    (interaction) => interaction.responseShape.kind === 'free-text',
  );

  return freeTextInteraction?.responseShape.kind === 'free-text'
    ? freeTextInteraction.responseShape.wordLimit
    : undefined;
};

const isCanonicalTaskType = (taskType: string): taskType is ReadingV2CanonicalTaskType =>
  taskType in READING_V2_TASK_TAXONOMY;

const getTaskGroupQuestionRange = (
  taskGroup: ReadingV2ProjectedTaskGroup,
): ReadingV2InstructionSemantics['questionRange'] | undefined => {
  const numbers = taskGroup.interactions
    .map((interaction) => interaction.displayNumber)
    .filter((number) => Number.isFinite(number));

  if (numbers.length === 0) {
    return undefined;
  }

  return {
    start: Math.min(...numbers),
    end: Math.max(...numbers),
  };
};

const getRuntimeInstructionSemantics = (
  taskGroup: ReadingV2ProjectedTaskGroup,
): ReadingV2InstructionSemantics => ({
  questionRange: getTaskGroupQuestionRange(taskGroup),
  wordLimit: getTaskGroupWordLimit(taskGroup),
});

const getRuntimeInstructionText = (
  taskGroup: ReadingV2ProjectedTaskGroup,
  text: string,
): string => {
  const baseText = text.trim();
  if (!isCanonicalTaskType(taskGroup.officialTaskType)) {
    return baseText;
  }

  const semantics = getRuntimeInstructionSemantics(taskGroup);
  if (!baseText || readingV2InstructionLooksStandard(taskGroup.officialTaskType, baseText, semantics)) {
    return getReadingV2InstructionText(taskGroup.officialTaskType, semantics);
  }

  return baseText;
};

interface StimulusViewProps {
  readonly stimulus?: ReadingV2ProjectedStimulus;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly highlights: readonly PassageHighlight[];
  readonly highlighterActive: boolean;
  readonly highlightColor: string;
  readonly activeAnchorId?: string | null;
  readonly anchorQuestionNumbers: ReadonlyMap<string, number>;
  readonly onAddHighlight: (highlight: PassageHighlight) => void;
}

function StimulusView({
  stimulus,
  fontSize,
  lineHeight,
  highlights,
  highlighterActive,
  highlightColor,
  activeAnchorId,
  anchorQuestionNumbers,
  onAddHighlight,
}: StimulusViewProps) {
  const captureHighlight = () => {
    if (!highlighterActive) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (!selectedText || selectedText.length < 2) {
      return;
    }

    onAddHighlight({
      id: `highlight-${Date.now()}-${selectedText.slice(0, 12)}`,
      text: selectedText,
      color: highlightColor,
    });
    selection?.removeAllRanges();
  };

  if (!stimulus) {
    return <p>No stimulus linked to this task group.</p>;
  }

  if (stimulus.content.kind === 'passage-content') {
    return (
      <article
        className="reading-v2-runtime__passage"
        aria-label="Reading passage"
        onMouseUp={captureHighlight}
        style={{
          '--reading-v2-passage-font-size': `${fontSize}px`,
          '--reading-v2-passage-line-height': String(lineHeight),
        } as CSSProperties}
      >
        <h2>{stimulus.title ?? 'Passage'}</h2>
        {stimulus.content.paragraphs.map((paragraph, index) => {
          const displayLabel = getParagraphDisplayLabel(paragraph.label);

          return (
            <p key={paragraph.anchorId ?? `${stimulus.stimulusId}-${index}`}>
              {displayLabel ? <strong>{displayLabel} </strong> : null}
              <ReadingV2FormattedText text={paragraph.text} highlights={highlights} />
            </p>
          );
        })}
      </article>
    );
  }

  if (stimulus.content.kind === 'table-content') {
    return (
      <section className="reading-v2-runtime__structured-overview" aria-label="Structured table overview" data-kind="table">
        <h2>{stimulus.title ?? 'Table'}</h2>
        <div className="reading-v2-runtime__table-scroll">
          <table>
            <tbody>
              {stimulus.content.rows.map((row, rowIndex) => (
                <tr key={`${stimulus.stimulusId}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      data-active={
                        (cell.anchorIds && activeAnchorId ? cell.anchorIds.some((anchorId) => anchorId === activeAnchorId) : false)
                        || (cell.anchorId && activeAnchorId === cell.anchorId)
                          ? 'true'
                          : 'false'
                      }
                      data-blank={cell.isBlank ? 'true' : 'false'}
                      key={`${cell.cellId ?? cell.anchorId ?? 'cell'}-${rowIndex}-${cellIndex}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                    >
                      {cell.isBlank ? (
                        <span className="reading-v2-runtime__blank-marker-stack">
                          {(cell.anchorIds && cell.anchorIds.length > 0 ? cell.anchorIds : cell.anchorId ? [cell.anchorId] : [])
                            .map((anchorId) => (
                              <span className="reading-v2-runtime__blank-marker" key={anchorId}>
                                Q{anchorQuestionNumbers.get(anchorId) ?? '?'}
                              </span>
                            ))}
                        </span>
                      ) : <ReadingV2FormattedText text={cell.text} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (stimulus.content.kind === 'flowchart-content') {
    return (
      <section className="reading-v2-runtime__structured-overview" aria-label="Structured flowchart overview" data-kind="flowchart">
        <h2>{stimulus.title ?? 'Flowchart'}</h2>
        <ol>
          {stimulus.content.steps.map((step) => (
            <li data-active={step.anchorId && activeAnchorId === step.anchorId ? 'true' : 'false'} key={step.stepId}>
              {step.anchorId && anchorQuestionNumbers.has(step.anchorId) ? (
                <span className="reading-v2-runtime__blank-marker">
                  Q{anchorQuestionNumbers.get(step.anchorId)}
                </span>
              ) : null}
              <ReadingV2FormattedText text={step.text} />
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (stimulus.content.kind === 'diagram-content') {
    return (
      <section className="reading-v2-runtime__structured-overview" aria-label="Zoomable diagram overview" data-kind="diagram">
        <h2>{stimulus.title ?? 'Diagram'}</h2>
        {stimulus.content.imageUrl ? (
          <img src={stimulus.content.imageUrl} alt={stimulus.title?.trim() || 'Diagram for labelling'} />
        ) : (
          <p>No diagram image available.</p>
        )}
        <ul aria-label="Diagram answer targets">
          {stimulus.content.hotspots.map((hotspot) => (
            <li data-active={activeAnchorId === hotspot.anchorId ? 'true' : 'false'} key={hotspot.anchorId}>
              <span className="reading-v2-runtime__blank-marker">
                Q{anchorQuestionNumbers.get(hotspot.anchorId) ?? '?'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return <p><ReadingV2FormattedText text={stimulus.content.alt} /></p>;
}

interface FreeTextAnswerControlProps {
  readonly label: string;
  readonly prompt: string;
  readonly value: ReadingV2AnswerValue | undefined;
  readonly interaction: ReadingV2ProjectedInteraction;
  readonly disabled: boolean;
  readonly inlineAfterPrompt?: boolean;
  readonly onAnswer: (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => void;
}

function FreeTextAnswerControl({
  label,
  prompt,
  value,
  interaction,
  disabled,
  inlineAfterPrompt = false,
  onAnswer,
}: FreeTextAnswerControlProps) {
  const inputValue = typeof value === 'string' ? value : '';
  const input = (
    <span className="reading-v2-runtime__text-input-shell">
      <input
        className="reading-v2-runtime__text-input"
        aria-label={`${label} answer`}
        disabled={disabled}
        value={inputValue}
        onChange={(event) => onAnswer(interaction, event.currentTarget.value)}
      />
    </span>
  );
  const blankIndex = prompt.search(/_{3,}/);

  if (blankIndex < 0) {
    if (inlineAfterPrompt) {
      return (
        <p className="reading-v2-runtime__completion-line reading-v2-runtime__completion-line--short-answer">
          <span><ReadingV2FormattedText text={prompt} /></span>
          {input}
        </p>
      );
    }
    return (
      <>
        <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
        {input}
      </>
    );
  }

  const beforeBlank = prompt.slice(0, blankIndex).trimEnd();
  const afterBlank = prompt.slice(blankIndex).replace(/^_{3,}/, '').trimStart();

  return (
    <p className="reading-v2-runtime__completion-line">
      {beforeBlank ? <span>{beforeBlank}</span> : null}
      {input}
      {afterBlank ? <span>{afterBlank}</span> : null}
    </p>
  );
}

interface FamilyRendererProps {
  readonly taskGroup: ReadingV2ProjectedTaskGroup;
  readonly stimulus?: ReadingV2ProjectedStimulus;
  readonly optionSets: readonly ReadingV2ProjectedOptionSet[];
  readonly answers: Readonly<Record<string, ReadingV2AnswerValue>>;
  readonly disabled: boolean;
  readonly onAnswer: (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => void;
  readonly onClear: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly onFocusInteraction: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly registerQuestionAnchor?: (interaction: ReadingV2ProjectedInteraction, element: HTMLElement | null) => void;
}

interface InlineAnswerInputProps {
  readonly interaction: ReadingV2ProjectedInteraction;
  readonly value: ReadingV2AnswerValue | undefined;
  readonly disabled: boolean;
  readonly ariaSuffix?: string;
  readonly showNumber?: boolean;
  readonly onAnswer: (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => void;
  readonly onFocusInteraction: (interaction: ReadingV2ProjectedInteraction) => void;
}

function InlineAnswerInput({
  interaction,
  value,
  disabled,
  ariaSuffix = 'answer',
  showNumber = true,
  onAnswer,
  onFocusInteraction,
}: InlineAnswerInputProps) {
  return (
    <label className="reading-v2-runtime__inline-answer">
      {showNumber ? (
        <span className="reading-v2-runtime__inline-answer-number">{interaction.displayNumber}</span>
      ) : null}
      <input
        className="reading-v2-runtime__text-input"
        aria-label={`Question ${interaction.displayNumber} ${ariaSuffix}`}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onFocus={() => onFocusInteraction(interaction)}
        onChange={(event) => {
          onFocusInteraction(interaction);
          onAnswer(interaction, event.currentTarget.value);
        }}
      />
    </label>
  );
}

interface InlineAnswerTextProps extends InlineAnswerInputProps {
  readonly text: string;
}

function InlineAnswerText({
  text,
  interaction,
  value,
  disabled,
  ariaSuffix,
  showNumber,
  onAnswer,
  onFocusInteraction,
}: InlineAnswerTextProps) {
  const parts = splitProjectedSummaryPrompt(text);
  const input = (
    <InlineAnswerInput
      interaction={interaction}
      value={value}
      disabled={disabled}
      ariaSuffix={ariaSuffix}
      showNumber={showNumber}
      onAnswer={onAnswer}
      onFocusInteraction={onFocusInteraction}
    />
  );

  if (!parts.before && !parts.after) {
    return input;
  }

  if (!/(\[blank\]|_{3,})/i.test(text)) {
    return (
      <>
        <span><ReadingV2FormattedText text={text} /></span>
        {input}
      </>
    );
  }

  return (
    <>
      {parts.before ? <span><ReadingV2FormattedText text={`${parts.before} `} /></span> : null}
      {input}
      {parts.after ? <span><ReadingV2FormattedText text={` ${parts.after}`} /></span> : null}
    </>
  );
}

interface SummaryListRuntimeProps extends FamilyRendererProps {
  readonly layout: ProjectedSummaryListLayout;
}

function SummaryListRuntime({
  taskGroup,
  optionSets,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
  layout,
}: SummaryListRuntimeProps) {
  const firstChoiceInteraction = taskGroup.interactions.find((interaction) => interaction.responseShape.kind === 'single-choice');
  const optionSet = firstChoiceInteraction?.responseShape.kind === 'single-choice'
    ? getOptionSet(optionSets, firstChoiceInteraction.responseShape.optionSetId)
    : undefined;
  const usedOptionIds = new Set(
    taskGroup.interactions
      .map((interaction) => answers[interaction.interactionId])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
  );

  return (
    <section className="reading-v2-runtime__summary-list" aria-label="Summary completion choose from list">
      {optionSet ? (
      <section className="reading-v2-runtime__summary-word-bank" aria-label="Summary completion option list">
          <h3>List of phrases</h3>
          <ul>
            {optionSet.options.map((option) => (
              <li key={option.optionId} data-used={usedOptionIds.has(option.optionId) ? 'true' : 'false'}>
                <strong>{option.label}</strong>
                {' '}
                <span><ReadingV2FormattedText text={option.text} /></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="reading-v2-runtime__summary-body">
        {taskGroup.interactions.map((interaction, index) => {
          const segment = layout.segments[index];
          const value = answers[interaction.interactionId];
          return (
            <span className="reading-v2-runtime__summary-segment" key={interaction.interactionId}>
              {segment ? <span>{`${segment} `}</span> : null}
              {interaction.responseShape.kind === 'single-choice' && optionSet ? (
                <label
                  className="reading-v2-runtime__summary-blank"
                  id={getQuestionAnchorId(interaction.displayNumber)}
                  ref={(element) => registerQuestionAnchor?.(interaction, element)}
                >
                  <span className="reading-v2-runtime__summary-number">{interaction.displayNumber}</span>
                  <select
                    aria-label={`Question ${interaction.displayNumber} answer`}
                    disabled={disabled}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => {
                      onFocusInteraction(interaction);
                      onAnswer(interaction, event.currentTarget.value);
                    }}
                  >
                    <option value="">Select</option>
                    {optionSet.options.map((option) => {
                      const usedElsewhere = taskGroup.interactions.some((otherInteraction) =>
                        otherInteraction.interactionId !== interaction.interactionId
                        && answers[otherInteraction.interactionId] === option.optionId,
                      );
                      return (
                        <option key={option.optionId} value={option.optionId} disabled={usedElsewhere}>
                          {usedElsewhere ? `${option.label} (used)` : option.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : (
                <span
                  className="reading-v2-runtime__blank-marker"
                  id={getQuestionAnchorId(interaction.displayNumber)}
                  ref={(element) => registerQuestionAnchor?.(interaction, element)}
                >
                  Q{interaction.displayNumber}
                </span>
              )}
            </span>
          );
        })}
        {layout.segments[taskGroup.interactions.length] ? (
          <span>{` ${layout.segments[taskGroup.interactions.length]}`}</span>
        ) : null}
      </p>
    </section>
  );
}

interface SummaryTextRuntimeProps extends FamilyRendererProps {
  readonly layout: ProjectedSummaryTextLayout;
}

function SummaryTextRuntime({
  taskGroup,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
  layout,
}: SummaryTextRuntimeProps) {
  return (
    <section className="reading-v2-runtime__summary-list reading-v2-runtime__summary-list--text" aria-label="Summary completion answer text">
      <div className="reading-v2-runtime__answer-frame">
        <h3>{taskGroup.groupTitle?.trim() || 'Summary'}</h3>
        <p className="reading-v2-runtime__summary-body">
          {taskGroup.interactions.map((interaction, index) => (
            <span
              className="reading-v2-runtime__summary-segment"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
            >
              {layout.segments[index] ? <span>{`${layout.segments[index]} `}</span> : null}
                              <InlineAnswerInput
                                    interaction={interaction}
                                    value={answers[interaction.interactionId]}
                disabled={disabled}
                onAnswer={onAnswer}
                onFocusInteraction={onFocusInteraction}
              />
            </span>
          ))}
          {layout.segments[taskGroup.interactions.length] ? (
            <span>{` ${layout.segments[taskGroup.interactions.length]}`}</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}

interface NoteCompletionRuntimeProps extends FamilyRendererProps {
  readonly layout: ProjectedNoteCompletionLayout;
}

const noteCompletionSections = (
  taskGroup: ReadingV2ProjectedTaskGroup,
  layout: ProjectedNoteCompletionLayout,
): readonly {
  readonly heading?: string;
  readonly interactions: readonly ReadingV2ProjectedInteraction[];
}[] => {
  const interactionsByNumber = new Map(
    taskGroup.interactions.map((interaction) => [interaction.displayNumber, interaction]),
  );
  const usedInteractionIds = new Set<string>();
  const sections = (layout.sections ?? [])
    .map((section) => {
      const interactions = (section.questionNumbers ?? [])
        .map((questionNumber) => interactionsByNumber.get(questionNumber))
        .filter((interaction): interaction is ReadingV2ProjectedInteraction => Boolean(interaction));

      interactions.forEach((interaction) => usedInteractionIds.add(interaction.interactionId));

      return {
        heading: section.heading?.trim() || undefined,
        interactions,
      };
    })
    .filter((section) => section.heading || section.interactions.length > 0);
  const unassigned = taskGroup.interactions.filter((interaction) => !usedInteractionIds.has(interaction.interactionId));

  if (sections.length === 0) {
    return [{ interactions: taskGroup.interactions }];
  }

  return unassigned.length > 0
    ? [...sections, { interactions: unassigned }]
    : sections;
};

function NoteCompletionRuntime({
  taskGroup,
  stimulus,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
  layout,
}: NoteCompletionRuntimeProps) {
  const sections = noteCompletionSections(taskGroup, layout);

  return (
    <section className="reading-v2-runtime__note-completion" aria-label="Note completion answer notes">
      <div className="reading-v2-runtime__answer-frame reading-v2-runtime__answer-frame--notes">
        <h3>{layout.subheading?.trim() || taskGroup.groupTitle?.trim() || stimulus?.title?.trim() || 'Notes'}</h3>
        {sections.map((section, sectionIndex) => (
          <section className="reading-v2-runtime__note-section" key={`${section.heading ?? 'note-section'}-${sectionIndex}`}>
            {section.heading ? <h4>{section.heading}</h4> : null}
            <ul>
              {section.interactions.map((interaction) => (
                <li
                  id={getQuestionAnchorId(interaction.displayNumber)}
                  key={interaction.interactionId}
                  ref={(element) => registerQuestionAnchor?.(interaction, element)}
                >
                  <span className="reading-v2-runtime__note-line">
                    <ReadingV2QuestionBadge
                      number={interaction.displayNumber}
                      state={isAnswered(answers[interaction.interactionId]) ? 'answered' : 'empty'}
                    />
                    <span className="reading-v2-runtime__note-text">
                      <InlineAnswerText
                        text={getPromptText(interaction, taskGroup, stimulus)}
                        interaction={interaction}
                        value={answers[interaction.interactionId]}
                        disabled={disabled}
                        showNumber={false}
                        onAnswer={onAnswer}
                        onFocusInteraction={onFocusInteraction}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function TableCompletionRuntime({
  taskGroup,
  stimulus,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
}: FamilyRendererProps) {
  if (stimulus?.content.kind !== 'table-content') {
    return null;
  }

  return (
    <section className="reading-v2-runtime__structured-answer" aria-label="Table completion answer table">
      <div className="reading-v2-runtime__table-scroll">
        <table>
          <tbody>
            {stimulus.content.rows.map((row, rowIndex) => (
              <tr key={`${stimulus.stimulusId}-answer-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => {
                  const anchorIds = cell.anchorIds && cell.anchorIds.length > 0
                    ? cell.anchorIds
                    : cell.anchorId
                      ? [cell.anchorId]
                      : [];
                  const linkedInteractions = anchorIds
                    .map((anchorId) => getAnchoredInteraction(taskGroup, anchorId))
                    .filter((interaction): interaction is ReadingV2ProjectedInteraction => Boolean(interaction));
                  const CellTag = cell.role === 'header' || rowIndex === 0 ? 'th' : 'td';
                  return (
                    <CellTag
                      data-blank={cell.isBlank ? 'true' : 'false'}
                      key={`${cell.cellId ?? cell.anchorId ?? 'answer-cell'}-${rowIndex}-${cellIndex}`}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                    >
                      {cell.isBlank ? (
                        <span className="reading-v2-runtime__cell-answer-stack">
                          {linkedInteractions.length > 0
                            ? linkedInteractions.map((interaction) => (
                                <span
                                  className="reading-v2-runtime__cell-answer-line"
                                  id={getQuestionAnchorId(interaction.displayNumber)}
                                  key={interaction.interactionId}
                                  ref={(element) => registerQuestionAnchor?.(interaction, element)}
                                >
                                  <span className="reading-v2-runtime__cell-answer-field">
                                    <ReadingV2QuestionBadge
                                      number={interaction.displayNumber}
                                      state={isAnswered(answers[interaction.interactionId]) ? 'answered' : 'empty'}
                                    />
                                    <input
                                      className="reading-v2-runtime__text-input"
                                      aria-label={`Question ${interaction.displayNumber} structured answer`}
                                      disabled={disabled}
                                      value={typeof answers[interaction.interactionId] === 'string' ? answers[interaction.interactionId] : ''}
                                      onFocus={() => onFocusInteraction(interaction)}
                                      onChange={(event) => {
                                        onFocusInteraction(interaction);
                                        onAnswer(interaction, event.currentTarget.value);
                                      }}
                                    />
                                  </span>
                                </span>
                              ))
                            : <span className="reading-v2-runtime__blank-marker">Blank</span>}
                        </span>
                      ) : <ReadingV2FormattedText text={cell.text} />}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FlowchartCompletionRuntime({
  taskGroup,
  stimulus,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
}: FamilyRendererProps) {
  if (stimulus?.content.kind !== 'flowchart-content') {
    return null;
  }

  return (
    <section className="reading-v2-runtime__structured-answer" aria-label="Flowchart completion answer flowchart">
      <h3>{taskGroup.groupTitle?.trim() || stimulus.title?.trim() || 'Flowchart'}</h3>
      <ol className="reading-v2-runtime__flowchart-answer">
        {stimulus.content.steps.map((step) => {
          const interaction = getAnchoredInteraction(taskGroup, step.anchorId);
          return (
            <li
              data-blank={interaction ? 'true' : 'false'}
              id={interaction ? getQuestionAnchorId(interaction.displayNumber) : undefined}
              key={step.stepId}
              ref={(element) => {
                if (interaction) {
                  registerQuestionAnchor?.(interaction, element);
                }
              }}
            >
              <div className="reading-v2-runtime__flowchart-box">
                {interaction ? (
                  <>
                    <InlineAnswerText
                      text={step.text}
                      interaction={interaction}
                      value={answers[interaction.interactionId]}
                      disabled={disabled}
                      ariaSuffix="structured answer"
                      onAnswer={onAnswer}
                      onFocusInteraction={onFocusInteraction}
                    />
                  </>
                ) : (
                  <ReadingV2FormattedText text={step.text} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DiagramLabelingRuntime({
  taskGroup,
  stimulus,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
}: FamilyRendererProps) {
  if (stimulus?.content.kind !== 'diagram-content') {
    return null;
  }

  return (
    <section className="reading-v2-runtime__structured-answer" aria-label="Diagram labeling answer diagram">
      <h3>{taskGroup.groupTitle?.trim() || stimulus.title?.trim() || 'Diagram'}</h3>
      <div className="reading-v2-runtime__diagram-answer">
        {stimulus.content.imageUrl ? (
          <img src={stimulus.content.imageUrl} alt={stimulus.content.imageAlt || stimulus.title?.trim() || 'Diagram for labelling'} />
        ) : (
          <div className="reading-v2-runtime__diagram-placeholder">Diagram image unavailable</div>
        )}
        {stimulus.content.hotspots.map((hotspot) => {
          const interaction = getAnchoredInteraction(taskGroup, hotspot.anchorId);
          if (!interaction) {
            return null;
          }

          return (
            <div
              className="reading-v2-runtime__diagram-label"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={hotspot.anchorId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              style={{
                left: `${hotspot.xPercent}%`,
                top: `${hotspot.yPercent}%`,
              } as CSSProperties}
            >
              <InlineAnswerText
                text={hotspot.label}
                interaction={interaction}
                value={answers[interaction.interactionId]}
                disabled={disabled}
                ariaSuffix="structured answer"
                onAnswer={onAnswer}
                onFocusInteraction={onFocusInteraction}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StructuredEntryRuntime(props: FamilyRendererProps) {
  if (props.taskGroup.officialTaskType === 'table-completion' && props.stimulus?.content.kind === 'table-content') {
    return <TableCompletionRuntime {...props} />;
  }

  if (props.taskGroup.officialTaskType === 'flowchart-completion' && props.stimulus?.content.kind === 'flowchart-content') {
    return <FlowchartCompletionRuntime {...props} />;
  }

  if (props.taskGroup.officialTaskType === 'diagram-labeling' && props.stimulus?.content.kind === 'diagram-content') {
    return <DiagramLabelingRuntime {...props} />;
  }

  return (
    <section className="reading-v2-runtime__structured-answer" aria-label="Structured task display unavailable">
      <p>Structured layout is unavailable for this task group.</p>
    </section>
  );
}

const getMatchingReferenceLabel = (taskType: string): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Matching headings reference list';
    case 'matching-information':
      return 'Paragraph reference list';
    case 'matching-features':
      return 'Matching features reference list';
    case 'matching-sentence-endings':
      return 'Matching endings reference list';
    default:
      return 'Matching option reference list';
  }
};

const getMatchingSelectPlaceholder = (taskType: string): string => {
  switch (taskType) {
    case 'matching-headings':
      return 'Select heading';
    case 'matching-information':
      return 'Select paragraph';
    case 'matching-sentence-endings':
      return 'Select ending';
    default:
      return 'Select option';
  }
};

function MatchingRuntime({
  taskGroup,
  stimulus,
  optionSets,
  answers,
  disabled,
  onAnswer,
  onFocusInteraction,
  registerQuestionAnchor,
}: FamilyRendererProps) {
  const firstMatchingInteraction = taskGroup.interactions.find((interaction) => interaction.responseShape.kind === 'matching');
  const optionSet = firstMatchingInteraction?.responseShape.kind === 'matching'
    ? getOptionSet(optionSets, firstMatchingInteraction.responseShape.optionSetId)
    : undefined;

  if (!firstMatchingInteraction || firstMatchingInteraction.responseShape.kind !== 'matching' || !optionSet) {
    return null;
  }

  const optionReuse = firstMatchingInteraction.responseShape.optionReuse;
  const selectedOptionIds = new Set(
    taskGroup.interactions
      .map((interaction) => answers[interaction.interactionId])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
  );

  return (
    <section className="reading-v2-runtime__matching-task" aria-label="Matching answer task">
      <ReadingV2ReferenceBank
        title={getMatchingReferenceLabel(taskGroup.officialTaskType).replace(' reference list', '')}
        ariaLabel={getMatchingReferenceLabel(taskGroup.officialTaskType)}
        items={optionSet.options.map((option) => ({
          id: option.optionId,
          label: option.label,
          text: option.text,
          used: optionReuse !== 'allowed' && selectedOptionIds.has(option.optionId),
        }))}
      />
      <div className="reading-v2-runtime__matching-rows">
        {taskGroup.interactions.map((interaction) => {
          const value = answers[interaction.interactionId];
          const prompt = getPromptText(interaction, taskGroup, stimulus);
          const isFeatureTask = taskGroup.officialTaskType === 'matching-features';

          return (
            <section
              className="reading-v2-runtime__matching-row"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={`Question ${interaction.displayNumber}`}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <p><ReadingV2FormattedText text={prompt} /></p>
              {isFeatureTask ? (
                <div className="reading-v2-runtime__matching-options" aria-label={`Question ${interaction.displayNumber} tap to assign choices`}>
                  {optionSet.options.map((option) => (
                    <button
                      className="reading-v2-runtime__choice-button"
                      key={option.optionId}
                      type="button"
                      disabled={disabled}
                      aria-pressed={value === option.optionId}
                      onClick={() => {
                        onFocusInteraction(interaction);
                        onAnswer(interaction, option.optionId);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="reading-v2-runtime__matching-select">
                  <span>Answer</span>
                  <select
                    aria-label={`Question ${interaction.displayNumber} answer`}
                    disabled={disabled}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => {
                      onFocusInteraction(interaction);
                      onAnswer(interaction, event.currentTarget.value);
                    }}
                  >
                    <option value="">{getMatchingSelectPlaceholder(taskGroup.officialTaskType)}</option>
                    {optionSet.options.map((option) => {
                      const usedElsewhere = optionReuse !== 'allowed'
                        && taskGroup.interactions.some((otherInteraction) =>
                          otherInteraction.interactionId !== interaction.interactionId
                          && answers[otherInteraction.interactionId] === option.optionId,
                        );
                      return (
                        <option key={option.optionId} value={option.optionId} disabled={usedElsewhere}>
                          {option.text ? `${option.label}. ${option.text}` : option.label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function RuntimeInteractionControls({
  taskGroup,
  stimulus,
  optionSets,
  answers,
  disabled,
  onAnswer,
  onClear,
  onFocusInteraction,
  registerQuestionAnchor,
}: FamilyRendererProps) {
  const summaryTextLayout = parseProjectedSummaryTextLayout(taskGroup);
  if (summaryTextLayout) {
    return (
      <SummaryTextRuntime
        taskGroup={taskGroup}
        stimulus={stimulus}
        optionSets={optionSets}
        answers={answers}
        disabled={disabled}
        onAnswer={onAnswer}
        onClear={onClear}
        onFocusInteraction={onFocusInteraction}
        registerQuestionAnchor={registerQuestionAnchor}
        layout={summaryTextLayout}
      />
    );
  }

  const summaryListLayout = parseProjectedSummaryListLayout(taskGroup);
  if (summaryListLayout) {
    return (
      <SummaryListRuntime
        taskGroup={taskGroup}
        stimulus={stimulus}
        optionSets={optionSets}
        answers={answers}
        disabled={disabled}
        onAnswer={onAnswer}
        onClear={onClear}
        onFocusInteraction={onFocusInteraction}
        registerQuestionAnchor={registerQuestionAnchor}
        layout={summaryListLayout}
      />
    );
  }

  const noteLayout = parseProjectedNoteCompletionLayout(taskGroup);
  if (noteLayout) {
    return (
      <NoteCompletionRuntime
        taskGroup={taskGroup}
        stimulus={stimulus}
        optionSets={optionSets}
        answers={answers}
        disabled={disabled}
        onAnswer={onAnswer}
        onClear={onClear}
        onFocusInteraction={onFocusInteraction}
        registerQuestionAnchor={registerQuestionAnchor}
        layout={noteLayout}
      />
    );
  }

  if (
    taskGroup.officialTaskType === 'table-completion'
    || taskGroup.officialTaskType === 'flowchart-completion'
    || taskGroup.officialTaskType === 'diagram-labeling'
  ) {
    return (
      <StructuredEntryRuntime
        taskGroup={taskGroup}
        stimulus={stimulus}
        optionSets={optionSets}
        answers={answers}
        disabled={disabled}
        onAnswer={onAnswer}
        onClear={onClear}
        onFocusInteraction={onFocusInteraction}
        registerQuestionAnchor={registerQuestionAnchor}
      />
    );
  }

  if (taskGroup.engineeringFamily === 'matching') {
    const matchingRuntime = (
      <MatchingRuntime
        taskGroup={taskGroup}
        stimulus={stimulus}
        optionSets={optionSets}
        answers={answers}
        disabled={disabled}
        onAnswer={onAnswer}
        onClear={onClear}
        onFocusInteraction={onFocusInteraction}
        registerQuestionAnchor={registerQuestionAnchor}
      />
    );

    return matchingRuntime;
  }

  return (
    <div className="reading-v2-runtime__interactions">
      {taskGroup.interactions.map((interaction) => {
        const value = answers[interaction.interactionId];
        const prompt = getPromptText(interaction, taskGroup, stimulus);
        const label = `Question ${interaction.displayNumber}`;
        if (interaction.responseShape.kind === 'free-text') {
          const isShortAnswer = taskGroup.officialTaskType === 'short-answer';
          return (
            <section
              className={`reading-v2-runtime__question-card ${isShortAnswer ? 'reading-v2-runtime__question-card--short-answer' : ''}`}
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={label}
              onFocus={() => onFocusInteraction(interaction)}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <FreeTextAnswerControl
                label={label}
                prompt={prompt}
                value={value}
                interaction={interaction}
                disabled={disabled}
                onAnswer={(currentInteraction, nextValue) => {
                  onFocusInteraction(currentInteraction);
                  onAnswer(currentInteraction, nextValue);
                }}
                inlineAfterPrompt={isShortAnswer}
              />
            </section>
          );
        }

        if (interaction.responseShape.kind === 'single-choice') {
          const optionSet = getOptionSet(optionSets, interaction.responseShape.optionSetId);
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={label}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
              <div className="reading-v2-runtime__option-stack">
                {optionSet?.options.map((option) => (
                  <ReadingV2ChoiceOption
                    key={option.optionId}
                    label={option.label}
                    text={option.text}
                    selected={value === option.optionId}
                    disabled={disabled}
                    name={interaction.interactionId}
                    variant="radio"
                    onChange={() => {
                      onFocusInteraction(interaction);
                      onAnswer(interaction, option.optionId);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        }

        if (interaction.responseShape.kind === 'multi-select') {
          const selected = asArray(value);
          const selectionLimit = interaction.responseShape.selectionLimit;
          const optionSet = getOptionSet(optionSets, interaction.responseShape.optionSetId);
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={label}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
              <p className="reading-v2-runtime__selection-count">
                Selected {selected.length} of {selectionLimit}
              </p>
              <div className="reading-v2-runtime__option-stack">
                {optionSet?.options.map((option) => (
                  <ReadingV2ChoiceOption
                    key={option.optionId}
                    label={option.label}
                    text={option.text}
                    selected={selected.includes(option.optionId)}
                    disabled={disabled || (!selected.includes(option.optionId) && selected.length >= selectionLimit)}
                    variant="checkbox"
                    title={!selected.includes(option.optionId) && selected.length >= selectionLimit ? `Deselect another answer first. Choose ${selectionLimit}.` : undefined}
                    onChange={() => {
                      const next = selected.includes(option.optionId)
                        ? selected.filter((optionId) => optionId !== option.optionId)
                        : [...selected, option.optionId].slice(0, selectionLimit);
                      onFocusInteraction(interaction);
                      onAnswer(interaction, next);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        }

        if (interaction.responseShape.kind === 'binary-judgement') {
          const vocabulary = interaction.responseShape.vocabulary === 'TFNG'
            ? [
              { value: 'True', label: 'TRUE' },
              { value: 'False', label: 'FALSE' },
              { value: 'Not Given', label: 'NOT GIVEN' },
            ]
            : [
              { value: 'Yes', label: 'YES' },
              { value: 'No', label: 'NO' },
              { value: 'Not Given', label: 'NOT GIVEN' },
            ];
          return (
            <section
              className="reading-v2-runtime__question-card reading-v2-runtime__question-card--judgement"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={label}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
              <div className="reading-v2-runtime__segmented reading-v2-runtime__segmented--judgement" aria-label={`${label} locked vocabulary`}>
                {vocabulary.map((item) => (
                  <label
                    className="reading-v2-runtime__segmented-button"
                    data-selected={value === item.value ? 'true' : 'false'}
                    key={item.value}
                  >
                    <input
                      type="radio"
                      name={interaction.interactionId}
                      disabled={disabled}
                      checked={value === item.value}
                      onChange={() => {
                        onFocusInteraction(interaction);
                        onAnswer(interaction, item.value);
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        }

        if (interaction.responseShape.kind === 'matching') {
          const responseShape = interaction.responseShape;
          const optionSet = getOptionSet(optionSets, responseShape.optionSetId);
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={getQuestionAnchorId(interaction.displayNumber)}
              key={interaction.interactionId}
              ref={(element) => registerQuestionAnchor?.(interaction, element)}
              aria-label={label}
            >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
              <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
              <p className="reading-v2-runtime__selection-count">Option reuse: {responseShape.optionReuse}</p>
              <div className="reading-v2-runtime__matching-options" aria-label={`${label} tap to assign choices`}>
                {optionSet?.options.map((option) => (
                  (() => {
                    const usedElsewhere = responseShape.optionReuse !== 'allowed'
                      && taskGroup.interactions.some((otherInteraction) =>
                        otherInteraction.interactionId !== interaction.interactionId
                        && answers[otherInteraction.interactionId] === option.optionId,
                      );
                    return (
                      <button
                        className="reading-v2-runtime__choice-button"
                        key={option.optionId}
                        type="button"
                        disabled={disabled || usedElsewhere}
                        aria-pressed={value === option.optionId}
                        title={usedElsewhere ? 'Already used for another question.' : undefined}
                        onClick={() => {
                          onFocusInteraction(interaction);
                          onAnswer(interaction, option.optionId);
                        }}
                      >
                        {option.text ? `${option.label}. ${option.text}` : option.label}
                      </button>
                    );
                  })()
                ))}
              </div>
            </section>
          );
        }

        return (
          <section
            className="reading-v2-runtime__question-card"
            id={getQuestionAnchorId(interaction.displayNumber)}
            key={interaction.interactionId}
            ref={(element) => registerQuestionAnchor?.(interaction, element)}
            aria-label={label}
          >
              <ReadingV2QuestionBadge
                className="reading-v2-runtime__question-number"
                number={interaction.displayNumber}
                state={isAnswered(value) ? 'answered' : 'empty'}
              />
            <p className="reading-v2-runtime__prompt"><ReadingV2FormattedText text={prompt} /></p>
            <p className="reading-v2-runtime__selection-count">
              {interaction.responseShape.structure === 'table'
                ? 'Use the table overview and focused answer entry.'
                : interaction.responseShape.structure === 'flowchart'
                  ? 'Use the flowchart overview and focused answer entry.'
                  : 'Use the zoomable diagram overview and label target entry.'}
            </p>
            <input
              className="reading-v2-runtime__text-input"
              aria-label={`${label} structured answer`}
              disabled={disabled}
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => {
                onFocusInteraction(interaction);
                onAnswer(interaction, event.currentTarget.value);
              }}
            />
          </section>
        );
      })}
    </div>
  );
}

function RuntimeTaskGroupPanel(props: FamilyRendererProps) {
  const { taskGroup } = props;
  const renderedInstructionTexts = taskGroup.instructionBlocks.map((block) =>
    getRuntimeInstructionText(taskGroup, block.text),
  );
  const instructions = (
    <>
      {taskGroup.instructionBlocks.map((block, index) => (
        <ReadingV2InstructionText key={block.id} text={renderedInstructionTexts[index] ?? ''} />
      ))}
    </>
  );

  return (
    <ReadingV2TaskFrame
      rangeLabel={getTaskGroupRange(taskGroup)}
      instructions={instructions}
    >
      <RuntimeInteractionControls {...props} />
    </ReadingV2TaskFrame>
  );
}

interface SectionQuestionPanelProps {
  readonly taskGroups: readonly ReadingV2ProjectedTaskGroup[];
  readonly stimuli: readonly ReadingV2ProjectedStimulus[];
  readonly optionSets: readonly ReadingV2ProjectedOptionSet[];
  readonly answers: Readonly<Record<string, ReadingV2AnswerValue>>;
  readonly disabled: boolean;
  readonly onAnswer: (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => void;
  readonly onClear: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly onFocusInteraction: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly registerQuestionAnchor?: (interaction: ReadingV2ProjectedInteraction, element: HTMLElement | null) => void;
}

function SectionQuestionPanel({
  taskGroups,
  stimuli,
  optionSets,
  answers,
  disabled,
  onAnswer,
  onClear,
  onFocusInteraction,
  registerQuestionAnchor,
}: SectionQuestionPanelProps) {
  return (
    <div className="reading-v2-runtime__section-questions">
      {taskGroups.map((taskGroup) => (
        <RuntimeTaskGroupPanel
          key={taskGroup.taskGroupId}
          taskGroup={taskGroup}
          stimulus={getPrimaryStimulus(taskGroup, stimuli)}
          optionSets={optionSets}
          answers={answers}
          disabled={disabled}
          onAnswer={onAnswer}
          onClear={onClear}
          onFocusInteraction={onFocusInteraction}
          registerQuestionAnchor={registerQuestionAnchor}
        />
      ))}
    </div>
  );
}

interface PassageTabsProps {
  readonly sections: readonly ReadingV2ProjectedSection[];
  readonly activeSectionId: string;
  readonly getSectionProgress: (section: ReadingV2ProjectedSection) => string;
  readonly onSelectSection: (section: ReadingV2ProjectedSection) => void;
  readonly variant: 'desktop' | 'phone';
}

function PassageTabs({
  sections,
  activeSectionId,
  getSectionProgress,
  onSelectSection,
  variant,
}: PassageTabsProps) {
  return (
    <nav className={`reading-v2-runtime__passage-tabs reading-v2-runtime__passage-tabs--${variant}`} aria-label="Passage tabs">
      {sections.map((section, index) => (
        <button
          className="reading-v2-runtime__passage-tab"
          key={section.sectionId}
          type="button"
          aria-pressed={section.sectionId === activeSectionId}
          onClick={() => onSelectSection(section)}
        >
          <span>{getPassageLabel(index)}</span>
          <small>{getSectionProgress(section)}</small>
        </button>
      ))}
    </nav>
  );
}

interface PassageControlsProps {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly highlighterActive: boolean;
  readonly highlightColor: string;
  readonly onFontSizeChange: (fontSize: number) => void;
  readonly onLineHeightChange: (lineHeight: number) => void;
  readonly onHighlighterActiveChange: (active: boolean) => void;
  readonly onHighlightColorChange: (color: string) => void;
  readonly onClearHighlights: () => void;
}

function PassageControls({
  fontSize,
  lineHeight,
  highlighterActive,
  highlightColor,
  onFontSizeChange,
  onLineHeightChange,
  onHighlighterActiveChange,
  onHighlightColorChange,
  onClearHighlights,
}: PassageControlsProps) {
  const colors = ['#fff59d', '#b7f7c4', '#bfe8ff'];

  return (
    <div className="reading-v2-runtime__passage-controls" aria-label="Passage controls">
      <div className="reading-v2-runtime__control-group" aria-label="Font size controls">
        <span>Font:</span>
        <button type="button" onClick={() => onFontSizeChange(Math.max(14, fontSize - 1))}>A-</button>
        <span className="reading-v2-runtime__control-value">{fontSize}px</span>
        <button type="button" onClick={() => onFontSizeChange(Math.min(20, fontSize + 1))}>A+</button>
      </div>
      <div className="reading-v2-runtime__control-group" aria-label="Line spacing controls">
        <span>Line:</span>
        <button type="button" onClick={() => onLineHeightChange(Math.max(1.4, Number((lineHeight - 0.1).toFixed(1))))}>-</button>
        <span className="reading-v2-runtime__control-value">{lineHeight.toFixed(2)}</span>
        <button type="button" onClick={() => onLineHeightChange(Math.min(2, Number((lineHeight + 0.1).toFixed(1))))}>+</button>
      </div>
      <div className="reading-v2-runtime__control-group" aria-label="Highlighter controls">
        <button
          type="button"
          aria-pressed={highlighterActive}
          onClick={() => onHighlighterActiveChange(!highlighterActive)}
        >
          Highlighter {highlighterActive ? 'ON' : 'OFF'}
        </button>
        {colors.map((color) => (
          <button
            className="reading-v2-runtime__swatch"
            key={color}
            type="button"
            aria-label={`Highlight color ${color}`}
            aria-pressed={highlightColor === color}
            style={{ backgroundColor: color }}
            onClick={() => onHighlightColorChange(color)}
          />
        ))}
        <button type="button" onClick={onClearHighlights}>Clear all</button>
      </div>
    </div>
  );
}

interface RuntimeFooterNavProps {
  readonly sections: readonly ReadingV2ProjectedSection[];
  readonly activeSectionId: string;
  readonly activeInteractionId: string | null;
  readonly taskGroupsBySection: (section: ReadingV2ProjectedSection) => readonly ReadingV2ProjectedTaskGroup[];
  readonly isInteractionComplete: (interaction: ReadingV2ProjectedInteraction) => boolean;
  readonly canSubmit: boolean;
  readonly submitDisabled: boolean;
  readonly onSelectSection: (section: ReadingV2ProjectedSection) => void;
  readonly onSelectInteraction: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly onSubmit: () => void;
}

type RuntimeNavigationScrollTarget =
  | { readonly kind: 'section' }
  | { readonly kind: 'interaction'; readonly displayNumber: number };

const QUESTION_FOCUS_TOP_OFFSET_PX = 72;
const QUESTION_FOCUS_BOTTOM_MARGIN_PX = 24;
const QUESTION_FOCUS_CLASS = 'reading-v2-runtime__question-anchor--focused';
const QUESTION_FOCUS_RUNWAY_PROPERTY = '--reading-v2-runtime-focus-runway';

const scrollRuntimePanelToTop = (element: HTMLElement | null): void => {
  if (!element) {
    return;
  }

  element.style.removeProperty(QUESTION_FOCUS_RUNWAY_PROPERTY);
  element.querySelectorAll(`.${QUESTION_FOCUS_CLASS}`).forEach((focusedElement) => {
    focusedElement.classList.remove(QUESTION_FOCUS_CLASS);
  });

  element.scrollTop = 0;
  if (typeof element.scrollTo === 'function') {
    try {
      element.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      element.scrollTo(0, 0);
    }
  }
};

const scrollElementTo = (element: HTMLElement, top: number, left = element.scrollLeft): void => {
  element.scrollTop = top;
  element.scrollLeft = left;

  if (typeof element.scrollTo === 'function') {
    try {
      element.scrollTo({ top, left, behavior: 'auto' });
    } catch {
      element.scrollTo(left, top);
    }
  }
};

const focusRuntimeQuestionAnchor = (questionElement: HTMLElement): void => {
  questionElement.classList.remove(QUESTION_FOCUS_CLASS);
  void questionElement.offsetWidth;
  questionElement.classList.add(QUESTION_FOCUS_CLASS);

  if (!questionElement.hasAttribute('tabindex')) {
    questionElement.tabIndex = -1;
  }

  try {
    questionElement.focus({ preventScroll: true });
  } catch {
    questionElement.focus();
  }
};

const scrollNestedContainersToRevealQuestion = (
  panel: HTMLElement,
  questionElement: HTMLElement,
): void => {
  let container = questionElement.parentElement;

  while (container && container !== panel) {
    const scrollableElement = container;
    if (scrollableElement.scrollWidth > scrollableElement.clientWidth) {
      const containerRect = scrollableElement.getBoundingClientRect();
      const questionRect = questionElement.getBoundingClientRect();
      const leftBoundary = containerRect.left + 16;
      const rightBoundary = containerRect.right - 16;
      let nextScrollLeft = scrollableElement.scrollLeft;

      if (questionRect.left < leftBoundary) {
        nextScrollLeft -= leftBoundary - questionRect.left;
      } else if (questionRect.right > rightBoundary) {
        nextScrollLeft += questionRect.right - rightBoundary;
      }

      const maxScrollLeft = Math.max(0, scrollableElement.scrollWidth - scrollableElement.clientWidth);
      const clampedScrollLeft = Math.min(Math.max(0, nextScrollLeft), maxScrollLeft);
      if (clampedScrollLeft !== scrollableElement.scrollLeft) {
        scrollElementTo(scrollableElement, scrollableElement.scrollTop, clampedScrollLeft);
      }
    }

    container = container.parentElement;
  }
};

const scrollRuntimeQuestionToFocusSlot = (
  panel: HTMLElement | null,
  questionElement: HTMLElement | undefined,
): void => {
  if (!panel || !questionElement) {
    return;
  }

  panel.querySelectorAll(`.${QUESTION_FOCUS_CLASS}`).forEach((element) => {
    element.classList.remove(QUESTION_FOCUS_CLASS);
  });
  focusRuntimeQuestionAnchor(questionElement);

  const focusRunway = Math.max(
    0,
    panel.clientHeight - QUESTION_FOCUS_TOP_OFFSET_PX - questionElement.offsetHeight - QUESTION_FOCUS_BOTTOM_MARGIN_PX,
  );
  panel.style.setProperty(QUESTION_FOCUS_RUNWAY_PROPERTY, `${Math.round(focusRunway)}px`);
  const panelRect = panel.getBoundingClientRect();
  const questionRect = questionElement.getBoundingClientRect();
  const maxScrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
  const nextScrollTop = Math.min(
    Math.max(
      0,
      panel.scrollTop + questionRect.top - panelRect.top - QUESTION_FOCUS_TOP_OFFSET_PX,
    ),
    maxScrollTop,
  );

  scrollElementTo(panel, nextScrollTop, 0);
  scrollNestedContainersToRevealQuestion(panel, questionElement);
};

function RuntimeFooterNav({
  sections,
  activeSectionId,
  activeInteractionId,
  taskGroupsBySection,
  isInteractionComplete,
  canSubmit,
  submitDisabled,
  onSelectSection,
  onSelectInteraction,
  onSubmit,
}: RuntimeFooterNavProps) {
  return (
    <footer className="reading-v2-runtime__footer" aria-label="Reading footer navigator">
      <div className="reading-v2-runtime__footer-parts" aria-label="Passage navigator">
        {sections.map((section, index) => {
          const isActive = section.sectionId === activeSectionId;
          const sectionInteractions = taskGroupsBySection(section).flatMap((taskGroup) => taskGroup.interactions);
          return (
            <div
              className="reading-v2-runtime__footer-part-slot"
              data-active={isActive ? 'true' : 'false'}
              key={section.sectionId}
            >
              <button
                className="reading-v2-runtime__footer-part"
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectSection(section)}
              >
                <span>Part {index + 1}</span>
                {!isActive ? <small>({getSectionRange(taskGroupsBySection(section)).replace(/^Q/, '')})</small> : null}
              </button>
              {isActive ? (
                <div className="reading-v2-runtime__footer-questions" aria-label="Question navigator">
                  {sectionInteractions.map((interaction) => (
                    <button
                      className="reading-v2-runtime__footer-question"
                      key={interaction.interactionId}
                      type="button"
                      data-answered={isInteractionComplete(interaction) ? 'true' : 'false'}
                      aria-pressed={interaction.interactionId === activeInteractionId}
                      onClick={() => onSelectInteraction(interaction)}
                    >
                      {interaction.displayNumber}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        className="reading-v2-runtime__finish-button"
        type="button"
        aria-label="Submit"
        disabled={!canSubmit || submitDisabled}
        onClick={onSubmit}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
    </footer>
  );
}

export function ReadingV2RuntimeShell({
  projection,
  state = 'ready',
  onSubmit,
  initialAnswers,
  onAnswersChange,
  persistenceKey,
  lifecycle,
  timer,
}: ReadingV2RuntimeShellProps) {
  const { isMobile } = useScreenSize();
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeTaskGroupId, setActiveTaskGroupId] = useState<string | null>(null);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Readonly<Record<string, ReadingV2AnswerValue>>>(initialAnswers ?? {});
  const [isQuestionSheetOpen, setIsQuestionSheetOpen] = useState(false);
  const [isMobileOverflowOpen, setIsMobileOverflowOpen] = useState(false);
  const [showReviewSummary, setShowReviewSummary] = useState(false);
  const [preservedScrollLabel, setPreservedScrollLabel] = useState('top');
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'pending' | 'failure' | 'success'>('idle');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [autoSubmitReason, setAutoSubmitReason] = useState<'timer' | 'force-submit' | null>(null);
  const [navigationScrollVersion, setNavigationScrollVersion] = useState(0);
  const [leftWidthPercent, setLeftWidthPercent] = useState(50);
  const [passageFontSize, setPassageFontSize] = useState(16);
  const [passageLineHeight, setPassageLineHeight] = useState(1.5);
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#fff59d');
  const [highlights, setHighlights] = useState<readonly PassageHighlight[]>([]);
  const desktopQuestionPanelRef = useRef<HTMLElement | null>(null);
  const questionAnchorRefs = useRef(new Map<number, HTMLElement>());
  const pendingNavigationScrollRef = useRef<RuntimeNavigationScrollTarget | null>(null);
  const phonePassageRef = useRef<HTMLDivElement | null>(null);
  const phonePassageScrollTopBySectionRef = useRef<Record<string, number>>({});
  const submitLockRef = useRef(false);
  const persistenceHydratedRef = useRef(!persistenceKey);
  const answersDirtyRef = useRef(false);
  const answersRef = useRef(answers);
  const initialAnswersRef = useRef(initialAnswers);
  const lastForceSubmitTokenRef = useRef<string | number | null | undefined>(null);
  const autoSubmitTokenRef = useRef<string | null>(null);
  const evaluatedTimerTokenRef = useRef<string | null>(null);

  const runtimeProjection = useMemo(() => {
    if (!projection) {
      return undefined;
    }

    assertReadingV2RuntimeProjection(projection);
    return projection;
  }, [projection]);

  const sections = runtimeProjection?.content.sections ?? [];
  const taskGroups = runtimeProjection?.content.taskGroups ?? [];
  const taskGroupsBySection = (section: ReadingV2ProjectedSection) => getSectionTaskGroups(section, taskGroups);
  const allInteractions = taskGroups.flatMap((taskGroup) => taskGroup.interactions);
  const activeSection = sections.find((section) => section.sectionId === activeSectionId)
    ?? sections.find((section) => section.taskGroupIds.includes(activeTaskGroupId ?? ''))
    ?? sections[0];
  const activeSectionIndex = activeSection
    ? Math.max(0, sections.findIndex((section) => section.sectionId === activeSection.sectionId))
    : 0;
  const activeSectionScrollKey = activeSection?.sectionId ?? '__unassigned-section__';
  const activeSectionTaskGroups = activeSection ? taskGroupsBySection(activeSection) : [];
  const activeTaskGroup = activeSectionTaskGroups.find((taskGroup) => taskGroup.taskGroupId === activeTaskGroupId)
    ?? activeSectionTaskGroups[0]
    ?? taskGroups[0];
  const activeStimulus = activeSection && runtimeProjection
    ? getSectionStimulus(activeSection, runtimeProjection.content.stimuli)
      ?? (activeTaskGroup ? getPrimaryStimulus(activeTaskGroup, runtimeProjection.content.stimuli) : undefined)
    : undefined;
  const activeSectionInteractions = activeSectionTaskGroups.flatMap((taskGroup) => taskGroup.interactions);
  const activeInteraction = allInteractions.find((interaction) => interaction.interactionId === activeInteractionId)
    ?? activeSectionInteractions[0]
    ?? null;
  const anchorQuestionNumbers = useMemo(
    () => new Map(
      allInteractions
        .filter((interaction) => Boolean(interaction.primaryAnchorId))
        .map((interaction) => [interaction.primaryAnchorId as string, interaction.displayNumber]),
    ),
    [allInteractions],
  );
  const isRuntimeInteractionComplete = (interaction: ReadingV2ProjectedInteraction): boolean =>
    isInteractionComplete(interaction, answers[interaction.interactionId]);
  const answeredCount = allInteractions.filter(isRuntimeInteractionComplete).length;
  const activeSectionAnsweredCount = activeSectionInteractions.filter(
    isRuntimeInteractionComplete,
  ).length;
  const runtimeProjectionId = runtimeProjection?.projectionId;
  const runtimeProjectionKind = runtimeProjection?.projectionKind;
  const canSubmit = typeof onSubmit === 'function';
  const submitDisabled = submitPhase === 'pending' || submitPhase === 'success';
  const lifecycleStatus = lifecycle?.status;
  const lifecycleLocksInput =
    lifecycleStatus === 'waiting' ||
    lifecycleStatus === 'paused' ||
    lifecycleStatus === 'completed';
  const inputsDisabled = submitDisabled || lifecycleLocksInput;
  const manualSubmitDisabled = submitDisabled || lifecycleLocksInput;
  const timerDurationSeconds =
    typeof timer?.durationMinutes === 'number' && timer.durationMinutes > 0
      ? Math.round(timer.durationMinutes * 60)
      : null;
  const formattedTimeRemaining = timeRemaining === null
    ? null
    : `${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}`;
  const headerTimerLabel = lifecycleStatus === 'paused'
    ? 'Paused'
    : submitPhase === 'success'
      ? 'Done'
      : formattedTimeRemaining ?? '60:00';
  const isTimerLow = timeRemaining !== null && timeRemaining > 0 && timeRemaining <= 300;

  answersRef.current = answers;
  initialAnswersRef.current = initialAnswers;

  useEffect(() => {
    if (persistenceKey) {
      return;
    }

    answersDirtyRef.current = false;
    setAnswers(initialAnswers ?? {});
  }, [initialAnswers, persistenceKey, runtimeProjectionId]);

  useEffect(() => {
    if (!persistenceKey) {
      persistenceHydratedRef.current = true;
      return;
    }

    let cancelled = false;
    persistenceHydratedRef.current = false;
    answersDirtyRef.current = false;

    const hydrateAnswers = async () => {
      const saved = await storage.get<Readonly<Record<string, ReadingV2AnswerValue>>>(persistenceKey);
      if (cancelled) {
        return;
      }

      persistenceHydratedRef.current = true;
      logRuntimeDiagnostic('answers_persistence_hydrated', {
        projectionId: runtimeProjectionId,
        hasSavedAnswers: Boolean(saved),
        dirtyDuringHydration: answersDirtyRef.current,
      });

      if (answersDirtyRef.current) {
        await storage.set(persistenceKey, answersRef.current);
        return;
      }

      setAnswers(saved ?? initialAnswersRef.current ?? {});
    };

    void hydrateAnswers();

    return () => {
      cancelled = true;
    };
  }, [persistenceKey, runtimeProjectionId]);

  useEffect(() => {
    onAnswersChange?.(answers);

    if (!persistenceKey || !persistenceHydratedRef.current) {
      return;
    }

    void storage.set(persistenceKey, answers);
  }, [answers, onAnswersChange, persistenceKey]);

  useEffect(() => {
    if (!persistenceKey || submitPhase !== 'success') {
      return;
    }

    void storage.remove(persistenceKey);
  }, [persistenceKey, submitPhase]);

  useEffect(() => {
    if (!timerDurationSeconds || !timer?.startedAt) {
      setTimeRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const timerToken = `timer:${timer.startedAt}:${timerDurationSeconds}`;
      const isInitialTimerEvaluation = evaluatedTimerTokenRef.current !== timerToken;
      if (isInitialTimerEvaluation) {
        evaluatedTimerTokenRef.current = timerToken;
      }

      const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - timer.startedAt! - (timer.pausedDurationMs ?? 0)) / 1000),
      );
      const nextRemaining = Math.max(0, timerDurationSeconds - elapsedSeconds);
      setTimeRemaining(nextRemaining);

      if (
        nextRemaining <= 0 &&
        timer.autoSubmitOnExpiry &&
        timer.running !== false &&
        canSubmit &&
        autoSubmitTokenRef.current !== timerToken
      ) {
        autoSubmitTokenRef.current = timerToken;

        if (isInitialTimerEvaluation) {
          logRuntimeDiagnostic('timer_initial_expired_auto_submit_suppressed', {
            projectionId: runtimeProjectionId,
            startedAt: timer.startedAt,
            durationMinutes: timer.durationMinutes,
          });
          return;
        }

        logRuntimeDiagnostic('timer_auto_submit_requested', {
          projectionId: runtimeProjectionId,
          startedAt: timer.startedAt,
          durationMinutes: timer.durationMinutes,
        });
        setAutoSubmitReason('timer');
      }
    };

    updateRemaining();

    if (timer.running === false || submitPhase === 'success') {
      return;
    }

    const intervalId = setInterval(updateRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [
    timer?.autoSubmitOnExpiry,
    timer?.pausedDurationMs,
    timer?.running,
    timer?.startedAt,
    timerDurationSeconds,
    canSubmit,
    runtimeProjectionId,
    submitPhase,
  ]);

  useEffect(() => {
    const token = lifecycle?.forceSubmitToken;
    if (token === null || token === undefined || token === lastForceSubmitTokenRef.current) {
      return;
    }

    lastForceSubmitTokenRef.current = token;
    logRuntimeDiagnostic('force_submit_requested', {
      projectionId: runtimeProjectionId,
      token,
    });
    setAutoSubmitReason('force-submit');
  }, [lifecycle?.forceSubmitToken, runtimeProjectionId]);

  useEffect(() => {
    if (!autoSubmitReason || !runtimeProjection || !onSubmit || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitPhase('pending');

    const payload: ReadingV2RuntimeSubmitPayload = {
      projectionId: runtimeProjection.projectionId,
      sourceSnapshotVersionId: runtimeProjection.sourceSnapshotVersionId,
      materialId: runtimeProjection.materialId,
      answers: allInteractions
        .filter((interaction) => isAnswered(answers[interaction.interactionId]))
        .map((interaction) => ({
          interactionId: interaction.interactionId,
          taskGroupId: interaction.taskGroupId,
          visibleNumber: interaction.displayNumber,
          value: getSubmissionAnswerValue(
            interaction,
            answers[interaction.interactionId] ?? '',
            runtimeProjection.content.optionSets,
          ),
        })),
    };

    void Promise.resolve(onSubmit(payload))
      .then(() => {
        logRuntimeDiagnostic('auto_submit_succeeded', {
          projectionId: runtimeProjection.projectionId,
          reason: autoSubmitReason,
          answerCount: payload.answers.length,
        });
        setSubmitPhase('success');
        setShowReviewSummary(false);
      })
      .catch(() => {
        logRuntimeDiagnostic('auto_submit_failed', {
          projectionId: runtimeProjection.projectionId,
          reason: autoSubmitReason,
          answerCount: payload.answers.length,
        });
        setSubmitPhase('failure');
        submitLockRef.current = false;
        setShowReviewSummary(true);
      })
      .finally(() => {
        setAutoSubmitReason(null);
      });
  }, [allInteractions, answers, autoSubmitReason, onSubmit, runtimeProjection]);

  useEffect(() => {
    if (!runtimeProjection || sections.length === 0) {
      return;
    }

    const nextSection = sections.find((section) => section.sectionId === activeSectionId) ?? sections[0];
    const nextTaskGroup = nextSection ? taskGroupsBySection(nextSection)[0] : undefined;
    const nextInteraction = nextTaskGroup?.interactions[0];

    if (!activeSectionId && nextSection) {
      setActiveSectionId(nextSection.sectionId);
    }
    if (!activeTaskGroupId && nextTaskGroup) {
      setActiveTaskGroupId(nextTaskGroup.taskGroupId);
    }
    if (!activeInteractionId && nextInteraction) {
      setActiveInteractionId(nextInteraction.interactionId);
    }
  }, [activeInteractionId, activeSectionId, activeTaskGroupId, runtimeProjectionId, sections, taskGroups]);

  useEffect(() => {
    if (!runtimeProjection || !activeTaskGroup || state !== 'ready') {
      return;
    }

    logRuntimeDiagnostic('runtime_layout_ready', {
      projectionId: runtimeProjection.projectionId,
      projectionKind: runtimeProjection.projectionKind,
      layout: isMobile ? 'phone' : 'desktop-tablet',
      sectionCount: sections.length,
      taskGroupCount: taskGroups.length,
      interactionCount: allInteractions.length,
      activeSectionId: activeSection?.sectionId,
      activeTaskGroupId: activeTaskGroup.taskGroupId,
      answeredCount,
    });
  }, [
    activeSection?.sectionId,
    activeTaskGroup?.taskGroupId,
    allInteractions.length,
    answeredCount,
    isMobile,
    runtimeProjectionId,
    runtimeProjectionKind,
    state,
    sections.length,
    taskGroups.length,
  ]);

  useEffect(() => {
    if (!isMobile || isQuestionSheetOpen || !phonePassageRef.current) {
      return;
    }

    phonePassageRef.current.scrollTop = phonePassageScrollTopBySectionRef.current[activeSectionScrollKey] ?? 0;
  }, [isMobile, isQuestionSheetOpen, activeSectionScrollKey]);

  useLayoutEffect(() => {
    const pendingTarget = pendingNavigationScrollRef.current;
    if (!pendingTarget || isMobile) {
      return;
    }

    pendingNavigationScrollRef.current = null;

    if (pendingTarget.kind === 'section') {
      scrollRuntimePanelToTop(desktopQuestionPanelRef.current);
      return;
    }

    scrollRuntimeQuestionToFocusSlot(
      desktopQuestionPanelRef.current,
      questionAnchorRefs.current.get(pendingTarget.displayNumber),
    );
  }, [activeInteractionId, activeSectionId, activeTaskGroupId, isMobile, navigationScrollVersion]);

  if (state !== 'ready') {
    const stateCopy = RUNTIME_STATES[state];
    return (
      <main aria-label="Reading V2 runtime state">
        <h1>{stateCopy.title}</h1>
        <p>{stateCopy.message}</p>
      </main>
    );
  }

  if (!runtimeProjection) {
    const stateCopy = RUNTIME_STATES['missing-projection'];
    return (
      <main aria-label="Reading V2 runtime state">
        <h1>{stateCopy.title}</h1>
        <p>{stateCopy.message}</p>
      </main>
    );
  }

  if (!activeSection || !activeTaskGroup || runtimeProjection.content.sections.length === 0) {
    const stateCopy = RUNTIME_STATES.empty;
    return (
      <main aria-label="Reading V2 runtime state">
        <h1>{stateCopy.title}</h1>
        <p>{stateCopy.message}</p>
      </main>
    );
  }

  const registerQuestionAnchor = (
    interaction: ReadingV2ProjectedInteraction,
    element: HTMLElement | null,
  ) => {
    if (element) {
      questionAnchorRefs.current.set(interaction.displayNumber, element);
      return;
    }

    questionAnchorRefs.current.delete(interaction.displayNumber);
  };

  const queueDesktopNavigationScroll = (target: RuntimeNavigationScrollTarget) => {
    if (isMobile) {
      return;
    }

    pendingNavigationScrollRef.current = target;
    setNavigationScrollVersion((current) => current + 1);
  };

  const saveCurrentPhonePassageScroll = () => {
    const scrollTop = phonePassageRef.current?.scrollTop ?? 0;
    phonePassageScrollTopBySectionRef.current[activeSectionScrollKey] = scrollTop;
    return scrollTop;
  };

  const focusInteraction = (
    interaction: ReadingV2ProjectedInteraction,
    options: { readonly scrollIntoView?: boolean } = {},
  ) => {
    const owningTaskGroup = taskGroups.find((taskGroup) => taskGroup.taskGroupId === interaction.taskGroupId);
    const owningSection = sections.find((section) => section.taskGroupIds.includes(interaction.taskGroupId));
    if (isMobile && !isQuestionSheetOpen && owningSection?.sectionId !== activeSection.sectionId) {
      saveCurrentPhonePassageScroll();
    }
    if (owningSection) {
      setActiveSectionId(owningSection.sectionId);
    }
    if (owningTaskGroup) {
      setActiveTaskGroupId(owningTaskGroup.taskGroupId);
    }
    setActiveInteractionId(interaction.interactionId);
    if (options.scrollIntoView) {
      queueDesktopNavigationScroll({ kind: 'interaction', displayNumber: interaction.displayNumber });
    }
  };

  const selectSection = (
    section: ReadingV2ProjectedSection,
    options: { readonly scrollToTop?: boolean } = {},
  ) => {
    const firstTaskGroup = taskGroupsBySection(section)[0];
    const firstInteraction = firstTaskGroup?.interactions[0];
    if (isMobile && !isQuestionSheetOpen && section.sectionId !== activeSection.sectionId) {
      saveCurrentPhonePassageScroll();
    }
    setActiveSectionId(section.sectionId);
    setActiveTaskGroupId(firstTaskGroup?.taskGroupId ?? null);
    setActiveInteractionId(firstInteraction?.interactionId ?? null);
    if (options.scrollToTop) {
      queueDesktopNavigationScroll({ kind: 'section' });
    }
  };

  const recordAnswer = (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => {
    answersDirtyRef.current = true;
    setAnswers((current) => ({
      ...current,
      [interaction.interactionId]: value,
    }));
  };

  const clearAnswer = (interaction: ReadingV2ProjectedInteraction) => {
    answersDirtyRef.current = true;
    setAnswers((current) => {
      const next = { ...current };
      delete next[interaction.interactionId];
      return next;
    });
  };

  const submitPayload = (): ReadingV2RuntimeSubmitPayload => ({
    projectionId: runtimeProjection.projectionId,
    sourceSnapshotVersionId: runtimeProjection.sourceSnapshotVersionId,
    materialId: runtimeProjection.materialId,
    answers: allInteractions
      .filter((interaction) => isAnswered(answers[interaction.interactionId]))
      .map((interaction) => ({
        interactionId: interaction.interactionId,
        taskGroupId: interaction.taskGroupId,
        visibleNumber: interaction.displayNumber,
        value: getSubmissionAnswerValue(
          interaction,
          answers[interaction.interactionId] ?? '',
          runtimeProjection.content.optionSets,
        ),
      })),
  });

  const getSectionProgress = (section: ReadingV2ProjectedSection) => {
    const interactions = taskGroupsBySection(section).flatMap((taskGroup) => taskGroup.interactions);
    const answered = interactions.filter(isRuntimeInteractionComplete).length;
    return `${answered}/${interactions.length || 0}`;
  };

  const openQuestionSheet = () => {
    const scrollTop = saveCurrentPhonePassageScroll();
    setPreservedScrollLabel(`${activeStimulus?.title ?? getPassageLabel(activeSectionIndex)} @ ${Math.round(scrollTop)}px`);
    setIsQuestionSheetOpen(true);
  };

  const closeQuestionSheet = () => {
    setIsQuestionSheetOpen(false);
  };

  const moveInteraction = (direction: -1 | 1) => {
    const currentIndex = allInteractions.findIndex((interaction) => interaction.interactionId === activeInteractionId);
    const fallbackIndex = Math.max(0, allInteractions.findIndex(
      (interaction) => interaction.interactionId === activeSectionInteractions[0]?.interactionId,
    ));
    const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const nextInteraction = allInteractions[Math.min(Math.max(baseIndex + direction, 0), allInteractions.length - 1)];
    if (nextInteraction) {
      focusInteraction(nextInteraction);
      if (isMobile) {
        setIsQuestionSheetOpen(true);
      }
    }
  };

  const confirmSubmit = async () => {
    if (!onSubmit || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitPhase('pending');

    try {
      await onSubmit(submitPayload());
      setSubmitPhase('success');
      setShowReviewSummary(false);
    } catch {
      setSubmitPhase('failure');
      submitLockRef.current = false;
    }
  };

  const stimulusView = (
    <StimulusView
      stimulus={activeStimulus}
      fontSize={passageFontSize}
      lineHeight={passageLineHeight}
      highlights={highlights}
      highlighterActive={highlighterActive && !isMobile}
      highlightColor={highlightColor}
      activeAnchorId={activeInteraction?.primaryAnchorId ?? null}
      anchorQuestionNumbers={anchorQuestionNumbers}
      onAddHighlight={(highlight) => setHighlights((current) => [...current, highlight])}
    />
  );

  const sectionQuestionPanel = (
    <SectionQuestionPanel
      taskGroups={activeSectionTaskGroups}
      stimuli={runtimeProjection.content.stimuli}
      optionSets={runtimeProjection.content.optionSets}
      answers={answers}
      disabled={inputsDisabled}
      onAnswer={recordAnswer}
      onClear={clearAnswer}
      onFocusInteraction={focusInteraction}
      registerQuestionAnchor={registerQuestionAnchor}
    />
  );

  const reviewSummary = showReviewSummary ? (
    <section className="reading-v2-runtime__review" aria-label="Pre-submit review summary">
      <h2>Review Answers</h2>
      <p>
        Answered {answeredCount} of {allInteractions.length}
      </p>
      <div className="reading-v2-runtime__review-sections">
        {sections.map((section, sectionIndex) => {
          const sectionGroups = taskGroupsBySection(section);
          const sectionInteractions = sectionGroups.flatMap((taskGroup) => taskGroup.interactions);
          const sectionAnswered = sectionInteractions.filter(
            isRuntimeInteractionComplete,
          ).length;
          return (
            <section className="reading-v2-runtime__review-section" key={section.sectionId}>
              <h3>{getPassageLabel(sectionIndex)} <span>{sectionAnswered}/{sectionInteractions.length}</span></h3>
              <div className="reading-v2-runtime__review-chips">
                {sectionInteractions.map((interaction) => (
                  <button
                    key={interaction.interactionId}
                    type="button"
                    data-answered={isRuntimeInteractionComplete(interaction) ? 'true' : 'false'}
                    onClick={() => {
                      focusInteraction(interaction);
                      setShowReviewSummary(false);
                      if (isMobile) {
                        setIsQuestionSheetOpen(true);
                      }
                    }}
                  >
                    Q{interaction.displayNumber}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {submitPhase === 'failure' ? (
        <p role="alert">{RUNTIME_STATES['submit-failure'].message}</p>
      ) : null}
      <div className="reading-v2-runtime__review-actions">
        <button type="button" onClick={() => setShowReviewSummary(false)}>Back to Test</button>
        <button
          type="button"
          disabled={!canSubmit || manualSubmitDisabled}
          onClick={() => {
            void confirmSubmit();
          }}
        >
          {submitPhase === 'pending' ? 'Submitting...' : 'Confirm Submit'}
        </button>
      </div>
    </section>
  ) : null;

  return (
    <main
      className="reading-v2-runtime"
      data-layout={isMobile ? 'phone' : 'desktop-tablet'}
      aria-label="Reading V2 Runtime Shell"
    >
      {isMobile ? (
        <header className="reading-v2-runtime__mobile-header" aria-label="Student Reading runtime header">
          <div
            className="reading-v2-runtime__mobile-timer"
            data-low={isTimerLow ? 'true' : 'false'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{headerTimerLabel}</span>
          </div>
          <button
            className="reading-v2-runtime__mobile-submit"
            type="button"
            aria-label="Submit"
            disabled={!canSubmit || manualSubmitDisabled}
            onClick={() => {
              setIsMobileOverflowOpen(false);
              setShowReviewSummary(true);
            }}
          >
            Submit
          </button>
          <button
            className="reading-v2-runtime__mobile-overflow"
            type="button"
            aria-label="More options"
            aria-expanded={isMobileOverflowOpen}
            onClick={() => setIsMobileOverflowOpen((current) => !current)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="10" cy="4" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="10" cy="16" r="1.5" />
            </svg>
          </button>
          {isMobileOverflowOpen ? (
            <div className="reading-v2-runtime__mobile-menu" role="menu">
              <p>{answeredCount} of {allInteractions.length} answered</p>
              <button
                className="reading-v2-runtime__mobile-menu-action"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsMobileOverflowOpen(false);
                  setIsQuestionSheetOpen(false);
                  setShowReviewSummary(true);
                }}
              >
                Review answers
              </button>
              {!canSubmit ? <p>Submission is not available for this Reading V2 launch yet.</p> : null}
            </div>
          ) : null}
        </header>
      ) : (
        <header className="reading-v2-runtime__topbar" aria-label="Student Reading runtime header">
          <div className="reading-v2-runtime__brand">
            <strong>IELTS</strong>
            <span aria-hidden="true" className="reading-v2-runtime__brand-divider" />
            <span>Reading Test</span>
          </div>
          <div className="reading-v2-runtime__test-meta">
            <p>
              Test taker ID: <strong>Student</strong>
            </p>
            <div
              className="reading-v2-runtime__timer"
              data-low={isTimerLow ? 'true' : 'false'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{headerTimerLabel}</span>
            </div>
          </div>
          <div className="reading-v2-runtime__desktop-header-status">
            {!canSubmit ? (
              <p className="reading-v2-runtime__status" role="status">Submission is not available for this Reading V2 launch yet.</p>
            ) : null}
          </div>
        </header>
      )}

      {lifecycleStatus && lifecycleStatus !== 'in-progress' ? (
        <section className="reading-v2-runtime__lifecycle-banner" role="status">
          {lifecycle.message
            ?? (lifecycleStatus === 'paused'
              ? 'This live test is paused by the teacher.'
              : lifecycleStatus === 'waiting'
                ? 'Waiting for the teacher to start this live test.'
                : 'This live test has ended.')}
        </section>
      ) : lifecycle?.message ? (
        <section className="reading-v2-runtime__lifecycle-banner" role="status">
          {lifecycle.message}
        </section>
      ) : null}

      {isMobile ? (
        <section className="reading-v2-runtime__phone" aria-label="Phone passage-first runtime">
          <PassageTabs
            sections={sections}
            activeSectionId={activeSection.sectionId}
            getSectionProgress={getSectionProgress}
            onSelectSection={selectSection}
            variant="phone"
          />
          <div ref={phonePassageRef} className="reading-v2-runtime__phone-passage" aria-label="Passage-first primary surface">
            {stimulusView}
          </div>
          <button
            className="reading-v2-runtime__questions-fab"
            type="button"
            aria-label="Open Questions"
            onClick={openQuestionSheet}
          >
            <span>Questions</span>
            <small>{activeSectionAnsweredCount}/{activeSectionInteractions.length}</small>
          </button>
          <p className="reading-v2-runtime__preserved-position" aria-label="Preserved passage scroll position">Preserved passage position: {preservedScrollLabel}</p>
          {isQuestionSheetOpen ? (
            <>
              <button
                className="reading-v2-runtime__sheet-backdrop"
                type="button"
                aria-label="Close question sheet backdrop"
                onClick={closeQuestionSheet}
              />
              <aside className="reading-v2-runtime__bottom-sheet" aria-label="Bottom-sheet question surface">
                <div className="reading-v2-runtime__sheet-handle" aria-hidden="true" />
                <header className="reading-v2-runtime__sheet-header">
                  <div>
                    <p>{getPassageLabel(activeSectionIndex)}</p>
                    <h2>{getSectionRange(activeSectionTaskGroups)}</h2>
                    <span>{activeSectionAnsweredCount}/{activeSectionInteractions.length} answered</span>
                  </div>
                  <button className="reading-v2-runtime__link-button" type="button" onClick={closeQuestionSheet}>Close Questions</button>
                </header>
                <PassageTabs
                  sections={sections}
                  activeSectionId={activeSection.sectionId}
                  getSectionProgress={getSectionProgress}
                  onSelectSection={selectSection}
                  variant="phone"
                />
                <div className="reading-v2-runtime__sheet-question-strip" aria-label="Phone question navigator">
                  {activeSectionInteractions.map((interaction) => (
                    <button
                      className="reading-v2-runtime__sheet-question-chip"
                      key={interaction.interactionId}
                      type="button"
                      aria-label={`Question ${interaction.displayNumber}`}
                      data-answered={isRuntimeInteractionComplete(interaction) ? 'true' : 'false'}
                      aria-pressed={interaction.interactionId === activeInteractionId}
                      onClick={() => focusInteraction(interaction)}
                    >
                      {interaction.displayNumber}
                    </button>
                  ))}
                </div>
                {sectionQuestionPanel}
              </aside>
            </>
          ) : null}
        </section>
      ) : (
        <>
          <section
            className="reading-v2-runtime__desktop"
            aria-label="Desktop and tablet two-column runtime"
            style={{
              gridTemplateColumns: `minmax(320px, ${leftWidthPercent}%) 10px minmax(360px, ${100 - leftWidthPercent}%)`,
            }}
          >
            <section className="reading-v2-runtime__left-column" aria-label="Left passage and stimulus column">
              <PassageControls
                fontSize={passageFontSize}
                lineHeight={passageLineHeight}
                highlighterActive={highlighterActive}
                highlightColor={highlightColor}
                onFontSizeChange={setPassageFontSize}
                onLineHeightChange={setPassageLineHeight}
                onHighlighterActiveChange={setHighlighterActive}
                onHighlightColorChange={setHighlightColor}
                onClearHighlights={() => setHighlights([])}
              />
              {stimulusView}
            </section>
            <div className="reading-v2-runtime__divider" aria-label="Resizable passage and questions divider">
              <input
                type="range"
                min={30}
                max={70}
                value={leftWidthPercent}
                aria-label="Resize passage and questions columns"
                onChange={(event) => setLeftWidthPercent(Number(event.currentTarget.value))}
              />
            </div>
            <section
              className="reading-v2-runtime__right-column"
              ref={desktopQuestionPanelRef}
              aria-label="Right full grouped question panel"
            >
              {sectionQuestionPanel}
            </section>
          </section>
          <div className="reading-v2-runtime__floating-arrows" aria-label="Previous and next question controls">
            <button type="button" aria-label="Previous question" onClick={() => moveInteraction(-1)}>{'<'}</button>
            <button type="button" aria-label="Next question" onClick={() => moveInteraction(1)}>{'>'}</button>
          </div>
          <RuntimeFooterNav
            sections={sections}
            activeSectionId={activeSection.sectionId}
            activeInteractionId={activeInteractionId}
            taskGroupsBySection={taskGroupsBySection}
            isInteractionComplete={isRuntimeInteractionComplete}
            canSubmit={canSubmit}
            submitDisabled={manualSubmitDisabled}
            onSelectSection={(section) => selectSection(section, { scrollToTop: true })}
            onSelectInteraction={(interaction) => focusInteraction(interaction, { scrollIntoView: true })}
            onSubmit={() => setShowReviewSummary(true)}
          />
        </>
      )}

      {reviewSummary}
    </main>
  );
}
