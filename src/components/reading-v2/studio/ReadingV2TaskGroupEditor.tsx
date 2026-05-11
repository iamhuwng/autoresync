import type {
  ReadingV2Document,
  ReadingV2Interaction,
  ReadingV2OptionSet,
  ReadingV2TaskGroup,
} from '../../../types/readingV2.types';
import { useState } from 'react';
import { readingV2Ids } from '../../../types/readingV2.types';
import type { ReadingV2DerivedNumber } from '../../../services/reading-v2/readingV2Numbering.service';
import {
  getReadingV2TaskFamily,
  READING_V2_CANONICAL_TASK_TYPES,
  READING_V2_TASK_TAXONOMY,
  type ReadingV2CanonicalTaskType,
} from '../../../types/readingV2Taxonomy';
import { ReadingV2AnswerRuleEditor } from './ReadingV2AnswerRuleEditor';
import { ReadingV2TableCompletionBuilder } from './ReadingV2TableCompletionBuilder';

export interface ReadingV2TaskGroupEditorProps {
  readonly document: ReadingV2Document;
  readonly taskGroups: readonly ReadingV2TaskGroup[];
  readonly interactions: Readonly<Record<string, ReadingV2Interaction>>;
  readonly optionSets?: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly visibleNumbers: readonly ReadingV2DerivedNumber[];
  readonly selectedTaskGroupId?: string;
  readonly teacherFacing?: boolean;
  readonly hideAddTaskGroupButton?: boolean;
  readonly onSelectTaskGroup: (taskGroupId: string) => void;
  readonly onAddTaskGroup: () => void;
  readonly onMoveSelectedTaskGroup: (direction: 'up' | 'down') => void;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
  readonly onInteractionRemove?: (interactionId: string, taskGroup: ReadingV2TaskGroup) => void;
  readonly onOptionSetChange?: (optionSet: ReadingV2OptionSet) => void;
  readonly onDocumentChange?: (document: ReadingV2Document) => void;
  readonly onTableCompletionAction?: (outcome: string, metadata?: Record<string, string | number | boolean | undefined>) => void;
}

