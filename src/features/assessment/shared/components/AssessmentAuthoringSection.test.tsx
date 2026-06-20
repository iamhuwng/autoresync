import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssessmentAuthoringSection } from './AssessmentAuthoringSection';

describe('AssessmentAuthoringSection', () => {
  it('renders neutral authoring structure and optional header slots', () => {
    render(
      <AssessmentAuthoringSection
        title="Questions (0/10)"
        description="Build the assessment questions."
        status={<span>Draft</span>}
        action={<button type="button">Add Question</button>}
      >
        <p>No questions added yet</p>
      </AssessmentAuthoringSection>,
    );

    const section = screen.getByRole('region', { name: 'Questions (0/10)' });
    expect(section).toContainElement(
      screen.getByRole('heading', { level: 2, name: 'Questions (0/10)' }),
    );
    expect(section).toHaveTextContent('Build the assessment questions.');
    expect(section).toHaveTextContent('Draft');
    expect(section).toContainElement(screen.getByRole('button', { name: 'Add Question' }));
    expect(section).toHaveTextContent('No questions added yet');
  });

  it('supports a nested heading level without requiring optional slots', () => {
    render(
      <AssessmentAuthoringSection title="Answer key" headingLevel={3}>
        <p>Answer content</p>
      </AssessmentAuthoringSection>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Answer key' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Answer key' })).toHaveTextContent('Answer content');
  });

  it('allows an explicit region label while preserving the visible heading', () => {
    render(
      <AssessmentAuthoringSection
        title="Accessibility And Runtime Advisories"
        ariaLabel="Accessibility and runtime advisories"
        headingLevel={3}
      >
        <p>Guidance content</p>
      </AssessmentAuthoringSection>,
    );

    const section = screen.getByRole('region', { name: 'Accessibility and runtime advisories' });

    expect(section).toContainElement(
      screen.getByRole('heading', { level: 3, name: 'Accessibility And Runtime Advisories' }),
    );
  });
});
