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
    {
        category: 'teacher',
        activeRoutes: ['/teacher/grading/writing'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_writing_grading_queue',
            description: 'Get the list of pending writing submissions displayed on the grading queue page. Returns submission cards with student name, word count, format, and status.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const cards = document.querySelectorAll('.wgq-card');
                    const submissions = Array.from(cards).map(card => ({
                        studentName: card.querySelector('.wgq-card-name')?.textContent || '',
                        format: card.querySelector('.wgq-card-format')?.textContent || '',
                        wordCount: card.querySelector('.wgq-card-words')?.textContent || '',
                        context: card.querySelector('.wgq-card-context')?.textContent || '',
                    }));
                    const filterValue = (document.querySelector('.wgq-filter-select') as HTMLSelectElement)?.value || 'all';
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ total: submissions.length, filter: filterValue, submissions }),
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
        activeRoutes: ['/teacher/grading/writing/:submissionId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'navigate_writing_grading_detail',
            description: 'Navigate to the Writing Grading page for a specific submission to start grading.',
            inputSchema: {
                type: 'object',
                properties: {
                    submissionId: { type: 'string', description: 'The Firestore submission ID to grade.' },
                },
                required: ['submissionId'],
            },
            execute: async ({ submissionId }) => {
                window.history.pushState({}, '', `/teacher/grading/writing/${submissionId}`);
                window.dispatchEvent(new PopStateEvent('popstate'));
                return { content: [{ type: 'text', text: `Navigated to grading page for submission ${submissionId}.` }] };
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/grading/writing/:submissionId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_writing_grading_state',
            description: 'Get the current state of the grading page: active task, scores per criterion, overall band, annotations count, void status, and essay preview.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const studentName = document.querySelector('.wgp-student-name')?.textContent || '';
                    const activeTab = document.querySelector('.wgp-tab--active')?.textContent || 'Task 1';
                    const overallBand = document.querySelector('.wgp-overall-band')?.textContent || '—';
                    const annotationCount = document.querySelectorAll('.annotation-group').length;

                    // Read score buttons - find selected ones
                    const scoreButtons = document.querySelectorAll('button[style*="border: 2px"]');
                    const selectedScores = Array.from(scoreButtons).map(btn => btn.textContent?.trim());

                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                studentName,
                                activeTab,
                                overallBand,
                                annotationCount,
                                selectedScores,
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
        category: 'teacher',
        activeRoutes: ['/teacher/grading/writing/:submissionId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'save_writing_grading_draft',
            description: 'Click the Save Draft button to save current grading progress without submitting.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const saveBtn = btns.find(b => b.textContent?.includes('Save Draft'));
                    if (!saveBtn) return { content: [{ type: 'text', text: 'Save Draft button not found.' }], isError: true };
                    saveBtn.click();
                    return { content: [{ type: 'text', text: 'Save Draft clicked.' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/grading/writing/:submissionId'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'submit_writing_grading',
            description: 'Click the Submit Grading button to finalize and submit the grading for this writing submission. Will validate that at least one task has all 4 criteria scored.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const submitBtn = btns.find(b => b.textContent?.includes('Submit Grading'));
                    if (!submitBtn) return { content: [{ type: 'text', text: 'Submit Grading button not found.' }], isError: true };
                    submitBtn.click();
                    return { content: [{ type: 'text', text: 'Submit Grading clicked. Will validate and submit.' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },

    // ── Teacher: Results & Review ──────────────────────────────
    {
        category: 'teacher',
        activeRoutes: ['/teacher/results/:sessionCode'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'get_writing_test_results',
            description: 'Get the writing test results summary table when viewing a writing test session. Returns list of students with their overall band, task bands, and status.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const rows = document.querySelectorAll('table tbody tr');
                    const results = Array.from(rows).map(row => {
                        const cells = row.querySelectorAll('td');
                        return {
                            student: cells[0]?.textContent?.trim() || '',
                            overallBand: cells[1]?.textContent?.trim() || '',
                            t1Band: cells[2]?.textContent?.trim() || '',
                            t2Band: cells[3]?.textContent?.trim() || '',
                            status: cells[4]?.textContent?.trim() || '',
                            submitted: cells[5]?.textContent?.trim() || '',
                        };
                    });
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({ total: results.length, results }),
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
        activeRoutes: ['/teacher/results/:sessionCode'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'open_writing_result_detail',
            description: 'Click on a student row in the writing results table to open their result detail modal.',
            inputSchema: {
                type: 'object',
                properties: {
                    studentName: {
                        type: 'string',
                        description: 'Name of the student whose result to view.',
                    },
                },
                required: ['studentName'],
            },
            execute: async ({ studentName }) => {
                try {
                    const name_q = String(studentName);
                    const rows = document.querySelectorAll('table tbody tr');
                    for (const row of Array.from(rows)) {
                        const name = row.querySelector('td')?.textContent?.trim();
                        if (name && name.includes(name_q)) {
                            (row as HTMLElement).click();
                            return { content: [{ type: 'text', text: `Opened result detail for ${name}.` }] };
                        }
                    }
                    return { content: [{ type: 'text', text: `Student "${studentName}" not found in results.` }], isError: true };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/results/:sessionCode'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'close_writing_result_detail',
            description: 'Close the currently open WritingResultDetailModal by clicking the backdrop or close button.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    // Modal has a close button with ✕ text
                    const buttons = document.querySelectorAll('button');
                    for (const btn of Array.from(buttons)) {
                        if (btn.textContent?.trim() === '✕') {
                            btn.click();
                            return { content: [{ type: 'text', text: 'Closed result detail modal.' }] };
                        }
                    }
                    return { content: [{ type: 'text', text: 'No modal close button found.' }], isError: true };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'teacher',
        activeRoutes: ['/teacher/results/:sessionCode'],
        allowedRoles: ['teacher', 'super_admin'],
        tool: {
            name: 'navigate_edit_grades',
            description: 'Click the "Edit Grades" button in the WritingResultDetailModal to navigate to the grading page for this submission.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    const buttons = document.querySelectorAll('button');
                    for (const btn of Array.from(buttons)) {
                        if (btn.textContent?.includes('Edit Grades')) {
                            btn.click();
                            return { content: [{ type: 'text', text: 'Navigating to grading page.' }] };
                        }
                    }
                    return { content: [{ type: 'text', text: 'Edit Grades button not found. Is the modal open?' }], isError: true };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
                }
            },
        },
    },

    // ── Student: Result View ───────────────────────────────────
    {
        category: 'student',
        activeRoutes: ['/student/results/*', '/student/academic-record'],
        allowedRoles: ['student'],
        tool: {
            name: 'get_writing_result_state',
            description: 'Get the current state of a student writing result view: grading status, overall band, per-task bands.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const bandEl = document.querySelector('[style*="3.5rem"]');
                    const band = bandEl?.textContent?.trim() || null;
                    const statusBanner = document.querySelector('[style*="fef3c7"]');
                    const isPending = !!statusBanner;
                    const taskBands = Array.from(document.querySelectorAll('[style*="eff6ff"]'))
                        .map(el => el.textContent?.trim())
                        .filter(t => t?.startsWith('Band'));
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                isPending,
                                overallBand: band,
                                taskBands,
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
];

