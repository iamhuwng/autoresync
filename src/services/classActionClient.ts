import { getAuth } from 'firebase/auth';
import {
    DEFAULT_NOTIFICATION_WORKER_ORIGIN,
    notificationWorkerOrigin,
} from './notificationCommandClient';

export type ClassActionKind = 'join-pending' | 'direct-add' | 'approve' | 'reject';

export interface ClassActionResult {
    readonly success: boolean;
    readonly committed?: boolean;
    readonly notificationStatus?: 'delivered' | 'retry_due';
    readonly error?: string;
}

export const commitClassAction = async (input: {
    readonly kind: ClassActionKind;
    readonly classId: string;
    readonly studentId: string;
}, options: {
    readonly workerOrigin?: string;
    readonly getIdToken?: () => Promise<string>;
    readonly fetchImpl?: typeof fetch;
} = {}): Promise<ClassActionResult> => {
    try {
        const actionId = crypto.randomUUID();
        const token = options.getIdToken
            ? await options.getIdToken()
            : await getAuth().currentUser?.getIdToken() ?? '';
        if (!token) return { success: false, error: 'class_action_unauthenticated' };
        const workerOrigin = notificationWorkerOrigin(
            options.workerOrigin?.trim()
            || import.meta.env.VITE_NOTIFICATION_COMMAND_WORKER_URL?.trim()
            || DEFAULT_NOTIFICATION_WORKER_ORIGIN,
        );
        const response = await (options.fetchImpl ?? globalThis.fetch)(
            `${workerOrigin}/class-notifications/actions`, {
                method: 'POST', credentials: 'omit', redirect: 'error',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': actionId,
                },
                body: JSON.stringify({
                    schemaVersion: 1,
                    actionType: 'class-membership-transition',
                    actionId,
                    ...input,
                }),
            },
        );
        const body = await response.json() as Record<string, unknown>;
        if (!response.ok) return {
            success: false,
            error: typeof body.code === 'string' ? body.code : `class_action_http_${response.status}`,
        };
        if ((body.status !== 'committed' && body.status !== 'replayed')
            || body.actionId !== actionId) {
            return { success: false, error: 'class_action_response_invalid' };
        }
        return {
            success: true,
            committed: body.status === 'committed',
            notificationStatus: body.notificationStatus === 'delivered' ? 'delivered' : 'retry_due',
        };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'class_action_failed' };
    }
};
