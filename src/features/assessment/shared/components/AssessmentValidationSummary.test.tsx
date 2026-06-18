import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssessmentValidationSummary } from './AssessmentValidationSummary';

describe('AssessmentValidationSummary', () => {
  it('renders blocked validation with polite status semantics', () => {
    render(
      <AssessmentValidationSummary
        title="Publish readiness"
        status="blocked"
        summary="Resolve required issues before publishing."
        messages={['Answer key needs review.']}
        issueCount={2}
      />,
    );

    const summary = screen.getByRole('status', { name: 'Publish readiness' });
    expect(summary).toHaveTextContent('Resolve required issues before publishing.');
    expect(summary).toHaveTextContent('Answer key needs review.');
    expect(summary).toHaveTextContent('Issues: 2');
  });

  it('renders ready validation with status semantics', () => {
    render(
      <AssessmentValidationSummary
        title="Publish readiness"
        status="ready"
        summary="Ready to publish."
        issueCount={0}
      />,
    );

    expect(screen.getByRole('status', { name: 'Publish readiness' })).toHaveTextContent('Issues: 0');
  });

  it('supports neutral labels and nested heading levels', () => {
    render(
      <AssessmentValidationSummary
        title="Form check"
        status="blocked"
        summary="Review the form."
        issueCount={1}
        issueLabel="Problems"
        headingLevel={4}
      />,
    );

    expect(screen.getByRole('heading', { level: 4, name: 'Form check' })).toBeInTheDocument();
    expect(screen.getByText('Problems: 1')).toBeInTheDocument();
  });

  it('allows urgent consumers to opt into alert semantics', () => {
    render(
      <AssessmentValidationSummary
        title="Submission failure"
        status="blocked"
        summary="Submission could not continue."
        issueCount={1}
        role="alert"
      />,
    );

    expect(screen.getByRole('alert', { name: 'Submission failure' })).toBeInTheDocument();
  });
});
