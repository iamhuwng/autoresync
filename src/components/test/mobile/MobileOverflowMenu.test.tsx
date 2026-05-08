import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileOverflowMenu } from './MobileOverflowMenu';

describe('MobileOverflowMenu', () => {
  const menuItems = [
    { key: 'text-size', label: 'Text size', onSelect: vi.fn() },
    { key: 'review-answers', label: 'Review answers', onSelect: vi.fn() },
    { key: 'instructions-help', label: 'Instructions / Help', onSelect: vi.fn() },
    { key: 'leave-test', label: 'Leave test', onSelect: vi.fn(), destructive: true },
  ];

  it('renders the remaining four overflow actions when open', () => {
    render(<MobileOverflowMenu isOpen onClose={vi.fn()} menuItems={menuItems} />);

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Text size' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Review answers' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Instructions / Help' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Leave test' })).toBeTruthy();
  });

  it('uses the required overflow z-index layer', () => {
    render(<MobileOverflowMenu isOpen onClose={vi.fn()} menuItems={menuItems} />);
    expect(screen.getByTestId('mobile-overflow-menu-backdrop')).toHaveStyle({ zIndex: '4000' });
  });

  it('invokes the item callback and closes the menu when an item is selected', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <MobileOverflowMenu
        isOpen
        onClose={onClose}
        menuItems={[{ key: 'text-size', label: 'Text size', onSelect }]}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Text size' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is tapped', () => {
    const onClose = vi.fn();
    render(<MobileOverflowMenu isOpen onClose={onClose} menuItems={menuItems} />);

    fireEvent.click(screen.getByTestId('mobile-overflow-menu-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders long labels with ellipsis-safe styling', () => {
    render(
      <MobileOverflowMenu
        isOpen
        onClose={vi.fn()}
        menuItems={[{
          key: 'long',
          label: 'A very long menu item label that should truncate safely on mobile',
          onSelect: vi.fn(),
        }]}
      />,
    );

    expect(screen.getByText(/very long menu item/i)).toHaveStyle({
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });
});
