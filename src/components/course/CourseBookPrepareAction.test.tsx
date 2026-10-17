import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock('../modern', () => ({ toast }));

import { CourseBookPrepareAction } from './CourseBookPrepareAction';

describe('CourseBookPrepareAction', () => {
  it('prepares with exact Course placement and direct enrollment authority', async () => {
    const prepare = vi.fn(async () => ({ bindingId: 'binding-1' }));
    const onPrepared = vi.fn();
    const trackAction = vi.fn();
    render(<CourseBookPrepareAction
      courseMaterialId="course-material-1"
      legacyEnrollmentId="enrollment-1"
      prepare={prepare}
      onPrepared={onPrepared}
      trackAction={trackAction}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Start →' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled());
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      courseMaterialId: 'course-material-1', legacyEnrollmentId: 'enrollment-1',
    }));
    expect(trackAction).toHaveBeenCalledWith('prepareCourseBook', { courseMaterialId: 'course-material-1' });
    expect(onPrepared).toHaveBeenCalledWith({ bindingId: 'binding-1' });
  });

  it('does not prepare class-based or missing direct enrollment authority', () => {
    const prepare = vi.fn();
    render(<CourseBookPrepareAction
      courseMaterialId="course-material-1"
      legacyEnrollmentId={null}
      prepare={prepare}
      trackAction={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Unavailable' }));
    expect(prepare).not.toHaveBeenCalled();
  });
});
