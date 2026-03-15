import type { ToolRegistration, ToolResult } from '../types';

function successResult(payload: unknown): ToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
    };
}

function errorResult(message: string): ToolResult {
    return {
        content: [{ type: 'text', text: message }],
        isError: true,
    };
}

function setFieldValue(element: HTMLInputElement, value: string): void {
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

function getSettingsSectionButton(section: 'api_keys' | 'tags'): HTMLButtonElement | null {
    const ariaLabel = section === 'tags'
        ? 'Show tags settings section'
        : 'Show API keys settings section';

    return document.querySelector(`button[aria-label="${ariaLabel}"]`) as HTMLButtonElement | null;
}

function getVisibleHomeworkTagLabels(): string[] {
    return Array.from(document.querySelectorAll('button[aria-label^="Delete tag "]'))
        .map((element) => element.getAttribute('aria-label')?.replace(/^Delete tag\s+/i, '').trim() || '')
        .filter(Boolean);
}

function findDeleteTagButton(label: string): HTMLButtonElement | null {
    const normalizedLabel = label.trim().toLowerCase();
    return Array.from(document.querySelectorAll('button[aria-label^="Delete tag "]'))
        .find((element): element is HTMLButtonElement => {
            if (!(element instanceof HTMLButtonElement)) {
                return false;
            }

            const ariaLabel = element.getAttribute('aria-label')?.replace(/^Delete tag\s+/i, '').trim().toLowerCase() || '';
            return ariaLabel === normalizedLabel;
        }) || null;
}

async function ensureTagsSection(): Promise<void> {
    const button = getSettingsSectionButton('tags');
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
}

export const settingsTools: ToolRegistration[] = [
    {
        category: 'admin',
        activeRoutes: ['/admin/settings'],
        allowedRoles: ['super_admin'],
        tool: {
            name: 'show_admin_settings_tags_section',
            description: 'Switch the admin settings page to the Tags section.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = getSettingsSectionButton('tags');
                if (!button) {
                    return errorResult('Could not find the Tags settings section button.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    section: 'tags',
                    visible: Boolean(document.querySelector('[aria-label="New tag label"]')),
                });
            },
        },
    },
    {
        category: 'admin',
        activeRoutes: ['/admin/settings'],
        allowedRoles: ['super_admin'],
        tool: {
            name: 'get_admin_homework_tags',
            description: 'Read the currently visible homework tags from the admin settings Tags section.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                await ensureTagsSection();
                return successResult({
                    tags: getVisibleHomeworkTagLabels(),
                });
            },
        },
    },
    {
        category: 'admin',
        activeRoutes: ['/admin/settings'],
        allowedRoles: ['super_admin'],
        tool: {
            name: 'add_admin_homework_tag',
            description: 'Add a homework tag from the admin settings Tags section.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Tag id to save, e.g. practice-set-2.',
                    },
                    label: {
                        type: 'string',
                        description: 'Visible tag label to save.',
                    },
                    color: {
                        type: 'string',
                        description: 'Hex color value for the tag, e.g. #6366f1.',
                    },
                },
                required: ['label'],
            },
            execute: async ({ id, label, color }) => {
                await ensureTagsSection();

                const idInput = document.querySelector('input[aria-label="New tag id"]') as HTMLInputElement | null;
                const labelInput = document.querySelector('input[aria-label="New tag label"]') as HTMLInputElement | null;
                const colorInput = document.querySelector('input[aria-label="New tag color"]') as HTMLInputElement | null;
                const addButton = Array.from(document.querySelectorAll('button')).find((element): element is HTMLButtonElement => (
                    element instanceof HTMLButtonElement && element.textContent?.trim() === 'Add Tag'
                )) || null;

                if (!labelInput || !colorInput || !addButton) {
                    return errorResult('The admin tag manager form is not visible.');
                }

                if (typeof id === 'string' && id.trim().length > 0 && idInput) {
                    setFieldValue(idInput, id.trim());
                }
                setFieldValue(labelInput, String(label).trim());
                setFieldValue(colorInput, typeof color === 'string' && color.trim().length > 0 ? color.trim() : '#6366f1');

                addButton.click();
                await new Promise((resolve) => setTimeout(resolve, 350));
                return successResult({
                    added: String(label).trim(),
                    tags: getVisibleHomeworkTagLabels(),
                });
            },
        },
    },
    {
        category: 'admin',
        activeRoutes: ['/admin/settings'],
        allowedRoles: ['super_admin'],
        tool: {
            name: 'delete_admin_homework_tag',
            description: 'Delete a homework tag from the admin settings Tags section by visible label.',
            inputSchema: {
                type: 'object',
                properties: {
                    label: {
                        type: 'string',
                        description: 'Visible tag label to delete.',
                    },
                },
                required: ['label'],
            },
            execute: async ({ label }) => {
                await ensureTagsSection();

                if (typeof label !== 'string' || !label.trim()) {
                    return errorResult('label is required.');
                }

                const button = findDeleteTagButton(label.trim());
                if (!button) {
                    return errorResult(`Could not find a delete button for tag "${label.trim()}".`);
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 350));
                return successResult({
                    deleted: label.trim(),
                    tags: getVisibleHomeworkTagLabels(),
                });
            },
        },
    },
];

export default settingsTools;
