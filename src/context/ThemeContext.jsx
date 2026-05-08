import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import '@mantine/core/styles.css';
import { AuroraThemeProvider } from '../components/theme/AuroraThemeProvider.jsx';

const ThemeContext = createContext(undefined);

const getInitialColorScheme = () => {
  return 'light'; // Always use light mode
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('legacy');
  const [colorScheme, setColorScheme] = useState('light'); // Always light mode
  const [MantineProviderComponent, setMantineProviderComponent] = useState(null);
  const [mantineLoadFailed, setMantineLoadFailed] = useState(false);

  useEffect(() => {
    let isSubscribed = true;

    import('@mantine/core')
      .then(({ MantineProvider }) => {
        if (!isSubscribed) return;
        setMantineProviderComponent(() => MantineProvider);
      })
      .catch((error) => {
        console.error('[ThemeContext] Failed to load MantineProvider:', error);
        if (!isSubscribed) return;
        setMantineLoadFailed(true);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

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

  const themeBootstrapFallback = mantineLoadFailed ? (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          borderRadius: '1rem',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.12)',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem', color: '#0f172a', fontSize: '1.1rem' }}>Unable to load workspace theme</h2>
        <p style={{ margin: '0 0 1rem', color: '#64748b', lineHeight: 1.5 }}>
          A required UI dependency did not finish loading. Reload the page to fetch a fresh bundle.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            border: 'none',
            borderRadius: '999px',
            background: '#4f46e5',
            color: '#fff',
            padding: '0.75rem 1.2rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    </div>
  ) : (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '4px solid rgba(79, 70, 229, 0.15)',
          borderTopColor: '#4f46e5',
          animation: 'theme-context-spin 0.9s linear infinite',
        }}
      />
      <style>{'@keyframes theme-context-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {MantineProviderComponent ? (
        <MantineProviderComponent forceColorScheme="light">
          {themedChildren}
        </MantineProviderComponent>
      ) : themeBootstrapFallback}
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
