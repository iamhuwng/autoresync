/**
 * useWebMCP React Hook
 * 
 * Automatically updates WebMCP tool context when the route or user changes.
 * Place this in App.jsx to keep tools in sync with the current page state.
 * 
 * @dev-only This hook is a no-op in production builds.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Hook that syncs WebMCP tool context with current route and user role.
 * Must be called inside a React Router context (BrowserRouter).
 * 
 * @param userRole - The current user's role ('teacher', 'student', 'super_admin')
 */
export function useWebMCP(userRole?: string): void {
    const location = useLocation();

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        // Dynamic import to avoid bundling in production
        import('./index').then(({ updateWebMCPContext }) => {
            updateWebMCPContext(location.pathname, userRole);
        });
    }, [location.pathname, userRole]);
}
