import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import DraftCard from './DraftCard';

describe('DraftCard', () => {
  it('renders IELTS writing draft badges and resumes with the draft object', async () => {
    const onResume = vi.fn();
    const user = userEvent.setup();
    const draft = {
      id: 'writing-draft-1',
      draftKind: 'writing',
      metadata: {
        title: 'Writing Draft',
        duration: 45,
        format: 'task2-only',
      },
      tasks: [{ taskNumber: 2 }],
      status: 'editing',
      updatedAt: new Date('2026-03-29T10:00:00Z'),
    };

    render(
      <DraftCard
        draft={draft}
        index={0}
        onResume={onResume}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Writing Draft')).toBeInTheDocument();
    expect(screen.getByText('1 task')).toBeInTheDocument();
    expect(screen.getByText('IELTS Writing')).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resume editing/i }));
    expect(onResume).toHaveBeenCalledWith(draft);
  });
});
