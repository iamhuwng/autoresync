import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { AuroraThemeProvider } from '../components/theme/AuroraThemeProvider.jsx';

const ThemeContext = createContext(undefined);

const LEGACY_THEME = createTheme({});

const getInitialColorScheme = () => {
  return 'light'; // Always use light mode
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('legacy');
  const [colorScheme, setColorScheme] = useState('light'); // Always light mode

  const contextValue = useMemo(() => ({
    theme,
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
    : (
      <MantineProvider theme={LEGACY_THEME} defaultColorScheme="light">
        {children}
      </MantineProvider>
    );

  return (
    <ThemeContext.Provider value={contextValue}>
      {themedChildren}
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
