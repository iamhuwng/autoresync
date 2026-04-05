import React from 'react';
import PropTypes from 'prop-types';

const auroraThemeStyle = {
  '--aurora-lavender-50': '#f5f3ff',
  '--aurora-lavender-100': '#ede9fe',
  '--aurora-lavender-200': '#ddd6fe',
  '--aurora-lavender-300': '#c4b5fd',
  '--aurora-lavender-400': '#a78bfa',
  '--aurora-lavender-500': '#8b5cf6',
  '--aurora-lavender-600': '#7c3aed',
  '--aurora-lavender-700': '#6d28d9',
  '--aurora-lavender-800': '#5b21b6',
  '--aurora-lavender-900': '#4c1d95',
  '--aurora-rose-500': '#f43f5e',
  '--aurora-sky-500': '#0ea5e9',
  '--aurora-mint-500': '#14b8a6',
  '--aurora-peach-500': '#f97316',
  '--aurora-shadow-xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  '--aurora-shadow-sm': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  '--aurora-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  '--aurora-shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  '--aurora-shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '--aurora-radius-xs': '0.375rem',
  '--aurora-radius-sm': '0.5rem',
  '--aurora-radius-md': '0.75rem',
  '--aurora-radius-lg': '1rem',
  '--aurora-radius-xl': '1.5rem',
  colorScheme: 'light',
};

/**
 * AuroraThemeProvider - Applies Aurora design tokens without mounting a nested UI provider.
 *
 * The authenticated app shell already owns the global MantineProvider boundary.
 * This wrapper only scopes Aurora-specific CSS variables to the subtree.
 */
export const AuroraThemeProvider = ({ children }) => {
  return (
    <div data-app-theme="aurora" style={auroraThemeStyle}>
      {children}
    </div>
  );
};

AuroraThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuroraThemeProvider;
