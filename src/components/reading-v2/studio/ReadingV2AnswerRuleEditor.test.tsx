import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2AnswerRuleEditor } from './ReadingV2AnswerRuleEditor';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';

describe('ReadingV2AnswerRuleEditor', () => {
  it('writes acceptable answers and scores into canonical interactions', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const interactions = taskGroup.interactionIds.map((id) => document.interactions[id]).filter(Boolean);
    const onInteractionChange = vi.fn();

    render(
      <ReadingV2AnswerRuleEditor
        taskGroup={taskGroup}
        interactions={interactions}
        onTaskGroupChange={vi.fn()}
        onInteractionChange={onInteractionChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(`Acceptable answers for ${interactions[0]!.interactionId}`), {
      target: { value: 'alpha | beta' },
    });
    fireEvent.change(screen.getByLabelText(`Score value for ${interactions[0]!.interactionId}`), {
      target: { value: '2' },
    });

    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ acceptableAnswers: ['alpha', 'beta'] }),
    }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      scoringRule: expect.objectContaining({ maxScore: 2 }),
    }));
  });

  it('edits normalization rules on the canonical task-group answer rule', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const interactions = taskGroup.interactionIds.map((id) => document.interactions[id]).filter(Boolean);
    const onTaskGroupChange = vi.fn();

    render(
      <ReadingV2AnswerRuleEditor
        taskGroup={taskGroup}
        interactions={interactions}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Answer casing normalization'), { target: { value: 'sensitive' } });
    fireEvent.change(screen.getByLabelText('Answer punctuation normalization'), { target: { value: 'sensitive' } });

    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ casing: 'sensitive' }),
    }));
    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ punctuation: 'sensitive' }),
    }));
    expect(onTaskGroupChange).not.toHaveBeenCalledWith(expect.objectContaining({
      instructionBlocks: expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('sensitive') })]),
    }));
  });

  it('keeps family-specific answer rules editable inside Questions', () => {
    const matchingDocument = createReadingV2CanonicalFixture('matching-features');
    const matchingGroup = Object.values(matchingDocument.taskGroups)[0]!;
    const matchingInteractions = matchingGroup.interactionIds.map((id) => matchingDocument.interactions[id]).filter(Boolean);
    const onTaskGroupChange = vi.fn();
    const onInteractionChange = vi.fn();

    render(
      <ReadingV2AnswerRuleEditor
        taskGroup={matchingGroup}
        interactions={matchingInteractions}
        onTaskGroupChange={onTaskGroupChange}
        onInteractionChange={onInteractionChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(`Option reuse for ${matchingInteractions[0]!.interactionId}`), {
      target: { value: 'disallowed' },
    });

    expect(onTaskGroupChange).toHaveBeenCalledWith(expect.objectContaining({
      answerRule: expect.objectContaining({ optionReuse: 'disallowed' }),
    }));
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({
      responseShape: expect.objectContaining({ optionReuse: 'disallowed' }),
    }));
  });
});
