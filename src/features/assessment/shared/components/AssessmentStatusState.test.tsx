import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssessmentStatusState } from './AssessmentStatusState';

describe('AssessmentStatusState', () => {
  it('renders loading state with status semantics', () => {
    render(
      <AssessmentStatusState
        variant="loading"
        title="Loading material"
        message="Preparing assessment content."
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Loading material' })).toBeInTheDocument();
    expect(screen.getByText('Preparing assessment content.')).toBeInTheDocument();
  });

  it('renders error state with alert semantics', () => {
    render(
      <AssessmentStatusState
        variant="error"
        title="Unable to open material"
        message="The assessment could not be loaded."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to open material');
    expect(screen.getByRole('alert')).toHaveTextContent('The assessment could not be loaded.');
  });

  it('renders optional actions', () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <AssessmentStatusState
        variant="empty"
        title="Nothing here yet"
        action={{ label: 'Create item', onClick: onAction }}
        secondaryAction={{ label: 'Go back', onClick: onSecondaryAction }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it('supports nested heading levels', () => {
    render(
      <AssessmentStatusState
        variant="empty"
        title="Nested state"
        titleLevel={3}
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Nested state' })).toBeInTheDocument();
  });

  it('supports centered display for nested empty states', () => {
    render(
      <AssessmentStatusState
        variant="empty"
        title="No items yet"
        align="center"
      />,
    );

    expect(screen.getByText('No items yet').closest('.assessment-status-state')).toHaveClass(
      'assessment-status-state--align-center',
    );
  });
});
