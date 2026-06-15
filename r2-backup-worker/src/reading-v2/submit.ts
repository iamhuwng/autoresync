import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from '../auth/firebase-auth';
import { getFirebaseAccessToken } from '../auth/google-oauth';
import {
    buildReadingV2TrustedSubmissionPlan,
    composeReadingPassageSetTrustedRecords,
    composeReadingV2CompositionTrustedRecords,
    getMaterialIdFromRequest,
    parseReadingV2TrustedSubmissionRequest,
    sanitizeRtdbValue,
    type ReadingPassageSetTrustedPassageRecord,
    type ReadingV2SubmitAuthContext,
    type ReadingV2SubmitLoadedRecords,
    type ReadingV2TrustedSubmissionRequest,
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

function firestoreUrl(env: WorkerEnv, documentPath: string): string {
    const encodedPath = documentPath
        .split('/')
        .filter((part) => part.length > 0)
        .map((part) => encodeURIComponent(part))
        .join('/');
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${encodedPath}`;
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

const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const decodeFirestoreValue = (value: unknown): unknown => {
    if (!isRecord(value)) {
        return undefined;
    }

    if ('stringValue' in value) {
        return String(value.stringValue ?? '');
    }

    if ('integerValue' in value) {
        return Number(value.integerValue ?? 0);
    }

    if ('doubleValue' in value) {
        return Number(value.doubleValue ?? 0);
    }

    if ('booleanValue' in value) {
        return Boolean(value.booleanValue);
    }

    if ('timestampValue' in value) {
        return String(value.timestampValue ?? '');
    }

    if ('nullValue' in value) {
        return null;
    }

    if (isRecord(value.arrayValue)) {
        const values = Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
        return values.map(decodeFirestoreValue);
    }

    if (isRecord(value.mapValue)) {
        return decodeFirestoreFields(value.mapValue.fields);
    }

    return undefined;
};

const decodeFirestoreFields = (fields: unknown): Record<string, unknown> => {
    if (!isRecord(fields)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
    );
};

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

const loadFirestoreDoc = async <T>(
    env: WorkerEnv,
    accessToken: string,
    path: string
): Promise<T | null> => {
    const response = await fetch(firestoreUrl(env, path), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(
            `Firestore GET ${path} failed (${response.status}): ${firebaseErrorMessage(body)}`
        );
    }

    if (!isRecord(body) || !isRecord(body.fields)) {
        return null;
    }

    return decodeFirestoreFields(body.fields) as T;
};

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
        message.includes('not found') ||
        message.includes('could not load')
    ) {
        return 404;
    }

    if (message.includes('does not match')) {
        return 409;
    }

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

const isReadingPassageSetSubmit = (
    request: ReadingV2TrustedSubmissionRequest,
    materialId: string
): boolean =>
    request.context?.surface === 'homework' &&
    materialId.startsWith('reading-passage-set:');

const isCompositionFirstMasterMetadata = (
    metadata: Record<string, any> | null
): metadata is Record<string, any> & { compositionId: string } =>
    metadata?.materialKind === 'reading-v2-full-test-composition' &&
    typeof metadata.compositionId === 'string' &&
    metadata.compositionId.trim().length > 0;

const loadReadingPassageSetRecords = async (input: {
    env: WorkerEnv;
    accessToken: string;
    request: ReadingV2TrustedSubmissionRequest;
    materialId: string;
    snapshotVersionId: string;
    generatedAt: string;
}): Promise<ReadingV2SubmitLoadedRecords> => {
    const homeworkId = input.request.context?.homeworkId;
    if (!homeworkId) {
        throw new Error('Reading Passage set trusted submission requires homeworkId.');
    }

    const homework = await loadFirestoreDoc<Record<string, any>>(
        input.env,
        input.accessToken,
        `homework_assignments/${homeworkId}`
    );
    if (!homework) {
        throw new Error('Reading Passage set trusted submission could not load homework assignment.');
    }

    if (
        homework.materialType !== 'reading-passage-set' ||
        homework.materialId !== input.materialId ||
        input.snapshotVersionId !== `homework-set:${homework.id ?? homeworkId}`
    ) {
        throw new Error('Reading Passage set trusted submission does not match the assigned homework.');
    }

    const items = Array.isArray(homework.readingPassageSet?.items)
        ? [...homework.readingPassageSet.items].sort((left, right) => Number(left.order) - Number(right.order))
        : [];

    if (items.length === 0) {
        throw new Error('Reading Passage set trusted submission has no assigned passages.');
    }

    const passageRecords: ReadingPassageSetTrustedPassageRecord[] = await Promise.all(
        items.map(async (item: Record<string, any>) => {
            const [snapshot, reviewProjection, metadata] = await Promise.all([
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/published_snapshots/${item.passageMaterialId}/${item.snapshotVersionId}`
                ),
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/projections/review/${item.passageMaterialId}:${item.snapshotVersionId}`
                ),
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/material_metadata/${item.passageMaterialId}`
                ),
            ]);

            if (!snapshot || !reviewProjection) {
                throw new Error('Reading Passage set trusted submission could not load an assigned passage snapshot.');
            }

            return {
                item,
                snapshot,
                reviewProjection,
                metadata,
            };
        })
    );

    return composeReadingPassageSetTrustedRecords({
        homework: {
            ...homework,
            id: homework.id ?? homeworkId,
        },
        passageRecords,
        generatedAt: input.generatedAt,
    });
};

