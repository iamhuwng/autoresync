import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CreateBookModal from './CreateBookModal';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';

describe('CreateBookModal', () => {
  it('validates title and at least one Test Type before saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    expect(await screen.findByText('Book title is required.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one Test Type.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves an empty draft Book with required metadata only', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('Title'), 'IELTS Reading Pack');
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        title: 'IELTS Reading Pack',
        testTypeIds: ['ielts'],
        visibility: 'private',
      }));
    });
  });

  it('supports multiple Test Types, public visibility, tags, and bibliographic fields', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mixed Exam Reader' } });
    fireEvent.change(screen.getByLabelText('Authors'), { target: { value: 'A. Nguyen, B. Tran' } });
    fireEvent.change(screen.getByLabelText('Publisher'), { target: { value: 'Practice Press' } });
    fireEvent.change(screen.getByLabelText('Series'), { target: { value: 'Core Reading' } });
    fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: '9781234567890' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'reading, academic' } });
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByLabelText('TOEIC'));
    await user.click(screen.getByLabelText('Public'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        authors: ['A. Nguyen', 'B. Tran'],
        publisher: 'Practice Press',
        series: 'Core Reading',
        isbn: '9781234567890',
        tags: ['reading', 'academic'],
        testTypeIds: ['ielts', 'toeic'],
        visibility: 'public-library-pending-review',
      }));
    });
  });
});
