import { createElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TestBuilderRouter from './TestBuilderRouter';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}));
vi.mock('../skills/listening/builders/ListeningTestBuilder', () => ({ default: () => null }));
vi.mock('./WritingTestBuilder', () => ({ default: () => null }));
vi.mock('./RetiredMaterialNoticePage', () => ({ default: () => null }));

describe('TestBuilderRouter', () => {
  it('hands existing material edits to the canonical Teacher Lobby editor dispatcher', async () => {
    render(createElement(MemoryRouter, { initialEntries: ['/create-test?edit=material-123'] }, createElement(TestBuilderRouter)));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/lobby', {
      replace: true,
      state: { editMaterialId: 'material-123', editSource: 'material-profile' },
    }));
  });
});
