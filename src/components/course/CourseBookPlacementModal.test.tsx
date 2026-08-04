import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../modern', () => ({ toast }));
vi.mock('../books/useBookEditorModeResolution', () => ({
  createFirebaseMaterialBooksRepository: vi.fn(),
}));
vi.mock('@mantine/core', () => ({
  Modal: ({ opened, title, children }: any) => opened ? <div role="dialog" aria-label={title}>{children}</div> : null,
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Alert: ({ title, children }: any) => <div><strong>{title}</strong>{children}</div>,
  Button: ({ children, loading: _loading, ...props }: any) => <button {...props}>{children}</button>,
  Checkbox: ({ label, ...props }: any) => <label><input type="checkbox" {...props} />{label}</label>,
  Select: ({ label, data, value, onChange, description: _description, searchable: _searchable, ...props }: any) => (
    <label>{label}<select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value || null)} {...props}>
      <option value="" />
      {data.map((item: any) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
  ),
  SegmentedControl: ({ data, value, onChange }: any) => <div>{data.map((item: any) => (
    <button key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>
  ))}</div>,
  MultiSelect: () => <div />,
}));

import { CourseBookPlacementModal } from './CourseBookPlacementModal';

describe('CourseBookPlacementModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the PRD PDF exposure confirmation before placing an exact subtree', async () => {
    const place = vi.fn(async () => ({ status: 'created' }));
    const trackAction = vi.fn();
    render(<CourseBookPlacementModal
      opened
      onClose={vi.fn()}
      teacherId="teacher-1"
      courseId="course-1"
      moduleId="module-1"
      loadBooks={async () => [{
        id: 'book-1', bookId: 'book-1', bookMode: 'pdf', ownerId: 'teacher-1',
        title: 'Book One', authors: [], visibility: 'private', status: 'ready', testTypeIds: [],
        testTypes: [], tags: [], updatedAt: '2026-08-05T00:00:00.000Z', isOwner: true,
      }]}
      readCatalog={async () => ({
        bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 1,
        manifestVersionId: 'manifest-1', sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'source-1' }],
        nodes: [
          { nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
          { nodeKey: 'test-1', parentNodeKey: 'unit-1', nodeType: 'test', order: 1 },
          { nodeKey: 'test-2', parentNodeKey: 'unit-1', nodeType: 'test', order: 2 },
        ],
        placements: [
          { placementId: 'placement-1', nodeKey: 'test-1', activityId: 'activity-1',
            activityVersionId: 'activity-version-1', sourceKeys: ['source-1'] },
          { placementId: 'placement-2', nodeKey: 'test-2', activityId: 'activity-2',
            activityVersionId: 'activity-version-2', sourceKeys: ['source-1'] },
        ],
      })}
      place={place}
      onPlaced={vi.fn()}
      trackAction={trackAction}
    />);

    fireEvent.change(await screen.findByLabelText('Published Book'), { target: { value: 'book-1' } });
    fireEvent.change(await screen.findByLabelText('Subtree'), { target: { value: 'test-1' } });
    expect(await screen.findByText('PDF visibility confirmation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Book item' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('I understand what students can view.'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Book item' }));
    await waitFor(() => expect(place).toHaveBeenCalled());
    expect(place).toHaveBeenCalledWith(expect.objectContaining({
      courseId: 'course-1', moduleId: 'module-1',
      selection: { bookId: 'book-1', scope: { kind: 'subtree', nodeKeys: ['test-1'], placementIds: [] } },
    }));
    expect(trackAction).toHaveBeenCalledWith('placeCourseBook', expect.objectContaining({ selectedCount: 1 }));
    expect(toast.success).toHaveBeenCalled();
  });
});
