import { getAuth } from 'firebase/auth';
import {
    DEFAULT_NOTIFICATION_WORKER_ORIGIN,
    notificationWorkerOrigin,
} from './notificationCommandClient';

export async function wakeCourseRequestNotification(actionId: string): Promise<void> {
    try {
        const token = await getAuth().currentUser?.getIdToken() ?? '';
        if (!token) return;
        const origin = notificationWorkerOrigin(
            import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
                || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
        );
        await fetch(`${origin}/enrollment-notifications/actions`, {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': actionId,
            },
            body: JSON.stringify({ schemaVersion: 1, actionId }),
        });
    } catch {
        // The committed embedded intent is picked up by the scheduled retry pass.
    }
}
