import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ContentTabs from './ContentTabs';

describe('ContentTabs', () => {
  it('renders the expanded teacher material tabs and reports selected tab ids', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();

    render(<ContentTabs activeTab="my" onTabChange={onTabChange} />);

    expect(screen.getByRole('button', { name: /My Content/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Public Library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reading Passage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reading Passage/i }));
    await user.click(screen.getByRole('button', { name: /Book/i }));

    expect(onTabChange).toHaveBeenNthCalledWith(1, 'reading-passage');
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'book');
  });
});
