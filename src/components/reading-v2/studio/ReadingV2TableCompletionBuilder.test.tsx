import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { deriveReadingV2VisibleNumbers } from '../../../services/reading-v2/readingV2Numbering.service';
import type { ReadingV2Document, ReadingV2Interaction } from '../../../types/readingV2.types';
import { ReadingV2TableCompletionBuilder } from './ReadingV2TableCompletionBuilder';

const getTableGroupFixture = () => {
  const document = createReadingV2CanonicalFixture('table-completion');
  const taskGroup = Object.values(document.taskGroups)[0]!;
  const interactions = taskGroup.interactionIds.map((interactionId) => document.interactions[interactionId]!);

  return {
    document,
    taskGroup,
    interactions,
    visibleNumbers: deriveReadingV2VisibleNumbers([taskGroup], document.interactions),
  };
};

const renderBuilder = (
  overrides: Partial<{
    document: ReadingV2Document;
    interactions: readonly ReadingV2Interaction[];
    selectedLinkAnchorId: string | null;
  }> = {},
) => {
  const fixture = getTableGroupFixture();
  const document = overrides.document ?? fixture.document;
  const taskGroup = Object.values(document.taskGroups)[0]!;
  const interactions = overrides.interactions
    ?? taskGroup.interactionIds.map((interactionId) => document.interactions[interactionId]!);
  const onDocumentChange = vi.fn();
  const onTableCompletionAction = vi.fn();
  const onQuestionLinkNavigation = vi.fn();
  const onQuestionLinkRepair = vi.fn();

  render(
    <ReadingV2TableCompletionBuilder
      document={document}
      taskGroup={taskGroup}
      interactions={interactions}
      visibleNumbers={deriveReadingV2VisibleNumbers([taskGroup], document.interactions)}
      selectedLinkAnchorId={overrides.selectedLinkAnchorId}
      onDocumentChange={onDocumentChange}
      onTableCompletionAction={onTableCompletionAction}
      onQuestionLinkNavigation={onQuestionLinkNavigation}
      onQuestionLinkRepair={onQuestionLinkRepair}
    />,
  );

  return {
    document,
    taskGroup,
    onDocumentChange,
    onTableCompletionAction,
    onQuestionLinkNavigation,
    onQuestionLinkRepair,
  };
};

const selectTableCell = (row: number, column: number) => {
  fireEvent.click(screen.getByLabelText(`Table cell ${row}.${column} text`));
};

const enableCellSelectionMode = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Select Cells' }));
};

