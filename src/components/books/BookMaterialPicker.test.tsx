import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BookMaterialPicker from './BookMaterialPicker';

describe('BookMaterialPicker', () => {
  it('shows published material summaries only with kind and Test Type metadata', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();

    render(
      <BookMaterialPicker
        materials={[
          { materialId: 'draft-1', title: 'Draft Hidden', materialKind: 'full-test', status: 'draft', testTypeIds: ['ielts'] },
          { materialId: 'test-1', title: 'Published Test', materialKind: 'full-test', status: 'published', testTypeIds: ['ielts'] },
          { materialId: 'passage-1', title: 'Published Passage', materialKind: 'reading-passage', publishedSnapshotVersionId: 'snapshot-1', testTypeIds: ['toeic'] },
        ]}
        onAttach={onAttach}
      />,
    );

    expect(screen.queryByText('Draft Hidden')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search published materials')).toBeInTheDocument();
    expect(screen.getByText('Published Test')).toBeInTheDocument();
    expect(screen.getByText('full-test')).toBeInTheDocument();
    expect(screen.getByText('ielts')).toBeInTheDocument();
    expect(screen.getByText('Published Passage')).toBeInTheDocument();
    expect(screen.getByText('reading-passage')).toBeInTheDocument();
    expect(screen.getByText('toeic')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Attach Published Passage' }));

    expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'passage-1',
      materialKind: 'reading-passage',
    }));
  });

  it('filters compact candidate rows without owning the attach section heading', async () => {
    const user = userEvent.setup();

    render(
      <BookMaterialPicker
        materials={[
          { materialId: 'test-1', title: 'Cambridge Reading Test', materialKind: 'full-test', status: 'published', testTypeIds: ['ielts'] },
          { materialId: 'passage-1', title: 'Huarango Passage', materialKind: 'reading-passage', publishedSnapshotVersionId: 'snapshot-1', testTypeIds: ['toeic'] },
        ]}
        onAttach={vi.fn()}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Attach material' })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search published materials'), 'toeic');

    expect(screen.getByText('Huarango Passage')).toBeInTheDocument();
    expect(screen.queryByText('Cambridge Reading Test')).not.toBeInTheDocument();
  });
});
