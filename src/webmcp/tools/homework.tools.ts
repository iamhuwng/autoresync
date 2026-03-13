import { getAuth } from 'firebase/auth';
import { buildRoute } from '../../constants/routes';
import { closeAllPastDueHomework } from '../../services/homeworkBulkOperations';
import { getHomeworkById, getHomeworkByTeacher } from '../../services/homeworkManager';
import { resetStudentHomework } from '../../services/homeworkSubmissionService';
import type { HomeworkAssignment } from '../../types/homework.types';
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

function getCurrentTeacherId(): string | null {
    return getAuth().currentUser?.uid || null;
}

function getHomeworkIdFromPath(): string | null {
    const match = window.location.pathname.match(/^\/teacher\/homework\/([^/]+)/);
    return match?.[1] || null;
}

function findButtonByText(text: string): HTMLButtonElement | null {
    const normalized = text.trim().toLowerCase();
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];

    return buttons.find((button) => {
        const label = button.textContent?.trim().toLowerCase() || '';
        return label === normalized || label.includes(normalized);
    }) || null;
}

function getTemplateSaveDialog(): HTMLElement | null {
    return document.querySelector('[aria-label="Save homework template"]') as HTMLElement | null;
}

function getBulkActionBar(): HTMLElement | null {
    return document.querySelector('[aria-label="Homework bulk actions"]') as HTMLElement | null;
}

function getBulkExtendDialog(): HTMLElement | null {
    return document.querySelector('[aria-label="Bulk extend homework deadlines"]') as HTMLElement | null;
}

function getBulkDeleteDialog(): HTMLElement | null {
    return document.querySelector('[aria-label="Confirm bulk homework archive"]') as HTMLElement | null;
}

function getSelectedHomeworkCheckboxes(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll('input[type="checkbox"][aria-label^="Select "]'))
        .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.checked);
}

function findHomeworkSelectionCheckbox(title: string): HTMLInputElement | null {
    const normalizedTitle = title.trim().toLowerCase();
    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][aria-label^="Select "]'));

    return inputs.find((element): element is HTMLInputElement => {
        if (!(element instanceof HTMLInputElement)) {
            return false;
        }

        const label = element.getAttribute('aria-label')?.trim().toLowerCase() || '';
        return label.includes(normalizedTitle);
    }) || null;
}

function findHomeworkActionButton(actionPrefix: string, title: string): HTMLButtonElement | null {
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedPrefix = actionPrefix.trim().toLowerCase();
    const buttons = Array.from(document.querySelectorAll('button[aria-label]'));

    return buttons.find((element): element is HTMLButtonElement => {
        if (!(element instanceof HTMLButtonElement)) {
            return false;
        }

        const label = element.getAttribute('aria-label')?.trim().toLowerCase() || '';
        return label.startsWith(normalizedPrefix) && label.includes(normalizedTitle);
    }) || null;
}

