/**
 * WebMCP Core Tools — Authentication
 * 
 * Tools for login/logout and user identity inspection.
 * These are always available regardless of route.
 * 
 * @dev-only
 */

import type { ToolRegistration } from '../types';

export const authTools: ToolRegistration[] = [
    {
        category: 'auth',
        tool: {
            name: 'dev_login_teacher',
            description: 'Quick-login as the dev teacher account (teacher@test.com). Useful for testing teacher-only features.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    // Dynamic import to avoid bundling auth in production
                    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
                    const auth = getAuth();
                    await signInWithEmailAndPassword(auth, 'teacher@test.com', 'password123');
                    return { content: [{ type: 'text', text: 'Successfully logged in as teacher@test.com' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Login failed: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'auth',
        tool: {
            name: 'dev_login_student',
            description: 'Quick-login as the dev student account (student@test.com). Useful for testing student-only features.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
                    const auth = getAuth();
                    await signInWithEmailAndPassword(auth, 'student@test.com', 'password123');
                    return { content: [{ type: 'text', text: 'Successfully logged in as student@test.com' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Login failed: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'auth',
        tool: {
            name: 'dev_logout',
            description: 'Sign out the current user.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            execute: async () => {
                try {
                    const { getAuth, signOut } = await import('firebase/auth');
                    await signOut(getAuth());
                    return { content: [{ type: 'text', text: 'Successfully logged out' }] };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    return { content: [{ type: 'text', text: `Logout failed: ${message}` }], isError: true };
                }
            },
        },
    },
    {
        category: 'auth',
        tool: {
            name: 'get_current_user',
            description: 'Get the currently authenticated user info including uid, email, displayName, and role. Returns null if not logged in.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
            annotations: { readOnlyHint: 'true' },
            execute: async () => {
                try {
                    const { getAuth } = await import('firebase/auth');
                    const user = getAuth().currentUser;
                    if (!user) {
                        return { content: [{ type: 'text', text: JSON.stringify({ loggedIn: false }) }] };
                    }
                    return {
                        content: [{
                            type: 'text',
                            text: JSON.stringify({
                                loggedIn: true,
                                uid: user.uid,
                                email: user.email,
                                displayName: user.displayName,
                                photoURL: user.photoURL,
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
