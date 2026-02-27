// TODO: UPDATE TESTS FOR SESSION CODE SYSTEM (Task 1.7)
// Use mock session code 'TEST123' instead of 'active_session'

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeacherResultsPage from './TeacherResultsPage';
import { MantineProvider } from '@mantine/core';
import { ThemeProvider } from '../context/ThemeContext';
import { onValue } from 'firebase/database';

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock('react-confetti', () => ({
  __esModule: true,
  default: () => <div>Confetti</div>,
}));

describe('TeacherResultsPage', () => {
  it('should display the final results for all players', () => {
    const mockGameSession = {
      players: {
        player1: { name: 'Alice', score: 100 },
        player2: { name: 'Bob', score: 80 },
        player3: { name: 'Charlie', score: 120 },
      },
    };

    onValue.mockImplementation((ref, callback) => {
      callback({ val: () => mockGameSession });
      return vi.fn(); // Return a mock unsubscribe function
    });

    render(
      <MantineProvider>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/teacher-results/TEST123']}>
            <Routes>
              <Route path="/teacher-results/:gameSessionId" element={<TeacherResultsPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </MantineProvider>
    );

    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });
});