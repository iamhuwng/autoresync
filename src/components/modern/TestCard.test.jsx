import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TestCard from './TestCard';

describe('TestCard', () => {
  it('renders IELTS writing metadata from the current test shape', () => {
    render(
      <TestCard
        test={{
          id: 'writing-1',
          testType: 'IELTS',
          skill: 'Writing',
          metadata: {
            title: 'IELTS Writing Mock 1',
            duration: 60,
            format: 'full-test',
          },
          tasks: [{ taskNumber: 1 }, { taskNumber: 2 }],
        }}
        index={0}
        canEdit
        isOwner
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onStartTest={vi.fn()}
        onTogglePublic={vi.fn()}
      />
    );

    expect(screen.getByText('IELTS Writing Mock 1')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(screen.getByText('IELTS - Writing')).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
  });
});
