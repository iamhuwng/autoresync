/**
 * Test Utilities for Vitest + React Testing Library + Mantine
 * 
 * USAGE: Import `render` from this file instead of @testing-library/react
 * 
 * @see documentation/sop/vitest-mantine-testing-guide.md
 */

import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';

// ============================================
// PROVIDERS WRAPPER
// ============================================

interface AllProvidersProps {
    children: ReactNode;
}

/**
 * Wraps components with all required providers for testing
 * - MantineProvider (required for Mantine components)
 * - BrowserRouter (required for navigation/Links)
 */
function AllProviders({ children }: AllProvidersProps) {
    return (
        <MantineProvider>
            <BrowserRouter>
                {children}
            </BrowserRouter>
        </MantineProvider>
    );
}

// ============================================
// CUSTOM RENDER
// ============================================

/**
 * Custom render function that wraps component with all providers
 * 
 * @example
 * // Use this instead of @testing-library/react render
 * import { render, screen } from '@/test/test-utils';
 * 
 * render(<MyComponent />);
 * expect(screen.getByText('Hello')).toBeInTheDocument();
 */
const customRender = (
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options });

// ============================================
// RE-EXPORTS
// ============================================

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override render with our custom version
export { customRender as render };

// Export userEvent separately (needs to be imported explicitly)
export { default as userEvent } from '@testing-library/user-event';