function findHomeworkTagFilterButton(tagLabel: string | null): HTMLButtonElement | null {
    const filterGroup = document.querySelector('[aria-label="Homework tag filters"]');
    if (!filterGroup) {
        return null;
    }

    const buttons = Array.from(filterGroup.querySelectorAll('button'));

    if (tagLabel === null) {
        return buttons.find((element): element is HTMLButtonElement => (
            element instanceof HTMLButtonElement
            && element.textContent?.trim().toLowerCase() === 'all'
        )) || null;
    }

    const normalizedLabel = tagLabel.trim().toLowerCase();
    return buttons.find((element): element is HTMLButtonElement => {
        if (!(element instanceof HTMLButtonElement)) {
            return false;
        }

        const text = element.textContent?.trim().toLowerCase() || '';
        const ariaLabel = element.getAttribute('aria-label')?.trim().toLowerCase() || '';
        return text === normalizedLabel || ariaLabel.includes(normalizedLabel);
    }) || null;
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

function readInfoValue(container: ParentNode, label: string): string | null {
    const items = Array.from(container.querySelectorAll('.info-item'));
    for (const item of items) {
        const labelNode = item.querySelector('.info-label');
        if (labelNode?.textContent?.trim() === label) {
            return item.querySelector('.info-value')?.textContent?.replace(/\s+/g, ' ').trim() || null;
        }
    }
    return null;
}

function summarizeVisibleHomeworkCards(): Array<Record<string, unknown>> {
    return Array.from(document.querySelectorAll('.homework-card')).map((card) => {
        const element = card as HTMLElement;
        return {
            title: element.querySelector('.homework-title')?.textContent?.trim() || '',
            status: element.querySelector('.homework-status-badge .status-label')?.textContent?.trim() || '',
            target: readInfoValue(element, 'Target:'),
            available: readInfoValue(element, 'Available:'),
            due: readInfoValue(element, 'Due:'),
            config: readInfoValue(element, 'Config:'),
            progress: element.querySelector('.progress-stats')?.textContent?.replace(/\s+/g, ' ').trim() || null,
            overdue: element.classList.contains('overdue'),
        };
    });
}

function summarizeVisibleSubmissionTable(): { headers: string[]; rowCount: number; rows: string[][] } {
    const table = document.querySelector('table');
    if (!table) {
        return { headers: [], rowCount: 0, rows: [] };
    }

    const headers = Array.from(table.querySelectorAll('th')).map((header) =>
        header.textContent?.replace(/\s+/g, ' ').trim() || ''
    );

    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() || '')
    );

    return {
        headers,
        rowCount: rows.length,
        rows: rows.slice(0, 20),
    };
}

function countHomeworkByStatus(homework: HomeworkAssignment[]): Record<string, number> {
    return homework.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status] = (accumulator[item.status] || 0) + 1;
        return accumulator;
    }, {});
}

async function navigateToPath(path: string): Promise<void> {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, 300));
}

