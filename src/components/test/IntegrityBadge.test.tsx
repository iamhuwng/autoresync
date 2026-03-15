/**
 * Unit tests for IntegrityBadge component
 *
 * PRD-0036: Anti-Cheating & Test Integrity System — Task 11.3
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrityBadge } from './IntegrityBadge';

describe('IntegrityBadge', () => {
  // ── (a) Renders a green dot for low risk ──

  it('renders green dot with no count for low risk', () => {
    const { container } = render(
      <IntegrityBadge violationCount={0} riskLevel="low" />,
    );

    // Should render as a span (no onClick)
    const badge = container.querySelector('span[title]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('title')).toBe('0 integrity violations');

    // Check green dot exists
    const dot = badge?.querySelector('span');
    expect(dot).not.toBeNull();

    // No count text for low risk
    expect(badge?.textContent).toBe('');
  });

  // ── (b) Renders amber badge for medium risk ──

  it('renders amber warning with count for medium risk', () => {
    const { container } = render(
      <IntegrityBadge violationCount={2} riskLevel="medium" />,
    );

    const badge = container.querySelector('span[title]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('2');
    expect(badge?.getAttribute('title')).toBe('2 integrity violations');
  });

  // ── (c) Renders red badge for high risk ──

  it('renders red flag with count for high risk', () => {
    const { container } = render(
      <IntegrityBadge violationCount={5} riskLevel="high" />,
    );

    const badge = container.querySelector('span[title]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('5');
    expect(badge?.getAttribute('title')).toBe('5 integrity violations');
  });

  // ── (d) Singular title for 1 violation ──

  it('uses singular "violation" for count of 1', () => {
    const { container } = render(
      <IntegrityBadge violationCount={1} riskLevel="medium" />,
    );

    const badge = container.querySelector('[title]');
    expect(badge?.getAttribute('title')).toBe('1 integrity violation');
  });

  // ── (e) Renders as button when onClick is provided ──

  it('renders as a button when onClick is provided', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <IntegrityBadge
        violationCount={3}
        riskLevel="high"
        onClick={handleClick}
      />,
    );

    const button = container.querySelector('button');
    expect(button).not.toBeNull();

    button?.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  // ── (f) Renders as span when no onClick ──

  it('renders as a span when no onClick is provided', () => {
    const { container } = render(
      <IntegrityBadge violationCount={0} riskLevel="low" />,
    );

    const span = container.querySelector('span[title]');
    expect(span).not.toBeNull();

    const button = container.querySelector('button');
    expect(button).toBeNull();
  });
});
