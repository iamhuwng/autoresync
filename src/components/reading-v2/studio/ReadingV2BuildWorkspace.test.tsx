import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { deriveReadingV2VisibleNumbers } from '../../../services/reading-v2/readingV2Numbering.service';
import { readingV2Ids, type ReadingV2Document } from '../../../types/readingV2.types';
import type { ReadingV2CanonicalTaskType } from '../../../types/readingV2Taxonomy';
import type {
  ReadingV2BuildPassageSlot,
  ReadingV2BuildValidationMessage,
  ReadingV2QuestionLinkTarget,
} from './ReadingV2BuildWorkspace';
import type { ReadingV2StudioMetadata } from './ReadingV2MetadataPanel';

vi.mock('./ReadingV2PassageEditor', () => ({
  ReadingV2PassageEditor: ({
    ariaLabel,
    onAction,
    onChange,
    value,
  }: {
    readonly ariaLabel?: string;
    readonly onAction?: (action: string) => void;
    readonly onChange: (value: string) => void;
    readonly value: string;
  }) => (
    <section aria-label="Mock TipTap passage editor" data-engine="tiptap">
      <div aria-label={ariaLabel ?? 'Passage editor'} data-value={value} role="textbox" />
      <button type="button" onClick={() => onAction?.('bold')}>Bold</button>
      <button type="button" onClick={() => onChange('Edited TipTap passage')}>Mock edit passage</button>
    </section>
  ),
}));

import { ReadingV2BuildWorkspace } from './ReadingV2BuildWorkspace';

const metadata = {
  title: 'Task type editor parity',
  productMarker: 'reading-v2',
  materialKind: 'full-test' as const,
  durationMinutes: 60,
  difficulty: 'IELTS',
  targetBand: '7.0',
  description: '',
  tags: [],
  visibility: 'private' as const,
  ownerId: 'teacher-1',
  provenanceSummary: 'Fixture',
};

