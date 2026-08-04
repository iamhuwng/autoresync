import { equalTo, get, orderByChild, query, ref } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { auth, database, firestore } from './firebase';
import { extractParams, ROUTES, type RouteName, type RouteParams } from '../constants/routes';
import type {
    BookNotificationMetadata,
    LegacyNotificationMetadata,
    Notification,
} from '../types/notification.types';
import { parseNotificationMetadata } from './notificationMetadata';

export type NotificationResolverRole = 'student' | 'teacher' | 'admin';

export type NotificationResolutionBlockReason =
    | 'unauthenticated'
    | 'unauthorized'
    | 'invalid-link'
    | 'invalid-metadata'
    | 'unsupported-destination'
    | 'stale-destination'
    | 'destination-state-unavailable';

export type NotificationDestinationResolution =
    | {
        readonly status: 'allowed';
        readonly destination: RouteName;
        readonly params: RouteParams;
    }
    | {
        readonly status: 'blocked';
        readonly reason: NotificationResolutionBlockReason;
    };

export interface NotificationDestinationStateRequest {
    readonly destination: RouteName;
    readonly params: RouteParams;
    readonly metadata?: BookNotificationMetadata;
    readonly userId: string;
    readonly currentPath: string;
}

export interface NotificationDestinationState {
    readonly exists: boolean;
    readonly authorized: boolean;
    readonly active?: boolean;
}

