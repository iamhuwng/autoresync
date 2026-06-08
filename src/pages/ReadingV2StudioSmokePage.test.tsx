import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import ReadingV2StudioSmokePage from './ReadingV2StudioSmokePage';

const renderSmokeRoute = (fixture: string) =>
  render(
    <MemoryRouter initialEntries={[`/__smoke/reading-v2-studio?fixture=${fixture}`]}>
      <ReadingV2StudioSmokePage />
    </MemoryRouter>,
  );

describe('ReadingV2StudioSmokePage', () => {
  it('reproduces the pasted Cam 16 diagnostic warning panel as compact question rows', () => {
    renderSmokeRoute('cam16-test4-diagnostics');

    fireEvent.click(screen.getByRole('button', { name: '3 validation items' }));

    const panel = screen.getByRole('dialog', { name: 'Review issues' });
    expect(within(panel).getByText('3 review items')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Question 23: Wrong Judgement Vocabulary' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Question 24: Wrong Judgement Vocabulary' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Question 26: Wrong Judgement Vocabulary' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Show source' })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Interaction ielts-reading-v2-test-june-2026-q23/i)).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Question 23: Wrong Judgement Vocabulary' }));

    expect(screen.queryByRole('dialog', { name: 'Review issues' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Review guidance for Question 23')).toHaveAttribute('data-review-focus', 'true');
  });
});
