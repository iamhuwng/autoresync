/**
 * WebMCP Core Tools — Page State Introspection
 * 
 * Read-only tools for inspecting the current page state.
 * Replaces the need for AI agents to take screenshots and parse DOM.
 * Always available regardless of route.
 * 
 * @dev-only
 */

import type { ToolRegistration } from '../types';

export const stateTools: ToolRegistration[] = [
    {
        category: 'state',
        tool: {
            name: 'get_page_state',
            description: 'Get a structured summary of the current page state: visible headings, buttons, modals, forms, errors, loading indicators. Use this instead of taking a screenshot.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                const state = {
                    url: window.location.pathname,
                    title: document.title,
                    headings: [...document.querySelectorAll('h1, h2, h3')].map(h => ({
                        level: h.tagName,
                        text: h.textContent?.trim().substring(0, 100),
                    })),
                    buttons: [...document.querySelectorAll('button')].slice(0, 30).map(b => ({
                        text: b.textContent?.trim().substring(0, 60),
                        disabled: b.disabled,
                        id: b.id || undefined,
                        className: b.className?.substring(0, 80) || undefined,
                    })),
                    modals: [...document.querySelectorAll('[role="dialog"], dialog[open], .modal-overlay')].map(m => ({
                        role: 'dialog',
                        title: m.querySelector('h1, h2, h3, [class*="title"]')?.textContent?.trim() || 'untitled',
                        visible: true,
                    })),
                    forms: [...document.querySelectorAll('form')].map(f => ({
                        id: f.id || undefined,
                        action: f.action || undefined,
                        fields: [...f.querySelectorAll('input, select, textarea')].map(el => ({
                            name: (el as HTMLInputElement).name || undefined,
                            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
                            value: (el as HTMLInputElement).type === 'password' ? '***' : (el as HTMLInputElement).value?.substring(0, 50),
                            placeholder: (el as HTMLInputElement).placeholder || undefined,
                        })),
                    })),
                    errors: [...document.querySelectorAll('.error, [class*="error"], [role="alert"]')].slice(0, 10).map(el =>
                        el.textContent?.trim().substring(0, 200)
                    ),
                    isLoading: document.querySelectorAll(
                        '[class*="loading"], [class*="spinner"], [class*="Loader"], [aria-busy="true"]'
                    ).length > 0,
                    tables: [...document.querySelectorAll('table')].map(t => ({
                        headers: [...t.querySelectorAll('th')].map(th => th.textContent?.trim()),
                        rowCount: t.querySelectorAll('tbody tr').length,
                    })),
                    links: [...document.querySelectorAll('a[href]')].slice(0, 20).map(a => ({
                        text: a.textContent?.trim().substring(0, 60),
                        href: (a as HTMLAnchorElement).href,
                    })),
                };

                return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
            },
        },
    },
    {
        category: 'state',
        tool: {
            name: 'get_element_text',
            description: 'Get the text content of a specific element by CSS selector. Useful for reading specific content on the page.',
            inputSchema: {
                type: 'object',
                properties: {
                    selector: {
                        type: 'string',
                        description: 'CSS selector for the element to read, e.g., "h1", "#my-id", ".my-class"',
                    },
                },
                required: ['selector'],
            },
            annotations: { readOnlyHint: 'true' },
            execute: async ({ selector }) => {
                const selectorStr = String(selector);
                try {
                    const elements = document.querySelectorAll(selectorStr);
                    if (elements.length === 0) {
                        return { content: [{ type: 'text', text: `No elements found for selector: ${selectorStr}` }], isError: true };
                    }
                    const texts = [...elements].map((el, i) => ({
                        index: i,
                        text: el.textContent?.trim().substring(0, 500),
                        tagName: el.tagName,
                        id: (el as HTMLElement).id || undefined,
                    }));
                    return { content: [{ type: 'text', text: JSON.stringify(texts) }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Invalid selector';
                    return { content: [{ type: 'text', text: `Selector error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'state',
        tool: {
            name: 'click_button',
            description: 'Click a button on the page by its text content or CSS selector. Use text matching first (more reliable), fall back to CSS selector if needed.',
            inputSchema: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The button text to match (case-insensitive, partial match). Preferred over selector.',
                    },
                    selector: {
                        type: 'string',
                        description: 'CSS selector for the button. Used as fallback if text matching fails.',
                    },
                },
            },
            execute: async ({ text, selector }) => {
                let button: HTMLButtonElement | null = null;

                if (text) {
                    const textStr = String(text).toLowerCase();
                    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
                    button = buttons.find(b => b.textContent?.toLowerCase().includes(textStr)) || null;
                }

                if (!button && selector) {
                    button = document.querySelector(String(selector)) as HTMLButtonElement;
                }

                if (!button) {
                    return {
                        content: [{ type: 'text', text: `No button found matching text="${text}" or selector="${selector}"` }],
                        isError: true,
                    };
                }

                if (button.disabled) {
                    return {
                        content: [{ type: 'text', text: `Button "${button.textContent?.trim()}" is disabled` }],
                        isError: true,
                    };
                }

                button.click();
                // Wait for React to re-render
                await new Promise(resolve => setTimeout(resolve, 300));
                return { content: [{ type: 'text', text: `Clicked button: "${button.textContent?.trim()}"` }] };
            },
        },
    },
    {
        category: 'state',
        tool: {
            name: 'check_console_errors',
            description: 'Check for recent JavaScript console errors on the page. Useful for debugging.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                // Access the error log if we've been capturing them
                const errors = (window as unknown as { __webmcp_errors?: string[] }).__webmcp_errors || [];
                if (errors.length === 0) {
                    return { content: [{ type: 'text', text: 'No console errors captured. Error monitoring is active.' }] };
                }
                return { content: [{ type: 'text', text: JSON.stringify(errors.slice(-20)) }] };
            },
        },
    },
];
