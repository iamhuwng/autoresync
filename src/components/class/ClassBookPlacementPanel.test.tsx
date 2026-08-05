import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClassBookPlacementPanel } from './ClassBookPlacementPanel';

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

const props = {
  classId: 'class-1',
  copyId: 'copy-1',
  courseMaterialId: 'class-material-1',
  bookTitle: 'Book one',
  selectedActivityCount: 1,
  sourceExposure: 'full-pdf' as const,
};

describe('#103 Class Book placement UI composition', () => {
  it('is hidden when the rollout is not explicitly enabled', () => {
    const { container } = render(<ClassBookPlacementPanel {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('requires source-exposure confirmation and emits exact placement dimensions', () => {
    const onPlace = vi.fn();
    render(<ClassBookPlacementPanel {...props} enabled onPlace={onPlace} />);
    const place = screen.getByRole('button', { name: 'Place Book Activities' });
    expect((place as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect((place as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(place);
    expect(onPlace).toHaveBeenCalledWith({
      classId: 'class-1',
      copyId: 'copy-1',
      courseMaterialId: 'class-material-1',
      confirmedSourceExposure: true,
    });
    expect(screen.getByRole('alert').textContent).toContain('complete published PDF');
  });
});
