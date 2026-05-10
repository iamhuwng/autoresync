import '@testing-library/jest-dom';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mantine/core', () => ({
  Text: ({ children }: any) => <div>{children}</div>,
  Textarea: (props: any) => <textarea {...props} />,
  TextInput: (props: any) => <input {...props} />,
  NumberInput: (props: any) => <input {...props} />,
  Radio: (props: any) => <input type="radio" {...props} />,
  Checkbox: (props: any) => <input type="checkbox" {...props} />,
  Stack: ({ children }: any) => <div>{children}</div>,
  Group: ({ children }: any) => <div>{children}</div>,
  Modal: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('./modern', () => ({
  Button: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
}));

import QuestionEditorPanel from './QuestionEditorPanel';

describe('QuestionEditorPanel', () => {
  it('shows a read-only notice for canonical table-completion member questions', () => {
    render(
      <QuestionEditorPanel
        question={{
          number: 1,
          type: 'table-completion',
          question: 'legacy fallback',
          answer: '',
          groupId: 'group-table-1',
          blankId: 'blank-1',
          anchorId: 'anchor-1',
          groupTaskType: 'table-completion',
        }}
        questionIndex={0}
        totalQuestions={2}
        onUpdate={vi.fn()}
        onClose={vi.fn()}
        onReset={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText('Canonical Table Group')).toBeInTheDocument();
    expect(
      screen.getByText(/published canonical table-completion group/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/read-only in the flat editor/i),
    ).toBeInTheDocument();
  });
});
