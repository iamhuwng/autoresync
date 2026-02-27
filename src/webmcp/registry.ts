/**
 * WebMCP Tool Registry
 * 
 * Manages the lifecycle of WebMCP tool registrations.
 * Handles dynamic registration/unregistration based on current route and user role.
 * 
 * @dev-only This module is only loaded in development builds.
 */

import type { WebMCPTool, ToolRegistration, ToolCategory } from './types';

class WebMCPRegistry {
    private registrations: Map<string, ToolRegistration> = new Map();
    private activeTools: Set<string> = new Set();
    private _isSupported: boolean = false;

    constructor() {
        this._isSupported = typeof navigator !== 'undefined' && !!navigator.modelContext;
    }

    /** Whether the browser supports WebMCP (Chrome 146+ with flag enabled) */
    get isSupported(): boolean {
        return this._isSupported;
    }

    /** Register a tool with metadata about when it should be active */
    register(registration: ToolRegistration): void {
        this.registrations.set(registration.tool.name, registration);
    }

    /** Register multiple tools at once */
    registerAll(registrations: ToolRegistration[]): void {
        for (const reg of registrations) {
            this.register(reg);
        }
    }

    /** Unregister a tool by name */
    unregister(name: string): void {
        this.registrations.delete(name);
        if (this.activeTools.has(name)) {
            navigator.modelContext?.unregisterTool(name);
            this.activeTools.delete(name);
        }
    }

    /**
     * Update active tools based on current context.
     * Called whenever the route or user role changes.
     */
    updateContext(pathname: string, userRole?: string): void {
        if (!this._isSupported || !navigator.modelContext) {
            return;
        }

        const toolsToActivate: WebMCPTool[] = [];

        for (const [_name, reg] of this.registrations) {
            const routeMatch = !reg.activeRoutes || reg.activeRoutes.length === 0 ||
                reg.activeRoutes.some(pattern => this.matchRoute(pathname, pattern));

            const roleMatch = !reg.allowedRoles || reg.allowedRoles.length === 0 ||
                (userRole && reg.allowedRoles.includes(userRole));

            if (routeMatch && roleMatch) {
                toolsToActivate.push(reg.tool);
            }
        }

        // Replace all tools at once (provideContext replaces the entire set)
        navigator.modelContext.provideContext({ tools: toolsToActivate });

        // Track what's active
        this.activeTools.clear();
        for (const tool of toolsToActivate) {
            this.activeTools.add(tool.name);
        }

        if (import.meta.env.DEV) {
            console.log(
                `[WebMCP] Updated context: ${toolsToActivate.length} tools active for ${pathname} (role: ${userRole || 'none'})`,
                toolsToActivate.map(t => t.name)
            );
        }
    }

    /** Clear all active tools from the browser */
    clearAll(): void {
        navigator.modelContext?.clearContext();
        this.activeTools.clear();
    }

    /** Get all registered tools */
    getRegistrations(): ToolRegistration[] {
        return Array.from(this.registrations.values());
    }

    /** Get currently active tool names */
    getActiveTools(): string[] {
        return Array.from(this.activeTools);
    }

    /** Get tools by category */
    getByCategory(category: ToolCategory): ToolRegistration[] {
        return Array.from(this.registrations.values())
            .filter(reg => reg.category === category);
    }

    /** Simple route pattern matching (supports * wildcard and :param) */
    private matchRoute(pathname: string, pattern: string): boolean {
        // Exact match
        if (pattern === pathname) return true;

        // Wildcard: /teacher/* matches /teacher/anything
        if (pattern.endsWith('/*')) {
            const prefix = pattern.slice(0, -2);
            return pathname.startsWith(prefix);
        }

        // Param match: /student/homework/:id matches /student/homework/abc123
        const patternParts = pattern.split('/');
        const pathParts = pathname.split('/');
        if (patternParts.length !== pathParts.length) return false;

        return patternParts.every((part, i) =>
            part.startsWith(':') || part === pathParts[i]
        );
    }
}

/** Singleton registry instance */
export const registry = new WebMCPRegistry();
