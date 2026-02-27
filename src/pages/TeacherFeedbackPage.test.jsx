import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TeacherFeedbackPage from '../pages/TeacherFeedbackPage';
import { MemoryRouter } from 'react-router-dom';

import { ThemeProvider } from '../context/ThemeContext';
import { MantineProvider } from '@mantine/core';

// Mock the useParams and useNavigate hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ gameSessionId: 'test-session' }),
    useNavigate: () => vi.fn(),
  };
});

describe('TeacherFeedbackPage', () => {
  it('renders without crashing', () => {
    render(
      <MantineProvider>
        <ThemeProvider>
          <MemoryRouter>
            <TeacherFeedbackPage />
          </MemoryRouter>
        </ThemeProvider>
      </MantineProvider>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
