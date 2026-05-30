import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MaterialViewModeToggle from './MaterialViewModeToggle';

describe('MaterialViewModeToggle', () => {
  it('exposes stable accessible names and active state', () => {
    render(<MaterialViewModeToggle value="grid" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange only when switching modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialViewModeToggle value="grid" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
