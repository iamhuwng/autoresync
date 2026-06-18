import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE } from '../../../services/reading-v2/fixtures/readingV2PasteImportFixtures';
import { READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE } from '../../../services/reading-v2/fixtures/readingV2ProjectionFixtures';
import { READING_V2_PROJECTION_FIXTURES } from '../../../services/reading-v2/fixtures/readingV2ProjectionFixtures';
import type { ReadingV2DerivedProjection } from '../../../services/reading-v2/readingV2Projection.service';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
} from '../../../services/reading-v2/readingV2ImportNormalization.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from '../../../services/reading-v2/readingV2ExternalAiPrompt.service';
import { generateReadingV2PreviewProjection } from '../../../services/reading-v2/readingV2Projection.service';
import { storage } from '../../../core/platform/storage';
import { ReadingV2RuntimeShell } from './ReadingV2RuntimeShell';

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
};

const mockElementRect = (
  element: Element,
  top: number,
  height = 48,
  horizontal: { readonly left?: number; readonly width?: number } = {},
) => {
  const left = horizontal.left ?? 0;
  const width = horizontal.width ?? 320;
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: height });
};

const mockScrollablePanel = (
  element: HTMLElement,
  metrics: {
    readonly scrollTop: number;
    readonly clientHeight: number;
    readonly scrollHeight: number;
    readonly scrollLeft?: number;
    readonly clientWidth?: number;
    readonly scrollWidth?: number;
  },
) => {
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: metrics.clientHeight });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: metrics.scrollHeight });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: metrics.clientWidth ?? 320 });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: metrics.scrollWidth ?? metrics.clientWidth ?? 320 });
  element.scrollTop = metrics.scrollTop;
  element.scrollLeft = metrics.scrollLeft ?? 0;

  const scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
    if (typeof optionsOrX === 'number') {
      element.scrollLeft = Number(optionsOrX);
      element.scrollTop = Number(y ?? 0);
      return;
    }

    element.scrollLeft = Number(optionsOrX?.left ?? element.scrollLeft);
    element.scrollTop = Number(optionsOrX?.top ?? element.scrollTop);
  });
  Object.defineProperty(element, 'scrollTo', { configurable: true, value: scrollTo });
  return scrollTo;
};

const getRuntimeQuestionAnchor = (displayNumber: number): HTMLElement => {
  const element = document.getElementById(`reading-v2-question-${displayNumber}`);
  expect(element).toBeInstanceOf(HTMLElement);
  return element as HTMLElement;
};

const cam16Projection = (): ReadingV2DerivedProjection => {
  const result = normalizeReadingV2ImportCandidate(
    createReadingV2ImportCandidateFromText({
      text: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.rawText,
      answerKeyText: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.answerKeyText,
      fileName: `${READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.name}.txt`,
    }),
  );

  return generateReadingV2PreviewProjection({
    draftId: 'full-fixture-runtime',
    ownerId: 'teacher-1',
    document: result.document,
  });
};

const mixedImportedProjection = (): ReadingV2DerivedProjection => {
  const structuredPayload = [
    READING_V2_STRUCTURED_MATERIALS_START,
    '```json',
    JSON.stringify({
      sourceFile: 'runtime-import-proof.txt',
      materials: [
        {
          passageNumber: 1,
          title: 'Runtime import proof',
          passages: [
            {
              title: 'Runtime source passage',
              content: [
                'This imported passage gives enough context for completion, judgement, choice, matching, and table tasks.',
                '',
                'A second paragraph keeps the source visible while runtime checks only consume the derived projection.',
              ].join('\n'),
            },
          ],
          sectionInstructions: [
            {
              id: 'p1-q1',
              text: 'Complete the sentence with ONE WORD.',
              questionRange: { start: 1, end: 1 },
            },
            {
              id: 'p1-q2',
              text: 'Do the following statement agree with the passage? TRUE, FALSE, NOT GIVEN',
              questionRange: { start: 2, end: 2 },
            },
            {
              id: 'p1-q3',
              text: 'Choose the correct letter, A, B or C.',
              questionRange: { start: 3, end: 3 },
            },
            {
              id: 'p1-q4',
              text: 'Choose the correct heading for Paragraph A from the list below.',
              questionRange: { start: 4, end: 4 },
              sectionReferences: [
                { label: 'i', text: 'Imported heading one' },
                { label: 'ii', text: 'Imported heading two' },
              ],
            },
            {
              id: 'p1-q5',
              text: 'Complete the table below.',
              questionRange: { start: 5, end: 5 },
              table: {
                rows: [
                  [
                    { text: 'Feature', role: 'header' },
                    { text: 'Detail', role: 'header' },
                  ],
                  [
                    { text: 'Imported row' },
                    { text: 'Runtime table blank _____.', questionNumber: 5 },
                  ],
                ],
              },
            },
          ],
          questions: [
            {
              questionNumber: 1,
              type: 'sentence-completion',
              sectionInstructionId: 'p1-q1',
              questionText: 'Imported completion prompt _____.',
              wordLimit: 1,
            },
            {
              questionNumber: 2,
              type: 'true-false-not-given',
              sectionInstructionId: 'p1-q2',
              questionText: 'Imported judgement statement.',
            },
            {
              questionNumber: 3,
              type: 'multiple-choice',
              sectionInstructionId: 'p1-q3',
              questionText: 'Imported choice question.',
              labeledOptions: [
                { label: 'A', text: 'Choice A' },
                { label: 'B', text: 'Choice B' },
                { label: 'C', text: 'Choice C' },
              ],
            },
            {
              questionNumber: 4,
              type: 'matching-headings',
              sectionInstructionId: 'p1-q4',
              questionText: 'Paragraph A',
            },
            {
              questionNumber: 5,
              type: 'table-completion',
              sectionInstructionId: 'p1-q5',
              questionText: 'Runtime table blank.',
            },
          ],
        },
      ],
    }),
    '```',
    READING_V2_STRUCTURED_MATERIALS_END,
  ].join('\n');
  const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({
    text: structuredPayload,
    answerKeyText: ['1 word', '2 TRUE', '3 A', '4 i', '5 table'].join('\n'),
  }));

  return generateReadingV2PreviewProjection({
    draftId: 'runtime-import-proof',
    ownerId: 'teacher-1',
    document: result.document,
  });
};

