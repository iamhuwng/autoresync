import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ContentTabs from './ContentTabs';

describe('ContentTabs', () => {
  const enabledCapabilities = {
    canUseReadingPassageLibrary: true,
    canUseMaterialBooks: true,
  };

  it('renders the expanded teacher material tabs and reports selected tab ids', () => {
    const onTabChange = vi.fn();

    render(<ContentTabs activeTab="my" onTabChange={onTabChange} capabilities={enabledCapabilities} />);

    expect(screen.getByRole('button', { name: /My Content/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Public Library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reading Passage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reading Passage/i }));
    fireEvent.click(screen.getByRole('button', { name: /Book/i }));

    expect(onTabChange).toHaveBeenNthCalledWith(1, 'reading-passage');
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'book');
  }, 15000);

  it('hides PRD-0052 gated tabs when capabilities are disabled', () => {
    render(<ContentTabs activeTab="my" onTabChange={vi.fn()} capabilities={{
      canUseReadingPassageLibrary: false,
      canUseMaterialBooks: false,
    }} />);

    expect(screen.getByRole('button', { name: /My Content/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reading Passage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Book/i })).not.toBeInTheDocument();
  }, 15000);
});
