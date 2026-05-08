import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileInstructionsModal } from './MobileInstructionsModal';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

describe('MobileInstructionsModal', () => {
  it('renders live-mode rules and controls help when opened', () => {
    render(
      <MobileInstructionsModal
        isOpen
        onClose={vi.fn()}
        mode="live"
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Instructions & Help')).toBeTruthy();
    expect(screen.getByText('Rules')).toBeTruthy();
    expect(screen.getByText('Controls Help')).toBeTruthy();
    expect(screen.getByText('This is a timed session managed by your teacher.')).toBeTruthy();
  });

  it('renders homework-mode content from shared instructions data', () => {
    render(
      <MobileInstructionsModal
        isOpen
        onClose={vi.fn()}
        mode="homework"
        resolvedSettings={{ timerMinutes: 30, allowPause: false } as any}
      />,
    );

    expect(screen.getByText('You have 30 minutes to complete this test.')).toBeTruthy();
    expect(screen.getByText('Your progress is saved automatically as you work.')).toBeTruthy();
  });

  it('does not render when closed', () => {
    render(
      <MobileInstructionsModal
        isOpen={false}
        onClose={vi.fn()}
        mode="solo"
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    render(
      <MobileInstructionsModal
        isOpen
        onClose={onClose}
        mode="solo"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the shared utility-modal z-index layer', () => {
    render(
      <MobileInstructionsModal
        isOpen
        onClose={vi.fn()}
        mode="solo"
      />,
    );

    expect(screen.getByTestId('mobile-instructions-modal')).toHaveStyle({
      zIndex: String(MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL),
    });
  });
});
