import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { AuroraThemeProvider } from '../components/theme/AuroraThemeProvider.jsx';

const ThemeContext = createContext(undefined);

const getInitialColorScheme = () => {
  return 'light'; // Always use light mode
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('legacy');
  const [colorScheme, setColorScheme] = useState('light'); // Always light mode

  const contextValue = useMemo(() => ({
    theme,
    template: theme,
    setTheme,
    colorScheme: 'light', // Always light mode
    setColorScheme: () => {}, // No-op since we don't change themes
    isAurora: theme === 'aurora',
    isLegacy: theme !== 'aurora'
  }), [theme, colorScheme]);

  const themedChildren = theme === 'aurora'
    ? (
      <AuroraThemeProvider>
        {children}
      </AuroraThemeProvider>
    )
    : children;

  return (
    <ThemeContext.Provider value={contextValue}>
      <MantineProvider forceColorScheme="light">
        {themedChildren}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
