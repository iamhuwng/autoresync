import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CreateBookModal from './CreateBookModal';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';
import { toast } from '../modern/ToastNotification';

vi.mock('../modern/ToastNotification', () => ({
  toast: {
    error: vi.fn(),
  },
}));

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

    await user.click(screen.getByLabelText('Materials'));
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

    await user.click(screen.getByLabelText('Materials'));
    await user.type(screen.getByLabelText('Title'), 'IELTS Reading Pack');
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        bookMode: 'materials',
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

    await user.click(screen.getByLabelText('Materials'));
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
        bookMode: 'materials',
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

  it('shows only chooser before an explicit mode selection', async () => {
    const user = userEvent.setup();
    const onModeSelect = vi.fn();

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onModeSelect={onModeSelect}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Materials')).not.toBeChecked();
    await user.click(screen.getByLabelText('Materials'));
    expect(onModeSelect).toHaveBeenCalledWith('materials');
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('keeps PDF source unavailable by default and shows its status', () => {
    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('PDF source')).toBeDisabled();
    expect(screen.getByText('PDF source creation is not available yet.')).toBeInTheDocument();
  });

  it('reveals the PDF Book details and Assembly handoff after PDF source selection', async () => {
    const user = userEvent.setup();

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        pdfModeEnabled={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('PDF source'));

    expect(screen.getByLabelText('PDF source')).toBeChecked();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Book' })).toBeInTheDocument();
    expect(screen.getByText('Complete the required Book details below, then choose Save Book to open PDF Assembly.')).toBeInTheDocument();
  });

  it('rejects PDF submission when PDF mode becomes disabled after selection', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const props = {
      opened: true,
      testTypes: DEFAULT_MATERIAL_TEST_TYPES,
      onClose: vi.fn(),
      onSave,
    };
    const { rerender } = render(<CreateBookModal {...props} pdfModeEnabled={true} />);

    await user.click(screen.getByLabelText('PDF source'));
    rerender(<CreateBookModal {...props} pdfModeEnabled={false} />);
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    expect(await screen.findByText('PDF source is no longer available. Choose another option.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('resets the chooser and metadata after a successful save', async () => {
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

    await user.click(screen.getByLabelText('Materials'));
    await user.type(screen.getByLabelText('Title'), 'Reset Book');
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Materials'));
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('announces rejected saves and preserves modal form state for retry', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error('PDF source denied'));

    render(
      <CreateBookModal
        opened={true}
        testTypes={DEFAULT_MATERIAL_TEST_TYPES}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByLabelText('Materials'));
    await user.type(screen.getByLabelText('Title'), 'Retry Book');
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not save Book. Please try again.');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Retry Book');
    expect(screen.getByLabelText('IELTS')).toBeChecked();
  });
});
