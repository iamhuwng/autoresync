import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreateBookSuccessorModal from './CreateBookSuccessorModal';

const predecessor = {
  bookId: 'book-1',
  bookMode: 'materials' as const,
  ownerId: 'teacher-1',
  title: 'Original Book',
  authors: [],
  testTypeIds: [],
  tags: [],
  visibility: 'public-library-published' as const,
  status: 'ready' as const,
  createdAt: 'created',
  updatedAt: 'updated',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
};

describe('CreateBookSuccessorModal', () => {
  it('cancels without creating a successor', () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    render(<CreateBookSuccessorModal opened predecessor={predecessor} onClose={onClose} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('creates the opposite-mode successor with an explicit reason', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateBookSuccessorModal opened predecessor={predecessor} onClose={vi.fn()} onCreate={onCreate} />);

    expect(screen.getByText(/Original Book/)).toBeInTheDocument();
    expect(screen.getByText(/stays unchanged/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Need source pages' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create PDF source successor' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      reason: 'Need source pages',
      targetMode: 'pdf',
    }));
  });

  it('defaults a legacy predecessor to materials mode', () => {
    render(
      <CreateBookSuccessorModal
        opened
        predecessor={{ ...predecessor, bookMode: undefined }}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create PDF source successor' })).toBeInTheDocument();
  });
});
