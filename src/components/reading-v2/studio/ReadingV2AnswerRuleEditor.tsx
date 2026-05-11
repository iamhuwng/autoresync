import type {
  ReadingV2Interaction,
  ReadingV2ScoringRule,
  ReadingV2TaskGroup,
} from '../../../types/readingV2.types';

export interface ReadingV2AnswerRuleEditorProps {
  readonly taskGroup: ReadingV2TaskGroup;
  readonly interactions: readonly ReadingV2Interaction[];
  readonly teacherFacing?: boolean;
  readonly onTaskGroupChange: (taskGroup: ReadingV2TaskGroup) => void;
  readonly onInteractionChange: (interaction: ReadingV2Interaction) => void;
}

const parseAcceptableAnswers = (value: string): readonly string[] =>
  value
    .split('|')
    .map((answer) => answer.trim())
    .filter(Boolean);

const updateScoringRule = (
  interaction: ReadingV2Interaction,
  scoringRule: Partial<ReadingV2ScoringRule>,
): ReadingV2Interaction => ({
  ...interaction,
  scoringRule: {
    ...interaction.scoringRule,
    ...scoringRule,
  },
});

const updateResponseShape = (
  interaction: ReadingV2Interaction,
  responseShape: ReadingV2Interaction['responseShape'],
): ReadingV2Interaction => ({
  ...interaction,
  responseShape,
});

const updateFreeTextWordLimit = (
  interaction: ReadingV2Interaction,
  wordLimit: number,
): ReadingV2Interaction =>
  updateResponseShape(interaction, {
    kind: 'free-text',
    wordLimit,
  });

const updateBinaryVocabulary = (
  interaction: ReadingV2Interaction,
  vocabulary: 'TFNG' | 'YNNG',
): ReadingV2Interaction => {
  if (interaction.responseShape.kind !== 'binary-judgement') {
    return interaction;
  }

  return updateResponseShape(interaction, {
    kind: 'binary-judgement',
    vocabulary,
  });
};

const updateMatchingOptionReuse = (
  interaction: ReadingV2Interaction,
  optionReuse: 'allowed' | 'disallowed',
): ReadingV2Interaction => {
  if (interaction.responseShape.kind !== 'matching') {
    return interaction;
  }

  return updateResponseShape(interaction, {
    kind: 'matching',
    optionSetId: interaction.responseShape.optionSetId,
    optionReuse,
  });
};

const updateStructuredEntryKind = (
  interaction: ReadingV2Interaction,
  structure: 'table' | 'flowchart' | 'diagram',
): ReadingV2Interaction => {
  if (interaction.responseShape.kind !== 'structured-entry') {
    return interaction;
  }

  return updateResponseShape(interaction, {
    kind: 'structured-entry',
    structure,
  });
};

const updateAnswerRule = (
  taskGroup: ReadingV2TaskGroup,
  answerRule: Partial<ReadingV2TaskGroup['answerRule']>,
): ReadingV2TaskGroup => ({
  ...taskGroup,
  answerRule: {
    ...taskGroup.answerRule,
    ...answerRule,
  },
});

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

