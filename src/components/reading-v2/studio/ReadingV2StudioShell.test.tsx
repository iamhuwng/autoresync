import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ReadingV2PassageEditor', () => ({
  ReadingV2PassageEditor: ({
    ariaLabel,
    onChange,
    value,
  }: {
    readonly ariaLabel?: string;
    readonly onChange: (value: string) => void;
    readonly value: string;
  }) => (
    <div
      aria-label={ariaLabel ?? 'Passage editor'}
      contentEditable
      data-engine="tiptap"
      onInput={(event) => onChange(event.currentTarget.textContent ?? '')}
      role="textbox"
      suppressContentEditableWarning
    >
      {value}
    </div>
  ),
}));

import {
  ReadingV2StudioShell,
  createManualReadingV2TaskGroup,
  createReadingV2ManualPassage,
} from './ReadingV2StudioShell';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
} from '../../../services/reading-v2/readingV2ImportNormalization.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from '../../../services/reading-v2/readingV2ExternalAiPrompt.service';
import { generateReadingV2PreviewOnly } from '../../../services/reading-v2/readingV2PublishPipeline.service';
import {
  deserializeReadingV2CanonicalToEditorDocument,
  validateReadingV2EditorDocument,
} from '../../../services/reading-v2/readingV2EditorDocument.service';
import type { ReadingV2Document, ReadingV2SectionId } from '../../../types/readingV2.types';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

const setClipboard = (clipboard: Pick<Clipboard, 'writeText'> | undefined): void => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
};

const ALL_READING_TASK_TYPES = [
  'Sentence Completion',
  'Summary Completion: words from passage',
  'Summary Completion: choose from list',
  'Note Completion',
  'Table Completion',
  'Flowchart Completion',
  'Diagram Labelling',
  'True / False / Not Given',
  'Yes / No / Not Given',
  'Matching Headings',
  'Matching Information',
  'Matching Features',
  'Matching Sentence Endings',
  'Multiple Choice',
  'Multiple Selection',
  'Short Answer Questions',
] as const;

const openAddQuestionGroupModal = () => {
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Question Group' })[0]!);
  return screen.getByRole('dialog', { name: 'Add Question Group' });
};

const chooseTaskType = (label: string) => {
  const dialog = screen.getByRole('dialog', { name: 'Add Question Group' });
  fireEvent.change(within(dialog).getByLabelText('Search question types'), {
    target: { value: label },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: label }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
};

const fillPassage = (
  document: ReadingV2Document,
  passageNumber: number,
  title: string,
  text: string,
): ReadingV2Document => {
  const sectionId = document.sectionIds[passageNumber - 1];
  const section = sectionId ? document.sections[sectionId] : undefined;
  const stimulusId = section?.stimulusIds[0];
  const stimulus = stimulusId ? document.stimuli[stimulusId] : undefined;

  if (!section || !stimulus || stimulus.content.kind !== 'passage-content') {
    return document;
  }

  return {
    ...document,
    sections: {
      ...document.sections,
      [section.sectionId]: {
        ...section,
        title,
      },
    },
    stimuli: {
      ...document.stimuli,
      [stimulus.stimulusId]: {
        ...stimulus,
        title,
        content: {
          ...stimulus.content,
          paragraphs: [
            {
              ...(stimulus.content.paragraphs[0] ?? {}),
              text,
            },
          ],
        },
      },
    },
  };
};

const completionTaskTypes = new Set([
  'sentence-completion',
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
]);
const visibleBlankPattern = /_{3,}|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}/i;

const fillAllQuestions = (document: ReadingV2Document): ReadingV2Document => ({
  ...document,
  interactions: Object.fromEntries(
    Object.values(document.interactions).map((interaction, index) => {
      const parentTaskGroup = document.taskGroups[interaction.taskGroupId];
      const promptText = interaction.promptText?.trim() ? interaction.promptText : `Question prompt ${index + 1}`;
      const publishablePromptText = parentTaskGroup && completionTaskTypes.has(parentTaskGroup.officialTaskType) && !visibleBlankPattern.test(promptText)
        ? `${promptText} [blank]`
        : promptText;

      return [
        interaction.interactionId,
        {
          ...interaction,
          promptText: publishablePromptText,
          scoringRule: {
            ...interaction.scoringRule,
            maxScore: 1,
            acceptableAnswers: interaction.scoringRule.acceptableAnswers?.length
              ? interaction.scoringRule.acceptableAnswers
              : [`answer ${index + 1}`],
          },
          placeholder: false,
        },
      ];
    }),
  ),
});

