import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssessmentAuthoringHeader } from './AssessmentAuthoringHeader';

describe('AssessmentAuthoringHeader', () => {
  it('renders children inside the named neutral header region', () => {
    render(
      <AssessmentAuthoringHeader title="Setup" ariaLabel="Authoring setup header">
        <p>Module-owned helper content</p>
      </AssessmentAuthoringHeader>,
    );

    const region = screen.getByRole('region', { name: 'Authoring setup header' });

    expect(region).toHaveTextContent('Module-owned helper content');
  });

  it('renders module-supplied title and description without owning product copy', () => {
    render(
      <AssessmentAuthoringHeader
        title="Material setup"
        description="Configure the visible assessment details."
      />,
    );

    const region = screen.getByRole('region', { name: 'Material setup' });

    expect(region).toContainElement(screen.getByRole('heading', { name: 'Material setup' }));
    expect(region).toHaveTextContent('Configure the visible assessment details.');
    expect(region).not.toHaveTextContent(/Reading|Listening|audio|parser|storage|runtime|live/i);
  });

  it('supports nested heading levels', () => {
    render(<AssessmentAuthoringHeader title="Review step" headingLevel={3} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Review step' })).toBeInTheDocument();
  });

  it('renders status and action slots without binding handlers or labels', () => {
    render(
      <AssessmentAuthoringHeader
        title="Questions"
        status={<span>Ready</span>}
        action={<button type="button">Add item</button>}
      />,
    );

    const region = screen.getByRole('region', { name: 'Questions' });

    expect(region).toHaveTextContent('Ready');
    expect(within(region).getByRole('button', { name: 'Add item' })).toBeInTheDocument();
  });

  it('preserves falsy ReactNode slot values instead of treating them as absent', () => {
    render(
      <AssessmentAuthoringHeader
        title="Counts"
        description={0}
        status={0}
        action={0}
      >
        {0}
      </AssessmentAuthoringHeader>,
    );

    const region = screen.getByRole('region', { name: 'Counts' });

    expect(region.querySelector('.assessment-authoring-header__description')).toHaveTextContent(
      '0',
    );
    expect(region.querySelector('.assessment-authoring-header__status')).toHaveTextContent('0');
    expect(region.querySelector('.assessment-authoring-header__action')).toHaveTextContent('0');
    expect(region.querySelector('.assessment-authoring-header__content')).toHaveTextContent('0');
  });

  it('uses the title as the accessible region name unless an explicit label is supplied', () => {
    const { rerender } = render(<AssessmentAuthoringHeader title="Default label" />);

    expect(screen.getByRole('region', { name: 'Default label' })).toBeInTheDocument();

    rerender(
      <AssessmentAuthoringHeader title="Visible title" ariaLabel="Explicit neutral label" />,
    );

    const region = screen.getByRole('region', { name: 'Explicit neutral label' });

    expect(region).toContainElement(screen.getByRole('heading', { name: 'Visible title' }));
  });

  it('exposes neutral mobile and always-stacked layout modes', () => {
    const { rerender } = render(<AssessmentAuthoringHeader title="Mobile stack" />);

    expect(screen.getByRole('region', { name: 'Mobile stack' })).toHaveClass(
      'assessment-authoring-header--stack-mobile',
    );

    rerender(<AssessmentAuthoringHeader title="Always stack" stackAt="always" />);

    expect(screen.getByRole('region', { name: 'Always stack' })).toHaveClass(
      'assessment-authoring-header--stack-always',
    );
  });
});
