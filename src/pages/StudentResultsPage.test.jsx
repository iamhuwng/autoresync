// TODO: UPDATE TESTS FOR SESSION CODE SYSTEM (Task 1.7)
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StudentResultsPage from './StudentResultsPage';
import { MantineProvider } from '@mantine/core';
import { ThemeProvider } from '../context/ThemeContext';
import { onValue } from 'firebase/database';

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  getDatabase: vi.fn(),
}));

describe('StudentResultsPage', () => {
  it('should display the student\'s final results', () => {
    const mockGameSession = {
      players: {
        player1: { id: 'player1', name: 'Alice', score: 100 },
        player2: { id: 'player2', name: 'Bob', score: 80 },
        player3: { id: 'player3', name: 'Charlie', score: 120 },
        player4: { id: 'player4', name: 'Dave', score: 90 },
        player5: { id: 'player5', name: 'Eve', score: 110 },
        player6: { id: 'player6', name: 'Frank', score: 70 },
      },
    };

    sessionStorage.setItem('playerId', 'player1');

    onValue.mockImplementation((ref, callback) => {
      callback({ val: () => mockGameSession });
      return vi.fn(); // Return a mock unsubscribe function
    });

    render(
      <MantineProvider>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/student-results/TEST123']}>
            <Routes>
              <Route path="/student-results/:gameSessionId" element={<StudentResultsPage />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </MantineProvider>
    );

    expect(screen.getByText('You finished 3 out of 6!')).toBeInTheDocument();
    const scoreHeading = screen.getByRole('heading', { level: 3 });
    expect(scoreHeading.textContent).toContain('Your final score: 100');
    const listItems = screen.getAllByRole('listitem');
    expect(listItems[0].textContent).toContain('Charlie');
    expect(listItems[0].textContent).toContain('120');
    expect(listItems[1].textContent).toContain('Eve');
    expect(listItems[1].textContent).toContain('110');
    expect(listItems[2].textContent).toContain('Alice');
    expect(listItems[2].textContent).toContain('100');
    expect(listItems[3].textContent).toContain('Dave');
    expect(listItems[3].textContent).toContain('90');
    expect(listItems[4].textContent).toContain('Bob');
    expect(listItems[4].textContent).toContain('80');
  });
});
