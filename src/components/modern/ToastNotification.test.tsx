import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer, toast } from './ToastNotification';

describe('ToastNotification shared announcement system', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.clear();
  });

  afterEach(() => {
    act(() => {
      toast.clear();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('renders success announcements in the bottom-right toast region', () => {
    const { container } = render(<ToastContainer />);

    act(() => {
      toast.success('Saved changes.');
    });

    const toastRegion = container.querySelector('.toast-container');
    expect(toastRegion).toBeInTheDocument();
    expect(getComputedStyle(toastRegion as Element).right).toBe('1rem');
    expect(getComputedStyle(toastRegion as Element).bottom).toBe('1rem');
    expect(screen.getByRole('status')).toHaveTextContent('Saved changes.');
    expect(screen.getByRole('button', { name: 'Dismiss announcement' })).toBeInTheDocument();
  });

  it('uses alert semantics for failure announcements', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('Failed to save changes.');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to save changes.');
  });

  it('keeps the toast visible through the readable duration before fading out', () => {
    render(<ToastContainer />);

    act(() => {
      toast.info('Material archived.');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Material archived.');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByRole('status')).toHaveClass('toast-card--leaving');

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByText('Material archived.')).not.toBeInTheDocument();
  });
});
