/**
 * Modern Pastel Design System
 * Soft, futuristic, dynamic aesthetic with cohesive color palette
 */

export const colors = {
  // Soft Pastel Primary Palette
  pastel: {
    lavender: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
    },
    rose: {
      50: '#fff1f2',
      100: '#ffe4e6',
      200: '#fecdd3',
      300: '#fda4af',
      400: '#fb7185',
      500: '#f43f5e',
      600: '#e11d48',
      700: '#be123c',
      800: '#9f1239',
      900: '#881337',
    },
    sky: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
    },
    mint: {
      50: '#f0fdfa',
      100: '#ccfbf1',
      200: '#99f6e4',
      300: '#5eead4',
      400: '#2dd4bf',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      800: '#115e59',
      900: '#134e4a',
    },
    peach: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
    },
    lilac: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7',
      600: '#9333ea',
      700: '#7e22ce',
      800: '#6b21a8',
      900: '#581c87',
    },
  },

  // Neutral Pastels
  neutral: {
    white: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    black: '#000000',
  },

  // Semantic Colors
  success: {
    light: '#d1fae5',
    main: '#10b981',
    dark: '#059669',
  },
  error: {
    light: '#fee2e2',
    main: '#ef4444',
    dark: '#dc2626',
  },
  warning: {
    light: '#fef3c7',
    main: '#f59e0b',
  },
  info: {
    light: '#dbeafe',
    main: '#3b82f6',
  },
};

export const gradients = {
  // Soft Pastel Gradients
  aurora: 'linear-gradient(135deg, #a78bfa 0%, #c084fc 25%, #fb7185 50%, #fda4af 75%, #fecdd3 100%)',
  sunset: 'linear-gradient(135deg, #fb923c 0%, #fdba74 25%, #fda4af 50%, #fecdd3 100%)',
  ocean: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 25%, #7dd3fc 50%, #bae6fd 100%)',
  mint: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 25%, #5eead4 50%, #99f6e4 100%)',
  lavender: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 25%, #c4b5fd 50%, #ddd6fe 100%)',
  rose: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 25%, #fda4af 50%, #fecdd3 100%)',
  
  // Background Gradients
  lightBg: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
  darkBg: 'linear-gradient(135deg, #1e1b4b 0%, #1e293b 25%, #0f172a 50%, #1e1b4b 100%)',
  
  // Mesh Gradients (for modern backgrounds)
  mesh1: 'radial-gradient(at 40% 20%, #a78bfa 0px, transparent 50%), radial-gradient(at 80% 0%, #fb7185 0px, transparent 50%), radial-gradient(at 0% 50%, #38bdf8 0px, transparent 50%), radial-gradient(at 80% 50%, #5eead4 0px, transparent 50%), radial-gradient(at 0% 100%, #c084fc 0px, transparent 50%), radial-gradient(at 80% 100%, #fdba74 0px, transparent 50%)',
  mesh2: 'radial-gradient(at 27% 37%, #a78bfa 0px, transparent 50%), radial-gradient(at 97% 21%, #fb7185 0px, transparent 50%), radial-gradient(at 52% 99%, #38bdf8 0px, transparent 50%), radial-gradient(at 10% 29%, #5eead4 0px, transparent 50%), radial-gradient(at 97% 96%, #c084fc 0px, transparent 50%), radial-gradient(at 33% 50%, #fdba74 0px, transparent 50%)',
};

export const shadows = {
  // Soft, elevated shadows
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  
  // Colored shadows for depth
  lavender: '0 10px 40px -10px rgba(139, 92, 246, 0.3)',
  rose: '0 10px 40px -10px rgba(244, 63, 94, 0.3)',
  sky: '0 10px 40px -10px rgba(14, 165, 233, 0.3)',
  mint: '0 10px 40px -10px rgba(20, 184, 166, 0.3)',
  
  // Glass shadows
  glass: '0 8px 32px 0 rgba(31, 38, 135, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
  glassHover: '0 12px 48px 0 rgba(31, 38, 135, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
};

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
  32: '8rem',     // 128px
};

export const borderRadius = {
  none: '0',
  sm: '0.375rem',   // 6px
  base: '0.5rem',   // 8px
  md: '0.75rem',    // 12px
  lg: '1rem',       // 16px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '2rem',    // 32px
  full: '9999px',
};

export const typography = {
  fontFamily: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
    display: "'Poppins', 'Inter', sans-serif",
    mono: "'Fira Code', 'Consolas', 'Monaco', monospace",
  },
  fontSize: {
    xs: '0.75rem',      // 12px
    sm: '0.875rem',     // 14px
    base: '1rem',       // 16px
    lg: '1.125rem',     // 18px
    xl: '1.25rem',      // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    '4xl': '2.25rem',   // 36px
    '5xl': '3rem',      // 48px
    '6xl': '3.75rem',   // 60px
    '7xl': '4.5rem',    // 72px
  },
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
};

export const animations = {
  // Durations
  duration: {
    fast: '150ms',
    base: '250ms',
    slow: '350ms',
    slower: '500ms',
  },
  
  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  
  // Keyframes
  keyframes: {
    fadeIn: `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    slideUp: `
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `,
    slideDown: `
      @keyframes slideDown {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `,
    scaleIn: `
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `,
    float: `
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
    `,
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `,
    shimmer: `
      @keyframes shimmer {
        0% { background-position: -1000px 0; }
        100% { background-position: 1000px 0; }
      }
    `,
    gradientShift: `
      @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    `,
  },
};

export const glassmorphism = {
  subtle: {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(12px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
  },
  base: {
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(16px) saturate(200%)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
  },
  strong: {
    background: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px) saturate(220%)',
    border: '1px solid rgba(255, 255, 255, 0.5)',
  },
};

export const breakpoints = {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export default {
  colors,
  gradients,
  shadows,
  spacing,
  borderRadius,
  typography,
  animations,
  glassmorphism,
  breakpoints,
};
