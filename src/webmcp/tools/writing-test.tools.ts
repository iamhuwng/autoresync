/**
 * WebMCP Tools — IELTS Writing Test System
 * 
 * Tools for AI agent testing of the Writing test features:
 * - Teacher: create/publish tests, monitor students, peek essays
 * - Student: get test state, submit test
 * 
 * @dev-only
 */

import type { ToolRegistration } from '../types';

export const writingTestTools: ToolRegistration[] = [
    // ── Teacher: Test Builder ───────────────────────────────────
    {
        category: 'teacher',
        activeRoutes: ['/teacher/create-test/writing', '/teacher/test-builder/*'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'navigate_writing_test_builder',
            description: 'Navigate to the Writing Test Builder page to create a new IELTS Writing test.',
            inputSchema: {
                type: 'object',
                properties: {
                    draftId: {
                        type: 'string',
                        description: 'Optional existing draft ID to edit instead of creating new.',
                    },
                },
            },
            execute: async ({ draftId }) => {
                const path = draftId
                    ? `/teacher/create-test/writing?draftId=${draftId}`
                    : '/teacher/create-test/writing';
                window.location.hash = '';
                window.history.pushState({}, '', path);
                window.dispatchEvent(new PopStateEvent('popstate'));
                return {
                    content: [{
                        type: 'text',
                        text: `Navigated to Writing Test Builder${draftId ? ` (editing draft ${draftId})` : ' (new test)'}`,
                    }],
                };
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/create-test/writing'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_writing_test_builder_state',
            description: 'Get the current state of the Writing Test Builder form: title, format, task prompts, word counts, validation status.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    // Read state from DOM
                    const title = (document.querySelector('input[placeholder*="Writing Test"]') as HTMLInputElement)?.value || '';
                    const format = document.querySelector('.wt-format-card.selected')?.textContent || '';
                    const prompts = Array.from(document.querySelectorAll('.wt-task-panel textarea')).map(
                        (el) => (el as HTMLTextAreaElement).value.substring(0, 100)
                    );
                    const validationItems = Array.from(document.querySelectorAll('.wt-validation-item')).map(
                        (el) => el.textContent?.trim()
                    );

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                title,
                                format,
                                taskPromptPreviews: prompts,
                                validationStatus: validationItems,
                            }),
                        }],
                    };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },

    // ── Teacher: Monitor ────────────────────────────────────────
    {
        category: 'teacher',
        activeRoutes: ['/teacher/monitor/*'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_writing_monitor_status',
            description: 'Get the status of all students in a writing test session: word counts, active/idle/submitted status, tab switches.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionCode: {
                        type: 'string',
                        description: 'The live session code to monitor.',
                    },
                },
                required: ['sessionCode'],
            },
            annotations: { readOnlyHint: 'true' },
            execute: async ({ sessionCode }) => {
                try {
                    const { ref, get } = await import('firebase/database');
                    const { database } = await import('../../services/firebase');
                    const studentsRef = ref(database, `game_sessions/${sessionCode}/students`);
                    const snap = await get(studentsRef);

                    if (!snap.exists()) {
                        return { content: [{ type: 'text', text: JSON.stringify({ students: [], total: 0 }) }] };
                    }

                    const students = snap.val();
                    const summary = Object.entries(students).map(([uid, data]: [string, any]) => {
                        const w = data.writing || {};
                        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
                        const isActive = (w.task1?.lastSavedAt > fiveMinAgo) || (w.task2?.lastSavedAt > fiveMinAgo);
                        const getWc = (text?: string) => text?.trim()?.split(/\s+/).filter((x: string) => x.length > 0).length || 0;

                        return {
                            uid,
                            name: data.name || uid,
                            task1Words: getWc(w.task1?.text),
                            task2Words: getWc(w.task2?.text),
                            status: w.submitted ? 'submitted' : isActive ? 'active' : 'idle',
                            tabSwitches: w.tabSwitches || 0,
                        };
                    });

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ students: summary, total: summary.length }),
                        }],
                    };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/monitor/*'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'peek_student_writing',
            description: 'Read a student\'s essay text in real-time during a writing test session. Read-only.',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionCode: { type: 'string', description: 'The live session code.' },
                    studentUid: { type: 'string', description: 'The student\'s Firebase UID.' },
                    taskNumber: { type: 'number', description: 'Task number (1 or 2). Default: 1.' },
                },
                required: ['sessionCode', 'studentUid'],
            },
            annotations: { readOnlyHint: 'true' },
            execute: async ({ sessionCode, studentUid, taskNumber }) => {
                try {
                    const { ref, get } = await import('firebase/database');
                    const { database } = await import('../../services/firebase');
                    const task = taskNumber || 1;
                    const textRef = ref(database, `game_sessions/${sessionCode}/students/${studentUid}/writing/task${task}/text`);
                    const snap = await get(textRef);
                    const text = snap.exists() ? snap.val() : '';
                    const wordCount = text.trim() ? text.trim().split(/\s+/).filter((w: string) => w.length > 0).length : 0;

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ taskNumber: task, text, wordCount }),
                        }],
                    };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },

    // ── Student: Test Page ──────────────────────────────────────
    {
        category: 'student',
        activeRoutes: ['/student-test/*'],
        allowedRoles: ['student'],
        tool: {
            name: 'get_writing_test_state',
            description: 'Get the current state of the student\'s writing test: active task, word counts per task, submission status.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    // Read from the DOM
                    const tabs = document.querySelectorAll('.wtp-tab');
                    const activeTab = document.querySelector('.wtp-tab--active')?.textContent || '';
                    const wordCountEl = document.querySelector('.wtp-word-count');
                    const wordCount = wordCountEl?.textContent || '0 words';
                    const isSubmitted = !!document.querySelector('.wtp-submitted-overlay');
                    const textarea = document.querySelector('.wtp-editor-textarea') as HTMLTextAreaElement;
                    const essayLength = textarea?.value?.length || 0;

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                activeTab,
                                wordCount,
                                essayCharacters: essayLength,
                                isSubmitted,
                                totalTabs: tabs.length,
                            }),
                        }],
                    };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'student',
        activeRoutes: ['/student-test/*'],
        allowedRoles: ['student'],
        tool: {
            name: 'submit_writing_test',
            description: 'Click the Submit button to open the writing test submission confirmation modal, then confirm submission.',
            inputSchema: {
                type: 'object',
                properties: {
                    confirm: {
                        type: 'boolean',
                        description: 'If true, also clicks the Confirm button in the modal. If false, only opens the modal.',
                    },
                },
            },
            execute: async ({ confirm }) => {
                try {
                    // Find and click the submit button in the tab bar
                    const submitBtn = Array.from(document.querySelectorAll('.wtp-tab'))
                        .find(el => el.textContent?.includes('Submit'));

                    if (!submitBtn) {
                        return { content: [{ type: 'text', text: 'Submit button not found — test may already be submitted.' }], isError: true };
                    }

                    (submitBtn as HTMLButtonElement).click();

                    if (confirm) {
                        // Wait for modal to render
                        await new Promise(r => setTimeout(r, 300));
                        const confirmBtn = document.querySelector('.wtp-submit-btn--confirm') as HTMLButtonElement;
                        if (confirmBtn) {
                            confirmBtn.click();
                            return { content: [{ type: 'text', text: 'Writing test submitted successfully.' }] };
                        }
                        return { content: [{ type: 'text', text: 'Confirm button not found in modal.' }], isError: true };
                    }

                    return { content: [{ type: 'text', text: 'Submit modal opened. Call again with confirm: true to submit.' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },

    // ── Teacher: Grading ────────────────────────────────────────
    {
        category: 'teacher',
        activeRoutes: ['/teacher/grading/writing', '/teacher/grading/writing/*'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'navigate_writing_grading_queue',
            description: 'Navigate to the Writing Grading Queue page where teachers can see pending submissions.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                window.history.pushState({}, '', '/teacher/grading/writing');
                window.dispatchEvent(new PopStateEvent('popstate'));
                return { content: [{ type: 'text', text: 'Navigated to Writing Grading Queue.' }] };
            },
        },
    },
];
