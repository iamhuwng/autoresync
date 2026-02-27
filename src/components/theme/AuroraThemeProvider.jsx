import React from 'react';
import PropTypes from 'prop-types';
import { MantineProvider, createTheme } from '@mantine/core';

/**
 * AuroraThemeProvider - Provides Aurora theme styling
 */
export const AuroraThemeProvider = ({ children }) => {
  const auroraTheme = createTheme({
    primaryColor: 'lavender',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    defaultRadius: 'lg',
    colors: {
      lavender: [
        '#f5f3ff',
        '#ede9fe',
        '#ddd6fe',
        '#c4b5fd',
        '#a78bfa',
        '#8b5cf6',
        '#7c3aed',
        '#6d28d9',
        '#5b21b6',
        '#4c1d95',
      ],
      rose: [
        '#fff1f2',
        '#ffe4e6',
        '#fecdd3',
        '#fda4af',
        '#fb7185',
        '#f43f5e',
        '#e11d48',
        '#be123c',
        '#9f1239',
        '#881337',
      ],
      sky: [
        '#f0f9ff',
        '#e0f2fe',
        '#bae6fd',
        '#7dd3fc',
        '#38bdf8',
        '#0ea5e9',
        '#0284c7',
        '#0369a1',
        '#075985',
        '#0c4a6e',
      ],
      mint: [
        '#f0fdfa',
        '#ccfbf1',
        '#99f6e4',
        '#5eead4',
        '#2dd4bf',
        '#14b8a6',
        '#0d9488',
        '#0f766e',
        '#115e59',
        '#134e4a',
      ],
      peach: [
        '#fff7ed',
        '#ffedd5',
        '#fed7aa',
        '#fdba74',
        '#fb923c',
        '#f97316',
        '#ea580c',
        '#c2410c',
        '#9a3412',
        '#7c2d12',
      ],
    },
    shadows: {
      xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    },
    radius: {
      xs: '0.375rem',
      sm: '0.5rem',
      md: '0.75rem',
      lg: '1rem',
      xl: '1.5rem',
    },
  });

  return (
    <MantineProvider theme={auroraTheme} defaultColorScheme="light">
      {children}
    </MantineProvider>
  );
};

AuroraThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuroraThemeProvider;
