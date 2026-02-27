// TODO: UPDATE TESTS FOR SESSION CODE SYSTEM (Task 1.7)
// These tests need to be updated to mock session code validation and input
// Expected navigation paths should use dynamic session codes instead of 'active_session'
// Mock validateSessionForJoin from sessionManager.js

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import userEvent from '@testing-library/user-event';

// Mock fetch for IP API
global.fetch = vi.fn();

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the firebase/database module
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
}));

// Mock the firebase service
vi.mock('../services/firebase', () => ({
  database: {},
  auth: {},
}));

// Import the mocked functions after mocking
import { get as mockGet, set as mockSet, ref as mockRef } from 'firebase/database';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage to prevent test pollution
    sessionStorage.clear();
    // Default fetch mock for IP API
    global.fetch.mockResolvedValue({
      json: async () => ({ ip: '192.168.1.1' }),
    });
  });

  it('renders the login page correctly', () => {
    render(
      <BrowserRouter>
        <MantineProvider>
          <LoginPage setShowAdminLogin={() => {}} />
        </MantineProvider>
      </BrowserRouter>
    );

    // Check for the main heading
    expect(screen.getByRole('heading', { name: /join game/i })).toBeInTheDocument();

    // Check for the name input field
    expect(screen.getByPlaceholderText(/enter your name/i)).toBeInTheDocument();

    // Check for the join button
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument();

    // Check for the admin login button
    expect(screen.getByRole('button', { name: /admin login/i })).toBeInTheDocument();
  });

  describe('Duplicate Name Prevention', () => {
    it('should allow joining when no duplicate name exists', async () => {
      // Mock Firebase: 1st call for players (none), 2nd for bans (none)
      mockGet
        .mockResolvedValueOnce({ exists: () => false, val: () => null })
        .mockResolvedValueOnce({ exists: () => false, val: () => null });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'John');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/student-wait/active_session');
      });
    });

    it('should prevent joining when exact duplicate name exists', async () => {
      // Mock Firebase: 1st call for players (has duplicate)
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'John', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'John');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/this name is already taken/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should prevent joining when duplicate name exists with different case (case-insensitive)', async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'John', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'JOHN');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/this name is already taken/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should prevent joining when duplicate name exists with different case variation', async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'JoHn', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'john');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/this name is already taken/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should trim whitespace and prevent duplicate names', async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'John', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, '  John  ');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/this name is already taken/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should display error alert with correct message', async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'Jane', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'Jane');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/name already taken/i)).toBeInTheDocument();
        expect(screen.getByText(/this name is already taken. please choose another./i)).toBeInTheDocument();
      });
    });

    it('should allow closing the error alert', async () => {
      mockGet.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ 'player1': { name: 'Sarah', score: 0 } }),
      });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'Sarah');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/name already taken/i)).toBeInTheDocument();
      });

      const alert = screen.getByRole('alert');
      const closeButton = alert.querySelector('.mantine-Alert-closeButton');
      expect(closeButton).toBeInTheDocument();

      await userEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText(/name already taken/i)).not.toBeInTheDocument();
      });
    });

    it('should clear error on new submission attempt', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => ({ 'player1': { name: 'Mike', score: 0 } }),
        })
        .mockResolvedValueOnce({ exists: () => false, val: () => null })
        .mockResolvedValueOnce({ exists: () => false, val: () => null });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'Mike');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/name already taken/i)).toBeInTheDocument();
      });

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Alex');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/student-wait/active_session');
      });
    });

    it('should handle multiple existing players correctly', async () => {
      // Mock Firebase: 1st call for players (has duplicate "Bob")
      mockGet
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => ({
            'player1': { name: 'Alice', score: 5 },
            'player2': { name: 'Bob', score: 10 },
          }),
        })
        // 2nd call for banned players (should not be reached if duplicate detected)
        .mockResolvedValueOnce({
          exists: () => false,
          val: () => null,
        });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'bob');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(screen.getByText(/this name is already taken/i)).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should allow name that is not in the existing players list', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => ({
            'player1': { name: 'Alice', score: 5 },
            'player2': { name: 'Bob', score: 10 },
          }),
        })
        .mockResolvedValueOnce({
          exists: () => false,
          val: () => null,
        });

      render(
        <BrowserRouter>
          <MantineProvider>
            <LoginPage setShowAdminLogin={() => {}} />
          </MantineProvider>
        </BrowserRouter>
      );

      const nameInput = screen.getByPlaceholderText(/enter your name/i);
      const joinButton = screen.getByRole('button', { name: /join/i });

      await userEvent.type(nameInput, 'David');
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/student-wait/active_session');
      });

      expect(screen.queryByText(/name already taken/i)).not.toBeInTheDocument();
    });
  });
});
