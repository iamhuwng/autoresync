import { z } from 'zod';
import { DRAFT_AUDIO_ASSET_ID, type AudioAssetRecord } from '@/types/assessmentAudio.types';
import type { AudioTestType } from '@/config/testTypeCapabilities';

const diagnostics = {
    invalid_request: 'Check the fields and try again.',
    teacher_required: 'Sign in with an active teacher account.',
    draft_audio_not_found: 'Save this draft and section, or reopen the draft before trying again.',
    connection_not_found: 'This connection is unavailable. Refresh connection status.',
    revoked_connection: 'Access was revoked. Connect a new key or choose another source.',
    archived_connection: 'This connection is retained for playback. Select it for authoring before browsing.',
    generation_conflict: 'The connection changed. Review the refreshed status before trying again.',
    rotation_scope_changed: 'Rotate with a key for the original account, bucket, and prefix.',
    use_rotation: 'This key matches an existing retained connection. Select or rotate that connection instead.',
    connection_limit: 'Revoke an unused connection before connecting another source.',
    connection_in_use: 'This archived source still has linked recordings. Repair or replace them before cleanup.',
    invalid_key: 'The key is invalid or expired. Create a replacement key and rotate it.',
    insufficient_capabilities: 'Use a read-only application key restricted to this bucket.',
    wrong_bucket: 'Check that the key is restricted to the chosen bucket.',
    wrong_prefix: 'Check the allowed folder prefix, including its trailing slash.',
    private_bucket_required: 'Set the B2 bucket to private and try again.',
    object_missing: 'Restore this version in B2 or select another file.',
    object_changed: 'The exact file version changed. Refresh the list and select a version again.',
    unsupported_audio: 'Choose a supported audio file.',
    oversized_audio: 'Choose an audio file of 50 MB or less.',
    rate_limited: 'Too many requests. Wait a moment and retry.',
    provider_rate_limited: 'Backblaze is limiting requests. Wait a moment and retry.',
    provider_unavailable: 'Backblaze is temporarily unavailable. Try again.',
    store_unavailable: 'External audio storage is unavailable. Try again.',
    restore_in_progress: 'Connection changes are paused during restore. Try again later.',
    playback_denied: 'The recording is unavailable for this activity.',
    audio_unavailable: 'The recording is unavailable. Ask your teacher to check it.',
    audio_required: 'Choose your own recording for each required audio section before publishing.',
    draft_changed: 'This draft changed during publication. Reopen the draft and try again.',
} as const;

type AudioDiagnostic = keyof typeof diagnostics;
const isDiagnostic = (code: unknown): code is AudioDiagnostic =>
    typeof code === 'string' && Object.hasOwn(diagnostics, code);

export class ExternalAudioRequestError extends Error {
    constructor(readonly code: AudioDiagnostic) {
        super(diagnostics[code]);
    }
}

export const externalAudioFeedback = (error: unknown) =>
    error instanceof ExternalAudioRequestError ? error.message : diagnostics.store_unavailable;

export const externalAudioHealth = (health: string) => health === 'healthy'
    ? 'Healthy'
    : isDiagnostic(health) ? diagnostics[health] : 'Connection needs attention. Recheck its status.';

const connection = z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(64).optional(),
    state: z.enum(['active', 'archived', 'revoked']),
    bucketName: z.string(),
    prefix: z.string(),
    health: z.string().transform((value) => value === 'healthy' || isDiagnostic(value) ? value : 'store_unavailable'),
    checkedAt: z.number().int().nonnegative(),
    lastSuccessfulAt: z.number().int().nonnegative().optional(),
});

const summary = z.object({
    generation: z.number().int().nonnegative(),
    activeConnectionId: z.string().nullable(),
    connections: z.array(connection),
});
const impact = z.object({
    connectionId: z.string().min(1), linkedFileCount: z.number().int().nonnegative(),
    draftCount: z.number().int().nonnegative(), publishedCount: z.number().int().nonnegative(),
    publicTestCount: z.number().int().nonnegative(), homeworkCount: z.number().int().nonnegative(),
    resultCount: z.number().int().nonnegative(), cleanupEligible: z.boolean(),
});
const adminConnection = connection.extend({ ownerId: z.string().min(1) });
const adminHealth = z.object({
    generatedAt: z.number().int().nonnegative(), connections: z.array(adminConnection),
});

