import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2TaskGroupEditor } from './ReadingV2TaskGroupEditor';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { deriveReadingV2VisibleNumbers } from '../../../services/reading-v2/readingV2Numbering.service';

describe('ReadingV2TaskGroupEditor', () => {
  it('edits grouped instructions as task-group data, not flat question-card authority', () => {
    const document = createReadingV2CanonicalFixture('matching-headings');
    const taskGroups = Object.values(document.taskGroups);
    const onTaskGroupChange = vi.fn();

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroups[0]?.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Grouped instruction block 1'), { target: { value: 'Match each heading once.' } });

    expect(screen.getByText(/Canonical task type: matching-headings/)).toBeInTheDocument();
    expect(screen.queryByText(/question card/i)).not.toBeInTheDocument();
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      instructionBlocks: [expect.objectContaining({ text: 'Match each heading once.' })],
    }));
  });

  it('preserves multi-block grouped-instruction structure while editing one block', () => {
    const document = createReadingV2CanonicalFixture('matching-headings');
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const taskGroups = [
      {
        ...taskGroup,
        instructionBlocks: [
          ...taskGroup.instructionBlocks,
          { id: 'second-instruction', text: 'Use each heading once.' },
        ],
      },
    ];
    const onTaskGroupChange = vi.fn();

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroups[0]?.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Grouped instruction block 1'), {
      target: { value: 'Updated first instruction.' },
    });

    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      instructionBlocks: [
        expect.objectContaining({ text: 'Updated first instruction.' }),
        expect.objectContaining({ id: 'second-instruction', text: 'Use each heading once.' }),
      ],
    }));
  });

  it('renders anchor repair coverage for every phase-4 anchor family', () => {
    const document = createReadingV2CanonicalFixture('table-completion');
    const taskGroups = Object.values(document.taskGroups);

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroups[0]?.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={vi.fn()}
        onInteractionChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/paragraph, inline blank, table-cell, flow-step, diagram hotspot, and annotation anchors/)).toBeInTheDocument();
  });

  it('uses the teacher-facing table builder for table-completion groups instead of generic question cards', () => {
    const document = createReadingV2CanonicalFixture('table-completion');
    const taskGroups = Object.values(document.taskGroups);

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroups[0]?.taskGroupId}
        teacherFacing
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={vi.fn()}
        onInteractionChange={vi.fn()}
        onDocumentChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Table Completion Builder')).toBeInTheDocument();
    expect(screen.getByLabelText('Blank and answer panel')).toBeInTheDocument();
    expect(screen.queryByText('Question text')).not.toBeInTheDocument();
    expect(screen.queryByText('Options')).not.toBeInTheDocument();
  });

  it('adds, removes, and reorders interactions while preserving existing stable IDs', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const taskGroups = Object.values(document.taskGroups);
    const taskGroup = taskGroups[0]!;
    const onTaskGroupChange = vi.fn();
    const onInteractionChange = vi.fn();
    const onInteractionRemove = vi.fn();

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={onInteractionChange}
        onInteractionRemove={onInteractionRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Interaction' }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      taskGroupId: taskGroup.taskGroupId,
      placeholder: true,
    }));
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      interactionIds: [...taskGroup.interactionIds, expect.stringContaining('manual-interaction-3')],
    }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Move Down' })[0]!);
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      interactionIds: [taskGroup.interactionIds[1], taskGroup.interactionIds[0]],
    }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    expect(onInteractionRemove).not.toHaveBeenCalled();
    expect(screen.getByLabelText(`Remove ${taskGroup.interactionIds[0]} confirmation`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Remove' }));
    expect(onInteractionRemove).toHaveBeenCalledWith(taskGroup.interactionIds[0], taskGroup);
  });

  it('creates and edits option sets for selected task groups', () => {
    const document = createReadingV2CanonicalFixture('multiple-choice');
    const taskGroups = Object.values(document.taskGroups);
    const taskGroup = {
      ...taskGroups[0]!,
      optionSetRefs: [],
    };
    const onTaskGroupChange = vi.fn();
    const onOptionSetChange = vi.fn();
    const { rerender } = render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={[taskGroup]}
        interactions={document.interactions}
        optionSets={{}}
        visibleNumbers={deriveReadingV2VisibleNumbers([taskGroup], document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
        onOptionSetChange={onOptionSetChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Option Set' }));
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      taskGroupId: taskGroup.taskGroupId,
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'A', text: 'Option A' }),
      ]),
    }));
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      optionSetRefs: [expect.stringContaining('option-set-1')],
    }));

    const optionSet = onOptionSetChange.mock.calls[0]?.[0];
    rerender(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={[{ ...taskGroup, optionSetRefs: [optionSet.optionSetId] }]}
        interactions={document.interactions}
        optionSets={{ [optionSet.optionSetId]: optionSet }}
        visibleNumbers={deriveReadingV2VisibleNumbers([taskGroup], document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
        onOptionSetChange={onOptionSetChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Option A label'), {
      target: { value: 'Alpha' },
    });
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'Alpha', text: 'Option A' }),
      ]),
    }));

    fireEvent.change(screen.getByLabelText('Option A value'), {
      target: { value: 'choice-alpha' },
    });
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ optionId: 'choice-alpha', label: 'A' }),
      ]),
    }));

    fireEvent.change(screen.getByLabelText('Option A text'), {
      target: { value: 'Edited option A' },
    });
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'A', text: 'Edited option A' }),
      ]),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Move Option A Down' }));
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: [
        expect.objectContaining({ label: 'B' }),
        expect.objectContaining({ label: 'A' }),
      ],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Option' }));
    expect(onOptionSetChange).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'C', text: 'Option C' }),
      ]),
    }));
  });

  it('changes interaction response shapes and option reuse settings inside canonical interactions', () => {
    const document = createReadingV2CanonicalFixture('matching-headings');
    const taskGroups = Object.values(document.taskGroups);
    const taskGroup = taskGroups[0]!;
    const onInteractionChange = vi.fn();

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        optionSets={document.optionSets}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={vi.fn()}
        onInteractionChange={onInteractionChange}
        onOptionSetChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByLabelText(/response shape/)[0]!, {
      target: { value: 'multi-select' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      responseShape: expect.objectContaining({ kind: 'multi-select', selectionLimit: 2 }),
    }));

    const firstInteraction = Object.values(document.interactions)[0]!;
    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={{
          ...document.interactions,
          [firstInteraction.interactionId]: {
            ...firstInteraction,
            responseShape: {
              kind: 'matching',
              optionSetId: taskGroup.optionSetRefs[0]!,
              optionReuse: 'allowed',
            },
          },
        }}
        optionSets={document.optionSets}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={vi.fn()}
        onInteractionChange={onInteractionChange}
        onOptionSetChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByLabelText(/option reuse/)[0]!, {
      target: { value: 'disallowed' },
    });
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      responseShape: expect.objectContaining({ kind: 'matching', optionReuse: 'disallowed' }),
    }));
  });

  it('limits task-type conversion to compatible engineering families', () => {
    const document = createReadingV2CanonicalFixture('matching-headings');
    const taskGroups = Object.values(document.taskGroups);
    const taskGroup = taskGroups[0]!;
    const onTaskGroupChange = vi.fn();

    render(
      <ReadingV2TaskGroupEditor
        document={document}
        taskGroups={taskGroups}
        interactions={document.interactions}
        optionSets={document.optionSets}
        visibleNumbers={deriveReadingV2VisibleNumbers(taskGroups, document.interactions)}
        selectedTaskGroupId={taskGroup.taskGroupId}
        onSelectTaskGroup={vi.fn()}
        onAddTaskGroup={vi.fn()}
        onMoveSelectedTaskGroup={vi.fn()}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
        onOptionSetChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText('Compatible canonical task type');
    expect(select).toHaveTextContent('Matching Information');
    expect(select).not.toHaveTextContent('Multiple Choice');

    fireEvent.change(select, { target: { value: 'matching-information' } });

    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      officialTaskType: 'matching-information',
      engineeringFamily: 'matching',
      interactionIds: taskGroup.interactionIds,
    }));
  });
});