describe('ReadingV2TableCompletionBuilder', () => {
  it('highlights and navigates linked table blanks from the table grid and answer card', () => {
    const fixture = getTableGroupFixture();
    const firstAnchorId = fixture.interactions[0]!.primaryAnchorId!;
    const { onQuestionLinkNavigation } = renderBuilder({ selectedLinkAnchorId: firstAnchorId });

    const blankIndicator = screen.getByRole('button', { name: 'Reveal Question 1 table blank' });
    expect(blankIndicator).toHaveAttribute('data-linked-selected', 'true');
    expect(screen.getByLabelText('Correct answers for Question 1').closest('.reading-v2-table-builder__answer-card')).toHaveAttribute(
      'data-linked-selected',
      'true',
    );

    fireEvent.click(blankIndicator);

    expect(onQuestionLinkNavigation).toHaveBeenCalledWith(expect.objectContaining({
      anchorId: firstAnchorId,
      interactionId: fixture.interactions[0]!.interactionId,
      taskGroupId: fixture.taskGroup.taskGroupId,
      source: 'block',
    }));
  });

  it('repairs table blanks that still have anchors but lost their linked interaction', () => {
    const fixture = getTableGroupFixture();
    const orphanedInteractionId = fixture.interactions[0]!.interactionId;
    const orphanedAnchorId = fixture.interactions[0]!.primaryAnchorId!;
    const remainingInteractions = { ...fixture.document.interactions };
    delete remainingInteractions[orphanedInteractionId];
    const orphanedDocument: ReadingV2Document = {
      ...fixture.document,
      interactions: remainingInteractions,
      taskGroups: {
        ...fixture.document.taskGroups,
        [fixture.taskGroup.taskGroupId]: {
          ...fixture.taskGroup,
          interactionIds: fixture.taskGroup.interactionIds.filter((interactionId) => interactionId !== orphanedInteractionId),
        },
      },
    };
    const { onDocumentChange, onQuestionLinkNavigation, onQuestionLinkRepair } = renderBuilder({
      document: orphanedDocument,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create linked question' }));

    const repairedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const repairedTaskGroup = repairedDocument.taskGroups[fixture.taskGroup.taskGroupId]!;
    const repairedInteraction = repairedTaskGroup.interactionIds
      .map((interactionId) => repairedDocument.interactions[interactionId])
      .find((interaction) => interaction?.primaryAnchorId === orphanedAnchorId);

    expect(repairedInteraction).toEqual(expect.objectContaining({
      primaryAnchorId: orphanedAnchorId,
      responseShape: { kind: 'structured-entry', structure: 'table' },
    }));
    expect(onQuestionLinkRepair).toHaveBeenCalledWith(
      'table-blank-linked-question-created',
      expect.objectContaining({ anchorId: orphanedAnchorId }),
    );
    expect(onQuestionLinkNavigation).toHaveBeenCalledWith(expect.objectContaining({
      anchorId: orphanedAnchorId,
      source: 'repair',
    }));
  });

  it('edits table title, cells, word limit, and correct answers in canonical draft state', () => {
    const { onDocumentChange, onTableCompletionAction } = renderBuilder();

    expect(screen.getByLabelText('Table cell 2.1 text')).toHaveValue('_____');
    expect(screen.getByLabelText('Inline blanks for table cell 2.1')).toHaveTextContent('1');

    fireEvent.change(screen.getByLabelText('Table title'), {
      target: { value: 'Medicinal plants table' },
    });
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.objectContaining({
        'stimulus-table-completion': expect.objectContaining({ title: 'Medicinal plants table' }),
      }),
    }));
    expect(onTableCompletionAction).toHaveBeenCalledWith('table-title-updated', expect.anything());

    fireEvent.change(screen.getByLabelText('Table cell 2.1 text'), {
      target: { value: 'Gingko' },
    });
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.objectContaining({
        'stimulus-table-completion': expect.objectContaining({
          content: expect.objectContaining({
            rows: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Gingko' }),
              ]),
            ]),
          }),
        }),
      }),
    }));

    fireEvent.change(screen.getByLabelText('Table completion word limit'), {
      target: { value: '3' },
    });
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      taskGroups: expect.objectContaining({
        'task-group-table-completion': expect.objectContaining({
          answerRule: expect.objectContaining({ wordLimit: 3 }),
        }),
      }),
    }));

    fireEvent.change(screen.getByLabelText('Correct answers for Question 2'), {
      target: { value: 'China | Chinese region' },
    });
    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      interactions: expect.objectContaining({
        'interaction-table-completion-2': expect.objectContaining({
          placeholder: false,
          scoringRule: expect.objectContaining({
            acceptableAnswers: ['China', 'Chinese region'],
          }),
        }),
      }),
    }));

    expect(screen.queryByLabelText('Student Preview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show student preview' }));
    expect(screen.getByLabelText('Student Preview')).toBeInTheDocument();
  });

  it('turns a table cell into a blank with an anchor and a structured interaction', () => {
    const { onDocumentChange, taskGroup } = renderBuilder();

    selectTableCell(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Insert blank' }));

    const nextDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const nextTaskGroup = nextDocument.taskGroups[taskGroup.taskGroupId]!;
    const blankAnchorIds = nextTaskGroup.stimulusRefs[0]?.anchorIds ?? [];
    const linkedInteractions = nextTaskGroup.interactionIds.map((interactionId) => nextDocument.interactions[interactionId]!);

    expect(blankAnchorIds.length).toBe(3);
    expect(Object.values(nextDocument.anchors).filter((anchor) => anchor.kind === 'table-cell')).toHaveLength(3);
    expect(linkedInteractions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        responseShape: { kind: 'structured-entry', structure: 'table' },
        primaryAnchorId: expect.stringContaining('table-r1-c1'),
      }),
    ]));
  });

  it('uses the table toolbar to mark selected blanks and keep the header row explicit', () => {
    const { onDocumentChange, onTableCompletionAction, taskGroup } = renderBuilder();

    selectTableCell(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Insert blank' }));

    const blankDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const blankTaskGroup = blankDocument.taskGroups[taskGroup.taskGroupId]!;
    const blankTable = blankDocument.stimuli[blankTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (blankTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(blankTable.content.rows[0]?.[0]).toEqual(expect.objectContaining({
      isBlank: true,
      anchorId: expect.stringContaining('table-r1-c1'),
      text: 'Feature _____',
    }));
    expect(onTableCompletionAction).toHaveBeenCalledWith(
      'table-inline-blanks-inserted',
      expect.objectContaining({ selectedCellCount: 1 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Header Row' }));

    const headerDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const headerTaskGroup = headerDocument.taskGroups[taskGroup.taskGroupId]!;
    const headerTable = headerDocument.stimuli[headerTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (headerTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(headerTable.content.rows[0]?.map((cell) => cell.role)).toEqual(['header', 'header']);
    expect(onTableCompletionAction).toHaveBeenCalledWith(
      'table-header-row-marked',
      expect.objectContaining({ taskGroupId: taskGroup.taskGroupId }),
    );
  });

  it('inserts a table blank at the active cell caret instead of only appending', () => {
    const { onDocumentChange, taskGroup } = renderBuilder();
    const cellInput = screen.getByLabelText('Table cell 1.1 text') as HTMLInputElement;

    act(() => {
      fireEvent.focus(cellInput);
      cellInput.setSelectionRange(3, 3);
      fireEvent.select(cellInput);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Insert blank' }));

    const nextDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const nextTaskGroup = nextDocument.taskGroups[taskGroup.taskGroupId]!;
    const tableStimulus = nextDocument.stimuli[nextTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (tableStimulus.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(tableStimulus.content.rows[0]?.[0]).toEqual(expect.objectContaining({
      isBlank: true,
      text: 'Fea _____ ture',
    }));
  });

  it('applies pasted spreadsheet text as editable table rows and blank questions', () => {
    const { onDocumentChange, taskGroup, onTableCompletionAction } = renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    fireEvent.change(screen.getByLabelText('Paste table from spreadsheet'), {
      target: { value: 'Feature\tDetail\nPlant\t___\nUse\t[blank]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Pasted Table' }));

    const nextDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const nextTaskGroup = nextDocument.taskGroups[taskGroup.taskGroupId]!;
    const tableStimulus = nextDocument.stimuli[nextTaskGroup.stimulusRefs[0]!.stimulusId]!;

    expect(tableStimulus.content).toEqual(expect.objectContaining({
      kind: 'table-content',
      rows: [
        [
          expect.objectContaining({ text: 'Feature', role: 'header' }),
          expect.objectContaining({ text: 'Detail', role: 'header' }),
        ],
        [
          expect.objectContaining({ text: 'Plant', role: 'body' }),
          expect.objectContaining({ text: '_____', isBlank: true }),
        ],
        [
          expect.objectContaining({ text: 'Use', role: 'body' }),
          expect.objectContaining({ text: '_____', isBlank: true }),
        ],
      ],
    }));
    expect(nextTaskGroup.interactionIds).toHaveLength(2);
    expect(nextTaskGroup.interactionIds.map((interactionId) => nextDocument.interactions[interactionId]?.primaryAnchorId)).toEqual(
      nextTaskGroup.stimulusRefs[0]?.anchorIds,
    );
    expect(onTableCompletionAction).toHaveBeenCalledWith('table-paste-applied', expect.objectContaining({ blankCount: 2 }));
  });

  it('persists rectangular merge and split with durable blank question links', () => {
    const { onDocumentChange, taskGroup } = renderBuilder();

    enableCellSelectionMode();
    selectTableCell(2, 1);
    selectTableCell(2, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const mergedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const mergedTaskGroup = mergedDocument.taskGroups[taskGroup.taskGroupId]!;
    const mergedTable = mergedDocument.stimuli[mergedTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (mergedTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    const mergedCell = mergedTable.content.rows[1]?.[0];
    expect(mergedCell).toEqual(expect.objectContaining({
      colSpan: 2,
      rowSpan: 1,
      isBlank: true,
      anchorIds: ['anchor-table-completion-1', 'anchor-table-completion-2'],
    }));
    expect(mergedTaskGroup.interactionIds.map((interactionId) => mergedDocument.interactions[interactionId]?.primaryAnchorId)).toContain(
      'anchor-table-completion-2',
    );

    cleanup();
    const splitRender = renderBuilder({ document: mergedDocument });
    selectTableCell(2, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    const splitDocument = splitRender.onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const splitTaskGroup = splitDocument.taskGroups[taskGroup.taskGroupId]!;
    const splitTable = splitDocument.stimuli[splitTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (splitTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(splitTable.content.rows[1]).toHaveLength(2);
    expect(splitTaskGroup.interactionIds.map((interactionId) => splitDocument.interactions[interactionId]?.primaryAnchorId)).toContain(
      'anchor-table-completion-1',
    );
    expect(splitTaskGroup.interactionIds.map((interactionId) => splitDocument.interactions[interactionId]?.primaryAnchorId)).toContain(
      'anchor-table-completion-2',
    );
  });

  it('restores source cell text after a merged table cell is split across a re-render', () => {
    const { onDocumentChange, taskGroup } = renderBuilder();

    enableCellSelectionMode();
    selectTableCell(1, 1);
    selectTableCell(1, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const mergedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const mergedTaskGroup = mergedDocument.taskGroups[taskGroup.taskGroupId]!;
    const mergedTable = mergedDocument.stimuli[mergedTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (mergedTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(mergedTable.content.rows[0]?.[0]).toEqual(expect.objectContaining({
      text: 'Feature Detail',
      splitSourceCells: [
        expect.objectContaining({ text: 'Feature', role: 'header' }),
        expect.objectContaining({ text: 'Detail', role: 'header' }),
      ],
    }));

    cleanup();
    const splitRender = renderBuilder({ document: mergedDocument });
    selectTableCell(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));

    const splitDocument = splitRender.onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    const splitTaskGroup = splitDocument.taskGroups[taskGroup.taskGroupId]!;
    const splitTable = splitDocument.stimuli[splitTaskGroup.stimulusRefs[0]!.stimulusId]!;

    if (splitTable.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    expect(splitTable.content.rows[0]?.map((cell) => cell.text)).toEqual(['Feature', 'Detail']);
    expect(splitTable.content.rows[0]?.map((cell) => cell.role)).toEqual(['header', 'header']);
    expect(JSON.stringify(splitTable.content.rows[0])).not.toContain('splitSourceCells');
  });

  it('blocks removing rows or columns crossed by merged cells', () => {
    const { onDocumentChange } = renderBuilder();

    enableCellSelectionMode();
    selectTableCell(2, 1);
    selectTableCell(2, 2);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const columnMergedDocument = onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    cleanup();
    renderBuilder({ document: columnMergedDocument });

    expect(screen.getByRole('button', { name: 'Delete column' })).toBeDisabled();
    expect(screen.getByText('Split merged cells that extend into the last column before removing it.')).toBeInTheDocument();

    cleanup();
    const rowRender = renderBuilder();
    enableCellSelectionMode();
    selectTableCell(1, 1);
    selectTableCell(2, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const rowMergedDocument = rowRender.onDocumentChange.mock.calls.at(-1)?.[0] as ReadingV2Document;
    cleanup();
    renderBuilder({ document: rowMergedDocument });

    expect(screen.getByRole('button', { name: 'Delete row' })).toBeDisabled();
    expect(screen.getByText('Split merged cells that extend into the last row before removing it.')).toBeInTheDocument();
  });
});
