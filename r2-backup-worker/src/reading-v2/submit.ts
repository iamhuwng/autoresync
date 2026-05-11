import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from '../auth/firebase-auth';
import { getFirebaseAccessToken } from '../auth/google-oauth';
import {
    buildReadingV2TrustedSubmissionPlan,
    getMaterialIdFromRequest,
    parseReadingV2TrustedSubmissionRequest,
    sanitizeRtdbValue,
    type ReadingV2SubmitAuthContext,
    type ReadingV2SubmitLoadedRecords,
} from '../../../functions/src/readingV2SubmitCore';

const MAX_SUBMISSION_BODY_BYTES = 512 * 1024;

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message, message }, status);
}

function encodeRtdbPath(path: string): string {
    return path
        .split('/')
        .filter((part) => part.length > 0)
        .map((part) => encodeURIComponent(part))
        .join('/');
}

function rtdbUrl(env: WorkerEnv, path: string): string {
    const baseUrl = env.FIREBASE_DB_URL.replace(/\/$/, '');
    const encodedPath = encodeRtdbPath(path);
    return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
}

function parseJsonBody(text: string): unknown {
    if (!text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function firebaseErrorMessage(body: unknown): string {
    if (body && typeof body === 'object' && 'error' in body) {
        return String((body as { error?: unknown }).error);
    }

    return String(body ?? 'Unknown Firebase REST error');
}

async function firebaseRequest<T>(input: {
    env: WorkerEnv;
    accessToken: string;
    method: 'GET' | 'PUT' | 'PATCH';
    path: string;
    body?: unknown;
}): Promise<T> {
    const headers = new Headers({
        Authorization: `Bearer ${input.accessToken}`,
    });

    if (input.body !== undefined) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(rtdbUrl(input.env, input.path), {
        method: input.method,
        headers,
        body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (!response.ok) {
        throw new Error(
            `Firebase RTDB ${input.method} ${input.path || '/'} failed (${response.status}): ${firebaseErrorMessage(body)}`
        );
    }

    return body as T;
}

const loadRtdb = async <T>(
    env: WorkerEnv,
    accessToken: string,
    path: string
): Promise<T | null> =>
    firebaseRequest<T | null>({
        env,
        accessToken,
        method: 'GET',
        path,
    });

const setRtdb = async (
    env: WorkerEnv,
    accessToken: string,
    path: string,
    value: unknown
): Promise<void> => {
    await firebaseRequest<unknown>({
        env,
        accessToken,
        method: 'PUT',
        path,
        body: value,
    });
};

const updateRtdbRoot = async (
    env: WorkerEnv,
    accessToken: string,
    updates: Record<string, unknown>
): Promise<void> => {
    await firebaseRequest<unknown>({
        env,
        accessToken,
        method: 'PATCH',
        path: '',
        body: updates,
    });
};

const classifySubmissionError = (message: string): number => {
    if (
        message.includes('missing') ||
        message.includes('requires') ||
        message.includes('must be') ||
        message.includes('unsupported') ||
        message.includes('binding')
    ) {
        return 400;
    }

    return 500;
};

export async function handleReadingV2Submit(
    request: Request,
    env: WorkerEnv
): Promise<Response> {
    const contentLengthHeader = request.headers.get('Content-Length');
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;

    if (Number.isFinite(contentLength) && contentLength > MAX_SUBMISSION_BODY_BYTES) {
        return errorResponse('Reading V2 submission payload is too large.', 413);
    }

    const auth = await verifyFirebaseToken(request.headers.get('Authorization'), env);
    if (!auth.valid || !auth.uid) {
        return errorResponse(auth.error ?? 'Unauthorized', 403);
    }

    try {
        const body = await request.json();
        const submission = parseReadingV2TrustedSubmissionRequest(body);
        const materialId = getMaterialIdFromRequest(submission);
        const accessToken = await getFirebaseAccessToken(env.GOOGLE_SA_KEY);
        const snapshotPath = `reading_v2/published_snapshots/${materialId}/${submission.sourceSnapshotVersionId}`;
        const reviewProjectionPath = `reading_v2/projections/review/${materialId}:${submission.sourceSnapshotVersionId}`;
        const metadataPath = `reading_v2/material_metadata/${materialId}`;
        const sessionPath = submission.context?.sessionCode
            ? `game_sessions/${submission.context.sessionCode}`
            : null;

        const [snapshot, reviewProjection, metadata, session, studentProfile] = await Promise.all([
            loadRtdb<Record<string, any>>(env, accessToken, snapshotPath),
            loadRtdb<Record<string, any>>(env, accessToken, reviewProjectionPath),
            loadRtdb<Record<string, any>>(env, accessToken, metadataPath),
            sessionPath ? loadRtdb<Record<string, any>>(env, accessToken, sessionPath) : Promise.resolve(null),
            loadRtdb<Record<string, any>>(env, accessToken, `users/${auth.uid}`),
        ]);

        if (!snapshot) {
            return errorResponse('Reading V2 published snapshot was not found.', 404);
        }

        if (!reviewProjection) {
            return errorResponse('Reading V2 review projection was not found.', 404);
        }

        const submittedAt = new Date();
        const authContext: ReadingV2SubmitAuthContext = {
            uid: auth.uid,
            name: auth.name,
            email: auth.email,
        };
        const records: ReadingV2SubmitLoadedRecords = {
            snapshot,
            reviewProjection,
            metadata,
            session,
            studentProfile,
        };
        const plan = buildReadingV2TrustedSubmissionPlan({
            request: submission,
            auth: authContext,
            records,
            identity: {
                resultId: `reading-v2-result-${crypto.randomUUID()}`,
                attemptId: `reading-v2-attempt-${crypto.randomUUID()}`,
                submittedAtIso: submittedAt.toISOString(),
                submittedAtMs: submittedAt.getTime(),
            },
        });

        await setRtdb(env, accessToken, plan.canonicalResultPath, sanitizeRtdbValue(plan.savedResult));

        if (Object.keys(plan.secondaryUpdates).length > 0) {
            await updateRtdbRoot(env, accessToken, sanitizeRtdbValue(plan.secondaryUpdates));
        }

        return jsonResponse(plan.response);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Reading V2 trusted submission failed.';
        const status = classifySubmissionError(message);
        console.error('[ReadingV2Submit] Failed:', message);
        return errorResponse(
            status === 500 ? 'Reading V2 trusted submission failed.' : message,
            status
        );
    }
}
