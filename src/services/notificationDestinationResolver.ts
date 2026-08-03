import type { BookNotificationMetadata } from '../types/notification.types';
import { parseNotificationMetadata } from './notificationMetadata';

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export type NotificationResolverRole = 'student' | 'teacher' | 'admin' | 'super_admin';

export type BookNotificationDestination =
    | { readonly status: 'allowed'; readonly path: string }
    | { readonly status: 'blocked'; readonly reason: 'unauthorized' | 'invalid-metadata' | 'stale-destination' };

/**
 * Resolve only destinations that are derived from trusted structured metadata.
 * The resolver never accepts a browser-provided URL or path as authority.
 */
export const resolveBookNotificationDestination = (input: {
    readonly metadata: BookNotificationMetadata;
    readonly role: NotificationResolverRole;
    readonly exists?: boolean;
    readonly authorized?: boolean;
}): BookNotificationDestination => {
    const parsed = parseNotificationMetadata(input.metadata);
    if (parsed.kind !== 'book') {
        return { status: 'blocked', reason: 'invalid-metadata' };
    }
    const { metadata } = parsed;
    if (input.exists === false) return { status: 'blocked', reason: 'stale-destination' };
    if (input.authorized === false) return { status: 'blocked', reason: 'unauthorized' };

    if (metadata.contextType === 'book-homework') {
        return {
            status: 'allowed',
            path: (input.role === 'teacher' || input.role === 'admin' || input.role === 'super_admin')
                ? `/teacher/homework/${metadata.contextId}`
                : `/student/homework/${metadata.contextId}`,
        };
    }

    return {
        status: 'allowed',
        path: (input.role === 'teacher' || input.role === 'admin' || input.role === 'super_admin')
            ? `/teacher/materials/books/${metadata.contextId}`
            : `/student/practice/${metadata.contextId}`,
    };
};

export const isSafeInternalNotificationPath = (value: unknown): value is string =>
    typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('..')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.length <= 512;