export interface NotificationResolverContext {
    readonly userId: string;
    readonly currentPath: string;
    readonly role: NotificationResolverRole;
    readonly authUserId?: string | null;
    readonly readCurrentState?: (
        request: NotificationDestinationStateRequest
    ) => Promise<NotificationDestinationState>;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const INTERNAL_NOTIFICATION_ROUTES: readonly RouteName[] = [
    'STUDENT_DASHBOARD',
    'STUDENT_COURSES',
    'STUDENT_COURSE_DETAIL',
    'STUDENT_COURSE_CATALOG',
    'STUDENT_CLASS_DETAIL',
    'STUDENT_HOMEWORK',
    'STUDENT_HOMEWORK_DETAIL',
    'STUDENT_LIBRARY',
    'STUDENT_ACADEMIC_RECORD',
    'STUDENT_PRACTICE',
    'RESULT_DETAIL',
    'ADMIN_DASHBOARD',
    'TEACHER_CLASSES',
    'TEACHER_CLASS_DETAIL',
    'TEACHER_HOMEWORK',
    'TEACHER_HOMEWORK_DETAIL',
    'TEACHER_COURSES',
    'TEACHER_COURSE_DETAIL',
    'TEACHER_STUDENTS',
    'TEACHER_GRADING',
    'TEACHER_GRADING_DETAIL',
    'TEACHER_MATERIAL_BOOK',
    'STUDENT_WAITING',
    'STUDENT_TEST',
    'STUDENT_TEST_RESULTS',
    'TEACHER_WAITING',
    'TEACHER_TEST_MONITOR',
];

const STUDENT_NOTIFICATION_ROUTES = new Set<RouteName>([
    'STUDENT_DASHBOARD',
    'STUDENT_COURSES',
    'STUDENT_COURSE_DETAIL',
    'STUDENT_COURSE_CATALOG',
    'STUDENT_CLASS_DETAIL',
    'STUDENT_HOMEWORK',
    'STUDENT_HOMEWORK_DETAIL',
    'STUDENT_LIBRARY',
    'STUDENT_ACADEMIC_RECORD',
    'STUDENT_PRACTICE',
    'STUDENT_WAITING',
    'STUDENT_TEST',
    'STUDENT_TEST_RESULTS',
]);

const TEACHER_NOTIFICATION_ROUTES = new Set<RouteName>([
    'TEACHER_CLASSES',
    'TEACHER_CLASS_DETAIL',
    'TEACHER_HOMEWORK',
    'TEACHER_HOMEWORK_DETAIL',
    'TEACHER_COURSES',
    'TEACHER_COURSE_DETAIL',
    'TEACHER_STUDENTS',
    'TEACHER_GRADING',
    'TEACHER_GRADING_DETAIL',
    'TEACHER_MATERIAL_BOOK',
    'TEACHER_WAITING',
    'TEACHER_TEST_MONITOR',
]);

const ADMIN_NOTIFICATION_ROUTES = new Set<RouteName>(['ADMIN_DASHBOARD']);

const SESSION_ROUTES = new Set<RouteName>([
    'STUDENT_WAITING',
    'STUDENT_TEST',
    'TEACHER_WAITING',
    'TEACHER_TEST_MONITOR',
]);

const RESULT_ROUTES = new Set<RouteName>(['STUDENT_TEST_RESULTS']);
const STATE_GATED_LEGACY_ROUTES = new Set<RouteName>([
    'STUDENT_COURSE_DETAIL',
    'STUDENT_PRACTICE',
    'TEACHER_COURSE_DETAIL',
    'TEACHER_HOMEWORK_DETAIL',
    'TEACHER_MATERIAL_BOOK',
]);

const roleCanOpen = (destination: RouteName, role: NotificationResolverRole): boolean => {
    if (ADMIN_NOTIFICATION_ROUTES.has(destination)) return role === 'admin';
    if (STUDENT_NOTIFICATION_ROUTES.has(destination)) return role === 'student';
    if (TEACHER_NOTIFICATION_ROUTES.has(destination)) return role === 'teacher' || role === 'admin';
    return true;
};

const safeParams = (params: RouteParams): boolean =>
    Object.values(params).every((value) => value === undefined || (typeof value === 'string' && SAFE_ID.test(value)));

const parseLegacyDestination = (
    link: string,
    metadata?: LegacyNotificationMetadata,
): { destination: RouteName; params: RouteParams } | null => {
    if (!link.startsWith('/') || link.startsWith('//')) return null;

    let url: URL;
    try {
        url = new URL(link, 'https://notification.invalid');
    } catch {
        return null;
    }

    if (url.pathname === '/student/results') {
        const sessionCode = metadata?.sessionCode;
        return typeof sessionCode === 'string' && SAFE_ID.test(sessionCode)
            ? { destination: 'STUDENT_TEST_RESULTS', params: { sessionCode } }
            : null;
    }

    const announcement = url.pathname.match(/^\/courses\/([^/]+)\/announcements\/([^/]+)$/u);
    if (announcement && SAFE_ID.test(announcement[1]) && SAFE_ID.test(announcement[2])) {
        return {
            destination: 'STUDENT_COURSE_DETAIL',
            params: { courseId: announcement[1] },
        };
    }

    for (const destination of INTERNAL_NOTIFICATION_ROUTES) {
        const params = extractParams(destination, url.pathname);
        if (params && safeParams(params)) {
            return { destination, params };
        }
    }

    return null;
};

const bookDestination = (
    metadata: BookNotificationMetadata,
    role: NotificationResolverRole
): { destination: RouteName; params: RouteParams } | null => {
    const teacher = role === 'teacher' || role === 'admin';

    switch (metadata.contextType) {
        case 'book':
        case 'book-activity':
            return teacher
                ? { destination: 'TEACHER_MATERIAL_BOOK', params: { bookId: metadata.contextId } }
                : { destination: 'STUDENT_PRACTICE', params: { materialId: metadata.contextId } };
        case 'book-homework':
            return teacher
                ? { destination: 'TEACHER_HOMEWORK_DETAIL', params: { homeworkId: metadata.contextId } }
                : { destination: 'STUDENT_HOMEWORK_DETAIL', params: { homeworkId: metadata.contextId } };
        default:
            return null;
    }
};

const defaultStateReader = async (
    request: NotificationDestinationStateRequest,
    role: NotificationResolverRole
): Promise<NotificationDestinationState> => {
    let path: string | null = null;

    if (request.destination === 'TEACHER_HOMEWORK_DETAIL') {
        try {
            const snapshot = await getDoc(doc(
                firestore,
                'homework_assignments',
                request.params.homeworkId ?? '',
            ));
            if (!snapshot.exists()) return { exists: false, authorized: false };
            const ownerId = snapshot.data().createdBy;
            return {
                exists: true,
                authorized: role === 'admin' || ownerId === request.userId,
            };
        } catch {
            throw new Error('Notification destination state unavailable');
        }
    } else if (request.destination === 'STUDENT_COURSE_DETAIL') {
        try {
            const courseId = request.params.courseId ?? '';
            const [course, enrollments] = await Promise.all([
                get(ref(database, `courses/${courseId}`)),
                get(query(
                    ref(database, 'course_enrollments'),
                    orderByChild('studentId'),
                    equalTo(request.userId),
                )),
            ]);
            if (!course.exists()) return { exists: false, authorized: false };
            const records = enrollments.exists()
                ? Object.values(enrollments.val() as Record<string, Record<string, unknown>>)
                : [];
            const authorized = records.some((record) =>
                record.courseId === courseId
                && record.status === 'active'
                && (record.expiresAt === 0
                    || (typeof record.expiresAt === 'number' && record.expiresAt > Date.now())));
            return { exists: true, authorized };
        } catch {
            throw new Error('Notification destination state unavailable');
        }
    } else if (SESSION_ROUTES.has(request.destination) || RESULT_ROUTES.has(request.destination)) {
        const sessionId = request.params.gameSessionId ?? request.params.sessionCode;
        if (sessionId) path = `game_sessions/${sessionId}`;
    } else if (request.destination === 'TEACHER_COURSE_DETAIL') {
        path = `courses/${request.params.courseId ?? ''}`;
    } else if (
        request.metadata?.contextType === 'book-homework'
        || (request.metadata && role === 'student')
        || request.destination === 'STUDENT_PRACTICE'
    ) {
        throw new Error('Trusted Book destination reader unavailable');
    } else if (role === 'teacher' || role === 'admin') {
        path = `material_catalog/books/${request.metadata?.contextId ?? request.params.bookId ?? ''}`;
    }

    if (!path) return { exists: true, authorized: true };

    try {
        const snapshot = await get(ref(database, path));
        if (!snapshot.exists()) return { exists: false, authorized: false, active: false };

        const value = snapshot.val() as Record<string, unknown> | null;
        if (
            (
                request.metadata
                || request.destination === 'TEACHER_COURSE_DETAIL'
                || request.destination === 'TEACHER_MATERIAL_BOOK'
            )
            && (role === 'teacher' || role === 'admin')
            && value
        ) {
            const ownerId = value.ownerId ?? value.createdBy ?? value.teacherId;
            if (role !== 'admin' && (typeof ownerId !== 'string' || ownerId !== request.userId)) {
                return { exists: true, authorized: false };
            }
        }

        if (RESULT_ROUTES.has(request.destination) && role === 'student') {
            const players = value?.players;
            const authorized = typeof players === 'object'
                && players !== null
                && !Array.isArray(players)
                && Object.prototype.hasOwnProperty.call(players, request.userId);
            return { exists: true, authorized };
        }

        if (SESSION_ROUTES.has(request.destination) && value?.status) {
            const active = value.status === 'waiting' || value.status === 'in-progress';
            return { exists: true, authorized: active, active };
        }

        return { exists: true, authorized: true };
    } catch {
        throw new Error('Notification destination state unavailable');
    }
};

const applyStateGate = async (
    target: { destination: RouteName; params: RouteParams },
    context: NotificationResolverContext,
    metadata?: BookNotificationMetadata
): Promise<NotificationDestinationResolution> => {
    const stateReader = context.readCurrentState ?? ((request) => defaultStateReader(request, context.role));
    try {
        const state = await stateReader({
            ...target,
            metadata,
            userId: context.userId,
            currentPath: context.currentPath,
        });

        if (!state.exists) return { status: 'blocked', reason: 'stale-destination' };
        if (!state.authorized || state.active === false) return { status: 'blocked', reason: 'unauthorized' };
        return { status: 'allowed', ...target };
    } catch {
        return { status: 'blocked', reason: 'destination-state-unavailable' };
    }
};

export async function resolveNotificationDestination(
    notification: Notification,
    context: NotificationResolverContext
): Promise<NotificationDestinationResolution> {
    const authenticatedUserId = context.authUserId === undefined
        ? auth.currentUser?.uid ?? null
        : context.authUserId;

    if (!context.userId || !authenticatedUserId || authenticatedUserId !== context.userId) {
        return { status: 'blocked', reason: authenticatedUserId ? 'unauthorized' : 'unauthenticated' };
    }

    const parsedMetadata = parseNotificationMetadata(notification.metadata);
    if (parsedMetadata.kind === 'invalid') {
        return { status: 'blocked', reason: 'invalid-metadata' };
    }

    if (parsedMetadata.kind === 'book') {
        const target = bookDestination(parsedMetadata.metadata, context.role);
        if (!target) return { status: 'blocked', reason: 'unsupported-destination' };
        return applyStateGate(target, context, parsedMetadata.metadata);
    }

    if (!notification.link) {
        return { status: 'blocked', reason: 'invalid-link' };
    }

    const target = parseLegacyDestination(
        notification.link,
        parsedMetadata.kind === 'legacy' ? parsedMetadata.metadata : undefined,
    );
    if (!target) return { status: 'blocked', reason: 'invalid-link' };
    if (!roleCanOpen(target.destination, context.role)) {
        return { status: 'blocked', reason: 'unauthorized' };
    }

    if (
        !SESSION_ROUTES.has(target.destination)
        && !RESULT_ROUTES.has(target.destination)
        && !STATE_GATED_LEGACY_ROUTES.has(target.destination)
    ) {
        return { status: 'allowed', ...target };
    }

    return applyStateGate(target, context);
}

export const isRegisteredNotificationRoute = (path: string): boolean =>
    INTERNAL_NOTIFICATION_ROUTES.some((route) => Boolean(extractParams(route, path)));

export const notificationRouteRegistry = ROUTES;
