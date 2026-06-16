import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2MetadataPanel, type ReadingV2StudioMetadata } from './ReadingV2MetadataPanel';

const metadata: ReadingV2StudioMetadata = {
  title: '',
  productMarker: 'Reading V2',
  materialKind: 'full-test',
  durationMinutes: 60,
  difficulty: 'intermediate',
  targetBand: 'Band 6-7',
  description: '',
  tags: [],
  visibility: 'private',
  ownerId: 'teacher-1',
  provenanceSummary: 'Original draft',
};

describe('ReadingV2MetadataPanel', () => {
  it('captures required metadata without editing question meaning', () => {
    const onMetadataChange = vi.fn();
    render(<ReadingV2MetadataPanel metadata={metadata} validationIssues={[]} onMetadataChange={onMetadataChange} />);

    fireEvent.change(screen.getByLabelText('Material title'), { target: { value: 'Cambridge Reading Set' } });
    fireEvent.change(screen.getByLabelText('Tags or topics'), { target: { value: 'science, academic' } });

    expect(onMetadataChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cambridge Reading Set' }));
    expect(onMetadataChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['science', 'academic'] }));
    expect(screen.getByText(/does not change question meaning/)).toBeInTheDocument();
  });

  it('shows publish readiness when title is missing', () => {
    render(<ReadingV2MetadataPanel metadata={metadata} validationIssues={[]} onMetadataChange={vi.fn()} />);

    expect(screen.getByText(/Title required before publish/)).toBeInTheDocument();
  });

  it('emits publish-compatible material kind and visibility values', () => {
    const onMetadataChange = vi.fn();
    render(<ReadingV2MetadataPanel metadata={metadata} validationIssues={[]} onMetadataChange={onMetadataChange} />);

    fireEvent.change(screen.getByLabelText('Material kind'), {
      target: { value: 'extracted-task-group-material' },
    });
    fireEvent.change(screen.getByLabelText('Visibility'), {
      target: { value: 'assigned-only' },
    });

    expect(onMetadataChange).toHaveBeenCalledWith(
      expect.objectContaining({ materialKind: 'extracted-task-group-material' }),
    );
    expect(onMetadataChange).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'assigned-only' }));
  });
});