export function ReadingV2TaskGroupEditor({
  document,
  taskGroups,
  interactions,
  optionSets = {},
  visibleNumbers,
  selectedTaskGroupId,
  teacherFacing = false,
  hideAddTaskGroupButton = false,
  onSelectTaskGroup,
  onAddTaskGroup,
  onMoveSelectedTaskGroup,
  onTaskGroupChange,
  onInteractionChange,
  onInteractionRemove = () => undefined,
  onOptionSetChange = () => undefined,
  onDocumentChange,
  onTableCompletionAction,
}: ReadingV2TaskGroupEditorProps) {
  const [pendingRemovalInteractionId, setPendingRemovalInteractionId] = useState<string | null>(null);
  const selectedTaskGroup = taskGroups.find((taskGroup) => taskGroup.taskGroupId === selectedTaskGroupId) ?? taskGroups[0];
  const selectedInteractions = selectedTaskGroup
    ? selectedTaskGroup.interactionIds
        .map((interactionId) => interactions[interactionId])
        .filter((interaction): interaction is ReadingV2Interaction => interaction !== undefined)
    : [];
  const selectedOptionSets = selectedTaskGroup
    ? selectedTaskGroup.optionSetRefs
        .map((optionSetId) => optionSets[optionSetId])
        .filter((optionSet): optionSet is ReadingV2OptionSet => optionSet !== undefined)
    : [];
  const selectedTaskUsesOptions = selectedTaskGroup
    ? selectedTaskGroup.answerRule.responseShape.kind === 'single-choice'
      || selectedTaskGroup.answerRule.responseShape.kind === 'multi-select'
      || selectedTaskGroup.answerRule.responseShape.kind === 'matching'
    : false;
  const compatibleTaskTypes = selectedTaskGroup
    ? READING_V2_CANONICAL_TASK_TYPES.filter((taskType) =>
        getReadingV2TaskFamily(taskType) === selectedTaskGroup.engineeringFamily)
    : [];
  const selectedTaskTypeLabel = selectedTaskGroup
    ? READING_V2_TASK_TAXONOMY[selectedTaskGroup.officialTaskType].label
    : '';
  const showTeacherTableCompletionBuilder =
    teacherFacing && selectedTaskGroup?.officialTaskType === 'table-completion' && onDocumentChange;
  const addInteraction = () => {
    if (!selectedTaskGroup) {
      return;
    }

    const nextIndex = selectedTaskGroup.interactionIds.length + 1;
    const interactionId = readingV2Ids.interactionId(`${selectedTaskGroup.taskGroupId}-manual-interaction-${nextIndex}`);
    const interaction: ReadingV2Interaction = {
      interactionId,
      taskGroupId: selectedTaskGroup.taskGroupId,
      responseShape: selectedTaskGroup.answerRule.responseShape,
      scoringRule: { maxScore: 1, acceptableAnswers: [] },
      reviewLabel: {},
      placeholder: true,
    };

    onInteractionChange(interaction);
    onTaskGroupChange({
      ...selectedTaskGroup,
      interactionIds: [...selectedTaskGroup.interactionIds, interactionId],
      validationState: {
        issues: [
          ...selectedTaskGroup.validationState.issues,
          {
            code: 'unresolved-draft-placeholder',
            severity: 'error',
            message: `Interaction ${interactionId} is incomplete.`,
            objectId: interactionId,
          },
        ],
      },
    });
  };

  const moveInteraction = (interactionId: string, direction: 'up' | 'down') => {
    if (!selectedTaskGroup) {
      return;
    }

    const currentIndex = selectedTaskGroup.interactionIds.indexOf(readingV2Ids.interactionId(interactionId));
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedTaskGroup.interactionIds.length) {
      return;
    }

    const nextInteractionIds = [...selectedTaskGroup.interactionIds];
    const [moved] = nextInteractionIds.splice(currentIndex, 1);
    if (!moved) {
      return;
    }
    nextInteractionIds.splice(nextIndex, 0, moved);
    onTaskGroupChange({ ...selectedTaskGroup, interactionIds: nextInteractionIds });
  };

  const addOptionSet = () => {
    if (!selectedTaskGroup) {
      return;
    }

    const optionSetId = readingV2Ids.optionSetId(`${selectedTaskGroup.taskGroupId}-option-set-${selectedTaskGroup.optionSetRefs.length + 1}`);
    onOptionSetChange({
      optionSetId,
      taskGroupId: selectedTaskGroup.taskGroupId,
      options: [
        { optionId: `${optionSetId}-a`, label: 'A', text: 'Option A' },
        { optionId: `${optionSetId}-b`, label: 'B', text: 'Option B' },
      ],
    });
    onTaskGroupChange({
      ...selectedTaskGroup,
      optionSetRefs: [...selectedTaskGroup.optionSetRefs, optionSetId],
    });
  };

  const handleTaskTypeChange = (taskType: ReadingV2CanonicalTaskType) => {
    if (!selectedTaskGroup) {
      return;
    }

    const nextFamily = getReadingV2TaskFamily(taskType);

    if (nextFamily !== selectedTaskGroup.engineeringFamily) {
      return;
    }

    onTaskGroupChange({
      ...selectedTaskGroup,
      officialTaskType: taskType,
      engineeringFamily: nextFamily,
    });
  };

  const updateOption = (
    optionSet: ReadingV2OptionSet,
    optionIndex: number,
    patch: Partial<ReadingV2OptionSet['options'][number]>,
  ) => {
    onOptionSetChange({
      ...optionSet,
      options: optionSet.options.map((current, currentIndex) =>
        currentIndex === optionIndex ? { ...current, ...patch } : current,
      ),
    });
  };

  const moveOption = (
    optionSet: ReadingV2OptionSet,
    optionIndex: number,
    direction: 'up' | 'down',
  ) => {
    const nextIndex = direction === 'up' ? optionIndex - 1 : optionIndex + 1;

    if (nextIndex < 0 || nextIndex >= optionSet.options.length) {
      return;
    }

    const nextOptions = [...optionSet.options];
    const [moved] = nextOptions.splice(optionIndex, 1);

    if (!moved) {
      return;
    }

    nextOptions.splice(nextIndex, 0, moved);
    onOptionSetChange({ ...optionSet, options: nextOptions });
  };

  const addOption = (optionSet: ReadingV2OptionSet) => {
    const nextIndex = optionSet.options.length;
    const label = String.fromCharCode('A'.charCodeAt(0) + nextIndex);
    onOptionSetChange({
      ...optionSet,
      options: [
        ...optionSet.options,
        {
          optionId: `${optionSet.optionSetId}-${label.toLowerCase()}`,
          label,
          text: `Option ${label}`,
        },
      ],
    });
  };

  const optionSetForInteraction = () =>
    selectedOptionSets[0]?.optionSetId
    ?? readingV2Ids.optionSetId(`${selectedTaskGroup?.taskGroupId ?? 'task-group'}-option-set-manual`);

  const responseShapeForKind = (
    kind: ReadingV2Interaction['responseShape']['kind'],
  ): ReadingV2Interaction['responseShape'] => {
    const optionSetId = optionSetForInteraction();

    if (kind === 'single-choice') {
      return { kind, optionSetId };
    }

    if (kind === 'multi-select') {
      return { kind, optionSetId, selectionLimit: 2 };
    }

    if (kind === 'binary-judgement') {
      return { kind, vocabulary: 'TFNG' };
    }

    if (kind === 'matching') {
      return { kind, optionSetId, optionReuse: 'allowed' };
    }

    if (kind === 'structured-entry') {
      return { kind, structure: 'table' };
    }

    return { kind: 'free-text', wordLimit: 2 };
  };
  const responseShapeLabel = (kind: ReadingV2Interaction['responseShape']['kind']): string => {
    switch (kind) {
      case 'free-text':
        return 'Short answer';
      case 'single-choice':
        return 'Single choice';
      case 'multi-select':
        return 'Multiple answers';
      case 'binary-judgement':
        return 'True/False/Not Given';
      case 'matching':
        return 'Matching';
      case 'structured-entry':
        return 'Table, flowchart, or diagram';
    }
  };

  return (
    <section className="reading-v2-task-group-editor" aria-label={teacherFacing ? 'Question group editor' : 'Task group editor'}>
      <div className="reading-v2-task-group-editor__rail">
        <div className="reading-v2-studio__panel-heading">
          <div>
            <p>Questions</p>
            <h2>{teacherFacing ? 'Question Groups' : 'Task Groups'}</h2>
          </div>
        </div>
        <div className="reading-v2-studio__inline-actions">
          {hideAddTaskGroupButton ? null : (
            <button className="reading-v2-studio__button" type="button" onClick={onAddTaskGroup}>
              {teacherFacing ? 'Add Question Group' : 'Add Task Group'}
            </button>
          )}
          <button className="reading-v2-studio__button" type="button" onClick={() => onMoveSelectedTaskGroup('up')}>
            Move Selected Up
          </button>
          <button className="reading-v2-studio__button" type="button" onClick={() => onMoveSelectedTaskGroup('down')}>
            Move Selected Down
          </button>
        </div>
        <ol className="reading-v2-task-group-editor__list">
          {taskGroups.map((taskGroup) => (
            <li key={taskGroup.taskGroupId}>
              <button
                className="reading-v2-task-group-editor__list-button"
                type="button"
                aria-current={taskGroup.taskGroupId === selectedTaskGroup?.taskGroupId ? 'true' : undefined}
                onClick={() => onSelectTaskGroup(taskGroup.taskGroupId)}
              >
                {taskGroup.groupTitle ?? (teacherFacing ? READING_V2_TASK_TAXONOMY[taskGroup.officialTaskType].label : taskGroup.officialTaskType)}
              </button>
              <span>{teacherFacing ? READING_V2_TASK_TAXONOMY[taskGroup.officialTaskType].label : taskGroup.engineeringFamily}</span>
            </li>
          ))}
        </ol>
      </div>

      {selectedTaskGroup ? (
        <section className="reading-v2-task-group-editor__main" aria-label={teacherFacing ? 'Selected question group editor' : 'Selected task-group editor'}>
          <div className="reading-v2-studio__panel-heading">
            <div>
              <p>{teacherFacing ? 'Selected question group' : 'Selected task group'}</p>
              <h2>{selectedTaskGroup.groupTitle ?? (teacherFacing ? selectedTaskTypeLabel : selectedTaskGroup.officialTaskType)}</h2>
            </div>
            <span className="reading-v2-status">{teacherFacing ? selectedTaskTypeLabel : selectedTaskGroup.officialTaskType}</span>
          </div>
          {teacherFacing ? (
            <section className="reading-v2-editor-section" aria-label="Question type">
              <h3>Question Type</h3>
              <p>{selectedTaskTypeLabel}</p>
              <p className="reading-v2-studio__muted">
                {selectedTaskUsesOptions
                  ? 'Add or edit the choices in Options, then set the correct answer for each question below.'
                  : 'Add the question text below, then set the correct answer for each question.'}
              </p>
            </section>
          ) : (
            <>
              <p className="reading-v2-studio__muted">Canonical task type: {selectedTaskGroup.officialTaskType}</p>
              <p className="reading-v2-studio__muted">Stable task group ID: {selectedTaskGroup.taskGroupId}</p>
              <section className="reading-v2-editor-section" aria-label="Task type conversion">
                <h3>Task Type</h3>
                <label>
                  Compatible canonical task type
                  <select
                    aria-label="Compatible canonical task type"
                    value={selectedTaskGroup.officialTaskType}
                    onChange={(event) => handleTaskTypeChange(event.currentTarget.value as ReadingV2CanonicalTaskType)}
                  >
                    {compatibleTaskTypes.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {READING_V2_TASK_TAXONOMY[taskType].label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="reading-v2-studio__muted">
                  Conversion is limited to the current engineering family so existing interactions and answer rules stay valid.
                </p>
              </section>
            </>
          )}
          <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Instructions' : 'Grouped instructions'}>
            <h3>{teacherFacing ? 'Instructions' : 'Grouped Instructions'}</h3>
            {selectedTaskGroup.instructionBlocks.map((block, index) => (
              <label key={block.id}>
                {teacherFacing ? `Instruction ${index + 1}` : `Instruction block ${index + 1}`}
                <textarea
                  aria-label={teacherFacing ? `Instruction ${index + 1}` : `Grouped instruction block ${index + 1}`}
                  value={block.text}
                  onChange={(event) =>
                    onTaskGroupChange({
                      ...selectedTaskGroup,
                      instructionBlocks: selectedTaskGroup.instructionBlocks.map((currentBlock) =>
                        currentBlock.id === block.id
                          ? { ...currentBlock, text: event.currentTarget.value }
                          : currentBlock,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <button
              className="reading-v2-studio__button"
              type="button"
              onClick={() =>
                onTaskGroupChange({
                  ...selectedTaskGroup,
                  instructionBlocks: [
                    ...selectedTaskGroup.instructionBlocks,
                    {
                      id: `${selectedTaskGroup.taskGroupId}-instruction-${selectedTaskGroup.instructionBlocks.length + 1}`,
                      text: '',
                    },
                  ],
                })
              }
            >
              {teacherFacing ? 'Add Instruction' : 'Add Instruction Block'}
            </button>
          </section>
          {showTeacherTableCompletionBuilder ? (
            <ReadingV2TableCompletionBuilder
              document={document}
              taskGroup={selectedTaskGroup}
              interactions={selectedInteractions}
              visibleNumbers={visibleNumbers}
              onDocumentChange={onDocumentChange}
              onTableCompletionAction={onTableCompletionAction}
            />
          ) : (
            <>
              <section className="reading-v2-editor-section">
                <h3>{teacherFacing ? 'Questions' : 'Interaction List'}</h3>
                <button className="reading-v2-studio__button" type="button" onClick={addInteraction}>
                  {teacherFacing ? 'Add Question' : 'Add Interaction'}
                </button>
                <ol className="reading-v2-interaction-list">
                  {selectedInteractions.map((interaction, index) => {
                    const derived = visibleNumbers.find((item) => item.interactionId === interaction.interactionId);
                    const questionLabel = derived ? `Question ${derived.displayNumber}` : `Question ${index + 1}`;
                    return (
                      <li key={interaction.interactionId}>
                        <span>{teacherFacing ? questionLabel : derived?.label ?? 'Unnumbered placeholder'}</span>
                        <span>{teacherFacing ? responseShapeLabel(interaction.responseShape.kind) : interaction.responseShape.kind}</span>
                        <label>
                          {teacherFacing ? 'Question text' : 'Prompt text'}
                          <textarea
                            aria-label={teacherFacing ? `${questionLabel} question text` : `${derived?.label ?? interaction.interactionId} prompt text`}
                            value={interaction.promptText ?? ''}
                            onChange={(event) =>
                              onInteractionChange({
                                ...interaction,
                                promptText: event.currentTarget.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {teacherFacing ? 'Answer format' : 'Response shape'}
                          <select
                            aria-label={teacherFacing ? `${questionLabel} answer format` : `${derived?.label ?? interaction.interactionId} response shape`}
                            value={interaction.responseShape.kind}
                            onChange={(event) =>
                              onInteractionChange({
                                ...interaction,
                                responseShape: responseShapeForKind(event.currentTarget.value as ReadingV2Interaction['responseShape']['kind']),
                              })
                            }
                          >
                            <option value="free-text">Free text</option>
                            <option value="single-choice">Single choice</option>
                            <option value="multi-select">Multi-select</option>
                            <option value="binary-judgement">Binary judgement</option>
                            <option value="matching">Matching</option>
                            <option value="structured-entry">Structured entry</option>
                          </select>
                        </label>
                        {interaction.responseShape.kind === 'multi-select' ? (
                          <label>
                            Selection limit
                            <input
                              aria-label={`${derived?.label ?? interaction.interactionId} selection limit`}
                              min={1}
                              type="number"
                              value={interaction.responseShape.selectionLimit}
                              onChange={(event) =>
                                onInteractionChange({
                                  ...interaction,
                                  responseShape: {
                                    kind: 'multi-select',
                                    optionSetId: optionSetForInteraction(),
                                    selectionLimit: Math.max(1, Number(event.currentTarget.value)),
                                  },
                                })
                              }
                            />
                          </label>
                        ) : null}
                        {interaction.responseShape.kind === 'matching' ? (
                          <label>
                            Option reuse
                            <select
                              aria-label={`${derived?.label ?? interaction.interactionId} option reuse`}
                              value={interaction.responseShape.optionReuse}
                              onChange={(event) =>
                                onInteractionChange({
                                  ...interaction,
                                  responseShape: {
                                    kind: 'matching',
                                    optionSetId: optionSetForInteraction(),
                                    optionReuse: event.currentTarget.value as 'allowed' | 'disallowed',
                                  },
                                })
                              }
                            >
                              <option value="allowed">Allowed</option>
                              <option value="disallowed">Disallowed</option>
                            </select>
                          </label>
                        ) : null}
                        <button className="reading-v2-studio__button" type="button" onClick={() => moveInteraction(interaction.interactionId, 'up')}>
                          Move Up
                        </button>
                        <button className="reading-v2-studio__button" type="button" onClick={() => moveInteraction(interaction.interactionId, 'down')}>
                          Move Down
                        </button>
                        <button
                          className="reading-v2-studio__button reading-v2-studio__button--quiet"
                          type="button"
                          onClick={() => setPendingRemovalInteractionId(interaction.interactionId)}
                        >
                          Remove
                        </button>
                        {pendingRemovalInteractionId === interaction.interactionId ? (
                          <div className="reading-v2-studio__inline-actions" aria-label={`Remove ${interaction.interactionId} confirmation`}>
                            <button
                              className="reading-v2-studio__button reading-v2-studio__button--secondary"
                              type="button"
                              onClick={() => {
                                onInteractionRemove(interaction.interactionId, selectedTaskGroup);
                                setPendingRemovalInteractionId(null);
                              }}
                            >
                              Confirm Remove
                            </button>
                            <button
                              className="reading-v2-studio__button reading-v2-studio__button--quiet"
                              type="button"
                              onClick={() => setPendingRemovalInteractionId(null)}
                            >
                              Cancel Remove
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
              <section className="reading-v2-editor-section" aria-label={teacherFacing ? 'Options' : 'Option set editor'}>
                <h3>{teacherFacing ? 'Options' : 'Option Sets'}</h3>
                {teacherFacing && !selectedTaskUsesOptions && selectedOptionSets.length === 0 ? (
                  <p className="reading-v2-studio__muted">This question type does not use answer choices.</p>
                ) : (
                  <button className="reading-v2-studio__button" type="button" onClick={addOptionSet}>
                    {teacherFacing ? 'Add Options' : 'Add Option Set'}
                  </button>
                )}
                {selectedOptionSets.map((optionSet) => (
                  <fieldset key={optionSet.optionSetId} className="reading-v2-answer-rule-editor__fieldset">
                    <legend>{teacherFacing ? 'Options' : optionSet.optionSetId}</legend>
                    {optionSet.options.map((option, optionIndex) => (
                      <div key={`${option.optionId}-${optionIndex}`} className="reading-v2-studio__inline-actions">
                        <label>
                          Option label
                          <input
                            aria-label={`Option ${option.label} label`}
                            value={option.label}
                            onChange={(event) => updateOption(optionSet, optionIndex, { label: event.currentTarget.value })}
                          />
                        </label>
                        {teacherFacing ? null : (
                          <label>
                            Option value
                            <input
                              aria-label={`Option ${option.label} value`}
                              value={option.optionId}
                              onChange={(event) => updateOption(optionSet, optionIndex, { optionId: event.currentTarget.value })}
                            />
                          </label>
                        )}
                        <label>
                          Option text
                          <input
                            aria-label={`Option ${option.label} text`}
                            value={option.text}
                            onChange={(event) => updateOption(optionSet, optionIndex, { text: event.currentTarget.value })}
                          />
                        </label>
                        <button
                          className="reading-v2-studio__button"
                          type="button"
                          disabled={optionIndex === 0}
                          onClick={() => moveOption(optionSet, optionIndex, 'up')}
                        >
                          Move Option {option.label} Up
                        </button>
                        <button
                          className="reading-v2-studio__button"
                          type="button"
                          disabled={optionIndex === optionSet.options.length - 1}
                          onClick={() => moveOption(optionSet, optionIndex, 'down')}
                        >
                          Move Option {option.label} Down
                        </button>
                      </div>
                    ))}
                    <button className="reading-v2-studio__button" type="button" onClick={() => addOption(optionSet)}>
                      Add Option
                    </button>
                  </fieldset>
                ))}
              </section>
              <ReadingV2AnswerRuleEditor
                taskGroup={selectedTaskGroup}
                interactions={selectedInteractions}
                teacherFacing={teacherFacing}
                onTaskGroupChange={onTaskGroupChange}
                onInteractionChange={onInteractionChange}
              />
            </>
          )}
          {teacherFacing ? null : (
            <section className="reading-v2-editor-section" aria-label="Anchor repair">
              <h3>Anchor Repair</h3>
              <p>
                Broken paragraph, inline blank, table-cell, flow-step, diagram hotspot, and annotation anchors are
                repaired against canonical anchor IDs.
              </p>
              <p>Document anchors: {Object.keys(document.anchors).length}</p>
            </section>
          )}
        </section>
      ) : (
        <p>{teacherFacing ? 'No question group selected.' : 'No task group selected.'}</p>
      )}
    </section>
  );
}