describe('ReadingV2RuntimeShell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the desktop/tablet V1-like two-column runtime from a projection fixture', () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    expect(screen.getByLabelText('Desktop and tablet two-column runtime')).toBeInTheDocument();
    expect(screen.getByLabelText('Left passage and stimulus column')).toBeInTheDocument();
    expect(screen.getByLabelText('Right full grouped question panel')).toBeInTheDocument();
    expect(screen.getByLabelText('Grouped instructions')).toHaveTextContent('Complete the sentences below.');
    expect(screen.getByLabelText('Grouped instructions')).toHaveTextContent('Choose NO MORE THAN TWO WORDS from the passage for each answer.');
    expect(screen.getByLabelText('Question 1')).toHaveTextContent('Complete the fixture sentence with the first missing word.');
    expect(screen.getByRole('textbox', { name: 'Question 1 answer' })).toBeInTheDocument();
  });

  it('keeps the phone runtime on phone hardware in landscape', () => {
    setViewport(844, 390);
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    );

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    expect(screen.getByLabelText('Phone passage-first runtime')).toBeInTheDocument();
    expect(screen.getByLabelText('Student Reading runtime header')).toBeInTheDocument();
  });

  it('uses the phone runtime across the full student mobile breakpoint', () => {
    setViewport(767, 500);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    expect(screen.getByLabelText('Phone passage-first runtime')).toBeInTheDocument();
  });

  it('renders a top-right exit button when a return handler is provided', async () => {
    setViewport(1366, 900);
    const onExit = vi.fn();
    const user = userEvent.setup();

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} onExit={onExit} />);

    const exitButton = screen.getByRole('button', { name: 'Exit Reading test' });
    expect(exitButton).toHaveClass('reading-v2-runtime__exit-button');

    await user.click(exitButton);

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not synthesize visible passage paragraph labels when projection paragraphs are unlabeled', () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={mixedImportedProjection()} />);

    const passage = screen.getByLabelText('Reading passage');
    expect(passage).toHaveTextContent('This imported passage gives enough context');
    expect(passage).toHaveTextContent('A second paragraph keeps the source visible');
    expect(passage).not.toHaveTextContent('A This imported passage');
    expect(passage).not.toHaveTextContent('B A second paragraph');
  });

  it('renders imported IELTS statement and completion prompts instead of passage paragraphs', () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={cam16Projection()} />);

    expect(screen.getByLabelText('Question 1')).toHaveTextContent('Imported judgement statement 1');
    expect(screen.getByLabelText('Question 10')).toHaveTextContent('Imported completion sentence 10');
    expect(screen.getByLabelText('Question 10')).not.toHaveTextContent('Imported passage 1 paragraph A');
    expect(within(screen.getByLabelText('Question 10')).getByRole('textbox', { name: 'Question 10 answer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reading footer navigator')).toHaveTextContent('13');
  });

  it('opens desktop footer part and question navigation at the selected content', async () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={cam16Projection()} />);

    const rightPanel = screen.getByLabelText('Right full grouped question panel') as HTMLElement;
    mockScrollablePanel(rightPanel, { scrollTop: 640, clientHeight: 520, scrollHeight: 2600 });
    fireEvent.click(screen.getByRole('button', { name: /Part 2/ }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(0));
    expect(screen.getByRole('button', { name: '14' })).toHaveAttribute('aria-pressed', 'true');

    mockScrollablePanel(rightPanel, { scrollTop: 0, clientHeight: 520, scrollHeight: 2600 });
    mockElementRect(rightPanel, 100, 520);
    const question20 = getRuntimeQuestionAnchor(20);
    mockElementRect(question20, 720, 48);
    fireEvent.click(screen.getByRole('button', { name: '20' }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(548));
    expect(screen.getByRole('button', { name: '20' })).toHaveAttribute('aria-pressed', 'true');
    expect(question20).toHaveClass('reading-v2-runtime__question-anchor--focused');
    expect(document.activeElement).toBe(question20);
    expect(rightPanel.style.getPropertyValue('--reading-v2-runtime-focus-runway')).toBe('376px');

    mockScrollablePanel(rightPanel, { scrollTop: 548, clientHeight: 520, scrollHeight: 2600 });
    mockElementRect(rightPanel, 100, 520);
    const question22 = getRuntimeQuestionAnchor(22);
    mockElementRect(question22, 250, 48);
    fireEvent.click(screen.getByRole('button', { name: '22' }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(626));
    expect(screen.getByRole('button', { name: '22' })).toHaveAttribute('aria-pressed', 'true');
    expect(question20).not.toHaveClass('reading-v2-runtime__question-anchor--focused');
    expect(question22).toHaveClass('reading-v2-runtime__question-anchor--focused');
    expect(document.activeElement).toBe(question22);

    fireEvent.click(screen.getByRole('button', { name: /Part 3/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: '27' })).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(rightPanel.scrollTop).toBe(0));
    expect(rightPanel.style.getPropertyValue('--reading-v2-runtime-focus-runway')).toBe('');

    mockScrollablePanel(rightPanel, { scrollTop: 300, clientHeight: 520, scrollHeight: 2600 });
    mockElementRect(rightPanel, 100, 520);
    const question29 = getRuntimeQuestionAnchor(29);
    mockElementRect(question29, 420, 48);
    fireEvent.click(screen.getByRole('button', { name: '29' }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(548));
    expect(screen.getByRole('button', { name: '29' })).toHaveAttribute('aria-pressed', 'true');
    expect(question29).toHaveClass('reading-v2-runtime__question-anchor--focused');

    mockScrollablePanel(rightPanel, { scrollTop: 548, clientHeight: 520, scrollHeight: 2600 });
    mockElementRect(rightPanel, 100, 520);
    mockElementRect(question29, 150, 48);
    fireEvent.click(screen.getByRole('button', { name: '29' }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(526));
    expect(question29).toHaveClass('reading-v2-runtime__question-anchor--focused');
  }, 10000);

  it('reveals structured table questions inside nested horizontal scroll containers', async () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={mixedImportedProjection()} />);

    const rightPanel = screen.getByLabelText('Right full grouped question panel') as HTMLElement;
    const tableScroll = document.querySelector('.reading-v2-runtime__table-scroll') as HTMLElement;
    const question5Input = screen.getByRole('textbox', { name: 'Question 5 structured answer' });
    const question5Anchor = question5Input.closest('.reading-v2-runtime__cell-answer-line') as HTMLElement;

    mockScrollablePanel(rightPanel, { scrollTop: 0, clientHeight: 520, scrollHeight: 1800 });
    mockElementRect(rightPanel, 100, 520);
    mockScrollablePanel(tableScroll, {
      scrollTop: 0,
      clientHeight: 220,
      scrollHeight: 220,
      scrollLeft: 0,
      clientWidth: 300,
      scrollWidth: 900,
    });
    mockElementRect(tableScroll, 160, 220, { left: 100, width: 300 });
    mockElementRect(question5Anchor, 440, 48, { left: 650, width: 110 });

    fireEvent.click(screen.getByRole('button', { name: '5' }));

    await waitFor(() => expect(rightPanel.scrollTop).toBe(268));
    expect(tableScroll.scrollLeft).toBe(376);
    expect(question5Anchor).toHaveClass('reading-v2-runtime__question-anchor--focused');
    expect(document.activeElement).toBe(question5Anchor);
  });

  it('renders imported projection families and submits stable interaction IDs with visible numbers', async () => {
    setViewport(1366, 900);
    const projection = mixedImportedProjection();
    const onSubmit = vi.fn();
    const projectedInteractions = projection.content.taskGroups.flatMap((taskGroup) => taskGroup.interactions);
    const matchingGroup = projection.content.taskGroups.find((taskGroup) => taskGroup.officialTaskType === 'matching-headings');
    const matchingOption = projection.content.optionSets.find(
      (optionSet) => optionSet.taskGroupId === matchingGroup?.taskGroupId,
    )?.options[0];

    render(<ReadingV2RuntimeShell projection={projection} onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Question 1')).toHaveTextContent('Imported completion prompt');
    fireEvent.change(screen.getByRole('textbox', { name: 'Question 1 answer' }), {
      target: { value: 'word' },
    });

    fireEvent.click(within(screen.getByLabelText('Question 2')).getByRole('radio', { name: 'TRUE' }));
    fireEvent.click(within(screen.getByLabelText('Question 3')).getAllByRole('radio')[0]!);
    fireEvent.change(screen.getByRole('combobox', { name: 'Question 4 answer' }), {
      target: { value: matchingOption?.optionId },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Question 5 structured answer' }), {
      target: { value: 'table' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Answered 5 of 5');
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Q1');
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Q5');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectionId: projection.projectionId,
      answers: projectedInteractions.map((interaction) =>
        expect.objectContaining({
          interactionId: interaction.interactionId,
          visibleNumber: interaction.displayNumber,
        }),
      ),
    }));
    await waitFor(() => expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument());
  });

  it('renders the phone passage-first runtime with a bottom-sheet question surface and pre-submit review summary', async () => {
    setViewport(390, 844);
    const onSubmit = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-choice'].studentSafe}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('Phone passage-first runtime')).toBeInTheDocument();
    expect(screen.getByLabelText('Passage-first primary surface')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bottom-sheet question surface')).not.toBeInTheDocument();

    const moreOptions = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(moreOptions);
    expect(screen.getByRole('menu')).toHaveTextContent('0 of 2 answered');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review answers' }));
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Answered 0 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Test' }));

    const passageSurface = screen.getByLabelText('Passage-first primary surface');
    passageSurface.scrollTop = 248;
    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));

    expect(screen.getByLabelText('Bottom-sheet question surface')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone question navigator')).toHaveTextContent('1');
    expect(screen.getByLabelText('Phone question navigator')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Question 1' })).toHaveTextContent('1');
    expect(screen.queryByLabelText('Preserved passage scroll position')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Questions' }));
    expect(screen.queryByLabelText('Bottom-sheet question surface')).not.toBeInTheDocument();
    expect(passageSurface.scrollTop).toBe(248);

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));

    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Answered 1 of 2');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Submit' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectionId: expect.stringContaining('student-safe'),
      materialId: 'projection-fixture-material-multiple-choice',
      answers: [
        expect.objectContaining({
          interactionId: 'interaction-multiple-choice-1',
          visibleNumber: 1,
          value: 'A',
        }),
      ],
    }));
    await waitFor(() => expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument());
  });

  it('offers persisted text size and current instructions from the mobile overflow menu', async () => {
    setViewport(390, 844);
    const textSizeStorageKey = 'reading_text_size_mobile-v2-test';
    await storage.set(textSizeStorageKey, 19);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        textSizeStorageKey={textSizeStorageKey}
      />,
    );

    const runtime = screen.getByLabelText('Reading V2 Runtime Shell');
    await waitFor(() => {
      expect(runtime).toHaveStyle('--reading-v2-runtime-mobile-content-size: 19px');
    });

    const moreOptions = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(moreOptions);
    expect(screen.getByRole('menuitem', { name: 'Review answers' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Text size' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Instructions' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Text size' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Reading text size' }), {
      target: { value: '20' },
    });
    expect(runtime).toHaveStyle('--reading-v2-runtime-mobile-content-size: 20px');
    await waitFor(async () => expect(storage.get(textSizeStorageKey)).resolves.toBe(20));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(moreOptions).toHaveFocus();

    fireEvent.click(moreOptions);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Instructions' }));
    expect(screen.getByRole('dialog', { name: 'Instructions' })).toHaveTextContent('Questions 1-2');
    expect(screen.getByRole('dialog', { name: 'Instructions' })).toHaveTextContent('Complete the sentences below.');
    expect(screen.queryByLabelText('Preserved passage scroll position')).not.toBeInTheDocument();

    await storage.remove(textSizeStorageKey);
  });

  it('preserves and persists a text-size change made before hydration completes', async () => {
    setViewport(390, 844);
    const textSizeStorageKey = 'reading_text_size_mobile-v2-race';
    let resolveStoredSize!: (value: number | undefined) => void;
    const storedSize = new Promise<number | undefined>((resolve) => {
      resolveStoredSize = resolve;
    });
    const getSpy = vi.spyOn(storage, 'get').mockReturnValueOnce(storedSize);
    const setSpy = vi.spyOn(storage, 'set');

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        textSizeStorageKey={textSizeStorageKey}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text size' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Reading text size' }), {
      target: { value: '20' },
    });

    await act(async () => {
      resolveStoredSize(19);
      await storedSize;
    });

    expect(getSpy).toHaveBeenCalledWith(textSizeStorageKey);
    expect(screen.getByLabelText('Reading V2 Runtime Shell')).toHaveStyle(
      '--reading-v2-runtime-mobile-content-size: 20px',
    );
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith(textSizeStorageKey, 20));
  });

  it('restores overflow-trigger focus after returning from menu-opened review', async () => {
    setViewport(390, 844);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Review answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Test' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('tracks text-size adjustments with the shared size metadata field', () => {
    setViewport(390, 844);
    const onAction = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text size' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Reading text size' }), {
      target: { value: '20' },
    });

    expect(onAction).toHaveBeenCalledWith('adjustTextSize', { size: 20 });
  });

  it('closes the mobile overflow menu on Escape and restores trigger focus', () => {
    setViewport(390, 844);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    const trigger = screen.getByRole('button', { name: 'More options' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('reports mobile runtime tool actions to the owning host', () => {
    setViewport(390, 844);
    const onAction = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text size' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Reading text size' }), {
      target: { value: '18' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onAction).toHaveBeenCalledWith('openOverflowMenu', undefined);
    expect(onAction).toHaveBeenCalledWith('openTextSizeControl', undefined);
    expect(onAction).toHaveBeenCalledWith('adjustTextSize', { size: 18 });
    expect(onAction).toHaveBeenCalledWith('closeTextSizeControl', undefined);
  });

  it('keeps phone passage scroll positions scoped to the selected passage', async () => {
    setViewport(390, 844);

    render(<ReadingV2RuntimeShell projection={cam16Projection()} />);

    const passageSurface = screen.getByLabelText('Passage-first primary surface');
    passageSurface.scrollTop = 248;

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    const passageTwoTabs = screen.getAllByRole('button', { name: /Passage 2/ });
    fireEvent.click(passageTwoTabs[passageTwoTabs.length - 1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Close Questions' }));

    await waitFor(() => expect(passageSurface.scrollTop).toBe(0));

    passageSurface.scrollTop = 91;
    fireEvent.click(screen.getByRole('button', { name: /Passage 1/ }));

    await waitFor(() => expect(passageSurface.scrollTop).toBe(248));

    fireEvent.click(screen.getByRole('button', { name: /Passage 2/ }));

    await waitFor(() => expect(passageSurface.scrollTop).toBe(91));
  });

  it('scrolls and focuses the selected question inside the phone question sheet', () => {
    setViewport(390, 844);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-choice'].studentSafe}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    const sheet = screen.getByLabelText('Bottom-sheet question surface');
    const scrollTo = mockScrollablePanel(sheet, {
      scrollTop: 0,
      scrollHeight: 1200,
      clientHeight: 400,
    });
    mockElementRect(sheet, 48, 400);
    const questionTwo = getRuntimeQuestionAnchor(2);
    mockElementRect(questionTwo, 720, 60);

    fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));

    expect(questionTwo).toHaveFocus();
    expect(scrollTo).toHaveBeenCalled();
    expect(sheet.scrollTop).toBeGreaterThan(0);
  });

  it('restores phone question-sheet scroll after close and reopen', async () => {
    setViewport(390, 844);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    const firstSheet = screen.getByLabelText('Bottom-sheet question surface');
    firstSheet.scrollTop = 333;
    fireEvent.click(screen.getByRole('button', { name: 'Close Questions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Bottom-sheet question surface').scrollTop).toBe(333);
    });
  });

  it('closes the phone question dialog on Escape and restores focus to its trigger', () => {
    setViewport(390, 844);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    const trigger = screen.getByRole('button', { name: 'Open Questions' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Bottom-sheet question surface' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Bottom-sheet question surface' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('restores the question sheet after returning from mobile review', async () => {
    setViewport(390, 844);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    const sheet = screen.getByLabelText('Bottom-sheet question surface');
    sheet.scrollTop = 222;
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.queryByLabelText('Bottom-sheet question surface')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Pre-submit review summary' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Test' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Bottom-sheet question surface').scrollTop).toBe(222);
      expect(screen.getByRole('button', { name: 'Close Questions' })).toHaveFocus();
    });
  });

  it('moves focus into mobile review and restores the header submit trigger', async () => {
    setViewport(390, 844);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={vi.fn()}
      />,
    );

    const submit = screen.getByRole('button', { name: 'Submit' });
    submit.focus();
    fireEvent.click(submit);

    const back = screen.getByRole('button', { name: 'Back to Test' });
    await waitFor(() => expect(back).toHaveFocus());
    fireEvent.click(back);

    expect(submit).toHaveFocus();
  });

  it('keeps submit controls unavailable until a launch surface provides a submit handler', () => {
    setViewport(1366, 900);

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Submission is not available for this Reading V2 launch yet.',
    );
    expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument();
  });

  it('submits selected choice-family answers using scoring-compatible labels', async () => {
    setViewport(1024, 768);
    const onSubmit = vi.fn();
    const { unmount } = render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-select'].studentSafe}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      answers: [
        expect.objectContaining({
          interactionId: 'interaction-multiple-select-1',
          value: ['A', 'B'],
        }),
      ],
    }));

    await waitFor(() => expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument());
    unmount();
    onSubmit.mockClear();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['matching-headings'].studentSafe}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Question 1 answer' }), {
      target: { value: 'matching-headings-option-i' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Submit' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      answers: [
        expect.objectContaining({
          interactionId: 'interaction-matching-headings-1',
          value: 'i',
        }),
      ],
    }));

    await waitFor(() => expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument());
  });

  it('persists and rehydrates answers for remount-safe attempts', async () => {
    setViewport(1024, 768);
    const persistenceKey = 'reading-v2-runtime-shell-test-persistence';
    await storage.remove(persistenceKey);

    const { unmount } = render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        persistenceKey={persistenceKey}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Question 1 answer' }), {
      target: { value: 'persisted answer' },
    });

    await waitFor(async () => {
      await expect(storage.get(persistenceKey)).resolves.toMatchObject({
        'interaction-sentence-completion-1': 'persisted answer',
      });
    });

    unmount();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        persistenceKey={persistenceKey}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Question 1 answer' })).toHaveValue('persisted answer');
    });

    await storage.remove(persistenceKey);
  });

  it('locks answers and manual submission while a live session is paused', () => {
    setViewport(1024, 768);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={vi.fn()}
        lifecycle={{ status: 'paused' }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Question 1 answer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('paused by the teacher');
  });

  it('auto-submits when a live force-submit token arrives', async () => {
    setViewport(1024, 768);
    const onSubmit = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={onSubmit}
        lifecycle={{
          status: 'in-progress',
          forceSubmitToken: 7890,
        }}
      />,
    );

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectionId: READING_V2_PROJECTION_FIXTURES.studentSafe.projectionId,
        sourceSnapshotVersionId: READING_V2_PROJECTION_FIXTURES.studentSafe.sourceSnapshotVersionId,
        materialId: READING_V2_PROJECTION_FIXTURES.studentSafe.materialId,
      }));
    });
  });

  it('labels untimed launches without showing a frozen default countdown', () => {
    setViewport(1024, 768);

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={vi.fn()}
        timer={{
          durationMinutes: null,
          startedAt: null,
          running: true,
          autoSubmitOnExpiry: true,
        }}
      />,
    );

    const header = screen.getByLabelText('Student Reading runtime header');
    expect(header).toHaveTextContent('Untimed');
    expect(header).not.toHaveTextContent('60:00');
  });

  it('does not auto-submit when the configured timer is already expired on first load', async () => {
    setViewport(1024, 768);
    const onSubmit = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={onSubmit}
        timer={{
          durationMinutes: 1,
          startedAt: Date.now() - 61_000,
          running: true,
          autoSubmitOnExpiry: true,
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Student Reading runtime header')).toHaveTextContent('0:00');
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Question 1 answer' })).not.toBeDisabled();
  });

  it('auto-submits when a configured timer reaches zero during the active runtime', async () => {
    setViewport(1024, 768);
    vi.useFakeTimers();
    const now = new Date('2026-04-29T10:00:00.000Z');
    vi.setSystemTime(now);
    const onSubmit = vi.fn();

    render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES.studentSafe}
        onSubmit={onSubmit}
        timer={{
          durationMinutes: 1,
          startedAt: now.getTime() - 59_000,
          running: true,
          autoSubmitOnExpiry: true,
        }}
      />,
    );

    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectionId: READING_V2_PROJECTION_FIXTURES.studentSafe.projectionId,
    }));
  });

  it('locks duplicate submit confirmations while the boundary submit handler is pending', async () => {
    setViewport(1366, 900);
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirm Submit' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    await waitFor(() => expect(screen.queryByLabelText('Pre-submit review summary')).not.toBeInTheDocument());
  });

  it('keeps review visible and shows failure copy when async submit rejects', async () => {
    setViewport(1366, 900);
    const onSubmit = vi.fn().mockRejectedValue(new Error('network failure'));

    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your answers are still on this device. Try submitting again.',
    );
    expect(screen.getByLabelText('Pre-submit review summary')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sentence-completion', 'Question 1 answer'],
    ['summary-completion-text', 'Question 1 answer'],
    ['note-completion', 'Question 1 answer'],
  ] as const)('captures completion-family answers for %s fixtures without visible clear controls', (taskType, label) => {
    setViewport(1024, 768);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe} />);

    const input = screen.getByRole('textbox', { name: label });
    fireEvent.change(input, { target: { value: 'typed answer' } });
    expect(input).toHaveValue('typed answer');
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('captures short-answer without inline clear button', () => {
    setViewport(1024, 768);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['short-answer'].studentSafe} />);

    const input = screen.getByRole('textbox', { name: 'Question 1 answer' });
    fireEvent.change(input, { target: { value: 'typed answer' } });
    expect(input).toHaveValue('typed answer');
    expect(screen.queryByRole('button', { name: 'Clear answer for question 1' })).not.toBeInTheDocument();
  });

  it('captures choice-family single and multi-select answers from projection fixtures', () => {
    setViewport(1024, 768);
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-choice'].studentSafe} />,
    );

    fireEvent.click(screen.getAllByRole('radio')[1]!);
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    expect(document.querySelector('.reading-v2-runtime__option-copy')).toBeInTheDocument();

    rerender(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-select'].studentSafe}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Answered 0 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Test' }));

    fireEvent.click(screen.getAllByRole('checkbox')[1]!);

    expect(screen.getByText('Selected 2 of 2')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')[2]).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByLabelText('Pre-submit review summary')).toHaveTextContent('Answered 1 of 2');
  });

  it('renders preserved Markdown formatting in passage, prompt, and option text without exposing marks', () => {
    setViewport(1024, 768);
    const baseProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['multiple-choice'].studentSafe;
    const firstStimulusId = baseProjection.content.stimuli[0]?.stimulusId;
    const firstTaskGroupId = baseProjection.content.taskGroups[0]?.taskGroupId;
    const firstInteractionId = baseProjection.content.taskGroups[0]?.interactions[0]?.interactionId;
    const firstOptionSetId = baseProjection.content.optionSets[0]?.optionSetId;
    const projection = {
      ...baseProjection,
      content: {
        ...baseProjection.content,
        stimuli: baseProjection.content.stimuli.map((stimulus) =>
          stimulus.stimulusId === firstStimulusId && stimulus.content.kind === 'passage-content'
            ? {
                ...stimulus,
                content: {
                  ...stimulus.content,
                  paragraphs: stimulus.content.paragraphs.map((paragraph, index) =>
                    index === 0
                      ? { ...paragraph, text: 'A **bold** passage and *italic* source.' }
                      : paragraph,
                  ),
                },
              }
            : stimulus,
        ),
        taskGroups: baseProjection.content.taskGroups.map((taskGroup) =>
          taskGroup.taskGroupId === firstTaskGroupId
            ? {
                ...taskGroup,
                interactions: taskGroup.interactions.map((interaction) =>
                  interaction.interactionId === firstInteractionId
                    ? { ...interaction, promptText: 'Which option is **important**?' }
                    : interaction,
                ),
              }
            : taskGroup,
        ),
        optionSets: baseProjection.content.optionSets.map((optionSet) =>
          optionSet.optionSetId === firstOptionSetId
            ? {
                ...optionSet,
                options: optionSet.options.map((option, index) =>
                  index === 0 ? { ...option, text: '**Formatted** option' } : option,
                ),
              }
            : optionSet,
        ),
      },
    };

    render(<ReadingV2RuntimeShell projection={projection} />);

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('important').tagName).toBe('STRONG');
    expect(screen.getAllByText('Formatted').every((element) => element.tagName === 'STRONG')).toBe(true);
    expect(screen.queryByText(/\*\*Formatted\*\*/)).not.toBeInTheDocument();
  });

  it('renders summary-completion-list as one flowing summary with a visible word bank', () => {
    setViewport(1024, 768);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['summary-completion-list'].studentSafe} />);

    const summary = screen.getByLabelText('Summary completion choose from list');
    expect(summary).toHaveTextContent('Fixture summary list blank');
    expect(within(summary).getByLabelText('Summary completion option list')).toHaveTextContent('H Option H');
    expect(screen.queryByLabelText('Question 1')).not.toBeInTheDocument();

    const firstSelect = within(summary).getByLabelText('Question 1 answer');
    fireEvent.change(firstSelect, { target: { value: 'summary-completion-list-option-a' } });
    expect(firstSelect).toHaveValue('summary-completion-list-option-a');
  });

  it('renders summary-completion-text as one grouped paragraph with inline answer inputs', () => {
    setViewport(1024, 768);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['summary-completion-text'].studentSafe} />);

    const summary = screen.getByLabelText('Summary completion answer text');
    expect(summary).toHaveTextContent('Fixture summary: the first process depends on');
    expect(summary).not.toHaveTextContent('Word limit:');
    expect(within(summary).getByRole('textbox', { name: 'Question 1 answer' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Question 1')).not.toBeInTheDocument();
  });

  it('keeps the runtime task header lean while rendering source-backed IELTS word-limit instructions', () => {
    setViewport(1366, 900);
    const baseProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['table-completion'].studentSafe;
    const projection = {
      ...baseProjection,
      content: {
        ...baseProjection.content,
        taskGroups: baseProjection.content.taskGroups.map((taskGroup, index) =>
          index === 0
            ? {
                ...taskGroup,
                wordLimit: 1,
                instructionBlocks: taskGroup.instructionBlocks.map((block) => ({
                  ...block,
                  text: 'Complete the table below.',
                })),
              }
            : taskGroup,
        ),
      },
    };

    render(<ReadingV2RuntimeShell projection={projection} />);

    const panel = screen.getByLabelText('Grouped question panel');
    expect(document.querySelector('.reading-v2-runtime__right-summary')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/table completion/i)).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('Task group progress')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Grouped instructions')).toHaveTextContent('Complete the table below.');
    expect(screen.getByLabelText('Grouped instructions')).toHaveTextContent('Choose ONE WORD ONLY from the passage for each answer.');
    expect(screen.getByLabelText('Grouped instructions')).toHaveTextContent('Write your answers in boxes 1-2 on your answer sheet.');
  });

  it('renders note-completion as structured notes with inline answer inputs', () => {
    setViewport(1024, 768);
    const baseProjection = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['note-completion'].studentSafe;
    const projection: ReadingV2DerivedProjection = {
      ...baseProjection,
      content: {
        ...baseProjection.content,
        taskGroups: baseProjection.content.taskGroups.map((taskGroup) => ({
          ...taskGroup,
          layoutHint: JSON.stringify({
            kind: 'note-completion-layout',
            sections: [{ heading: 'Early silk production in China', questionNumbers: [1, 2] }],
          }),
        })),
      },
    };

    render(<ReadingV2RuntimeShell projection={projection} />);

    const notes = screen.getByLabelText('Note completion answer notes');
    expect(notes.querySelectorAll('li')).toHaveLength(2);
    expect(notes).toHaveTextContent('Early silk production in China');
    expect(notes).toHaveTextContent('Complete the fixture sentence with the first missing word');
    expect(within(notes).getByRole('textbox', { name: 'Question 1 answer' })).toBeInTheDocument();
  });

  it('renders binary judgement locked vocabulary without normalizing TFNG and YNNG', () => {
    setViewport(1024, 768);
    const { rerender } = render(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['true-false-not-given'].studentSafe}
      />,
    );

    expect(screen.getAllByRole('radio', { name: 'TRUE' })).toHaveLength(2);
    expect(screen.getAllByRole('radio', { name: 'FALSE' })).toHaveLength(2);
    const tfngInstructions = screen.getByLabelText('Grouped instructions');
    expect(tfngInstructions.textContent?.match(/TRUE/g)).toHaveLength(1);
    expect(tfngInstructions.querySelectorAll('.reading-v2-runtime__instruction-rule')).toHaveLength(3);
    expect(tfngInstructions.querySelector('dt')).toHaveTextContent('TRUE');
    const firstTfngQuestion = screen.getByLabelText('Question 1');
    expect(within(firstTfngQuestion).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    fireEvent.click(within(firstTfngQuestion).getByRole('radio', { name: 'TRUE' }));
    expect(within(firstTfngQuestion).queryByRole('button', { name: 'Clear answer for question 1' })).not.toBeInTheDocument();
    expect(within(firstTfngQuestion).getByRole('radio', { name: 'TRUE' })).toBeChecked();

    rerender(
      <ReadingV2RuntimeShell
        projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE['yes-no-not-given'].studentSafe}
      />,
    );

    expect(screen.getAllByRole('radio', { name: 'YES' })).toHaveLength(2);
    expect(screen.getAllByRole('radio', { name: 'NO' })).toHaveLength(2);
  });

  it.each([
    ['matching-headings', 'Matching headings reference list'],
    ['matching-information', 'Paragraph reference list'],
    ['matching-features', 'Matching features reference list'],
    ['matching-sentence-endings', 'Matching endings reference list'],
  ] as const)('renders matching-family reference banks and answer controls for %s', (taskType, referenceLabel) => {
    setViewport(390, 844);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));

    expect(screen.getByLabelText(referenceLabel)).toBeInTheDocument();
    const firstQuestion = document.getElementById('reading-v2-question-1');
    expect(firstQuestion).toBeInTheDocument();
    expect(within(firstQuestion!).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    const firstChoiceName = taskType === 'matching-headings'
      ? 'i. Heading option i'
      : taskType === 'matching-information'
        ? 'A. Paragraph A note'
        : taskType === 'matching-features'
          ? 'A. Feature A'
          : 'A. Ending A';
    if (taskType === 'matching-features') {
      expect(screen.getByLabelText('Question 1 tap to assign choices')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'A' })[0]!);
      expect(screen.getAllByRole('button', { name: 'A' })[0]).toHaveAttribute('aria-pressed', 'true');
    } else {
      const select = screen.getByRole('combobox', { name: 'Question 1 answer' });
      expect(within(select).getByRole('option', { name: firstChoiceName })).toBeInTheDocument();
      fireEvent.change(select, {
        target: {
          value: taskType === 'matching-headings'
            ? 'matching-headings-option-i'
            : taskType === 'matching-information'
              ? 'matching-information-option-a'
              : 'matching-sentence-endings-option-a',
        },
      });
      expect(select).toHaveValue(
        taskType === 'matching-headings'
          ? 'matching-headings-option-i'
          : taskType === 'matching-information'
            ? 'matching-information-option-a'
            : 'matching-sentence-endings-option-a',
      );
    }
  });

  it.each([
    ['table-completion', 'Structured table overview', 'Table completion answer table'],
    ['flowchart-completion', 'Structured flowchart overview', 'Flowchart completion answer flowchart'],
    ['diagram-labeling', 'Zoomable diagram overview', 'Diagram labeling answer diagram'],
  ] as const)('renders structured-layout overview and spec-shaped answer surface for %s', (taskType, overviewLabel, answerLabel) => {
    setViewport(390, 844);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[taskType].studentSafe} />);

    expect(screen.getByLabelText('Phone passage-first runtime')).toBeInTheDocument();
    const overview = screen.getByLabelText(overviewLabel);
    expect(overview).toBeInTheDocument();
    expect(overview.querySelector('[data-active="true"]')).toBeInTheDocument();
    expect(overview.querySelector('.reading-v2-runtime__blank-marker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    expect(screen.getByLabelText(answerLabel)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question 1 structured answer' })).toBeInTheDocument();
  });

  it('preserves answer state while switching phone answer layers', () => {
    setViewport(390, 844);
    render(<ReadingV2RuntimeShell projection={READING_V2_PROJECTION_FIXTURES.studentSafe} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Question 1 answer' }), {
      target: { value: 'stable answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close Questions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Questions' }));

    expect(screen.getByRole('textbox', { name: 'Question 1 answer' })).toHaveValue('stable answer');
  });

  it.each([
    ['loading', 'Loading Reading material'],
    ['empty', 'No Reading content'],
    ['missing-projection', 'Reading material unavailable'],
    ['permission-denied', 'Permission required'],
    ['network-failure', 'Connection problem'],
    ['submit-pending', 'Submitting answers'],
    ['submit-failure', 'Submit failed'],
    ['duplicate-submit', 'Already submitted'],
    ['submit-success', 'Submitted'],
  ] as const)('defines %s inside the V2 runtime instead of a new error product', (state, title) => {
    render(<ReadingV2RuntimeShell state={state} />);

    expect(screen.getByLabelText('Reading V2 runtime state')).toHaveTextContent(title);
  });

  it('rejects unsupported schema versions and canonical drafts before renderer selection', () => {
    const invalidProjection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      schemaVersion: 999,
    } as unknown as ReadingV2DerivedProjection;
    const canonicalDraft = createReadingV2CanonicalFixture('sentence-completion') as unknown as ReadingV2DerivedProjection;

    expect(() => render(<ReadingV2RuntimeShell projection={invalidProjection} />)).toThrow(
      /Unsupported Reading V2 schema version/,
    );
    expect(() => render(<ReadingV2RuntimeShell projection={canonicalDraft} />)).toThrow(
      /require derived projection payloads/,
    );
  });
});
