/**
 * Navigation Context Hook
 * Manages active page state and breadcrumb generation
 * Provides navigation helpers for consistent routing
 */

import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ROUTES, RouteName } from '@/constants/routes';
import {
    buildBreadcrumbTrail,
    getParentRoute,
    isRootRoute,
    BreadcrumbItem,
} from '@/config/breadcrumbConfig';

export interface NavigationContext {
    /** Current active page route name */
    activePage: RouteName | null;
    /** Breadcrumb trail from root to current page */
    breadcrumbs: BreadcrumbItem[];
    /** Whether breadcrumbs are currently loading */
    isLoadingBreadcrumbs: boolean;
    /** Navigate to parent page (for back button) */
    navigateToParent: () => void;
    /** Navigate to specific route */
    navigateTo: (route: RouteName, params?: Record<string, string>) => void;
    /** Check if current page is root (no back button needed) */
    isRoot: boolean;
}

/**
 * Hook for managing navigation context
 * Automatically determines active page from current route
 * and builds breadcrumb trail
 * 
 * @example
 * const { activePage, breadcrumbs, navigateToParent } = useNavigationContext();
 * 
 * return (
 *   <Header>
 *     <BackButton onClick={navigateToParent} />
 *     <Breadcrumbs items={breadcrumbs} />
 *   </Header>
 * );
 */
export const useNavigationContext = (): NavigationContext => {
    const location = useLocation();
    const navigate = useNavigate();
    const params = useParams();

    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
    const [isLoadingBreadcrumbs, setIsLoadingBreadcrumbs] = useState(false);

    /**
     * Determine active page from current pathname
     * Matches pathname against all route patterns
     */
    const activePage = useMemo((): RouteName | null => {
        const pathname = location.pathname;

        // Try to match pathname against all routes
        for (const [routeName, routePath] of Object.entries(ROUTES)) {
            if (matchPathname(pathname, routePath)) {
                return routeName as RouteName;
            }
        }

        return null;
    }, [location.pathname]);

    /**
     * Check if current page is a root route
     */
    const isRoot = useMemo(() => {
        return activePage ? isRootRoute(activePage) : false;
    }, [activePage]);

    /**
     * Build breadcrumb trail when route changes
     */
    useEffect(() => {
        const buildBreadcrumbs = async () => {
            if (!activePage) {
                setBreadcrumbs([]);
                return;
            }

            setIsLoadingBreadcrumbs(true);

            try {
                const trail = await buildBreadcrumbTrail(activePage, params as Record<string, string>);
                setBreadcrumbs(trail);
            } catch (error) {
                console.error('Failed to build breadcrumbs:', error);
                setBreadcrumbs([]);
            } finally {
                setIsLoadingBreadcrumbs(false);
            }
        };

        buildBreadcrumbs();
    }, [activePage, params]);

    /**
     * Navigate to parent page (for back button)
     */
    const navigateToParent = () => {
        if (!activePage) return;

        const parentRoute = getParentRoute(activePage);
        if (!parentRoute) {
            console.warn('No parent route found, cannot navigate back');
            return;
        }

        const parentPath = ROUTES[parentRoute];
        navigate(parentPath);
    };

    /**
     * Navigate to specific route with params
     */
    const navigateTo = (route: RouteName, routeParams?: Record<string, string>) => {
        let path = ROUTES[route];

        // Inject parameters into path
        if (routeParams) {
            Object.entries(routeParams).forEach(([key, value]) => {
                path = path.replace(`:${key}`, value);
            });
        }

        navigate(path);
    };

    return {
        activePage,
        breadcrumbs,
        isLoadingBreadcrumbs,
        navigateToParent,
        navigateTo,
        isRoot,
    };
};

/**
 * Match a pathname against a route pattern
 * Handles dynamic segments (e.g., :sessionCode)
 * 
 * @param pathname - Current pathname (e.g., "/teacher/classes/123")
 * @param pattern - Route pattern (e.g., "/teacher/classes/:classId")
 * @returns True if pathname matches pattern
 */
function matchPathname(pathname: string, pattern: string): boolean {
    const pathSegments = pathname.split('/').filter(Boolean);
    const patternSegments = pattern.split('/').filter(Boolean);

    // Different number of segments = no match
    if (pathSegments.length !== patternSegments.length) {
        return false;
    }

    // Check each segment
    for (let i = 0; i < pathSegments.length; i++) {
        const pathSegment = pathSegments[i];
        const patternSegment = patternSegments[i];

        if (!pathSegment || !patternSegment) continue;

        // Dynamic segment (starts with :) matches anything
        if (patternSegment.startsWith(':')) {
            continue;
        }

        // Static segment must match exactly
        if (pathSegment !== patternSegment) {
            return false;
        }
    }

    return true;
}
