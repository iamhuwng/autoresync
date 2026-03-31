import React from 'react';
import RestoreBanner from '../components/RestoreBanner.tsx';
import { ThemeProvider } from '../context/ThemeContext.jsx';

interface AuthenticatedChromeProps {
  children: React.ReactNode;
}

export default function AuthenticatedChrome({ children }: AuthenticatedChromeProps) {
  return (
    <ThemeProvider>
      <RestoreBanner />
      {children}
    </ThemeProvider>
  );
}
