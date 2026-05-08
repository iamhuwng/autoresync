/**
 * Tests for MobilePassageTabs
 * @see PRD-0043 Task 3.5
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobilePassageTabs } from './MobilePassageTabs';

describe('MobilePassageTabs', () => {
  const passages = [
    { id: 'p1', title: 'Coral Reefs' },
    { id: 'p2', title: 'Climate Change' },
    { id: 'p3' }, // no title — falls back to Passage 3
  ];

  it('renders correct number of tabs', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={vi.fn()} />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
  });

  it('highlights the active tab with aria-selected', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p2" onPassageChange={vi.fn()} />,
    );
    const p2Tab = screen.getByTestId('passage-tab-p2');
    expect(p2Tab.getAttribute('aria-selected')).toBe('true');

    const p1Tab = screen.getByTestId('passage-tab-p1');
    expect(p1Tab.getAttribute('aria-selected')).toBe('false');
  });

  it('always shows generic passage labels in numeric order', () => {
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={vi.fn()} />,
    );
    expect(screen.getByTestId('passage-tab-p1').textContent).toBe('Passage 1');
    expect(screen.getByTestId('passage-tab-p2').textContent).toBe('Passage 2');
    expect(screen.getByTestId('passage-tab-p3').textContent).toBe('Passage 3');
  });

  it('calls onPassageChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <MobilePassageTabs passages={passages} activePassageId="p1" onPassageChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('passage-tab-p2'));
    expect(onChange).toHaveBeenCalledWith('p2');
  });
});
