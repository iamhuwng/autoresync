import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileTextSizeControl } from './MobileTextSizeControl';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobileReadingLayering';

describe('MobileTextSizeControl', () => {
  it('renders the expected slider range, step, and current value', () => {
    render(
      <MobileTextSizeControl
        currentSize={16}
        onSizeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const slider = screen.getByTestId('mobile-text-size-slider');
    expect(slider.getAttribute('min')).toBe('14');
    expect(slider.getAttribute('max')).toBe('22');
    expect(slider.getAttribute('step')).toBe('1');
    expect(screen.getByTestId('mobile-text-size-value').textContent).toBe('16px');
  });

  it('calls onSizeChange immediately for live preview updates', () => {
    const onSizeChange = vi.fn();
    render(
      <MobileTextSizeControl
        currentSize={16}
        onSizeChange={onSizeChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('mobile-text-size-slider'), {
      target: { value: '20' },
    });

    expect(onSizeChange).toHaveBeenCalledWith(20);
  });

  it('closes via the done button', () => {
    const onClose = vi.fn();
    render(
      <MobileTextSizeControl
        currentSize={16}
        onSizeChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the shared utility-modal z-index layer', () => {
    render(
      <MobileTextSizeControl
        currentSize={16}
        onSizeChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('mobile-text-size-control')).toHaveStyle({
      zIndex: String(MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL),
    });
  });
});