export const homeworkTools: ToolRegistration[] = [
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_teacher_homework_list_state',
            description: 'Get a structured summary of the teacher homework list page, including current search value, visible homework cards, and overall teacher homework counts.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const teacherId = getCurrentTeacherId();
                    if (!teacherId) {
                        return errorResult('No authenticated teacher found.');
                    }

                    const homework = await getHomeworkByTeacher(teacherId);
                    const searchQuery = (document.querySelector('input[placeholder*="Search by title"]') as HTMLInputElement | null)?.value || '';
                    const visibleCards = summarizeVisibleHomeworkCards();

                    return successResult({
                        teacherId,
                        pathname: window.location.pathname,
                        searchQuery,
                        totalHomework: homework.length,
                        byStatus: countHomeworkByStatus(homework),
                        visibleCardCount: visibleCards.length,
                        visibleCards,
                    });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return errorResult(`Failed to read teacher homework list state: ${message}`);
                }
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_teacher_homework_bulk_selection_state',
            description: 'Inspect the teacher homework list bulk-selection state, including selected items and whether bulk modals are open.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                const selectedInputs = getSelectedHomeworkCheckboxes();
                const selectedLabels = selectedInputs.map((input) => input.getAttribute('aria-label') || '');
                const bulkActionBar = getBulkActionBar();

                return successResult({
                    bulkModeVisible: Boolean(document.querySelector('button')?.textContent?.includes('Cancel Bulk Select') || bulkActionBar),
                    selectedCount: selectedInputs.length,
                    selectedLabels,
                    bulkActionBarVisible: Boolean(bulkActionBar),
                    bulkExtendDialogOpen: Boolean(getBulkExtendDialog()),
                    bulkDeleteDialogOpen: Boolean(getBulkDeleteDialog()),
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'toggle_teacher_homework_bulk_select_mode',
            description: 'Toggle bulk-select mode on the teacher homework list page.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Cancel Bulk Select') || findButtonByText('Bulk Select');
                if (!button) {
                    return errorResult('Could not find the bulk-select toggle button.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    bulkActionBarVisible: Boolean(getBulkActionBar()),
                    selectedCount: getSelectedHomeworkCheckboxes().length,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'select_teacher_homework_card_for_bulk_action',
            description: 'Select a visible homework card for bulk actions by matching its title text.',
            inputSchema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Visible homework title to match against the card checkbox aria-label.',
                    },
                },
                required: ['title'],
            },
            execute: async ({ title }) => {
                if (typeof title !== 'string' || !title.trim()) {
                    return errorResult('title is required.');
                }

                if (!findButtonByText('Cancel Bulk Select')) {
                    const toggleButton = findButtonByText('Bulk Select');
                    if (!toggleButton) {
                        return errorResult('Could not find the bulk-select toggle button.');
                    }
                    toggleButton.click();
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }

                const checkbox = findHomeworkSelectionCheckbox(title.trim());
                if (!checkbox) {
                    return errorResult(`Could not find a visible homework selection checkbox matching "${title.trim()}".`);
                }

                checkbox.click();
                await new Promise((resolve) => setTimeout(resolve, 200));
                return successResult({
                    title: title.trim(),
                    checked: checkbox.checked,
                    selectedCount: getSelectedHomeworkCheckboxes().length,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'select_all_teacher_homework_matching_filter',
            description: 'Use the list-page banner action to select all homework assignments matching the current status filter.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Select all matching filter');
                if (!button) {
                    return errorResult('Could not find the select-all-matching-filter button. Apply a status filter first.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                return successResult({
                    selectedCount: getSelectedHomeworkCheckboxes().length,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_bulk_extend_modal',
            description: 'Open the bulk extend deadline modal from the teacher homework bulk action bar.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Extend');
                if (!button) {
                    return errorResult('Could not find the bulk extend button. Select at least one homework item first.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    open: Boolean(getBulkExtendDialog()),
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_bulk_delete_modal',
            description: 'Open the bulk archive confirmation modal from the teacher homework bulk action bar.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Delete');
                if (!button) {
                    return errorResult('Could not find the bulk delete button. Select at least one homework item first.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    open: Boolean(getBulkDeleteDialog()),
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'restore_teacher_archived_homework',
            description: 'Restore an archived homework card on the teacher homework list page by matching its visible title.',
            inputSchema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Visible archived homework title to restore.',
                    },
                },
                required: ['title'],
            },
            execute: async ({ title }) => {
                if (typeof title !== 'string' || !title.trim()) {
                    return errorResult('title is required.');
                }

                const button = findHomeworkActionButton('restore', title);
                if (!button) {
                    return errorResult(`Could not find an archived restore button matching "${title.trim()}".`);
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                return successResult({
                    title: title.trim(),
                    restored: true,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_permanent_delete_modal',
            description: 'Open the permanent-delete confirmation modal for an archived homework card by matching its visible title.',
            inputSchema: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Visible archived homework title to permanently delete.',
                    },
                },
                required: ['title'],
            },
            execute: async ({ title }) => {
                if (typeof title !== 'string' || !title.trim()) {
                    return errorResult('title is required.');
                }

                const button = findHomeworkActionButton('permanently delete', title);
                if (!button) {
                    return errorResult(`Could not find a permanent-delete button matching "${title.trim()}".`);
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    title: title.trim(),
                    open: Boolean(document.querySelector('[aria-label="Confirm permanent homework delete"]')),
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'filter_teacher_homework_by_tag',
            description: 'Apply or clear the teacher homework list tag filter using the visible tag chips.',
            inputSchema: {
                type: 'object',
                properties: {
                    tagLabel: {
                        type: 'string',
                        description: 'Visible tag label to filter by. Leave empty to clear back to All.',
                    },
                },
            },
            execute: async ({ tagLabel }) => {
                const nextLabel = typeof tagLabel === 'string' && tagLabel.trim().length > 0
                    ? tagLabel.trim()
                    : null;
                const button = findHomeworkTagFilterButton(nextLabel);

                if (!button) {
                    return errorResult(
                        nextLabel
                            ? `Could not find a homework tag filter matching "${nextLabel}".`
                            : 'Could not find the All homework tag filter button.'
                    );
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({
                    tagLabel: nextLabel,
                    applied: true,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_detail',
            description: 'Navigate directly to a teacher homework detail page by homeworkId using the route registry.',
            inputSchema: {
                type: 'object',
                properties: {
                    homeworkId: {
                        type: 'string',
                        description: 'Homework assignment ID to open.',
                    },
                },
                required: ['homeworkId'],
            },
            execute: async ({ homeworkId }) => {
                if (typeof homeworkId !== 'string' || !homeworkId.trim()) {
                    return errorResult('homeworkId is required.');
                }

                const path = buildRoute('TEACHER_HOMEWORK_DETAIL', { homeworkId: homeworkId.trim() });
                await navigateToPath(path);
                return successResult({ path, homeworkId: homeworkId.trim() });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_create_modal',
            description: 'Open the teacher homework creation modal from the homework list page.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Create Homework');
                if (!button) {
                    return errorResult('Could not find the Create Homework button on the current page.');
                }
                if (button.disabled) {
                    return errorResult('The Create Homework button is disabled.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                return successResult({ opened: true, modal: 'homework_create' });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_thcs_homework_modal',
            description: 'Open the THCS homework assignment flow from the teacher homework list page.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Create THCS Homework');
                if (!button) {
                    return errorResult('Could not find the Create THCS Homework button on the current page.');
                }
                if (button.disabled) {
                    return errorResult('The Create THCS Homework button is disabled.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                return successResult({ opened: true, modal: 'thcs_homework_assign' });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'close_all_teacher_homework_past_due',
            description: 'Close all currently past-due homework assignments for the authenticated teacher using the production bulk-close service.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { destructiveHint: 'true' },
            execute: async () => {
                try {
                    const teacherId = getCurrentTeacherId();
                    if (!teacherId) {
                        return errorResult('No authenticated teacher found.');
                    }

                    const result = await closeAllPastDueHomework(teacherId);
                    return successResult({ teacherId, ...result });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return errorResult(`Failed to close past-due homework: ${message}`);
                }
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_teacher_homework_template_save_modal',
            description: 'Open the Save as Template modal from the teacher homework create flow.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const button = findButtonByText('Save as Template');
                if (!button) {
                    return errorResult('Could not find the Save as Template button. Make sure the homework create modal is open.');
                }
                if (button.disabled) {
                    return errorResult('The Save as Template button is disabled.');
                }

                button.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                return successResult({
                    opened: Boolean(getTemplateSaveDialog()),
                    modal: 'template_save',
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_teacher_homework_template_save_state',
            description: 'Inspect the Save homework template modal state, including entered values and any inline error.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                const dialog = getTemplateSaveDialog();
                if (!dialog) {
                    return successResult({
                        open: false,
                    });
                }

                const nameInput = dialog.querySelector('input') as HTMLInputElement | null;
                const descriptionInput = dialog.querySelector('textarea') as HTMLTextAreaElement | null;

                return successResult({
                    open: true,
                    title: dialog.querySelector('div')?.textContent?.includes('Save Homework Template')
                        ? 'Save Homework Template'
                        : null,
                    name: nameInput?.value || '',
                    description: descriptionInput?.value || '',
                    error: Array.from(dialog.querySelectorAll('div'))
                        .map((element) => element.textContent?.trim() || '')
                        .find((text) =>
                            text.length > 0
                            && (
                                text.includes('Template name is required.')
                                || text.includes('already exists')
                                || text.includes('Failed to save template')
                                || text.includes('signed in to save a template')
                            )
                        ) || null,
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'submit_teacher_homework_template_save',
            description: 'Fill and submit the Save homework template modal from the teacher homework create flow.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Template name to save.',
                    },
                    description: {
                        type: 'string',
                        description: 'Optional template description.',
                    },
                },
                required: ['name'],
            },
            execute: async ({ name, description }) => {
                if (typeof name !== 'string' || !name.trim()) {
                    return errorResult('name is required.');
                }

                const dialog = getTemplateSaveDialog();
                if (!dialog) {
                    return errorResult('The Save homework template modal is not open.');
                }

                const nameInput = dialog.querySelector('input') as HTMLInputElement | null;
                const descriptionInput = dialog.querySelector('textarea') as HTMLTextAreaElement | null;
                const submitButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
                    button.textContent?.toLowerCase().includes('save template')
                ) as HTMLButtonElement | undefined;

                if (!nameInput || !descriptionInput || !submitButton) {
                    return errorResult('Could not find the template save form controls.');
                }

                setFieldValue(nameInput, name.trim());
                setFieldValue(descriptionInput, typeof description === 'string' ? description : '');
                submitButton.click();
                await new Promise((resolve) => setTimeout(resolve, 400));

                return successResult({
                    submitted: true,
                    modalStillOpen: Boolean(getTemplateSaveDialog()),
                    name: name.trim(),
                });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'close_teacher_homework_template_save_modal',
            description: 'Close the Save homework template modal without submitting it.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                const dialog = getTemplateSaveDialog();
                if (!dialog) {
                    return successResult({ open: false });
                }

                const closeButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
                    button.textContent?.trim() === '×' || button.textContent?.trim() === 'Cancel'
                ) as HTMLButtonElement | undefined;

                if (!closeButton) {
                    return errorResult('Could not find a close button for the template save modal.');
                }

                closeButton.click();
                await new Promise((resolve) => setTimeout(resolve, 250));
                return successResult({ open: Boolean(getTemplateSaveDialog()) });
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework/:homeworkId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_teacher_homework_detail_state',
            description: 'Get structured state for the current teacher homework detail page, including homework metadata, stats, tags, and the visible submissions table.',
            inputSchema: {
                type: 'object',
                properties: {
                    homeworkId: {
                        type: 'string',
                        description: 'Optional homeworkId override. If omitted, uses the current route.',
                    },
                },
            },
            annotations: { readOnlyHint: 'true' },
            execute: async ({ homeworkId }) => {
                try {
                    const resolvedHomeworkId = typeof homeworkId === 'string' && homeworkId.trim()
                        ? homeworkId.trim()
                        : getHomeworkIdFromPath();

                    if (!resolvedHomeworkId) {
                        return errorResult('Could not resolve homeworkId from the current route.');
                    }

                    const homework = await getHomeworkById(resolvedHomeworkId);
                    if (!homework) {
                        return errorResult(`Homework ${resolvedHomeworkId} was not found.`);
                    }

                    const visibleTable = summarizeVisibleSubmissionTable();
                    const tags = Array.from(document.querySelectorAll('span'))
                        .map((element) => element.textContent?.trim() || '')
                        .filter((text) => text.length > 0 && homework.tags?.includes(text));

                    return successResult({
                        homeworkId: resolvedHomeworkId,
                        title: homework.title || homework.materialTitle,
                        status: homework.status,
                        target: homework.target,
                        scheduling: homework.scheduling,
                        config: homework.config,
                        stats: homework.stats,
                        tags,
                        resetDialogOpen: document.body.textContent?.includes('Reset student homework') || false,
                        visibleSubmissionTable: visibleTable,
                    });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return errorResult(`Failed to read teacher homework detail state: ${message}`);
                }
            },
        },
    },
    {
        category: 'homework',
        activeRoutes: ['/teacher/homework/:homeworkId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'reset_teacher_homework_student',
            description: 'Reset a specific student\'s homework attempts from the teacher homework detail page using the production reset service.',
            inputSchema: {
                type: 'object',
                properties: {
                    studentId: {
                        type: 'string',
                        description: 'Student ID to reset.',
                    },
                    homeworkId: {
                        type: 'string',
                        description: 'Optional homeworkId override. If omitted, uses the current route.',
                    },
                },
                required: ['studentId'],
            },
            annotations: { destructiveHint: 'true' },
            execute: async ({ studentId, homeworkId }) => {
                try {
                    if (typeof studentId !== 'string' || !studentId.trim()) {
                        return errorResult('studentId is required.');
                    }

                    const resolvedHomeworkId = typeof homeworkId === 'string' && homeworkId.trim()
                        ? homeworkId.trim()
                        : getHomeworkIdFromPath();

                    if (!resolvedHomeworkId) {
                        return errorResult('Could not resolve homeworkId from the current route.');
                    }

                    const homework = await getHomeworkById(resolvedHomeworkId);
                    if (!homework) {
                        return errorResult(`Homework ${resolvedHomeworkId} was not found.`);
                    }

                    const result = await resetStudentHomework(
                        resolvedHomeworkId,
                        studentId.trim(),
                        homework.title || homework.materialTitle
                    );

                    return successResult({
                        homeworkId: resolvedHomeworkId,
                        studentId: studentId.trim(),
                        ...result,
                    });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return errorResult(`Failed to reset teacher homework student: ${message}`);
                }
            },
        },
    },
];