const loadCompositionFirstMasterRecords = async (input: {
    env: WorkerEnv;
    accessToken: string;
    materialId: string;
    snapshotVersionId: string;
    metadata: Record<string, any>;
    generatedAt: string;
}): Promise<ReadingV2SubmitLoadedRecords> => {
    const compositionId = String(input.metadata.compositionId);
    const composition = await loadRtdb<Record<string, any>>(
        input.env,
        input.accessToken,
        `reading_v2/full_test_composition_versions/${compositionId}/${input.snapshotVersionId}`
    ) ?? await loadRtdb<Record<string, any>>(
        input.env,
        input.accessToken,
        `reading_v2/full_test_compositions/${compositionId}`
    );

    if (!composition) {
        throw new Error('Reading V2 composition trusted submission could not load the full-test composition.');
    }

    const passageRefs = Array.isArray(composition.passageRefs)
        ? [...composition.passageRefs].sort((left, right) => Number(left.order) - Number(right.order))
        : [];

    if (passageRefs.length === 0) {
        throw new Error('Reading V2 composition trusted submission has no passage refs.');
    }

    const passageRecords: ReadingPassageSetTrustedPassageRecord[] = await Promise.all(
        passageRefs.map(async (item: Record<string, any>) => {
            const [snapshot, reviewProjection, passageMetadata] = await Promise.all([
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/published_snapshots/${item.passageMaterialId}/${item.snapshotVersionId}`
                ),
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/projections/review/${item.passageMaterialId}:${item.snapshotVersionId}`
                ),
                loadRtdb<Record<string, any>>(
                    input.env,
                    input.accessToken,
                    `reading_v2/material_metadata/${item.passageMaterialId}`
                ),
            ]);

            if (!snapshot || !reviewProjection) {
                throw new Error('Reading V2 composition trusted submission could not load an assigned passage snapshot.');
            }

            return {
                item,
                snapshot,
                reviewProjection,
                metadata: passageMetadata,
            };
        })
    );

    return composeReadingV2CompositionTrustedRecords({
        composition,
        materialId: input.materialId,
        snapshotVersionId: input.snapshotVersionId,
        metadata: input.metadata,
        passageRecords,
        generatedAt: input.generatedAt,
    });
};

const loadStandardReadingV2Records = async (input: {
    env: WorkerEnv;
    accessToken: string;
    materialId: string;
    snapshotVersionId: string;
    generatedAt: string;
}): Promise<ReadingV2SubmitLoadedRecords> => {
    const metadata = await loadRtdb<Record<string, any>>(
        input.env,
        input.accessToken,
        `reading_v2/material_metadata/${input.materialId}`
    );

    if (isCompositionFirstMasterMetadata(metadata)) {
        return loadCompositionFirstMasterRecords({
            env: input.env,
            accessToken: input.accessToken,
            materialId: input.materialId,
            snapshotVersionId: input.snapshotVersionId,
            metadata,
            generatedAt: input.generatedAt,
        });
    }

    const [snapshot, reviewProjection] = await Promise.all([
        loadRtdb<Record<string, any>>(
            input.env,
            input.accessToken,
            `reading_v2/published_snapshots/${input.materialId}/${input.snapshotVersionId}`
        ),
        loadRtdb<Record<string, any>>(
            input.env,
            input.accessToken,
            `reading_v2/projections/review/${input.materialId}:${input.snapshotVersionId}`
        ),
    ]);

    return {
        snapshot: snapshot ?? {},
        reviewProjection: reviewProjection ?? {},
        metadata,
    };
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
        const submittedAt = new Date();
        const sessionPath = submission.context?.sessionCode
            ? `game_sessions/${submission.context.sessionCode}`
            : null;
        const trustedRecordsPromise = isReadingPassageSetSubmit(submission, materialId)
            ? loadReadingPassageSetRecords({
                env,
                accessToken,
                request: submission,
                materialId,
                snapshotVersionId: submission.sourceSnapshotVersionId,
                generatedAt: submittedAt.toISOString(),
            })
            : loadStandardReadingV2Records({
                env,
                accessToken,
                materialId,
                snapshotVersionId: submission.sourceSnapshotVersionId,
                generatedAt: submittedAt.toISOString(),
            });

        const [records, session, studentProfile] = await Promise.all([
            trustedRecordsPromise,
            sessionPath ? loadRtdb<Record<string, any>>(env, accessToken, sessionPath) : Promise.resolve(null),
            loadRtdb<Record<string, any>>(env, accessToken, `users/${auth.uid}`),
        ]);

        if (!records.snapshot || Object.keys(records.snapshot).length === 0) {
            return errorResponse('Reading V2 published snapshot was not found.', 404);
        }

        if (!records.reviewProjection || Object.keys(records.reviewProjection).length === 0) {
            return errorResponse('Reading V2 review projection was not found.', 404);
        }

        const authContext: ReadingV2SubmitAuthContext = {
            uid: auth.uid,
            name: auth.name,
            email: auth.email,
        };
        const loadedRecords: ReadingV2SubmitLoadedRecords = {
            ...records,
            session,
            studentProfile,
        };
        const plan = buildReadingV2TrustedSubmissionPlan({
            request: submission,
            auth: authContext,
            records: loadedRecords,
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
