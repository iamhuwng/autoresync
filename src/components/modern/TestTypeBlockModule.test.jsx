import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TestTypeBlockModule from './TestTypeBlockModule';

const testTypes = [
  {
    testTypeId: 'ielts',
    canonicalKey: 'IELTS',
    label: 'IELTS',
    shortLabel: 'IELTS',
    active: true,
    teacherSelectable: true,
    displayOrder: 1,
    defaultPinnedRank: 1,
    logoUrl: '/assets/material-test-types/ielts.svg',
    logoAlt: 'IELTS logo',
    allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
  },
  {
    testTypeId: 'toeic',
    canonicalKey: 'TOEIC',
    label: 'TOEIC',
    shortLabel: 'TOEIC',
    active: true,
    teacherSelectable: true,
    displayOrder: 2,
    defaultPinnedRank: 2,
    logoUrl: '/assets/material-test-types/toeic.svg',
    logoAlt: 'TOEIC logo',
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'archived',
    canonicalKey: 'OLD',
    label: 'Old Test Type',
    shortLabel: 'OLD',
    active: false,
    teacherSelectable: true,
    displayOrder: 3,
    defaultPinnedRank: 3,
    logoAlt: 'Old logo',
    allowedMaterialKinds: ['full-test'],
  },
  {
    testTypeId: 'long-label',
    canonicalKey: 'LONG',
    label: 'Very Long Institution Specific Placement Exam',
    shortLabel: 'Placement',
    active: true,
    teacherSelectable: true,
    displayOrder: 4,
    defaultPinnedRank: 4,
    logoAlt: 'Placement exam logo',
    allowedMaterialKinds: ['full-test'],
  },
];

describe('TestTypeBlockModule', () => {
  it('renders only real active Test Types from pinned order and never renders an All block', () => {
    render(
      <TestTypeBlockModule
        testTypes={testTypes}
        pinnedTestTypeIds={['toeic', 'archived', 'ielts']}
        activeTestTypeId={null}
        onActiveTestTypeChange={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    const blocks = screen.getAllByRole('button', { name: /filter materials by/i });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveAccessibleName(/TOEIC/);
    expect(blocks[1]).toHaveAccessibleName(/IELTS/);
    expect(screen.queryByRole('button', { name: /all/i })).not.toBeInTheDocument();
  });

  it('falls back to admin default top four, uses logo alt text, and avoids repeated visible title when logo exists', () => {
    render(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId={null}
        onActiveTestTypeChange={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    const ieltsBlock = screen.getByRole('button', { name: /filter materials by IELTS/i });

    expect(within(ieltsBlock).getByRole('img', { name: 'IELTS logo' })).toHaveAttribute(
      'src',
      '/assets/material-test-types/ielts.svg',
    );
    expect(within(ieltsBlock).queryByText('IELTS')).not.toBeInTheDocument();
  });

  it('renders compact fallback badge with accessible overflow label when no logo exists', () => {
    render(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId={null}
        onActiveTestTypeChange={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    const placementBlock = screen.getByRole('button', {
      name: /Very Long Institution Specific Placement Exam/i,
    });

    expect(within(placementBlock).queryByRole('img')).not.toBeInTheDocument();
    expect(within(placementBlock).getByText('Placement')).toHaveAttribute(
      'title',
      'Very Long Institution Specific Placement Exam',
    );
  });

  it('toggles active filter from block body and clears when clicked again', async () => {
    const user = userEvent.setup();
    const onActiveTestTypeChange = vi.fn();
    const { rerender } = render(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId={null}
        onActiveTestTypeChange={onActiveTestTypeChange}
        onOpenPreferences={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /filter materials by IELTS/i }));
    expect(onActiveTestTypeChange).toHaveBeenCalledWith('ielts');

    rerender(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId="ielts"
        onActiveTestTypeChange={onActiveTestTypeChange}
        onOpenPreferences={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /filter materials by IELTS/i }));
    expect(onActiveTestTypeChange).toHaveBeenLastCalledWith(null);
  });

  it('opens preferences from settings icon without toggling the active filter', async () => {
    const user = userEvent.setup();
    const onActiveTestTypeChange = vi.fn();
    const onOpenPreferences = vi.fn();
    render(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId={null}
        onActiveTestTypeChange={onActiveTestTypeChange}
        onOpenPreferences={onOpenPreferences}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Edit pinned Test Types' })[0]);

    expect(onOpenPreferences).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'settings-icon', testTypeId: 'ielts' }),
    );
    expect(onActiveTestTypeChange).not.toHaveBeenCalled();
  });

  it('keeps settings icon keyboard discoverable through focus-within styling contract', async () => {
    const user = userEvent.setup();
    render(
      <TestTypeBlockModule
        testTypes={testTypes}
        activeTestTypeId={null}
        onActiveTestTypeChange={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    await user.tab();

    expect(screen.getByRole('button', { name: /filter materials by IELTS/i })).toHaveFocus();
    expect(screen.getAllByRole('button', { name: 'Edit pinned Test Types' })[0]).toHaveClass(
      'test-type-block__settings',
    );
  });
});
