import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuroraThemeProvider } from './AuroraThemeProvider.jsx';

describe('AuroraThemeProvider', () => {
  it('renders children inside a native aurora theme shell', () => {
    render(
      <AuroraThemeProvider>
        <div>aurora-child</div>
      </AuroraThemeProvider>
    );

    expect(screen.getByText('aurora-child')).toBeInTheDocument();

    const shell = screen.getByText('aurora-child').closest('[data-app-theme="aurora"]');
    expect(shell).not.toBeNull();
    expect(shell).toHaveStyle({ colorScheme: 'light' });
    expect(shell.style.getPropertyValue('--aurora-lavender-500')).toBe('#8b5cf6');
  });
});
