import { auth } from './firebase';
import {
    DEFAULT_NOTIFICATION_WORKER_ORIGIN,
    notificationWorkerOrigin,
} from './notificationCommandClient';

const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export async function wakeCourseTypeDecisionDelivery(requestId: string): Promise<boolean> {
    if (!REQUEST_ID.test(requestId)) return false;
    const user = auth.currentUser;
    if (!user) return false;
    try {
        const origin = notificationWorkerOrigin(
            import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
                || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
        );
        const response = await fetch(`${origin}/notifications/course-type-decisions/dispatch`, {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            headers: {
                Authorization: `Bearer ${await user.getIdToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                schemaVersion: 1,
                actionType: 'dispatch-course-type-decision',
                requestId,
            }),
            signal: AbortSignal.timeout(8_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}
