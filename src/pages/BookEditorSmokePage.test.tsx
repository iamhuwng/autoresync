import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BookEditorSmokePage from './BookEditorSmokePage';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@test.com' },
    profile: { role: 'teacher', displayName: 'Teacher', email: 'teacher@test.com' },
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: vi.fn(),
  }),
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async () => ({ val: () => null })),
  ref: vi.fn((_database, path: string) => ({ path })),
  remove: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('../components/homework/HomeworkCreateModal', () => ({
  HomeworkCreateModal: () => null,
}));

const renderFixture = (fixture: string) =>
  render(
    <MemoryRouter initialEntries={[`/__smoke/book-editor?fixture=${fixture}`]}>
      <BookEditorSmokePage />
    </MemoryRouter>,
  );

describe('BookEditorSmokePage', () => {
  it('renders healthy Book smoke data with the repair region still visible', () => {
    renderFixture('healthy');

    const dialog = screen.getByRole('dialog', { name: 'Smoke Book - Healthy Book' });
    expect(within(dialog).getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    const repairRegion = within(dialog).getByRole('region', { name: 'Book broken refs' });

    expect(within(repairRegion).getByText('All Book refs are usable.')).toBeInTheDocument();
  });

  it('renders owned archived broken ref data with repair, remove, and restore actions', async () => {
    const user = userEvent.setup();
    renderFixture('broken-refs');

    const dialog = screen.getByRole('dialog', { name: 'Smoke Book - Owned Archived Ref' });
    const repairRegion = within(dialog).getByRole('region', { name: 'Book broken refs' });

    expect(within(repairRegion).getByText('Owned archived source')).toBeInTheDocument();
    expect(within(repairRegion).getByText('Removed')).toBeInTheDocument();
    expect(within(repairRegion).getByRole('button', { name: 'Replace broken ref' })).toBeInTheDocument();
    expect(within(repairRegion).getByRole('button', { name: 'Remove broken ref' })).toBeInTheDocument();
    expect(within(repairRegion).getByRole('button', { name: 'Restore source' })).toBeInTheDocument();

    await user.click(within(repairRegion).getByRole('button', { name: 'Replace broken ref' }));

    expect(within(dialog).queryByText('Owned archived source')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Available control passage')).toBeInTheDocument();
  });

  it('hides restore for non-owned archived refs', () => {
    renderFixture('non-owned-archived-ref');

    const repairRegion = screen.getByRole('region', { name: 'Book broken refs' });

    expect(within(repairRegion).getByText('Other teacher archived source')).toBeInTheDocument();
    expect(within(repairRegion).getByText('Removed')).toBeInTheDocument();
    expect(within(repairRegion).queryByRole('button', { name: 'Restore source' })).not.toBeInTheDocument();
  });

  it('renders all broken-ref reason mock data without unsafe payload leakage', () => {
    renderFixture('all-broken-ref-reasons');

    const repairRegion = screen.getByRole('region', { name: 'Book broken refs' });

    expect(within(repairRegion).getAllByRole('button', { name: 'Replace broken ref' })).toHaveLength(6);
    expect(within(repairRegion).getAllByText('Removed')).toHaveLength(2);
    expect(within(repairRegion).getByText('Missing')).toBeInTheDocument();
    expect(within(repairRegion).getByText('No access')).toBeInTheDocument();
    expect(within(repairRegion).getByText('Missing version')).toBeInTheDocument();
    expect(within(repairRegion).getByText('Missing projection')).toBeInTheDocument();
    expect(screen.queryByText('canonical-payload-secret')).not.toBeInTheDocument();
    expect(screen.queryByText('answer-key-secret')).not.toBeInTheDocument();
  });
});
