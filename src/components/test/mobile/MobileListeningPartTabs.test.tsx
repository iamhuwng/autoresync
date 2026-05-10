/**
 * Tests for MobileListeningPartTabs — PRD-0045 Task 2.4
 *
 * Covers:
 *   - Renders exactly 4 tabs with correct labels
 *   - Active tab has aria-selected="true"
 *   - Tapping inactive tab fires onPartChange
 *   - Tapping active tab does NOT fire onPartChange (FR-14)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MobileListeningPartTabs } from './MobileListeningPartTabs';

describe('MobileListeningPartTabs', () => {
  it('renders exactly 4 tabs', () => {
    const { getAllByRole } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} />,
    );
    expect(getAllByRole('tab')).toHaveLength(4);
  });

  it('uses the compact tab strip height and sticky offset', () => {
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} />,
    );
    const strip = getByTestId('mobile-listening-part-tabs');
    expect(strip.style.height).toBe('44px');
    expect(strip.style.top).toBe('48px');
  });

  it('renders correct labels', () => {
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} />,
    );
    expect(getByTestId('listening-part-tab-1').textContent).toBe('Part 1');
    expect(getByTestId('listening-part-tab-2').textContent).toBe('Part 2');
    expect(getByTestId('listening-part-tab-3').textContent).toBe('Part 3');
    expect(getByTestId('listening-part-tab-4').textContent).toBe('Part 4');
  });

  it('marks active tab with aria-selected', () => {
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={3} onPartChange={vi.fn()} />,
    );
    expect(getByTestId('listening-part-tab-3').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('listening-part-tab-1').getAttribute('aria-selected')).toBe('false');
    expect(getByTestId('listening-part-tab-2').getAttribute('aria-selected')).toBe('false');
    expect(getByTestId('listening-part-tab-4').getAttribute('aria-selected')).toBe('false');
  });

  it('fires onPartChange when inactive tab is tapped', () => {
    const onPartChange = vi.fn();
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={onPartChange} />,
    );
    fireEvent.click(getByTestId('listening-part-tab-3'));
    expect(onPartChange).toHaveBeenCalledWith(3);
  });

  it('does NOT fire onPartChange when active tab is tapped (FR-14)', () => {
    const onPartChange = vi.fn();
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={2} onPartChange={onPartChange} />,
    );
    fireEvent.click(getByTestId('listening-part-tab-2'));
    expect(onPartChange).not.toHaveBeenCalled();
  });

  it('renders tablist role on container', () => {
    const { getByTestId } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} />,
    );
    expect(getByTestId('mobile-listening-part-tabs').getAttribute('role')).toBe('tablist');
  });

  it('renders only 2 tabs when partCount=2', () => {
    const { getAllByRole, queryByTestId } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} partCount={2} />,
    );
    expect(getAllByRole('tab')).toHaveLength(2);
    expect(queryByTestId('listening-part-tab-1')).toBeTruthy();
    expect(queryByTestId('listening-part-tab-2')).toBeTruthy();
    expect(queryByTestId('listening-part-tab-3')).toBeNull();
    expect(queryByTestId('listening-part-tab-4')).toBeNull();
  });

  it('renders only 1 tab when partCount=1', () => {
    const { getAllByRole } = render(
      <MobileListeningPartTabs activePartNumber={1} onPartChange={vi.fn()} partCount={1} />,
    );
    expect(getAllByRole('tab')).toHaveLength(1);
  });
});