export function ReadingV2AnswerRuleEditor({
  taskGroup,
  interactions,
  teacherFacing = false,
  onTaskGroupChange,
  onInteractionChange,
}: ReadingV2AnswerRuleEditorProps) {
  return (
    <section className="reading-v2-answer-rule-editor" aria-label={teacherFacing ? 'Correct answers' : 'Answer rules and scoring'}>
      <div className="reading-v2-studio__panel-heading">
        <div>
          <p>Scoring</p>
          <h3>{teacherFacing ? 'Correct Answers' : 'Answer Rules'}</h3>
        </div>
      </div>
      <p className="reading-v2-studio__muted">
        {teacherFacing
          ? 'Answer keys are edited inside this question group.'
          : 'Answer keys live inside Questions and write into canonical task-group interactions.'}
      </p>
      <div className="reading-v2-form-grid reading-v2-form-grid--compact">
      <label>
        {teacherFacing ? 'Capitalization' : 'Casing normalization'}
        <select
          aria-label={teacherFacing ? 'Answer capitalization' : 'Answer casing normalization'}
          value={taskGroup.answerRule.casing ?? 'ignored'}
          onChange={(event) =>
            onTaskGroupChange(
              updateAnswerRule(taskGroup, {
                casing: event.currentTarget.value as ReadingV2TaskGroup['answerRule']['casing'],
              }),
            )
          }
        >
          <option value="ignored">Ignored</option>
          <option value="sensitive">Sensitive</option>
        </select>
      </label>
      <label>
        {teacherFacing ? 'Punctuation' : 'Punctuation normalization'}
        <select
          aria-label={teacherFacing ? 'Answer punctuation' : 'Answer punctuation normalization'}
          value={taskGroup.answerRule.punctuation ?? 'ignored'}
          onChange={(event) =>
            onTaskGroupChange(
              updateAnswerRule(taskGroup, {
                punctuation: event.currentTarget.value as ReadingV2TaskGroup['answerRule']['punctuation'],
              }),
            )
          }
        >
          <option value="ignored">Ignored</option>
          <option value="sensitive">Sensitive</option>
        </select>
      </label>
      </div>
      {interactions.map((interaction, index) => {
        const questionLabel = interaction.reviewLabel.displayNumber
          ? `Question ${interaction.reviewLabel.displayNumber}`
          : `Question ${index + 1}`;

        return (
        <fieldset className="reading-v2-answer-rule-editor__fieldset" key={interaction.interactionId}>
          <legend>{teacherFacing ? questionLabel : interaction.reviewLabel.displayNumber ? `Question ${interaction.reviewLabel.displayNumber}` : interaction.interactionId}</legend>
          <p className="reading-v2-studio__muted">
            {teacherFacing ? 'Answer format' : 'Response shape'}: {teacherFacing ? responseShapeLabel(interaction.responseShape.kind) : interaction.responseShape.kind}
          </p>
          <div className="reading-v2-form-grid reading-v2-form-grid--compact">
          {interaction.responseShape.kind === 'free-text' ? (
            <label>
              Word limit
              <input
                aria-label={`Word limit for ${interaction.interactionId}`}
                type="number"
                min={1}
                value={interaction.responseShape.wordLimit ?? taskGroup.answerRule.wordLimit ?? 1}
                onChange={(event) => {
                  const wordLimit = Number(event.currentTarget.value);
                  onTaskGroupChange(updateAnswerRule(taskGroup, { wordLimit }));
                  onInteractionChange(updateFreeTextWordLimit(interaction, wordLimit));
                }}
              />
            </label>
          ) : null}
          <label>
            {teacherFacing ? 'Correct answers' : 'Acceptable answers'}
            <input
              aria-label={teacherFacing ? `Correct answers for ${questionLabel}` : `Acceptable answers for ${interaction.interactionId}`}
              value={interaction.scoringRule.acceptableAnswers?.join(' | ') ?? ''}
              onChange={(event) =>
                onInteractionChange(
                  updateScoringRule(interaction, {
                    acceptableAnswers: parseAcceptableAnswers(event.currentTarget.value),
                  }),
                )
              }
            />
          </label>
          <label>
            Score value
            <input
              aria-label={`Score value for ${interaction.interactionId}`}
              type="number"
              min={0}
              value={interaction.scoringRule.maxScore}
              onChange={(event) =>
                onInteractionChange(
                  updateScoringRule(interaction, {
                    maxScore: Number(event.currentTarget.value),
                  }),
                )
              }
            />
          </label>
          {interaction.responseShape.kind === 'binary-judgement' ? (
            <label>
              Binary judgement vocabulary
              <select
                aria-label={`Binary judgement vocabulary for ${interaction.interactionId}`}
                value={interaction.responseShape.vocabulary}
                onChange={(event) =>
                  onInteractionChange(
                    updateBinaryVocabulary(interaction, event.currentTarget.value as 'TFNG' | 'YNNG'),
                  )
                }
              >
                <option value="TFNG">True / False / Not Given</option>
                <option value="YNNG">Yes / No / Not Given</option>
              </select>
            </label>
          ) : null}
          {interaction.responseShape.kind === 'matching' ? (
            <label>
              Option reuse
              <select
                aria-label={`Option reuse for ${interaction.interactionId}`}
                value={interaction.responseShape.optionReuse}
                onChange={(event) => {
                  const optionReuse = event.currentTarget.value as 'allowed' | 'disallowed';
                  onTaskGroupChange(updateAnswerRule(taskGroup, { optionReuse }));
                  onInteractionChange(updateMatchingOptionReuse(interaction, optionReuse));
                }}
              >
                <option value="allowed">Allowed</option>
                <option value="disallowed">Disallowed</option>
              </select>
            </label>
          ) : null}
          {interaction.responseShape.kind === 'structured-entry' ? (
            <label>
              {teacherFacing ? 'Block type' : 'Structured target keys'}
              <select
                aria-label={teacherFacing ? `Block type for ${questionLabel}` : `Structured target keys for ${interaction.interactionId}`}
                value={interaction.responseShape.structure}
                onChange={(event) =>
                  onInteractionChange(
                    updateStructuredEntryKind(
                      interaction,
                      event.currentTarget.value as 'table' | 'flowchart' | 'diagram',
                    ),
                  )
                }
              >
                <option value="table">Table</option>
                <option value="flowchart">Flowchart</option>
                <option value="diagram">Diagram</option>
              </select>
            </label>
          ) : null}
          </div>
        </fieldset>
      );
      })}
    </section>
  );
}
