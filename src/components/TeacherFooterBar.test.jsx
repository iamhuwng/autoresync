import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TeacherFooterBar from './TeacherFooterBar';

import { MantineProvider } from '@mantine/core';

vi.mock('../context/ThemeContext.jsx', () => ({
  useThemeContext: () => ({ template: {} }),
}));

describe('TeacherFooterBar', () => {
  it('renders without crashing', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1300,
    });

    render(
      <MantineProvider>
        <TeacherFooterBar />
      </MantineProvider>
    );
    expect(screen.getByText('Players (0)')).toBeInTheDocument();
  });
});