const file = z.object({
    objectKey: z.string().min(1),
    providerVersionId: z.string().min(1),
    contentType: z.string(),
    sizeBytes: z.number().int().positive(),
    lastModifiedAt: z.number().int().nonnegative().optional(),
});

const page = z.object({ files: z.array(file), nextCursor: z.string().nullable() });
const validation = connection.pick({ bucketName: true, prefix: true }).extend({ health: z.literal('healthy') });
const preview = z.object({ file, url: z.string(), expiresAt: z.number().int().positive() });
const draftAudio = z.object({ assetId: z.string().regex(DRAFT_AUDIO_ASSET_ID), scope: z.literal('section') }).strict();
const draftPreview = preview.omit({ file: true }).strict();
const draftRecording = z.object({ filename: z.string().min(1), lastModifiedAt: z.number().int().nonnegative().optional() });
export type DraftAudioTarget = { testType: AudioTestType; draftId: string; sectionId: string };

export type ExternalAudioConnection = z.infer<typeof connection>;
export type AdminAudioConnection = z.infer<typeof adminConnection>;
export type ExternalAudioSummary = z.infer<typeof summary>;
export type ExternalAudioImpact = z.infer<typeof impact>;
export type ExternalAudioFile = z.infer<typeof file>;
export type ExternalAudioPreview = z.infer<typeof preview>;
export type DraftRecording = z.infer<typeof draftRecording>;
export type ExternalAudioSelection = Pick<Extract<AudioAssetRecord, { storageProvider: 'b2' }>,
    'storageProvider' | 'connectionId' | 'objectKey' | 'providerVersionId' | 'contentType' | 'sizeBytes'
> & { generation: number; lastModifiedAt?: number };

type Key = { applicationKeyId: string; applicationKey: string };
type Scope = { bucketName: string; prefix: string };
type ConnectionVersion = { connectionId: string; generation: number };
type FileTarget = Pick<ExternalAudioFile, 'objectKey' | 'providerVersionId'> & { connectionId: string };

interface AudioQaEnv {
    DEV?: boolean;
    VITE_EXTERNAL_AUDIO_LOCAL_QA?: string;
    VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA?: string;
    VITE_EXTERNAL_AUDIO_PRIVATE_HOMEWORK_LOCAL_QA?: string;
    VITE_EXTERNAL_AUDIO_PUBLIC_LISTENING_LOCAL_QA?: string;
    VITE_EXTERNAL_AUDIO_THCS_LOCAL_QA?: string;
    VITE_EXTERNAL_AUDIO_UPLOAD_ROLLOUT?: string;
    VITE_EXTERNAL_AUDIO_UPLOAD_ROLLBACK?: string;
    VITE_BACKUP_WORKER_URL?: string;
    VITE_FIREBASE_LOCAL_ONLY?: string;
    VITE_FIREBASE_PROJECT_ID?: string;
    VITE_R2_UPLOAD_WORKER_URL?: string;
}

const PRODUCTION_APP_ORIGINS = new Set(['https://kahut1.web.app', 'https://hocthem.net']);
const PRODUCTION_WORKER_ORIGINS = new Set(['https://r2-upload-signer.iamhuwng.workers.dev']);

function parseUrl(value: string) {
    try { return new URL(value); }
    catch { return null; }
}

function localOrigin(value: string | undefined) {
    if (!value) return null;
    const url = parseUrl(value);
    if (url?.protocol === 'http:' && url.hostname === 'localhost' && url.port
        && (value === url.origin || value === `${url.origin}/`)) return url.origin;
    return null;
}

function httpsOrigin(value: string | undefined) {
    if (!value) return null;
    const url = parseUrl(value);
    if (url?.protocol === 'https:' && !url.port && (value === url.origin || value === `${url.origin}/`)) return url.origin;
    return null;
}

function productionAppOrigin(value: string | undefined) {
    const origin = httpsOrigin(value);
    return origin && PRODUCTION_APP_ORIGINS.has(origin) ? origin : null;
}

function productionWorkerOrigin(value: string | undefined) {
    const origin = httpsOrigin(value);
    return origin && PRODUCTION_WORKER_ORIGINS.has(origin) ? origin : null;
}

