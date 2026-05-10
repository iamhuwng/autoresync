// Reading V2 runtime boundary: renders derived V2 projections only.
// V1 Reading runtime files are visual references; legacy flat-question payloads are rejected before rendering.
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

const getPassageLabel = (index: number): string => `Passage ${index + 1}`;

const getParagraphDisplayLabel = (label: string | undefined, index: number): string => {
  const trimmed = label?.trim();
  if (!trimmed) {
    return String.fromCharCode(65 + index);
  }

  const letterMatch = trimmed.match(/^(?:paragraph\s*)?([a-z])$/i);
  if (letterMatch?.[1]) {
    return letterMatch[1].toUpperCase();
  }

  const numericMatch = trimmed.match(/^(?:paragraph\s*)?\d+$/i);
  if (numericMatch) {
    return String.fromCharCode(65 + index);
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
      (entry) => entry.anchorId === interaction.primaryAnchorId,
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

const renderHighlightedText = (
  text: string,
  highlights: readonly PassageHighlight[],
): ReactNode => {
  if (highlights.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const nextMatch = highlights
      .map((highlight) => ({
        highlight,
        index: text.indexOf(highlight.text, cursor),
      }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index)[0];

    if (!nextMatch) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (nextMatch.index > cursor) {
      nodes.push(text.slice(cursor, nextMatch.index));
    }

    nodes.push(
      <mark
        className="reading-v2-runtime__highlight"
        key={`${nextMatch.highlight.id}-${nextMatch.index}`}
        style={{ backgroundColor: nextMatch.highlight.color }}
      >
        {nextMatch.highlight.text}
      </mark>,
    );
    cursor = nextMatch.index + nextMatch.highlight.text.length;
  }

  return nodes;
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
        {stimulus.content.paragraphs.map((paragraph, index) => (
          <p key={paragraph.anchorId ?? `${stimulus.stimulusId}-${index}`}>
            <strong>{getParagraphDisplayLabel(paragraph.label, index)} </strong>
            {renderHighlightedText(paragraph.text, highlights)}
          </p>
        ))}
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
                      data-active={cell.anchorId && activeAnchorId === cell.anchorId ? 'true' : 'false'}
                      data-blank={cell.isBlank ? 'true' : 'false'}
                      key={`${cell.anchorId ?? 'cell'}-${rowIndex}-${cellIndex}`}
                    >
                      {cell.isBlank ? (
                        <span className="reading-v2-runtime__blank-marker">
                          Q{cell.anchorId ? anchorQuestionNumbers.get(cell.anchorId) ?? '?' : '?'}
                        </span>
                      ) : cell.text}
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
              {step.text}
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
        <p>{stimulus.content.imageAlt}</p>
        <ul>
          {stimulus.content.hotspots.map((hotspot) => (
            <li data-active={activeAnchorId === hotspot.anchorId ? 'true' : 'false'} key={hotspot.anchorId}>
              <span className="reading-v2-runtime__blank-marker">
                Q{anchorQuestionNumbers.get(hotspot.anchorId) ?? '?'}
              </span>
              {hotspot.label}: {hotspot.xPercent}%, {hotspot.yPercent}%
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return <p>{stimulus.content.alt}</p>;
}

interface FreeTextAnswerControlProps {
  readonly label: string;
  readonly prompt: string;
  readonly value: ReadingV2AnswerValue | undefined;
  readonly interaction: ReadingV2ProjectedInteraction;
  readonly disabled: boolean;
  readonly onAnswer: (interaction: ReadingV2ProjectedInteraction, value: ReadingV2AnswerValue) => void;
}

function FreeTextAnswerControl({
  label,
  prompt,
  value,
  interaction,
  disabled,
  onAnswer,
}: FreeTextAnswerControlProps) {
  const input = (
    <input
      className="reading-v2-runtime__text-input"
      aria-label={`${label} answer`}
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onAnswer(interaction, event.currentTarget.value)}
    />
  );
  const blankIndex = prompt.search(/_{3,}/);

  if (blankIndex < 0) {
    return (
      <>
        <p className="reading-v2-runtime__prompt">{prompt}</p>
        {input}
      </>
    );
  }

  const beforeBlank = prompt.slice(0, blankIndex).trimEnd();
  const afterBlank = prompt.slice(blankIndex).replace(/^_{3,}/, '').trimStart();

  return (
    <p className="reading-v2-runtime__completion-line">
      {beforeBlank ? <span>{beforeBlank} </span> : null}
      {input}
      {afterBlank ? <span> {afterBlank}</span> : null}
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
}: FamilyRendererProps) {
  return (
    <div className="reading-v2-runtime__interactions">
      {taskGroup.interactions.map((interaction) => {
        const value = answers[interaction.interactionId];
        const prompt = getPromptText(interaction, taskGroup, stimulus);
        const label = `Question ${interaction.displayNumber}`;
        const clearButton = (
          <button className="reading-v2-runtime__link-button" type="button" disabled={disabled} onClick={() => onClear(interaction)}>
            Clear
          </button>
        );

        if (interaction.responseShape.kind === 'free-text') {
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={`reading-v2-question-${interaction.displayNumber}`}
              key={interaction.interactionId}
              aria-label={label}
              onFocus={() => onFocusInteraction(interaction)}
            >
              <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
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
              />
              <small className="reading-v2-runtime__word-limit">
                Word limit: {interaction.responseShape.wordLimit ?? 'as instructed'}
              </small>
              {clearButton}
            </section>
          );
        }

        if (interaction.responseShape.kind === 'single-choice') {
          const optionSet = getOptionSet(optionSets, interaction.responseShape.optionSetId);
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={`reading-v2-question-${interaction.displayNumber}`}
              key={interaction.interactionId}
              aria-label={label}
            >
              <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
              <p className="reading-v2-runtime__prompt">{prompt}</p>
              <div className="reading-v2-runtime__option-stack">
                {optionSet?.options.map((option) => (
                  <label
                    className="reading-v2-runtime__option"
                    data-selected={value === option.optionId ? 'true' : 'false'}
                    key={option.optionId}
                  >
                    <input
                      type="radio"
                      name={interaction.interactionId}
                      disabled={disabled}
                      checked={value === option.optionId}
                      onChange={() => {
                        onFocusInteraction(interaction);
                        onAnswer(interaction, option.optionId);
                      }}
                    />
                    <span>{option.label}. {option.text}</span>
                  </label>
                ))}
              </div>
              {clearButton}
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
              id={`reading-v2-question-${interaction.displayNumber}`}
              key={interaction.interactionId}
              aria-label={label}
            >
              <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
              <p className="reading-v2-runtime__prompt">{prompt}</p>
              <p className="reading-v2-runtime__selection-count">
                Selected {selected.length} of {selectionLimit}
              </p>
              <div className="reading-v2-runtime__option-stack">
                {optionSet?.options.map((option) => (
                  <label
                    className="reading-v2-runtime__option"
                    data-selected={selected.includes(option.optionId) ? 'true' : 'false'}
                    key={option.optionId}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.includes(option.optionId)}
                      onChange={(event) => {
                        const next = event.currentTarget.checked
                          ? [...selected, option.optionId].slice(0, selectionLimit)
                          : selected.filter((optionId) => optionId !== option.optionId);
                        onFocusInteraction(interaction);
                        onAnswer(interaction, next);
                      }}
                    />
                    <span>{option.label}. {option.text}</span>
                  </label>
                ))}
              </div>
              {clearButton}
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
              id={`reading-v2-question-${interaction.displayNumber}`}
              key={interaction.interactionId}
              aria-label={label}
            >
              <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
              <p className="reading-v2-runtime__prompt">{prompt}</p>
              <div className="reading-v2-runtime__segmented" aria-label={`${label} locked vocabulary`}>
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
              {clearButton}
            </section>
          );
        }

        if (interaction.responseShape.kind === 'matching') {
          const optionSet = getOptionSet(optionSets, interaction.responseShape.optionSetId);
          return (
            <section
              className="reading-v2-runtime__question-card"
              id={`reading-v2-question-${interaction.displayNumber}`}
              key={interaction.interactionId}
              aria-label={label}
            >
              <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
              <p className="reading-v2-runtime__prompt">{prompt}</p>
              <p className="reading-v2-runtime__selection-count">Option reuse: {interaction.responseShape.optionReuse}</p>
              <div className="reading-v2-runtime__matching-options" aria-label={`${label} tap to assign choices`}>
                {optionSet?.options.map((option) => (
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
                    {option.label}. {option.text}
                  </button>
                ))}
              </div>
              {clearButton}
            </section>
          );
        }

        return (
          <section
            className="reading-v2-runtime__question-card"
            id={`reading-v2-question-${interaction.displayNumber}`}
            key={interaction.interactionId}
            aria-label={label}
          >
            <span className="reading-v2-runtime__question-number">{interaction.displayNumber}</span>
            <p className="reading-v2-runtime__prompt">{prompt}</p>
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
            {clearButton}
          </section>
        );
      })}
    </div>
  );
}

function RuntimeTaskGroupPanel(props: FamilyRendererProps) {
  const { taskGroup } = props;
  const vocabulary = taskGroup.interactions[0]?.responseShape.kind === 'binary-judgement'
    ? taskGroup.interactions[0].responseShape.vocabulary
    : undefined;

  return (
    <section className="reading-v2-runtime__question-panel" aria-label="Grouped question panel">
      <header className="reading-v2-runtime__group-header">
        <div>
          <p className="reading-v2-runtime__task-type">{taskGroup.officialTaskType}</p>
          <h2>{getTaskGroupRange(taskGroup)}</h2>
        </div>
        <p className="reading-v2-runtime__question-range">{getTaskGroupRange(taskGroup)}</p>
        <div className="reading-v2-runtime__instructions" aria-label="Grouped instructions">
          {taskGroup.instructionBlocks.map((block) => (
            <p key={block.id}>{block.text}</p>
          ))}
          {vocabulary === 'TFNG' ? (
            <p><strong>TRUE</strong> if the statement agrees, <strong>FALSE</strong> if it contradicts, <strong>NOT GIVEN</strong> if there is no information.</p>
          ) : null}
          {vocabulary === 'YNNG' ? (
            <p><strong>YES</strong> if the statement agrees, <strong>NO</strong> if it contradicts, <strong>NOT GIVEN</strong> if there is no information.</p>
          ) : null}
        </div>
      </header>
      <RuntimeInteractionControls {...props} />
    </section>
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
  readonly answers: Readonly<Record<string, ReadingV2AnswerValue>>;
  readonly canSubmit: boolean;
  readonly submitDisabled: boolean;
  readonly onSelectSection: (section: ReadingV2ProjectedSection) => void;
  readonly onSelectInteraction: (interaction: ReadingV2ProjectedInteraction) => void;
  readonly onSubmit: () => void;
}

function RuntimeFooterNav({
  sections,
  activeSectionId,
  activeInteractionId,
  taskGroupsBySection,
  answers,
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
                      data-answered={isAnswered(answers[interaction.interactionId]) ? 'true' : 'false'}
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
  const [leftWidthPercent, setLeftWidthPercent] = useState(50);
  const [passageFontSize, setPassageFontSize] = useState(16);
  const [passageLineHeight, setPassageLineHeight] = useState(1.5);
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#fff59d');
  const [highlights, setHighlights] = useState<readonly PassageHighlight[]>([]);
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
  const firstQuestionNumber = allInteractions[0]?.displayNumber;
  const lastQuestionNumber = allInteractions[allInteractions.length - 1]?.displayNumber;
  const fullQuestionHeading = firstQuestionNumber && lastQuestionNumber
    ? firstQuestionNumber === lastQuestionNumber
      ? `Question ${firstQuestionNumber}`
      : `Questions ${firstQuestionNumber}-${lastQuestionNumber}`
    : 'Questions';
  const anchorQuestionNumbers = useMemo(
    () => new Map(
      allInteractions
        .filter((interaction) => Boolean(interaction.primaryAnchorId))
        .map((interaction) => [interaction.primaryAnchorId as string, interaction.displayNumber]),
    ),
    [allInteractions],
  );
  const answeredCount = allInteractions.filter((interaction) => isAnswered(answers[interaction.interactionId])).length;
  const activeSectionAnsweredCount = activeSectionInteractions.filter(
    (interaction) => isAnswered(answers[interaction.interactionId]),
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

  const saveCurrentPhonePassageScroll = () => {
    const scrollTop = phonePassageRef.current?.scrollTop ?? 0;
    phonePassageScrollTopBySectionRef.current[activeSectionScrollKey] = scrollTop;
    return scrollTop;
  };

  const focusInteraction = (interaction: ReadingV2ProjectedInteraction) => {
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
  };

  const selectSection = (section: ReadingV2ProjectedSection) => {
    const firstTaskGroup = taskGroupsBySection(section)[0];
    const firstInteraction = firstTaskGroup?.interactions[0];
    if (isMobile && !isQuestionSheetOpen && section.sectionId !== activeSection.sectionId) {
      saveCurrentPhonePassageScroll();
    }
    setActiveSectionId(section.sectionId);
    setActiveTaskGroupId(firstTaskGroup?.taskGroupId ?? null);
    setActiveInteractionId(firstInteraction?.interactionId ?? null);
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
    const answered = interactions.filter((interaction) => isAnswered(answers[interaction.interactionId])).length;
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
            (interaction) => isAnswered(answers[interaction.interactionId]),
          ).length;
          return (
            <section className="reading-v2-runtime__review-section" key={section.sectionId}>
              <h3>{getPassageLabel(sectionIndex)} <span>{sectionAnswered}/{sectionInteractions.length}</span></h3>
              <div className="reading-v2-runtime__review-chips">
                {sectionInteractions.map((interaction) => (
                  <button
                    key={interaction.interactionId}
                    type="button"
                    data-answered={isAnswered(answers[interaction.interactionId]) ? 'true' : 'false'}
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
                      data-answered={isAnswered(answers[interaction.interactionId]) ? 'true' : 'false'}
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
            <section className="reading-v2-runtime__right-column" aria-label="Right full grouped question panel">
              <header className="reading-v2-runtime__right-summary">
                <div>
                  <p>{getPassageLabel(activeSectionIndex)}</p>
                  <h2>{fullQuestionHeading}</h2>
                </div>
                <span>{answeredCount} of {allInteractions.length} answered</span>
              </header>
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
            answers={answers}
            canSubmit={canSubmit}
            submitDisabled={manualSubmitDisabled}
            onSelectSection={selectSection}
            onSelectInteraction={focusInteraction}
            onSubmit={() => setShowReviewSummary(true)}
          />
        </>
      )}

      {reviewSummary}
    </main>
  );
}