const renderWorkspace = (
  taskType: ReadingV2CanonicalTaskType,
  options: {
    readonly firstPromptText?: string;
    readonly firstAnswer?: string;
    readonly selectedQuestionLink?: ReadingV2QuestionLinkTarget | null;
    readonly withoutPrimaryAnchor?: boolean;
    readonly withImageBlock?: boolean;
    readonly layoutHint?: string;
    readonly validationMessages?: readonly ReadingV2BuildValidationMessage[];
    readonly metadata?: ReadingV2StudioMetadata;
    readonly onAddPassage?: () => void;
  } = {},
) => {
  let document = createReadingV2CanonicalFixture(taskType);
  if (
    options.firstPromptText !== undefined
    || options.firstAnswer !== undefined
    || options.withoutPrimaryAnchor
  ) {
    const firstTaskGroup = Object.values(document.taskGroups)[0]!;
    const firstInteractionId = firstTaskGroup.interactionIds[0]!;
    const firstInteraction = document.interactions[firstInteractionId]!;
    document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          promptText: options.firstPromptText ?? firstInteraction.promptText,
          primaryAnchorId: options.withoutPrimaryAnchor ? undefined : firstInteraction.primaryAnchorId,
          contextAnchorIds: options.withoutPrimaryAnchor ? undefined : firstInteraction.contextAnchorIds,
          scoringRule: options.firstAnswer !== undefined
            ? {
                ...firstInteraction.scoringRule,
                acceptableAnswers: [options.firstAnswer],
              }
            : firstInteraction.scoringRule,
        },
      },
    };
  }
  if (options.withImageBlock) {
    const sectionId = document.sectionIds[0]!;
    const section = document.sections[sectionId]!;
    const imageStimulusId = readingV2Ids.stimulusId('existing-passage-image');
    const nextDocument: ReadingV2Document = {
      ...document,
      sections: {
        ...document.sections,
        [section.sectionId]: {
          ...section,
          stimulusIds: [...section.stimulusIds, imageStimulusId],
        },
      },
      stimuli: {
        ...document.stimuli,
        [imageStimulusId]: {
          stimulusId: imageStimulusId,
          kind: 'media',
          title: 'Existing image',
          content: {
            kind: 'media-content',
            mediaUrl: 'https://example.test/existing.png',
            alt: 'Existing alt text',
            caption: 'Existing caption',
            source: 'Existing source',
          },
          anchorIds: [],
        },
      },
    };
    document = nextDocument;
  }
  if (options.layoutHint !== undefined) {
    const firstTaskGroup = Object.values(document.taskGroups)[0]!;
    document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [firstTaskGroup.taskGroupId]: {
          ...firstTaskGroup,
          layoutHint: options.layoutHint,
        },
      },
    };
  }
  const taskGroups = Object.values(document.taskGroups);
  const taskGroup = taskGroups[0]!;
  const interactions = document.interactions;
  const visibleNumbers = deriveReadingV2VisibleNumbers(taskGroups, interactions);
  const passageSlots: ReadingV2BuildPassageSlot[] = [
    {
      passageNumber: 1,
      sectionId: document.sectionIds[0],
      stimulusId: document.sections[document.sectionIds[0]!]?.stimulusIds[0],
      title: 'Passage 1',
      text: 'Passage body',
      questionGroupCount: 1,
      questionCount: taskGroup.interactionIds.length,
      hasTitle: true,
      hasText: true,
    },
    {
      passageNumber: 2,
      title: '',
      text: '',
      questionGroupCount: 0,
      questionCount: 0,
      hasTitle: false,
      hasText: false,
    },
    {
      passageNumber: 3,
      title: '',
      text: '',
      questionGroupCount: 0,
      questionCount: 0,
      hasTitle: false,
      hasText: false,
    },
  ];
  const onInteractionChange = vi.fn();
  const onOptionSetChange = vi.fn();
  const onTaskGroupChange = vi.fn();
  const onDocumentChange = vi.fn();
  const onPassageTextChange = vi.fn();
  const onPassageEditorAction = vi.fn();
  const onQuestionLinkNavigation = vi.fn();
  const onQuestionLinkRepair = vi.fn();
  const onSelectTaskGroup = vi.fn();
  const onReviewIssuesAction = vi.fn();
  const onMetadataChange = vi.fn();

  const renderResult = render(
    <ReadingV2BuildWorkspace
      document={document}
      metadata={options.metadata ?? metadata}
      modeLabel="Create blank"
      passageSlots={passageSlots}
      selectedPassageNumber={1}
      selectedPassageTaskGroups={taskGroups}
      allTaskGroups={taskGroups}
      interactions={interactions}
      optionSets={document.optionSets}
      authoringNumbers={visibleNumbers}
      selectedTaskGroupId={taskGroup.taskGroupId}
      selectedQuestionLink={options.selectedQuestionLink}
      validationMessages={options.validationMessages ?? []}
      publishBlocked={false}
      publishState="idle"
      onSaveDraft={vi.fn()}
      onValidate={vi.fn()}
      onPreview={vi.fn()}
      onPublish={vi.fn()}
      onExit={vi.fn()}
      onSelectPassage={vi.fn()}
      onAddPassage={options.onAddPassage}
      onMetadataChange={onMetadataChange}
      onPassageTitleChange={vi.fn()}
      onPassageTextChange={onPassageTextChange}
      onAddQuestionGroup={vi.fn()}
      onSelectTaskGroup={onSelectTaskGroup}
      onTaskGroupChange={onTaskGroupChange}
      onInteractionChange={onInteractionChange}
      onInteractionRemove={vi.fn()}
      onOptionSetChange={onOptionSetChange}
      onDocumentChange={onDocumentChange}
      onPassageEditorAction={onPassageEditorAction}
      onQuestionLinkNavigation={onQuestionLinkNavigation}
      onQuestionLinkRepair={onQuestionLinkRepair}
      onReviewIssuesAction={onReviewIssuesAction}
      onAddQuestion={vi.fn()}
      onDuplicateQuestionGroup={vi.fn()}
      onDeleteQuestionGroup={vi.fn()}
      onOpenQuestionGroupModal={vi.fn()}
      onCloseQuestionGroupModal={vi.fn()}
    />,
  );

  return {
    container: renderResult.container,
    document,
    taskGroup,
    onInteractionChange,
    onOptionSetChange,
    onTaskGroupChange,
    onDocumentChange,
    onPassageEditorAction,
    onPassageTextChange,
    onQuestionLinkNavigation,
    onQuestionLinkRepair,
    onSelectTaskGroup,
    onReviewIssuesAction,
    onMetadataChange,
  };
};