function isProductionAudioEnv(env: AudioQaEnv) {
    return env.DEV !== true
        && env.VITE_FIREBASE_LOCAL_ONLY !== 'true'
        && env.VITE_FIREBASE_PROJECT_ID === 'temp-a1437';
}

export function resolveExternalAudioOrigin(
    profile: { role?: string; disabled?: boolean; forceReauth?: boolean; status?: string } | null | undefined,
    env: AudioQaEnv = import.meta.env,
    origin = globalThis.location?.origin,
) {
    if ((profile?.role !== 'teacher' && profile?.role !== 'super_admin')
        || profile.disabled || profile.forceReauth
        || ['blocked', 'disabled', 'inactive', 'suspended'].includes(profile.status ?? '')) return null;
    if (isProductionAudioEnv(env)) {
        if (!productionAppOrigin(origin)) return null;
        return productionWorkerOrigin(env.VITE_R2_UPLOAD_WORKER_URL || 'https://r2-upload-signer.iamhuwng.workers.dev');
    }
    if (!env.DEV || env.VITE_EXTERNAL_AUDIO_LOCAL_QA !== 'enabled' || env.VITE_FIREBASE_LOCAL_ONLY !== 'true'
        || env.VITE_FIREBASE_PROJECT_ID !== 'demo-luyentap-local' || !localOrigin(origin)) return null;
    return localOrigin(env.VITE_R2_UPLOAD_WORKER_URL);
}

export function externalAudioAuthoringOptedIn(env: AudioQaEnv = import.meta.env) {
    return isProductionAudioEnv(env) || (env.DEV === true && env.VITE_EXTERNAL_AUDIO_AUTHORING_LOCAL_QA === 'enabled');
}

export function externalAudioChooserRolloutEnabled(env: AudioQaEnv = import.meta.env) {
    if (isProductionAudioEnv(env)) {
        return env.VITE_EXTERNAL_AUDIO_UPLOAD_ROLLBACK !== 'enabled';
    }
    return externalAudioAuthoringOptedIn(env)
        && env.VITE_EXTERNAL_AUDIO_UPLOAD_ROLLOUT === 'enabled'
        && env.VITE_EXTERNAL_AUDIO_UPLOAD_ROLLBACK !== 'enabled';
}

export function externalAudioPrivateHomeworkOptedIn(env: AudioQaEnv = import.meta.env) {
    if (isProductionAudioEnv(env)) {
        return Boolean(httpsOrigin(env.VITE_BACKUP_WORKER_URL));
    }
    return externalAudioAuthoringOptedIn(env) && env.VITE_EXTERNAL_AUDIO_PRIVATE_HOMEWORK_LOCAL_QA === 'enabled'
        && Boolean(localOrigin(env.VITE_BACKUP_WORKER_URL));
}

export function externalAudioPublicListeningOptedIn(env: AudioQaEnv = import.meta.env) {
    if (isProductionAudioEnv(env)) {
        return Boolean(httpsOrigin(env.VITE_BACKUP_WORKER_URL));
    }
    return externalAudioAuthoringOptedIn(env) && env.VITE_EXTERNAL_AUDIO_PUBLIC_LISTENING_LOCAL_QA === 'enabled'
        && Boolean(localOrigin(env.VITE_BACKUP_WORKER_URL));
}

export function resolveThcsAudioOrigin(env: AudioQaEnv = import.meta.env, origin = globalThis.location?.origin) {
    if (isProductionAudioEnv(env)) return resolveAudioCourseOrigin(env, origin);
    return env.VITE_EXTERNAL_AUDIO_THCS_LOCAL_QA === 'enabled' ? resolveAudioCourseOrigin(env, origin) : null;
}

export function resolveAudioCourseOrigin(env: AudioQaEnv = import.meta.env, origin = globalThis.location?.origin) {
    if (isProductionAudioEnv(env)) {
        if (!productionAppOrigin(origin)) return null;
        return productionWorkerOrigin(env.VITE_R2_UPLOAD_WORKER_URL || 'https://r2-upload-signer.iamhuwng.workers.dev');
    }
    if (!externalAudioAuthoringOptedIn(env) || env.VITE_EXTERNAL_AUDIO_LOCAL_QA !== 'enabled' ||
        env.VITE_FIREBASE_LOCAL_ONLY !== 'true' ||
        env.VITE_FIREBASE_PROJECT_ID !== 'demo-luyentap-local' || !localOrigin(origin)) return null;
    return localOrigin(env.VITE_R2_UPLOAD_WORKER_URL);
}