const createPublishableThreePassageDocument = (): ReadingV2Document => {
  let document = createReadingV2CanonicalFixture('sentence-completion');
  document = fillPassage(document, 1, 'Passage One', 'Passage one text for preview.');
  document = createReadingV2ManualPassage(document, 2);
  document = fillPassage(document, 2, 'Passage Two', 'Passage two text for preview.');
  document = createManualReadingV2TaskGroup(document, 'sentence-completion', document.sectionIds[1] as ReadingV2SectionId);
  document = createReadingV2ManualPassage(document, 3);
  document = fillPassage(document, 3, 'Passage Three', 'Passage three text for preview.');
  document = createManualReadingV2TaskGroup(document, 'sentence-completion', document.sectionIds[2] as ReadingV2SectionId);
  return fillAllQuestions(document);
};

afterEach(() => {
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
  } else {
    delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  }
});

const updatePassageEditorText = (value: string): HTMLElement => {
  const editor = screen.getByLabelText('Passage editor');
  editor.textContent = value;
  fireEvent.input(editor);
  return editor;
};

describe('ReadingV2StudioShell Build Workspace', () => {
  it('renders the Build Test action bar and keeps developer details collapsed by default', () => {
    render(<ReadingV2StudioShell mode="create-blank" />);

    expect(screen.getByRole('heading', { name: 'Untitled IELTS Reading Test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy parsing diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Developer details' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Metadata and publish readiness')).not.toBeInTheDocument();
    expect(screen.queryByText(/Revision token/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Developer details' }));
    expect(screen.getByLabelText('Metadata readiness')).toHaveTextContent('Metadata');
    expect(screen.getByLabelText('Publish readiness')).toHaveTextContent('Publish Readiness');
  });

  it('copies parser diagnostics for imported Studio drafts in one click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onAction = vi.fn();
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph.',
        '',
        '#### Questions 1-2',
        'Do the following statements agree with the information? TRUE, FALSE, NOT GIVEN',
        '**1** Imported statement one',
        '**2** Imported statement two',
      ].join('\n'),
      answerKeyText: ['1 TRUE', '2 NG'].join('\n'),
      fileName: 'studio-diagnostics.md',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);
    setClipboard({ writeText });

    render(
      <ReadingV2StudioShell
        mode="create-from-import"
        document={normalized.document}
        importCandidate={candidate}
        metadata={{ title: 'Studio Diagnostics' }}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy parsing diagnostics' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('READING V2 STUDIO PARSING DIAGNOSTICS')));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('studio-diagnostics.md'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"answerKey"'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"officialTaskType": "true-false-not-given"'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"parsedQuestionCount": 2'));
    expect(screen.queryByLabelText('Import review')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept into Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review import details' })).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('Parsing diagnostics copied.')).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledWith('copyParsingDiagnostics', expect.objectContaining({ outcome: 'success' }));
  });

  it('surfaces import blockers and jumps teachers to the repair area', () => {
    const onAction = vi.fn();
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Partial key passage',
            passages: [
              {
                title: 'Partial key passage',
                content: 'This structured source passage has enough content for import diagnostics.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Complete the sentences below.',
                questionRange: { start: 1, end: 2 },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'sentence-completion',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Imported sentence one ___.',
              },
              {
                questionNumber: 2,
                type: 'sentence-completion',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Imported sentence two ___.',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: '1 answer',
      fileName: 'studio-partial-key.md',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);

    render(
      <ReadingV2StudioShell
        mode="create-from-import"
        document={normalized.document}
        importCandidate={candidate}
        metadata={{ title: 'Partial Key Diagnostics' }}
        onAction={onAction}
      />,
    );

    expect(screen.queryByLabelText('Import review and answer key authority')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review import details' }));
    expect(screen.getByLabelText('Import review and answer key authority')).toHaveTextContent('Teacher key partially bound');
    expect(onAction).toHaveBeenCalledWith('toggleImportReviewDetails', expect.objectContaining({ outcome: 'expanded' }));
    const missingQuestionRow = screen.getByText('Question 2 has no bound teacher-key answer.').closest('li');
    expect(missingQuestionRow).toBeTruthy();

    fireEvent.click(within(missingQuestionRow as HTMLElement).getByRole('button', { name: 'Review' }));

    expect(onAction).toHaveBeenCalledWith('jumpImportDiagnostic', expect.objectContaining({
      outcome: 'interaction',
      targetStep: 'Questions',
    }));
  });

  it('keeps imported review details collapsed by default and accepts import from the developer action row', () => {
    const onAction = vi.fn();
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph.',
        '',
        '#### Questions 1-2',
        'Do the following statements agree with the information? TRUE, FALSE, NOT GIVEN',
        '**1** Imported statement one',
        '**2** Imported statement two',
      ].join('\n'),
      answerKeyText: ['1 TRUE', '2 FALSE'].join('\n'),
      fileName: 'accept-from-actions.md',
    });

    render(
      <ReadingV2StudioShell
        mode="create-from-import"
        importCandidate={candidate}
        metadata={{ title: 'Accept Import' }}
        onAction={onAction}
      />,
    );

    expect(screen.queryByLabelText('Import review')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept into Draft' }));

    expect(screen.queryByRole('button', { name: 'Accept into Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review import details' })).not.toBeInTheDocument();
    expect(onAction).toHaveBeenCalledWith('importMaterial', expect.objectContaining({
      outcome: 'normalized-to-canonical-draft',
    }));
  });

  it('tracks question-link navigation and repair actions from the Studio shell', () => {
    const onAction = vi.fn();
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const firstTaskGroup = Object.values(document.taskGroups)[0]!;
    const firstInteractionId = firstTaskGroup.interactionIds[0]!;
    const orphanDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...document.interactions[firstInteractionId]!,
          primaryAnchorId: undefined,
          contextAnchorIds: undefined,
        },
      },
    };

    render(
      <ReadingV2StudioShell
        mode="resume-draft"
        document={orphanDocument}
        metadata={{ title: 'Question link repair' }}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Link to passage' }));

    expect(onAction).toHaveBeenCalledWith('questionLinkRepair', expect.objectContaining({
      outcome: 'orphan-question-linked-to-passage',
      interactionId: firstInteractionId,
    }));
    expect(onAction).toHaveBeenCalledWith('questionLinkNavigate', expect.objectContaining({
      outcome: 'repair',
      interactionId: firstInteractionId,
    }));
  });

  it('switches between Passage 1, Passage 2, and Passage 3 and updates both panels', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Switch test' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Passage 1' }));

    expect(screen.getByLabelText('Passage 1 editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Questions for Passage 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passage 2' }));
    expect(screen.getByLabelText('Passage 2 editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Questions for Passage 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Passage title'), { target: { value: 'Second passage' } });
    updatePassageEditorText('Second passage body.');
    expect(screen.getByLabelText('Passage title')).toHaveValue('Second passage');
    expect(screen.getByLabelText('Passage editor')).toHaveTextContent('Second passage body.');

    fireEvent.click(screen.getByRole('button', { name: 'Passage 3' }));
    expect(screen.getByLabelText('Passage 3 editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Questions for Passage 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passage 2' }));
    expect(screen.getByLabelText('Passage title')).toHaveValue('Second passage');
  });

  it('adds and removes empty passages from the passage selector', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Passage controls' }} />);

    expect(screen.queryByRole('button', { name: 'Passage 2' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    expect(screen.getByRole('button', { name: 'Passage 2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Passage 2 editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Passage 2' }));
    expect(screen.queryByRole('button', { name: 'Passage 2' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Passage 1 editor')).toBeInTheDocument();
  });

  it('keeps Passage 3 editable when selected directly from a blank test', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Direct passage 3 test' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Passage 3' }));
    expect(screen.getByLabelText('Passage 3 editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Questions for Passage 3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Passage title'), { target: { value: 'Third passage' } });
    updatePassageEditorText('Third passage body.');
    expect(screen.getByLabelText('Passage title')).toHaveValue('Third passage');
    expect(screen.getByLabelText('Passage editor')).toHaveTextContent('Third passage body.');

    openAddQuestionGroupModal();
    chooseTaskType('Table Completion');
    const passageThreeQuestions = screen.getByLabelText('Questions for Passage 3');
    expect(within(passageThreeQuestions).getByText('Table Completion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passage 1' }));
    expect(within(screen.getByLabelText('Questions for Passage 1')).queryByText('Table Completion')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passage 3' }));
    expect(screen.getByLabelText('Passage title')).toHaveValue('Third passage');
    expect(screen.getByLabelText('Passage editor')).toHaveTextContent('Third passage body.');
    expect(within(screen.getByLabelText('Questions for Passage 3')).getByText('Table Completion')).toBeInTheDocument();
  }, 15000);

  it('keeps task type categories collapsed until search filters the Add Question Group modal', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Modal test' }} />);

    const dialog = openAddQuestionGroupModal();
    const continueButton = within(dialog).getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    expect(dialog.querySelector('details.reading-v2-build-modal__category[open]')).not.toBeInTheDocument();

    ALL_READING_TASK_TYPES.forEach((label) => {
      fireEvent.change(within(dialog).getByLabelText('Search question types'), {
        target: { value: label },
      });
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    });

    fireEvent.change(within(dialog).getByLabelText('Search question types'), {
      target: { value: 'Multiple Selection' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Multiple Selection' }));
    expect(continueButton).not.toBeDisabled();
  });

  it('creates question groups for the selected passage and keeps numbering global', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Global numbering' }} />);

    openAddQuestionGroupModal();
    chooseTaskType('Sentence Completion');
    expect(within(screen.getByLabelText('Questions for Passage 1')).getByText('Questions 1-2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Passage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Passage 2' }));
    openAddQuestionGroupModal();
    chooseTaskType('Multiple Choice');

    const passageTwoQuestions = screen.getByLabelText('Questions for Passage 2');
    expect(within(passageTwoQuestions).getByText('Multiple Choice')).toBeInTheDocument();
    expect(within(passageTwoQuestions).getByText('Questions 3-4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passage 1' }));
    const passageOneQuestions = screen.getByLabelText('Questions for Passage 1');
    expect(within(passageOneQuestions).queryByText('Multiple Choice')).not.toBeInTheDocument();
  }, 10000);

  it('duplicates a question group into an independent editable copy', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Duplicate group' }} />);

    openAddQuestionGroupModal();
    chooseTaskType('Table Completion');

    const passageOneQuestions = screen.getByLabelText('Questions for Passage 1');
    const originalCard = within(passageOneQuestions).getByText('Questions 1-2').closest('article');
    expect(originalCard).toBeTruthy();
    fireEvent.click(within(originalCard as HTMLElement).getByRole('button', { name: 'Duplicate' }));

    expect(within(passageOneQuestions).getByText('Questions 3-4')).toBeInTheDocument();
    const tableTitles = within(passageOneQuestions).getAllByLabelText('Table title') as HTMLInputElement[];
    expect(tableTitles).toHaveLength(2);

    fireEvent.change(tableTitles[1]!, { target: { value: 'Copied table title' } });
    expect(tableTitles[0]).toHaveValue('Table Completion Table');
    expect(tableTitles[1]).toHaveValue('Copied table title');
  }, 10000);

  it('saves structured table edits only after editor-block normalization keeps anchors valid', async () => {
    const onSaveDraft = vi.fn(async () => ({ revisionToken: 'structured-normalized-rev-2' }));

    render(
      <ReadingV2StudioShell
        mode="create-blank"
        draftId="structured-normalized-draft"
        metadata={{ title: 'Structured normalized draft' }}
        onSaveDraft={onSaveDraft}
      />,
    );

    openAddQuestionGroupModal();
    chooseTaskType('Table Completion');

    fireEvent.change(screen.getByLabelText('Table title'), {
      target: { value: 'Editor block normalized table' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalled());
    const savedDocument = onSaveDraft.mock.calls[0]?.[0].document as ReadingV2Document;
    const tableStimulus = Object.values(savedDocument.stimuli).find((stimulus) =>
      stimulus.content.kind === 'table-content',
    );

    expect(tableStimulus).toEqual(expect.objectContaining({ title: 'Editor block normalized table' }));
    expect(validateReadingV2EditorDocument(deserializeReadingV2CanonicalToEditorDocument(savedDocument))).toEqual([]);
  }, 10000);

  it('saves incomplete drafts while publish remains blocked by teacher-readable validation', async () => {
    const onSaveDraft = vi.fn(async () => ({ revisionToken: 'incomplete-rev-2' }));
    const onPreview = vi.fn(async (snapshot) =>
      generateReadingV2PreviewOnly({
        draftId: snapshot.draftId,
        ownerId: snapshot.metadata.ownerId,
        document: snapshot.document,
      }).projection);
    render(
      <ReadingV2StudioShell
        mode="create-blank"
        draftId="incomplete-draft"
        onSaveDraft={onSaveDraft}
        onPreview={onPreview}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText(/items? need attention\./)).toBeInTheDocument();
    expect(screen.getByText('Passage 1 needs a title.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'incomplete-draft',
      document: expect.any(Object),
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('dialog', { name: 'Reading V2 teacher preview' })).toBeInTheDocument();
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'incomplete-draft',
    }));
  });

  it('offers completion blank repair and confirms destructive question deletes', () => {
    const completionDocument = createReadingV2CanonicalFixture('sentence-completion');
    const documentWithoutVisibleBlanks: ReadingV2Document = {
      ...completionDocument,
      interactions: Object.fromEntries(
        Object.entries(completionDocument.interactions).map(([interactionId, interaction]) => [
          interactionId,
          {
            ...interaction,
            promptText: (interaction.promptText ?? '').replace(/_{3,}|\[\s*blank\s*\]/gi, 'the missing word'),
          },
        ]),
      ) as ReadingV2Document['interactions'],
    };

    render(
      <ReadingV2StudioShell
        mode="resume-draft"
        draftId="completion-ux-draft"
        document={documentWithoutVisibleBlanks}
        metadata={{ title: 'Completion UX draft' }}
      />,
    );

    const firstSentence = screen.getAllByLabelText('Question 1 sentence text')[0] as HTMLTextAreaElement;
    fireEvent.change(firstSentence, { target: { value: 'Repaired sentence prefix' } });
    firstSentence.setSelectionRange(firstSentence.value.length, firstSentence.value.length);
    fireEvent.click(screen.getAllByRole('button', { name: 'Insert blank for Question 1' })[0]!);
    expect(firstSentence.value).toBe('Repaired sentence prefix _____');
    expect(screen.getAllByText('Blank in sentence: Q1')[0]).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row for Question 1' })[0]!);
    expect(screen.getByText(/Delete Question 1/i)).toBeInTheDocument();
    expect(screen.getAllByText('Question 1')[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep row' }));
    expect(screen.queryByText(/Delete Question 1/i)).not.toBeInTheDocument();
  });

  it('saves against the duplicated draft identity after conflict recovery duplicate', async () => {
    const onDuplicateDraft = vi.fn(async () => ({
      draftId: 'duplicated-draft',
      materialId: 'duplicated-material',
      revisionToken: 'duplicated-draft-rev-1',
    }));
    const onSaveDraft = vi.fn(async () => ({ revisionToken: 'duplicated-draft-rev-2' }));
    render(
      <ReadingV2StudioShell
        mode="resume-draft"
        operationalState="conflict"
        draftId="source-draft"
        materialId="source-material"
        onDuplicateDraft={onDuplicateDraft}
        onSaveDraft={onSaveDraft}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Developer details' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate draft' }));
    });

    expect(onDuplicateDraft).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'duplicated-draft',
      materialId: 'duplicated-material',
      revisionToken: 'duplicated-draft-rev-1',
    })));
  });

  it('enables structured task types while marker-based passage tools stay out of the TipTap editor', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Structured controls' }} />);

    expect(screen.getByLabelText('Passage editor')).toHaveAttribute('data-engine', 'tiptap');
    expect(screen.queryByRole('button', { name: 'Add table' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add image' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add diagram' })).not.toBeInTheDocument();

    const dialog = openAddQuestionGroupModal();
    fireEvent.change(within(dialog).getByLabelText('Search question types'), {
      target: { value: 'Flowchart Completion' },
    });
    expect(within(dialog).getByRole('button', { name: /Flowchart Completion/ })).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText('Search question types'), {
      target: { value: 'Diagram Labelling' },
    });
    expect(within(dialog).getByRole('button', { name: /Diagram Labelling/ })).toBeEnabled();
    expect(within(dialog).queryByText(/image persistence and runtime preview/i)).not.toBeInTheDocument();
  });

  it('does not expose forbidden internal terms in the normal teacher workspace', () => {
    render(<ReadingV2StudioShell mode="create-blank" metadata={{ title: 'Teacher safe copy' }} />);

    const normalTeacherText = screen.getByLabelText('Reading V2 build workspace').textContent?.toLowerCase() ?? '';
    [
      'stimulus',
      'canonical',
      'schema',
      'provenance',
      'extraction scope',
      'material kind',
      'anchor',
      'task group id',
      'revision token',
      'publish-blocking placeholder',
      'unresolved extraction evidence',
      'canonical validation',
    ].forEach((term) => {
      expect(normalTeacherText).not.toContain(term);
    });
  });

  it('opens a student-facing preview from the current publishable draft', async () => {
    const document = createPublishableThreePassageDocument();
    const onPreview = vi.fn(async (snapshot) =>
      generateReadingV2PreviewOnly({
        draftId: snapshot.draftId,
        ownerId: snapshot.metadata.ownerId,
        document: snapshot.document,
      }).projection);

    render(
      <ReadingV2StudioShell
        mode="resume-draft"
        draftId="preview-draft"
        document={document}
        metadata={{ title: 'Preview ready test' }}
        onPreview={onPreview}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByRole('dialog', { name: 'Reading V2 teacher preview' })).toBeInTheDocument();
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'preview-draft',
      document: expect.objectContaining({ documentId: document.documentId }),
    }));
  });

  it('uses an exit confirmation before leaving the workspace', () => {
    const onExit = vi.fn();
    render(<ReadingV2StudioShell mode="create-blank" onExit={onExit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Exit confirmation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leave Workspace' }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