describe('ReadingV2BuildWorkspace task-type editors', () => {
  it('renders Add Passage as an icon-only control with an accessible name', () => {
    renderWorkspace('summary-completion-text', {
      onAddPassage: vi.fn(),
    });

    const addPassageButton = screen.getByRole('button', { name: 'Add Passage' });

    expect(addPassageButton).toHaveAttribute('aria-label', 'Add Passage');
    expect(addPassageButton.textContent?.trim()).toBe('');
    expect(addPassageButton.querySelector('svg')).toBeTruthy();
  });

  it('keeps numeric passage tab labels available for constrained layouts', () => {
    const { container } = renderWorkspace('summary-completion-text');

    const firstTab = screen.getByRole('button', { name: 'Passage 1' });

    expect(firstTab.querySelector('.reading-v2-build__passage-tab-label-full')).toHaveTextContent('Passage 1');
    expect(firstTab.querySelector('.reading-v2-build__passage-tab-label-short')).toHaveTextContent('1');
    expect(container.querySelector('.reading-v2-build__passage-tab-list')).toBeInTheDocument();
  });

  it('does not render the redundant Instructions heading inside question cards', () => {
    renderWorkspace('summary-completion-text');

    expect(screen.queryByRole('heading', { name: 'Instructions' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Summary Completion: words from passage instruction 1')).toBeInTheDocument();
  });

  it('exposes public and private visibility beside Add Question Group for passage materials', () => {
    const { onMetadataChange } = renderWorkspace('summary-completion-text', {
      metadata: {
        ...metadata,
        materialKind: 'reading-passage',
      },
    });

    const visibilityGroup = screen.getByRole('group', { name: 'Reading Passage visibility' });
    const privateButton = within(visibilityGroup).getByRole('button', { name: 'Private' });
    const publicButton = within(visibilityGroup).getByRole('button', { name: 'Public' });

    expect(privateButton).toHaveAttribute('aria-pressed', 'true');
    expect(publicButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(publicButton);

    expect(onMetadataChange).toHaveBeenCalledWith(expect.objectContaining({
      visibility: 'public',
    }));
  });

  it('opens click-stable review issues panel instead of exposing full tooltip text', () => {
    renderWorkspace('summary-completion-text', {
      validationMessages: [
        {
          key: 'q1-answer',
          message: 'Question 1 needs an answer.',
          reviewLabel: 'Question 1',
          reviewDetail: 'Add the missing answer before publishing.',
          questionRange: { start: 1, end: 1 },
        },
        {
          key: 'q2-3-source',
          message: 'Questions 2-3 need source review.',
          reviewLabel: 'Questions 2-3',
          reviewDetail: 'Check prompt text and answer key.',
          questionRange: { start: 2, end: 3 },
        },
      ],
    });

    const pill = screen.getByRole('button', { name: '2 validation items' });
    expect(pill).not.toHaveAttribute('title', expect.stringContaining('Add the missing answer'));
    expect(screen.queryByRole('dialog', { name: 'Review issues' })).not.toBeInTheDocument();

    fireEvent.click(pill);

    const panel = screen.getByRole('dialog', { name: 'Review issues' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    expect(within(panel).getByRole('button', { name: 'Question 1: Missing Answer' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Questions 2-3: Review Required' })).toBeInTheDocument();
    expect(within(panel).queryByText(/Interaction /i)).not.toBeInTheDocument();
  });

  it('navigates from a review issue to the target question and highlights its card', () => {
    const { document, taskGroup, onQuestionLinkNavigation, onSelectTaskGroup, onReviewIssuesAction } = renderWorkspace('summary-completion-text', {
      validationMessages: [
        {
          key: 'q1-answer',
          message: 'Question 1 needs an answer.',
          reviewLabel: 'Question 1',
          reviewDetail: 'Add the missing answer before publishing.',
          questionRange: { start: 1, end: 1 },
        },
      ],
    });
    const firstInteraction = document.interactions[taskGroup.interactionIds[0]!]!;

    fireEvent.click(screen.getByRole('button', { name: '1 validation item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Question 1: Missing Answer' }));

    expect(onSelectTaskGroup).toHaveBeenCalledWith(taskGroup.taskGroupId);
    expect(onQuestionLinkNavigation).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: firstInteraction.interactionId,
      taskGroupId: taskGroup.taskGroupId,
      source: 'diagnostic',
    }));
    expect(onReviewIssuesAction).toHaveBeenCalledWith('reviewIssueNavigate', expect.objectContaining({
      issueId: 'q1-answer',
      questionStart: 1,
    }));
    expect(screen.getByLabelText(`Review guidance for Question 1`)).toHaveAttribute('data-review-focus', 'true');
  });

  it('navigates and highlights when validation text infers the question target', () => {
    const { document, taskGroup, onQuestionLinkNavigation, onSelectTaskGroup } = renderWorkspace('summary-completion-text', {
      validationMessages: [
        {
          key: 'q1-answer-key',
          message: 'Question 1 has no answer key.',
        },
      ],
    });
    const firstInteraction = document.interactions[taskGroup.interactionIds[0]!]!;

    fireEvent.click(screen.getByRole('button', { name: '1 validation item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Question 1: Missing Answer Key' }));

    expect(onSelectTaskGroup).toHaveBeenCalledWith(taskGroup.taskGroupId);
    expect(onQuestionLinkNavigation).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: firstInteraction.interactionId,
      taskGroupId: taskGroup.taskGroupId,
      source: 'diagnostic',
    }));
    const card = screen.getByLabelText('Review guidance for Question 1').closest('.reading-v2-build-card');
    expect(within(card as HTMLElement).getByRole('button', { name: /Missing answer key/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Review guidance for Question 1')).toHaveAttribute('data-review-focus', 'true');
  });

  it('renders inline issue chips from the same review issue data source', () => {
    renderWorkspace('summary-completion-text', {
      validationMessages: [
        {
          key: 'q1-answer',
          message: 'Question 1 needs an answer.',
          reviewLabel: 'Question 1',
          reviewDetail: 'Add the missing answer before publishing.',
          questionRange: { start: 1, end: 1 },
        },
      ],
    });

    const card = screen.getByLabelText('Review guidance for Question 1').closest('.reading-v2-build-card');
    expect(within(card as HTMLElement).getByRole('button', { name: /Missing answer/i })).toBeInTheDocument();
    expect(screen.queryByText('2 issues')).not.toBeInTheDocument();
  });

  it('hides question link checks when linked questions do not need attention', () => {
    renderWorkspace('true-false-not-given');

    expect(screen.queryByLabelText(/Question links for/i)).not.toBeInTheDocument();
  });

  it('navigates from question rows to linked source blocks and highlights the selected link', () => {
    const fixtureDocument = createReadingV2CanonicalFixture('table-completion');
    const fixtureTaskGroup = Object.values(fixtureDocument.taskGroups)[0]!;
    const firstInteraction = fixtureDocument.interactions[fixtureTaskGroup.interactionIds[0]!]!;
    const { onQuestionLinkNavigation } = renderWorkspace('table-completion', {
      selectedQuestionLink: {
        anchorId: firstInteraction.primaryAnchorId,
        interactionId: firstInteraction.interactionId,
        taskGroupId: fixtureTaskGroup.taskGroupId,
        source: 'diagnostic',
      },
    });

    const linkPanel = screen.getByLabelText(/Question links for/i);
    const selectedRow = within(linkPanel).getByText('Q1').closest('.reading-v2-question-links__row');
    expect(selectedRow).toHaveAttribute('data-linked-selected', 'true');

    fireEvent.click(within(linkPanel).getAllByRole('button', { name: 'Reveal linked block' })[0]!);

    expect(onQuestionLinkNavigation).toHaveBeenCalledWith(expect.objectContaining({
      anchorId: firstInteraction.primaryAnchorId,
      interactionId: firstInteraction.interactionId,
      taskGroupId: fixtureTaskGroup.taskGroupId,
      source: 'question',
    }));
  });

  it('repairs orphan questions by linking them to the passage anchor', () => {
    const { document, onInteractionChange, onQuestionLinkRepair } = renderWorkspace('sentence-completion', {
      withoutPrimaryAnchor: true,
    });
    const firstTaskGroup = Object.values(document.taskGroups)[0]!;
    const firstInteraction = document.interactions[firstTaskGroup.interactionIds[0]!]!;
    const passageStimulus = Object.values(document.stimuli).find((stimulus) => stimulus.kind === 'passage')!;
    const passageAnchorId = passageStimulus.anchorIds[0]!;

    fireEvent.click(screen.getByRole('button', { name: 'Link to passage' }));

    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: firstInteraction.interactionId,
      primaryAnchorId: passageAnchorId,
      contextAnchorIds: [passageAnchorId],
    }));
    expect(onQuestionLinkRepair).toHaveBeenCalledWith(
      'orphan-question-linked-to-passage',
      expect.objectContaining({
        anchorId: passageAnchorId,
        interactionId: firstInteraction.interactionId,
      }),
    );
  });

  it('shows a passage-side highlight when the selected link belongs to a passage anchor', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const interaction = document.interactions[taskGroup.interactionIds[0]!]!;

    renderWorkspace('sentence-completion', {
      selectedQuestionLink: {
        anchorId: interaction.primaryAnchorId,
        interactionId: interaction.interactionId,
        taskGroupId: taskGroup.taskGroupId,
        source: 'question',
      },
    });

    expect(screen.getByLabelText('Selected passage link')).toHaveTextContent('Linked passage block selected');
  });

  it('repairs stale option answers by adding the missing option to the bank', () => {
    const { onOptionSetChange, onQuestionLinkRepair } = renderWorkspace('matching-features', {
      firstAnswer: 'Z',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add missing option' }));

    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'Z', text: 'Z' }),
      ]),
    }));
    expect(onQuestionLinkRepair).toHaveBeenCalledWith(
      'stale-option-added-to-bank',
      expect.objectContaining({ answer: 'Z' }),
    );
  });

  it('uses a TipTap passage editor for passage authoring tools', () => {
    const { onPassageEditorAction, onPassageTextChange } = renderWorkspace('sentence-completion');
    const passageEditor = screen.getByLabelText('Passage editor');

    expect(passageEditor).toHaveAttribute('data-value', 'Passage body');
    expect(screen.getByLabelText('Mock TipTap passage editor')).toHaveAttribute('data-engine', 'tiptap');
    expect(screen.queryByText('Passage text')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(onPassageEditorAction).toHaveBeenCalledWith('bold', expect.objectContaining({
      passageNumber: 1,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Mock edit passage' }));
    expect(onPassageTextChange).toHaveBeenCalledWith(1, 'Edited TipTap passage');
  });

  it('creates and edits durable passage image blocks without marker text', () => {
    const { onDocumentChange, onPassageEditorAction } = renderWorkspace('sentence-completion', {
      withImageBlock: true,
    });

    const imageBlocks = screen.getByLabelText('Passage image blocks');
    expect(within(imageBlocks).getByRole('img', { name: 'Existing alt text' })).toBeInTheDocument();
    fireEvent.change(within(imageBlocks).getByLabelText('Image block 1 URL'), {
      target: { value: 'https://example.test/updated.png' },
    });

    const updatedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const updatedImage = updatedDocument.stimuli[readingV2Ids.stimulusId('existing-passage-image')];
    expect(updatedImage?.content).toEqual(expect.objectContaining({
      kind: 'media-content',
      mediaUrl: 'https://example.test/updated.png',
    }));
    expect(onPassageEditorAction).toHaveBeenCalledWith('image-block-url-updated', expect.objectContaining({
      passageNumber: 1,
    }));

    fireEvent.click(within(imageBlocks).getByRole('button', { name: 'Add image block' }));
    const createdDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    expect(Object.values(createdDocument.stimuli).filter((stimulus) => stimulus.content.kind === 'media-content')).toHaveLength(2);
    expect(onPassageEditorAction).toHaveBeenCalledWith('image-block-created', expect.objectContaining({
      passageNumber: 1,
    }));

    fireEvent.click(within(imageBlocks).getByRole('button', { name: 'Delete image block' }));
    const deletedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    expect(deletedDocument.stimuli[readingV2Ids.stimulusId('existing-passage-image')]).toBeUndefined();
    expect(onPassageEditorAction).toHaveBeenCalledWith('image-block-deleted', expect.objectContaining({
      passageNumber: 1,
    }));
  });

  it('uses one whole-sentence field and group word limit for sentence-completion', () => {
    const { onInteractionChange, onTaskGroupChange } = renderWorkspace('sentence-completion', {
      firstPromptText: 'The ancient sailors used',
    });

    const editor = screen.getByLabelText('Sentence Completion dedicated editor');
    expect(editor).toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Question \d+ text before blank/)).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Question \d+ text after blank/)).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Word limit for Question \d+/)).not.toBeInTheDocument();

    const sentenceField = within(editor).getByLabelText('Question 1 sentence text');
    fireEvent.focus(sentenceField);
    (sentenceField as HTMLTextAreaElement).setSelectionRange(
      (sentenceField as HTMLTextAreaElement).value.length,
      (sentenceField as HTMLTextAreaElement).value.length,
    );
    fireEvent.click(within(editor).getByRole('button', { name: 'Insert blank for Question 1' }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'The ancient sailors used _____',
    }));

    fireEvent.change(within(editor).getByLabelText('Accepted answers for Question 1'), {
      target: { value: 'stars | currents' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['stars', 'currents'] }),
    }));

    fireEvent.change(screen.getByLabelText('Sentence completion word limit'), {
      target: { value: '3' },
    });
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ wordLimit: 3 }),
    }));
  });

  it('uses a choice bank and blank mapping for summary-completion-list', () => {
    const { onInteractionChange, onTaskGroupChange } = renderWorkspace('summary-completion-list');

    const editor = screen.getByLabelText('Summary Completion: choose from list dedicated editor');
    const summaryBody = within(editor).getByLabelText('Summary completion list body');
    expect((summaryBody as HTMLTextAreaElement).value).toContain('[1]');
    expect((summaryBody as HTMLTextAreaElement).value).toContain('[2]');
    expect(within(editor).queryByLabelText(/Question \d+ text before blank/)).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Option H text')).toBeInTheDocument();

    fireEvent.change(summaryBody, {
      target: { value: 'The summary uses [1] in context and then uses [2] later.' },
    });
    fireEvent.blur(summaryBody);
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      layoutHint: expect.stringContaining('"kind":"summary-list"'),
    }));

    fireEvent.change(within(editor).getByRole('combobox', { name: 'Answer key for Question 1' }), {
      target: { value: 'A' },
    });

    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['A'] }),
    }));
  });

  it('uses one continuous free-text body for summary-completion-text', () => {
    const { onInteractionChange, onTaskGroupChange } = renderWorkspace('summary-completion-text');

    const editor = screen.getByLabelText('Summary Completion: words from passage dedicated editor');
    const summaryBody = within(editor).getByLabelText('Summary completion text body');
    expect((summaryBody as HTMLTextAreaElement).value).toContain('[1]');
    expect((summaryBody as HTMLTextAreaElement).value).toContain('[2]');
    expect(within(editor).queryByLabelText(/Question \d+ text before blank/)).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Question \d+ text after blank/)).not.toBeInTheDocument();

    fireEvent.change(summaryBody, {
      target: { value: 'The passage summary keeps [1] inline and adds [2] in the same body.' },
    });
    fireEvent.blur(summaryBody);
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      layoutHint: expect.stringContaining('"kind":"summary-text"'),
    }));

    onTaskGroupChange.mockClear();
    fireEvent.change(summaryBody, {
      target: { value: 'The passage summary keeps blank inline and adds blank in the same body.' },
    });
    fireEvent.blur(summaryBody);
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      layoutHint: expect.stringContaining('The passage summary keeps'),
    }));

    fireEvent.change(within(editor).getByLabelText('Accepted answers for Question 1'), {
      target: { value: 'steam | vapour' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['steam', 'vapour'] }),
    }));

    fireEvent.change(screen.getByLabelText('Summary completion word limit'), {
      target: { value: '3' },
    });
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ wordLimit: 3 }),
    }));
  });

  it('uses table-first editing controls for table-completion', () => {
    const { onDocumentChange } = renderWorkspace('table-completion');

    const builder = screen.getByLabelText('Table Completion Builder');
    expect(within(builder).getByLabelText('Table title')).toBeInTheDocument();
    expect(within(builder).queryByText('Cell role')).not.toBeInTheDocument();
    expect(within(builder).queryByLabelText(/Select table cell/)).not.toBeInTheDocument();
    expect(within(builder).getByRole('status', { name: /Select a cell to insert an inline blank/ })).toBeInTheDocument();

    fireEvent.focus(within(builder).getByLabelText('Table cell 1.1 text'));
    fireEvent.click(within(builder).getByRole('button', { name: 'Insert blank' }));
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.any(Object),
    }));

    fireEvent.click(within(builder).getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(within(builder).getByRole('button', { name: 'Select Cells' }));
    fireEvent.click(within(builder).getByLabelText('Table cell 1.1 text'));
    fireEvent.click(within(builder).getByLabelText('Table cell 1.2 text'));
    expect(within(builder).getByRole('status', { name: /Ready to merge into one table cell/ })).toBeInTheDocument();
    expect(within(builder).getByRole('button', { name: 'Merge' })).not.toBeDisabled();
    fireEvent.click(within(builder).getByRole('button', { name: 'Merge' }));
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.any(Object),
    }));
  });

  it('uses a normal formatted note editor for note-completion', () => {
    const { onInteractionChange, onTaskGroupChange } = renderWorkspace('note-completion', {
      firstPromptText: 'Featured a stiff frame made of',
      layoutHint: JSON.stringify({
        kind: 'note-completion-layout',
        subheading: '',
        sections: [{ heading: 'Early silk production in China', questionNumbers: [1, 2] }],
      }),
    });

    const editor = screen.getByLabelText('Note Completion dedicated editor');
    expect(within(editor).getByLabelText('Note completion heading')).toBeInTheDocument();
    expect(within(editor).getByText('Early silk production in China')).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add note blank' })).toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Question \d+ note text before blank/)).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText(/Question \d+ note text after blank/)).not.toBeInTheDocument();

    const noteText = within(editor).getByLabelText('Question 1 note text');
    fireEvent.focus(noteText);
    (noteText as HTMLTextAreaElement).setSelectionRange(
      (noteText as HTMLTextAreaElement).value.length,
      (noteText as HTMLTextAreaElement).value.length,
    );
    fireEvent.click(within(editor).getByRole('button', { name: 'Insert blank for Question 1' }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'Featured a stiff frame made of _____',
    }));

    fireEvent.change(within(editor).getByLabelText('Note completion heading'), {
      target: { value: 'EVOLUTION OF THE BICYCLE DESIGN' },
    });
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      groupTitle: 'EVOLUTION OF THE BICYCLE DESIGN',
    }));
  });

  it('uses option-bank source fields for matching-headings', () => {
    const { onDocumentChange } = renderWorkspace('matching-headings');

    const editor = screen.getByLabelText('Matching Headings dedicated editor');
    const headingBank = within(editor).getByLabelText('Roman numeral heading list for Matching Headings');
    expect(headingBank.querySelector('.reading-v2-build-options--table')).toBeInTheDocument();
    expect(headingBank.querySelector('table')).toBeInTheDocument();
    expect(headingBank.querySelector('tbody td.reading-v2-build-options__label')).toHaveTextContent('i');
    expect(within(headingBank).getByText('Heading text')).toBeInTheDocument();
    expect(within(editor).queryByRole('combobox', { name: 'Answer key for option i' })).not.toBeInTheDocument();
    expect(within(editor).queryByRole('combobox', { name: /Correct match/ })).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Paragraph or section for option i')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Paragraph or section for option iii')).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Remove option iii' })).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText('Paragraph or section for option iii'), {
      target: { value: 'Paragraph C introduces the main heading.' },
    });
    const nextDocument = onDocumentChange.mock.calls.at(-1)?.[0];
    expect(Object.values(nextDocument.interactions)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        promptText: 'Paragraph C introduces the main heading.',
        scoringRule: expect.objectContaining({ acceptableAnswers: ['iii'] }),
      }),
    ]));
  });

  it('uses paragraph-bank statement mapping for matching-information', () => {
    const { onDocumentChange } = renderWorkspace('matching-information');

    const editor = screen.getByLabelText('Matching Information dedicated editor');
    const paragraphBank = within(editor).getByLabelText('Paragraph choices for Matching Information');
    expect(paragraphBank).toBeInTheDocument();
    expect(paragraphBank.querySelector('.reading-v2-build-options--table')).toBeInTheDocument();
    expect(paragraphBank.querySelector('table')).toBeInTheDocument();
    expect(paragraphBank.querySelector('tbody td.reading-v2-build-options__label')).toHaveTextContent('A');
    expect(within(editor).getByText('Reuse paragraphs')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Option H text')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Information statements for option C')).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add paragraph' })).toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: 'Add statement' })).not.toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText('Information statements for option C'), {
      target: { value: 'The paragraph mentions a training method.\nThe paragraph names a reviewer.' },
    });
    const nextDocument = onDocumentChange.mock.calls.at(-1)?.[0];
    const cMatches = Object.values(nextDocument.interactions).filter((interaction) =>
      interaction.scoringRule.acceptableAnswers?.includes('C'),
    );
    expect(cMatches).toHaveLength(2);
  });

  it('uses feature-bank statement mapping for matching-features', () => {
    const { onInteractionChange, onOptionSetChange } = renderWorkspace('matching-features');

    const editor = screen.getByLabelText('Matching Features dedicated editor');
    const featureBank = within(editor).getByLabelText('Feature list for Matching Features');
    expect(featureBank).toBeInTheDocument();
    expect(featureBank.querySelector('.reading-v2-build-options--table')).toBeInTheDocument();
    expect(featureBank.querySelector('table')).toBeInTheDocument();
    expect(featureBank.querySelector('tbody td.reading-v2-build-options__label')).toHaveTextContent('A');
    expect(within(editor).getByText('Reuse features')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Option E text')).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Feature statements for option E')).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Feature statements for Matching Features')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Statement for Question 1')).toBeInTheDocument();
    expect(within(editor).getByRole('combobox', { name: 'Correct match for Question 1' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add feature' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add statement' })).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText('Statement for Question 1'), {
      target: { value: 'The researcher used interviews.' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'The researcher used interviews.',
    }));

    fireEvent.change(within(editor).getByRole('combobox', { name: 'Correct match for Question 1' }), {
      target: { value: 'E' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['E'] }),
    }));

    fireEvent.click(within(editor).getByRole('button', { name: 'Add feature' }));
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([expect.objectContaining({ label: 'F' })]),
    }));
  });

  it('uses sentence beginnings, ending bank, and no-reuse defaults for matching-sentence-endings', () => {
    const { onInteractionChange, onOptionSetChange } = renderWorkspace('matching-sentence-endings');

    const editor = screen.getByLabelText('Matching Sentence Endings dedicated editor');
    const endingBank = within(editor).getByLabelText('Ending options for Matching Sentence Endings');
    expect(endingBank).toBeInTheDocument();
    expect(endingBank.querySelector('.reading-v2-build-options--table')).toBeInTheDocument();
    expect(endingBank.querySelector('table')).toBeInTheDocument();
    expect(endingBank.querySelector('tbody td.reading-v2-build-options__label')).toHaveTextContent('A');
    expect(within(editor).getByText('Reuse endings')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Option G text')).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Sentence beginning for option A')).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Sentence beginnings for Matching Sentence Endings')).toBeInTheDocument();
    expect(within(editor).getByLabelText('Sentence beginning for Question 1')).toBeInTheDocument();
    expect(within(editor).getByRole('combobox', { name: 'Correct match for Question 1' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add ending' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'Add sentence beginning' })).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: 'No reuse' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(within(editor).getByLabelText('Sentence beginning for Question 1'), {
      target: { value: 'The first design was intended to' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'The first design was intended to',
    }));

    fireEvent.change(within(editor).getByRole('combobox', { name: 'Correct match for Question 1' }), {
      target: { value: 'C' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['C'] }),
    }));

    fireEvent.click(within(editor).getByRole('button', { name: 'Add ending' }));
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([expect.objectContaining({ label: 'H' })]),
    }));
  });

  it('uses radio-style option rows for multiple-choice instead of a generic answer dropdown', () => {
    const { onInteractionChange, onOptionSetChange } = renderWorkspace('multiple-choice');

    const editor = screen.getByLabelText('Multiple Choice dedicated editor');
    expect(editor).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /correct answer for question 1/i })).not.toBeInTheDocument();
    const question = within(editor).getByText('Question 1').closest('fieldset') as HTMLElement;
    expect(within(question).getByLabelText('Question 1 question text').closest('.reading-v2-choice-editor__prompt-row')).toBeInTheDocument();
    expect(question.querySelector('.reading-v2-task-editor__error')).not.toBeInTheDocument();
    const addOptionButton = within(question).getByRole('button', { name: 'Add option' });
    const deleteQuestionButton = within(question).getByRole('button', { name: 'Delete question' });
    expect(addOptionButton.closest('.reading-v2-choice-editor__row-actions')).toBe(deleteQuestionButton.closest('.reading-v2-choice-editor__row-actions'));

    fireEvent.click(screen.getByLabelText('Mark option B correct for Question 1'));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['B'] }),
    }));

    fireEvent.change(screen.getByLabelText('Question 1 option A'), {
      target: { value: 'A clear option' },
    });
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'A', text: 'A clear option' }),
      ]),
    }));
  });

  it('uses checkbox-style option rows and selection-count validation for multiple-select', () => {
    const { onInteractionChange } = renderWorkspace('multiple-select');

    const editor = screen.getByLabelText('Multiple Selection dedicated editor');
    const selectionCount = within(editor).getByLabelText('Selection count for Question 1');
    expect(selectionCount).toHaveValue(2);
    const promptRow = selectionCount.closest('.reading-v2-choice-editor__prompt-row--with-count');
    expect(promptRow).toBeInTheDocument();
    expect(within(promptRow as HTMLElement).getByLabelText('Question 1 question text')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mark option A correct for Question 1'));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({
        acceptableAnswers: ['B'],
        orderMatters: false,
      }),
    }));
  });

  it('uses accepted-answer fields and word-limit controls for short-answer', () => {
    const { onInteractionChange, onTaskGroupChange } = renderWorkspace('short-answer');

    const editor = screen.getByLabelText('Short Answer Questions dedicated editor');
    expect(editor).toBeInTheDocument();
    expect(screen.getByLabelText('Short Answer Questions word limit')).toHaveValue('2');
    expect(within(editor).queryByLabelText(/Word limit for Question \d+/)).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('Question 1 short answer prompt').closest('.reading-v2-short-answer-editor__prompt')).toBeInTheDocument();
    const question = within(editor).getByText('Question 1').closest('fieldset') as HTMLElement;
    const addAcceptedButton = within(question).getByRole('button', { name: 'Add accepted answer' });
    expect(addAcceptedButton.closest('.reading-v2-short-answer-editor__primary-row')).toBeInTheDocument();
    expect(question.querySelector('.reading-v2-task-editor__error')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Short Answer Questions word limit'), {
      target: { value: '3' },
    });
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ wordLimit: 3 }),
    }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      responseShape: expect.objectContaining({ wordLimit: 3 }),
    }));

    fireEvent.change(screen.getByLabelText('Primary answer for Question 1'), {
      target: { value: 'navigation' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['navigation'] }),
    }));
  });

  it('uses judgement statement cards and pill controls for true-false-not-given', () => {
    const { onInteractionChange } = renderWorkspace('true-false-not-given');

    const editor = screen.getByLabelText('True / False / Not Given dedicated editor');
    expect(within(editor).queryByText('Statement text')).not.toBeInTheDocument();
    fireEvent.click(within(editor).getAllByRole('button', { name: 'FALSE' })[0]!);

    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['False'] }),
    }));
  });

  it('uses yes-no-not-given vocabulary without exposing TFNG labels', () => {
    const { onInteractionChange } = renderWorkspace('yes-no-not-given');

    const editor = screen.getByLabelText('Yes / No / Not Given dedicated editor');
    expect(within(editor).queryByRole('button', { name: 'TRUE' })).not.toBeInTheDocument();

    fireEvent.click(within(editor).getAllByRole('button', { name: 'NO' })[0]!);
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['No'] }),
    }));
  });

  it('uses ordered flowchart steps with blank markers and answer-key rows', () => {
    const { onInteractionChange, onDocumentChange } = renderWorkspace('flowchart-completion');

    const editor = screen.getByLabelText('Flowchart Completion dedicated editor');
    expect(within(editor).getByLabelText('Flowchart steps')).toBeInTheDocument();
    expect(within(editor).getByText('[1]')).toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText('Flowchart answer for Question 1'), {
      target: { value: 'sulphur' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['sulphur'] }),
    }));

    fireEvent.click(within(editor).getByRole('button', { name: 'Add Step' }));
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.any(Object),
    }));
  });

  it('uses diagram source choice, preview-only image, and answer-key rows', () => {
    const { onInteractionChange, onDocumentChange } = renderWorkspace('diagram-labeling');

    const editor = screen.getByLabelText('Diagram Labelling dedicated editor');
    expect(within(editor).getByLabelText('Diagram image preview')).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Diagram image alt text')).not.toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: 'Drag diagram label Question 1' })).not.toBeInTheDocument();

    fireEvent.click(within(editor).getByRole('button', { name: 'Use URL' }));
    fireEvent.change(within(editor).getByLabelText('Diagram image URL'), {
      target: { value: 'https://example.test/diagram.png' },
    });
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.any(Object),
    }));

    fireEvent.click(within(editor).getByRole('button', { name: 'Upload file' }));
    expect(within(editor).getByLabelText('Diagram image file')).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Diagram target label for Question 1')).not.toBeInTheDocument();

    fireEvent.change(within(editor).getByLabelText('Diagram answer for Question 1'), {
      target: { value: 'greenbelts' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['greenbelts'] }),
    }));
  });
});
