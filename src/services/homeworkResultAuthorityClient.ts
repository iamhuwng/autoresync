import { getAuth } from 'firebase/auth';
import { notificationWorkerOrigin } from './notificationCommandClient';

export type HomeworkAuthorityVerification =
    | { status: 'created' | 'replayed' }
    | { status: 'held' | 'failed'; code: string };

/** One product verification attempt after save; never dispatches a notice. */
export async function verifyHomeworkResultAuthority(resultId: string, options: {
    workerOrigin?: string;
    getIdToken?: () => Promise<string>;
    fetchImpl?: typeof fetch;
} = {}): Promise<HomeworkAuthorityVerification> {
    const origin = options.workerOrigin ?? import.meta.env.VITE_HOMEWORK_RESULT_AUTHORITY_URL;
    if (!origin?.trim()) return { status: 'held', code: 'homework_authority_not_qualified' };
    try {
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(resultId)) throw Error('homework_authority_invalid_result');
        const destination = `${notificationWorkerOrigin(origin)}/homework-result-authority`;
        const token = await (options.getIdToken ?? (async () => getAuth().currentUser?.getIdToken(false) ?? ''))();
        if (!token) throw Error('homework_authority_unauthenticated');
        const response = await (options.fetchImpl ?? fetch)(destination, {
            method: 'POST', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ resultId }),
        });
        const text = await response.text();
        if (new TextEncoder().encode(text).length > 2048) throw Error('homework_authority_response_invalid');
        const body = JSON.parse(text) as { status?: unknown };
        if (!response.ok || !['created', 'replayed'].includes(String(body?.status)))
            throw Error(typeof body?.status === 'string' ? body.status : 'homework_authority_unconfirmed');
        return { status: body.status as 'created' | 'replayed' };
    } catch (error) {
        return { status: 'failed', code: error instanceof Error ? error.message : 'homework_authority_unconfirmed' };
    }
}
