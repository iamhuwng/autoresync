import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TeacherFooterBar from './TeacherFooterBar';

import { ThemeProvider } from '../context/ThemeContext.jsx';
import { MantineProvider } from '@mantine/core';

describe('TeacherFooterBar', () => {
  it('renders without crashing', () => {
    render(
      <MantineProvider>
        <ThemeProvider>
          <TeacherFooterBar />
        </ThemeProvider>
      </MantineProvider>
    );
    expect(screen.getByText('👥 0')).toBeInTheDocument();
  });
});