function assertPreviewUrl(result: z.infer<typeof draftPreview>, versionId?: string, fixtureOrigin?: string) {
    const url = parseUrl(result.url);
    const version = url?.searchParams.get('versionId');
    const fixture = fixtureOrigin && url?.origin === fixtureOrigin && url.pathname === '/fixture/audio'
        && url.searchParams.get('expiry') === String(result.expiresAt)
        && /^[a-f0-9]{64}$/u.test(url.searchParams.get('signature') ?? '');
    const backblaze = url?.protocol === 'https:' && !url.port
        && /^s3\.[a-z]{2}(?:-[a-z0-9]+)+-\d+\.backblazeb2\.com$/u.test(url.hostname);
    if (!url || url.username || url.password || url.hash || (!backblaze && !fixture) || !version
        || (versionId !== undefined && version !== versionId) || result.expiresAt <= Date.now()) {
        throw new ExternalAudioRequestError('object_changed');
    }
}

export interface ThcsAudioScope {
    testId: string;
    versionId?: string;
    homeworkId?: string;
    submissionId?: string;
    courseId?: string;
    moduleId?: string;
    resultId?: string;
}

export function createExternalAudioClient(origin: string, getIdToken: () => Promise<string>, fetchImpl = fetch) {
    const endpoint = localOrigin(origin) ?? productionWorkerOrigin(origin);
    const fixtureOrigin = import.meta.env.VITE_EXTERNAL_AUDIO_BROWSER_MEDIA === 'enabled'
        && endpoint === resolveAudioCourseOrigin() ? endpoint ?? undefined : undefined;
    async function post<Result>(
        action: string, input: object, schema: z.ZodType<Result>, signal?: AbortSignal,
    ): Promise<Result> {
        if (!endpoint) throw new ExternalAudioRequestError('store_unavailable');
        try {
            const idToken = await getIdToken();
            if (!idToken) throw new ExternalAudioRequestError('teacher_required');
            if (signal?.aborted) throw new ExternalAudioRequestError('store_unavailable');
            const response = await fetchImpl(`${endpoint}/external-audio/${action}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify(input), signal, cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
            });
            if (response.status === 401 || response.status === 403) throw new ExternalAudioRequestError('teacher_required');
            const body: unknown = await response.json();
            if (!response.ok) {
                const code = z.object({ error: z.unknown() }).safeParse(body);
                throw new ExternalAudioRequestError(code.success && isDiagnostic(code.data.error) ? code.data.error : 'store_unavailable');
            }
            const parsed = schema.safeParse(body);
            if (!parsed.success) throw new ExternalAudioRequestError('store_unavailable');
            return parsed.data;
        } catch (error) {
            if (error instanceof ExternalAudioRequestError) throw error;
            throw new ExternalAudioRequestError('store_unavailable');
        }
    }
    return {
        connections: (signal?: AbortSignal) => post('connections', {}, summary, signal),
        impact: (connectionId: string, signal?: AbortSignal) => post('impact', { connectionId }, impact, signal),
        adminImpact: (ownerId: string, connectionId: string, signal?: AbortSignal) =>
            post('admin-impact', { ownerId, connectionId }, impact, signal),
        adminHealth: (signal?: AbortSignal) => post('admin-health', {}, adminHealth, signal),
        validate: (input: Key & Scope, signal?: AbortSignal) => post('validate', input, validation, signal),
        connect: ({ label, ...input }: Key & Scope & { generation: number; label?: string }, signal?: AbortSignal) =>
            post('connect', label?.trim() ? { ...input, label: label.trim() } : input, summary, signal),
        switch: ({ label, ...input }: Key & Scope & ConnectionVersion & { label?: string }, signal?: AbortSignal) =>
            post('switch', label?.trim() ? { ...input, label: label.trim() } : input, summary, signal),
        select: (input: ConnectionVersion, signal?: AbortSignal) => post('select', input, summary, signal),
        rotate: (input: Key & ConnectionVersion, signal?: AbortSignal) => post('rotate', input, summary, signal),
        revoke: (input: ConnectionVersion, signal?: AbortSignal) => post('revoke', input, summary, signal),
        cleanup: (input: ConnectionVersion, signal?: AbortSignal) => post('cleanup', input, summary, signal),
        recheck: (input: ConnectionVersion, signal?: AbortSignal) => post('recheck', input, summary, signal),
        list: (input: { connectionId: string; prefix: string; cursor?: string; filenamePrefix?: string }, signal?: AbortSignal) => post('list', input, page, signal),
        async inspect(input: FileTarget, signal?: AbortSignal) {
            const result = await post('inspect', input, file, signal);
            assertExactVersion(result, input);
            return result;
        },
        async preview(input: FileTarget, signal?: AbortSignal) {
            const result = await post('preview', input, preview, signal);
            assertExactVersion(result.file, input);
            assertPreviewUrl(result, input.providerVersionId, fixtureOrigin);
            return result;
        },
        attachDraft(target: DraftAudioTarget, selection: ExternalAudioSelection, signal?: AbortSignal) {
            const { connectionId, generation, objectKey, providerVersionId } = selection;
            return post('attach-draft', { ...target, connectionId, generation, objectKey, providerVersionId }, draftAudio, signal);
        },
        draftRecording: (target: DraftAudioTarget, assetId: string, signal?: AbortSignal) =>
            post('draft-recording', { ...target, assetId }, draftRecording, signal),
        async previewDraft(target: DraftAudioTarget, assetId: string, signal?: AbortSignal) {
            const result = await post('preview-draft', { ...target, assetId }, draftPreview, signal);
            assertPreviewUrl(result, undefined, fixtureOrigin);
            return result;
        },
        validateThcsDraft(draftId: string, attachments: readonly { sectionId: string; assetId: string }[]) {
            return post('validate-thcs-draft', { draftId, attachments }, z.object({ ready: z.literal(true) }));
        },
        publishThcs(draftId: string) {
            return post('publish-thcs', { draftId }, z.object({ testId: z.string().min(1) }));
        },
        readThcs(scope: ThcsAudioScope, signal?: AbortSignal) {
            return post('read-thcs', scope, z.object({
                document: z.custom<import('../types/thcs-test.types').THCSTest>((value) =>
                    z.object({ id: z.literal(scope.testId), testType: z.literal('THCS-THPT'),
                        externalAudioVersionId: z.string().min(1), sections: z.array(z.object({ id: z.string() })) }).safeParse(value).success),
                attemptHandle: z.string().min(1).optional(),
            }), signal);
        },
        readThcsResult(testId: string, resultId: string, signal?: AbortSignal) {
            return post('read-thcs', { testId, resultId }, z.object({ versionId: z.string().min(1),
                sections: z.array(z.object({ sectionId: z.string().min(1), sectionNumber: z.number().int().positive(), assetId: z.string().min(1) })),
            }), signal);
        },
        retainThcsResult(scope: ThcsAudioScope, resultId: string, attemptHandle: string) {
            return post('retain-thcs-result', { ...scope, resultId, attemptHandle }, z.object({ retained: z.literal(true) }));
        },
        submitThcsCourse(scope: ThcsAudioScope, attemptHandle: string, answers: Record<string, string | string[]>, timeElapsed: number) {
            return post('submit-thcs-course', { ...scope, attemptHandle, answers, timeElapsed }, z.object({ resultId: z.string().min(1) }));
        },
        async playThcs(input: ThcsAudioScope & { versionId: string; sectionId: string; assetId: string; attemptHandle?: string }, signal?: AbortSignal, refreshHandle?: string) {
            const grant = await post('play-thcs', { ...input, refreshHandle },
                draftPreview.extend({ refreshAfter: z.number().int().positive(), refreshHandle: z.string().min(1) }), signal);
            assertPreviewUrl(grant, undefined, fixtureOrigin);
            return grant;
        },
    };
}

function assertExactVersion(result: ExternalAudioFile, requested: FileTarget) {
    if (result.objectKey !== requested.objectKey || result.providerVersionId !== requested.providerVersionId) {
        throw new ExternalAudioRequestError('object_changed');
    }
}

export type ExternalAudioClient = ReturnType<typeof createExternalAudioClient>;
