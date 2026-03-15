/**
 * WebMCP Bootstrap — Main Entry Point
 * 
 * Initializes the WebMCP tool registry with core tools and
 * sets up error monitoring. Call this once from main.jsx (dev-only).
 * 
 * @dev-only This entire module tree is only imported in development.
 */

import { registry } from './registry';
import { authTools } from './tools/auth.tools';
import { navigationTools } from './tools/navigation.tools';
import { stateTools } from './tools/state.tools';
import { writingTestTools } from './tools/writing-test.tools';
import { classManagementTools } from './tools/class-management.tools';
import { homeworkTools } from './tools/homework.tools';
import { settingsTools } from './tools/settings.tools';

/**
 * Initialize WebMCP infrastructure.
 * Should be called once at app startup (dev-only).
 */
export function initWebMCP(): void {
    if (!import.meta.env.DEV) {
        console.warn('[WebMCP] Attempted to initialize in production — skipping.');
        return;
    }

    // Check browser support
    if (!registry.isSupported) {
        console.log(
            '%c[WebMCP] Browser does not support WebMCP. Enable chrome://flags/#enable-webmcp-testing in Chrome 146+.',
            'color: #f59e0b; font-weight: bold;'
        );
        console.log(
            '%c[WebMCP] Tools are still registered internally for when you enable the flag.',
            'color: #6b7280;'
        );
    } else {
        console.log(
            '%c[WebMCP] ✅ Browser supports WebMCP! Tools will appear in the Model Context Tool Inspector extension.',
            'color: #10b981; font-weight: bold;'
        );
    }

    // Register core tools (always available)
    registry.registerAll(authTools);
    registry.registerAll(navigationTools);
    registry.registerAll(stateTools);
    registry.registerAll(writingTestTools);
    registry.registerAll(classManagementTools);
    registry.registerAll(homeworkTools);
    registry.registerAll(settingsTools);

    // Set up console error capture
    setupErrorCapture();

    // Initial context update (no route or role yet — login page)
    registry.updateContext(window.location.pathname);

    console.log(
        `%c[WebMCP] Initialized with ${registry.getRegistrations().length} tools registered.`,
        'color: #8b5cf6; font-weight: bold;'
    );
    console.log(
        '%c[WebMCP] Use the Model Context Tool Inspector extension to test tools.',
        'color: #6b7280;'
    );
}

/**
 * Update the WebMCP context when route or user changes.
 * Call this from a React effect that watches route/auth changes.
 */
export function updateWebMCPContext(pathname: string, userRole?: string): void {
    registry.updateContext(pathname, userRole);
}

/**
 * Get the registry instance for advanced use.
 */
export { registry };

// Re-export types for convenience
export type { WebMCPTool, ToolRegistration, ToolCategory } from './types';

/**
 * Set up console.error capture for the check_console_errors tool.
 */
function setupErrorCapture(): void {
    const errorLog: string[] = [];
    const maxErrors = 50;

    // Store on window for the state tools to read
    (window as unknown as { __webmcp_errors: string[] }).__webmcp_errors = errorLog;

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        // Convert args to string
        const message = args.map(a => {
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            if (typeof a === 'object') {
                try { return JSON.stringify(a); } catch { return String(a); }
            }
            return String(a);
        }).join(' ');

        errorLog.push(`[${new Date().toISOString()}] ${message.substring(0, 500)}`);

        // Keep only the last N errors
        while (errorLog.length > maxErrors) {
            errorLog.shift();
        }

        // Still call original console.error
        originalConsoleError(...args);
    };

    // Also capture unhandled errors
    window.addEventListener('error', (event) => {
        errorLog.push(`[${new Date().toISOString()}] UNHANDLED: ${event.message} at ${event.filename}:${event.lineno}`);
        while (errorLog.length > maxErrors) {
            errorLog.shift();
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason instanceof Error
            ? `${event.reason.name}: ${event.reason.message}`
            : String(event.reason);
        errorLog.push(`[${new Date().toISOString()}] PROMISE_REJECT: ${reason.substring(0, 500)}`);
        while (errorLog.length > maxErrors) {
            errorLog.shift();
        }
    });
}
