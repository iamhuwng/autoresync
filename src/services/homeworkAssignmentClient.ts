import { getAuth } from 'firebase/auth';
import type { HomeworkContentRef } from '../types/homework.types';
import type { CreateHomeworkInput } from './homeworkManager';
import type {
    BookHomeworkSagaCommand,
    BookHomeworkSagaState,
} from './book-homework/bookHomeworkSaga.types';
import type { BookHomeworkAssignmentPreviewSource } from './book-homework/bookHomeworkAssignmentIntent';
import type { BookHomeworkSelectionTarget } from '../types/homework.types';

const WORKER_BASE_URL = import.meta.env.VITE_BACKUP_WORKER_URL || '';
const HOMEWORK_ASSIGNMENTS_PATH = '/api/homework/assignments';
const BOOK_HOMEWORK_ASSIGNMENTS_PATH = '/book-homework/assignments';
const BOOK_HOMEWORK_PREVIEW_SOURCE_PATH = '/book-homework/preview-source';
const BOOK_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const BOOK_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BOOK_STATUSES = new Set([
    'prepared',
    'fanout_pending',
    'committed',
    'compensating',
    'compensated',
    'failed_retryable',
    'failed_terminal',
]);
type BookHomeworkWorkerCommandStatus = BookHomeworkSagaState | 'committed_projection_pending';

const isBookState = (value: unknown): value is BookHomeworkSagaState => (
    typeof value === 'string' && BOOK_STATUSES.has(value)
);
const isBookCommandStatus = (value: unknown): value is BookHomeworkWorkerCommandStatus => (
    isBookState(value) || value === 'committed_projection_pending'
);

const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);
const isSafeId = (value: unknown): value is string => (
    typeof value === 'string' && BOOK_ROUTE_ID.test(value)
);
const isPositiveSafeInteger = (value: unknown): value is number => (
    isSafeInteger(value) && value > 0
);
const isTimestamp = (value: unknown): value is string => (
    typeof value === 'string' && Number.isFinite(Date.parse(value))
);

export class HomeworkAssignmentWorkerError extends Error {
    readonly reasonCode?: string;
    readonly status: number;

    constructor(message: string, status: number, reasonCode?: string) {
        super(message);
        this.name = 'HomeworkAssignmentWorkerError';
        this.status = status;
        this.reasonCode = reasonCode;
    }
}

export type WorkerHomeworkAssignmentInput = CreateHomeworkInput & {
    contentRef: HomeworkContentRef;
};

export type BookHomeworkWorkerCommandInput = Omit<BookHomeworkSagaCommand, 'ownerId' | 'createdAt'>;

export interface BookHomeworkWorkerCommandResult {
    readonly status: BookHomeworkWorkerCommandStatus;
    readonly assignmentId: string;
    readonly operationId: string;
    readonly state: BookHomeworkSagaState;
    readonly visibility: 'hidden' | 'committed';
    readonly recipientCount: number;
    readonly committedRecipientCount: number;
    readonly revision: number;
}

export interface BookHomeworkWorkerRequestOptions {
    readonly workerOrigin?: string;
    readonly fetchImpl?: typeof fetch;
    readonly getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    readonly signal?: AbortSignal;
}

export interface BookHomeworkPreviewSourceRequest {
    readonly bookId: string;
    readonly target?: BookHomeworkSelectionTarget;
    readonly unitKey?: string;
    readonly classId: string;
    readonly selectedRecipientIds: readonly string[];
    readonly title: string;
}

const toMillis = (value: Date | number | string | undefined): number | string | undefined => {
    if (value instanceof Date) {
        return value.getTime();
    }
    return value;
};

async function getCurrentIdToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
        throw new HomeworkAssignmentWorkerError('You must be signed in to assign homework.', 401, 'INVALID_ASSIGNMENT_REQUEST');
    }
    return user.getIdToken();
}

async function getCurrentIdTokenForBook(forceRefresh = false): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
        throw new HomeworkAssignmentWorkerError('You must be signed in to assign Book Homework.', 401, 'INVALID_ASSIGNMENT_REQUEST');
    }
    return user.getIdToken(forceRefresh);
}

function serializeAssignment(input: WorkerHomeworkAssignmentInput): Record<string, unknown> {
    return {
        contentRef: input.contentRef,
        target: input.target,
        config: input.config,
        availableFrom: toMillis(input.availableFrom),
        dueDate: toMillis(input.dueDate),
        instructions: input.instructions,
        title: input.title,
        tags: input.tags,
        thcsConfig: input.thcsConfig,
        antiCheatConfig: input.antiCheatConfig,
    };
}

function getHomeworkAssignmentEndpoint(): string {
    if (!WORKER_BASE_URL && import.meta.env.PROD) {
        throw new HomeworkAssignmentWorkerError(
            'Homework assignment service is not configured. Missing VITE_BACKUP_WORKER_URL.',
            500,
            'INVALID_ASSIGNMENT_REQUEST'
        );
    }
    return WORKER_BASE_URL + HOMEWORK_ASSIGNMENTS_PATH;
}

export async function createHomeworkAssignmentViaWorker(
    input: WorkerHomeworkAssignmentInput
): Promise<string> {
    const endpoint = getHomeworkAssignmentEndpoint();
    const token = await getCurrentIdToken();
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(serializeAssignment(input)),
    });

    const responseBody = await response.json().catch(() => ({})) as {
        assignmentId?: string;
        error?: string;
        message?: string;
        reasonCode?: string;
    };

    if (!response.ok) {
        throw new HomeworkAssignmentWorkerError(
            responseBody.message || responseBody.error || 'Failed to create homework assignment.',
            response.status,
            responseBody.reasonCode
        );
    }

    if (!responseBody.assignmentId) {
        throw new HomeworkAssignmentWorkerError(
            'Homework assignment response did not include an assignment id.',
            response.status,
            'INVALID_ASSIGNMENT_REQUEST'
        );
    }

    return responseBody.assignmentId;
}

const exactBookOrigin = (value: string): string => {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new HomeworkAssignmentWorkerError('Book Homework Worker origin is invalid.', 500, 'INVALID_ASSIGNMENT_REQUEST');
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
        || (url.protocol === 'http:' && url.hostname !== 'localhost')
        || url.username !== ''
        || url.password !== ''
        || !/^\/+$/u.test(url.pathname)
        || url.search !== ''
        || url.hash !== '') {
        throw new HomeworkAssignmentWorkerError('Book Homework Worker origin is invalid.', 500, 'INVALID_ASSIGNMENT_REQUEST');
    }
    return url.origin;
};

export const resolveBookHomeworkWorkerOrigin = (): string => {
    const configured = import.meta.env.VITE_BOOK_HOMEWORK_WORKER_URL?.trim()
        || import.meta.env.VITE_BOOK_DELIVERY_WORKER_URL?.trim()
        || import.meta.env.VITE_R2_UPLOAD_WORKER_URL?.trim();
    if (!configured) {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework service is not configured. Missing canonical Book Worker origin.',
            500,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }
    return exactBookOrigin(configured);
};

const assertBookInput = (input: BookHomeworkWorkerCommandInput): void => {
    if (typeof input.assignmentId !== 'string' || !BOOK_ROUTE_ID.test(input.assignmentId)
        || typeof input.operationId !== 'string' || !BOOK_OPERATION_ID.test(input.operationId)
        || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length === 0
        || typeof input.manifestVersionId !== 'string' || input.manifestVersionId.length === 0
        || !input.intent || typeof input.intent !== 'object' || Array.isArray(input.intent)
        || !Array.isArray(input.selectedRecipientIds) || input.selectedRecipientIds.length === 0) {
        throw new HomeworkAssignmentWorkerError('Invalid Book Homework command.', 400, 'INVALID_ASSIGNMENT_REQUEST');
    }
};

const parseBookResponse = (
    body: unknown,
    responseStatus: number,
    expectedAssignmentId: string,
): BookHomeworkWorkerCommandResult => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework Worker returned an invalid response.',
            responseStatus,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }
    const result = body as Record<string, unknown>;
    if (typeof result.assignmentId !== 'string' || result.assignmentId !== expectedAssignmentId
        || typeof result.operationId !== 'string'
        || !isBookCommandStatus(result.status)
        || !isBookState(result.state)
        || (result.status === 'committed_projection_pending'
            && (responseStatus !== 202 || result.state !== 'committed' || result.visibility !== 'committed'))
        || (result.visibility !== 'hidden' && result.visibility !== 'committed')
        || !isSafeInteger(result.recipientCount)
        || !isSafeInteger(result.committedRecipientCount)
        || !isSafeInteger(result.revision)) {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework Worker returned an invalid response.',
            responseStatus,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }
    return {
        status: result.status,
        assignmentId: result.assignmentId,
        operationId: result.operationId,
        state: result.state,
        visibility: result.visibility,
        recipientCount: result.recipientCount,
        committedRecipientCount: result.committedRecipientCount,
        revision: result.revision,
    };
};

export async function createBookHomeworkAssignmentViaWorker(
    input: BookHomeworkWorkerCommandInput,
    options: BookHomeworkWorkerRequestOptions = {},
): Promise<BookHomeworkWorkerCommandResult> {
    assertBookInput(input);
    const origin = exactBookOrigin(options.workerOrigin ?? resolveBookHomeworkWorkerOrigin());
    const endpoint = `${origin}${BOOK_HOMEWORK_ASSIGNMENTS_PATH}/${encodeURIComponent(input.assignmentId)}/commands`;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const getIdToken = options.getIdToken ?? getCurrentIdTokenForBook;
    let token = await getIdToken(false);
    let response: Response | undefined;
    let responseBody: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'Idempotency-Key': input.idempotencyKey,
            },
            body: JSON.stringify(input),
            signal: options.signal,
        });
        responseBody = await response.json().catch(() => ({}));
        if (response.status !== 401 || attempt === 1) break;
        token = await getIdToken(true);
    }

    if (!response) {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework Worker did not return a response.',
            503,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }
    if (!response.ok) {
        const body = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
            ? responseBody as Record<string, unknown>
            : {};
        throw new HomeworkAssignmentWorkerError(
            String(body.message ?? body.error ?? body.code ?? 'Book Homework command failed.'),
            response.status,
            typeof body.code === 'string' ? body.code : undefined,
        );
    }

    return parseBookResponse(responseBody, response.status, input.assignmentId);
}

const assertPreviewSourceResponse = (
    value: unknown,
    input: BookHomeworkPreviewSourceRequest,
): BookHomeworkAssignmentPreviewSource => {
    const invalid = (): never => {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework preview source response was invalid.',
            502,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    };
    const body = isRecord(value) ? value : invalid();
    const requestedTarget = input.target ?? {
        kind: 'unit' as const,
        bookId: input.bookId,
        nodeKey: input.unitKey ?? '',
    };
    const targetKeys = requestedTarget.kind === 'book' ? ['kind', 'bookId']
        : requestedTarget.kind === 'activity' ? ['kind', 'bookId', 'activityId',
            ...(requestedTarget.placementId === undefined ? [] : ['placementId'])]
        : ['kind', 'bookId', 'nodeKey'];
    const initialTarget = body.initialTarget;
    const matchesTarget = isRecord(initialTarget)
        && Object.keys(initialTarget).length === targetKeys.length
        && targetKeys.every(key => initialTarget[key] === (requestedTarget as unknown as Record<string, unknown>)[key]);
    if (!isRecord(body.delivery) || !isRecord(body.identity)
        || !isSafeId(body.classId)
        || body.classId !== input.classId
        || !Array.isArray(body.selectedRecipientIds)
        || body.selectedRecipientIds.length < 1
        || body.selectedRecipientIds.length > 30
        || !body.selectedRecipientIds.every(isSafeId)
        || new Set(body.selectedRecipientIds).size !== body.selectedRecipientIds.length
        || !matchesTarget
        || !isRecord(body.targetPreview)) invalid();

    const delivery = body.delivery as Record<string, unknown>;
    const identity = body.identity as Record<string, unknown>;
    const book = delivery.book as Record<string, unknown>;
    const context = delivery.context as Record<string, unknown>;
    const sourceSet = delivery.sourceSet as Record<string, unknown>;
    const scope = delivery.scope as Record<string, unknown>;
    const provenance = delivery.provenance as Record<string, unknown>;
    const sources = sourceSet.sources as unknown[];
    const selectedRecipientIds = body.selectedRecipientIds as string[];
    if (delivery.schemaVersion !== 1
        || delivery.projectionKind !== 'book-runtime-delivery'
        || !isSafeId(delivery.bindingId)
        || !isPositiveSafeInteger(delivery.bindingRevision)
        || !isSafeId(delivery.recipientId)
        || !isRecord(context)
        || !isSafeId(context.contextId)
        || context.kind !== 'homework'
        || context.entitlementBasis !== 'assignment'
        || !isRecord(book)
        || book.bookId !== input.bookId
        || book.bookMode !== 'pdf'
        || !isPositiveSafeInteger(book.bookRevision)
        || !isSafeId(book.manifestVersionId)
        || !isSafeId(book.publicationId)
        || !isPositiveSafeInteger(book.publicationRevision)
        || book.publicationStatus !== 'published'
        || !isRecord(sourceSet)
        || !['full_pdf', 'component_pdfs'].includes(String(sourceSet.strategy))
        || !Array.isArray(sourceSet.sources)
        || sourceSet.sources.length < 1
        || !isRecord(scope)
        || !Array.isArray(scope.nodeKeys)
        || !Array.isArray(scope.placementIds)
        || !Array.isArray(delivery.outline)
        || !delivery.outline.every(isRecord)
        || !Array.isArray(delivery.documentRequests)
        || !delivery.documentRequests.every(isRecord)
        || !Array.isArray(delivery.activities)
        || !delivery.activities.every(isRecord)
        || !isRecord(delivery.actionFlags)
        || typeof delivery.actionFlags.canAutosave !== 'boolean'
        || typeof delivery.actionFlags.canSubmit !== 'boolean'
        || typeof delivery.actionFlags.canReview !== 'boolean'
        || !isRecord(provenance)
        || provenance.publicationId !== book.publicationId
        || provenance.publicationRevision !== book.publicationRevision
        || provenance.bindingId !== delivery.bindingId
        || provenance.bindingRevision !== delivery.bindingRevision
        || !isSafeId(identity.ownerId)
        || !isSafeId(identity.manifestVersionId)
        || identity.manifestVersionId !== book.manifestVersionId
        || !isSafeId(identity.createdByCommandId)
        || !isTimestamp(identity.createdAt)
        || !isPositiveSafeInteger(identity.bindingRevision)
        || identity.bindingRevision !== delivery.bindingRevision
        || !selectedRecipientIds.includes(String(delivery.recipientId))) invalid();

    if (!sources.every((entry) => isRecord(entry)
        && isSafeId(entry.sourceKey)
        && isSafeId(entry.sourceVersionId)
        && entry.lifecycle === 'verified-usable'
        && isRecord(entry.localPageScope)
        && (entry.localPageScope.kind === 'all' || entry.localPageScope.kind === 'pages')
        && Array.isArray(entry.localPageScope.pages))) invalid();
    const document = body.studentDocument;
    const preview = body.targetPreview as Record<string, unknown>;
    if (document !== undefined && (!isRecord(document) || !isSafeId(document.sourceVersionId)
        || !Number.isSafeInteger(document.descriptorRevision) || Number(document.descriptorRevision) < 0
        || typeof document.sha256Hex !== 'string' || !/^[a-f0-9]{64}$/u.test(document.sha256Hex))) invalid();
    if (typeof preview.fingerprint !== 'string' || preview.fingerprint.length === 0
        || !Array.isArray(preview.rows) || preview.rows.length === 0
        || !preview.rows.every(isRecord)
        || !Number.isSafeInteger(preview.includedCount) || Number(preview.includedCount) < 1
        || !Number.isSafeInteger(preview.excludedCount) || Number(preview.excludedCount) < 0
        || !isRecord(preview.excludedReasonCounts)) invalid();
    if (sourceSet.strategy === 'component_pdfs'
        && (!isRecord(document) || Number(document.descriptorRevision) < 1
            || document.sha256Hex === '0'.repeat(64)
            || !Array.isArray(document.components)
            || document.components.length < 2)) invalid();

    if (body.bookTitle !== undefined && typeof body.bookTitle !== 'string') invalid();
    if (body.presentation !== undefined && !isRecord(body.presentation)) invalid();
    if (body.initialSchedule !== undefined && !isRecord(body.initialSchedule)) invalid();
    if (body.excludedActivities !== undefined
        && (!Array.isArray(body.excludedActivities) || !body.excludedActivities.every(isRecord))) invalid();
    if (body.studentExtensions !== undefined
        && (!Array.isArray(body.studentExtensions) || !body.studentExtensions.every(isRecord))) invalid();
    if (body.priorResultAccess !== undefined && typeof body.priorResultAccess !== 'boolean') invalid();
    if (body.soloAccess !== undefined && typeof body.soloAccess !== 'boolean') invalid();
    return body as unknown as BookHomeworkAssignmentPreviewSource;
};

export async function createBookHomeworkPreviewSource(
    input: BookHomeworkPreviewSourceRequest,
    options: BookHomeworkWorkerRequestOptions = {},
): Promise<BookHomeworkAssignmentPreviewSource> {
    const hasTarget = isRecord(input.target);
    const hasLegacyUnit = isSafeId(input.unitKey);
    if (!BOOK_ROUTE_ID.test(input.bookId)
        || hasTarget === hasLegacyUnit
        || (hasTarget && input.target?.bookId !== input.bookId)
        || !BOOK_ROUTE_ID.test(input.classId)
        || !Array.isArray(input.selectedRecipientIds)
        || input.selectedRecipientIds.length < 1
        || input.selectedRecipientIds.length > 30
        || !input.selectedRecipientIds.every((id) => BOOK_ROUTE_ID.test(id))
        || new Set(input.selectedRecipientIds).size !== input.selectedRecipientIds.length
        || typeof input.title !== 'string'
        || input.title.trim().length === 0) {
        throw new HomeworkAssignmentWorkerError(
            'Invalid Book Homework preview source request.',
            400,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }

    const origin = exactBookOrigin(options.workerOrigin ?? resolveBookHomeworkWorkerOrigin());
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const getIdToken = options.getIdToken ?? getCurrentIdTokenForBook;
    let token = await getIdToken(false);
    let response: Response | undefined;
    let responseBody: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetchImpl(`${origin}${BOOK_HOMEWORK_PREVIEW_SOURCE_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(input),
            signal: options.signal,
        });
        responseBody = await response.json().catch(() => ({}));
        if (response.status !== 401 || attempt === 1) break;
        token = await getIdToken(true);
    }

    if (!response) {
        throw new HomeworkAssignmentWorkerError(
            'Book Homework preview source Worker did not return a response.',
            503,
            'INVALID_ASSIGNMENT_REQUEST',
        );
    }
    if (!response.ok) {
        const body = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
            ? responseBody as Record<string, unknown>
            : {};
        throw new HomeworkAssignmentWorkerError(
            String(body.message ?? body.error ?? body.code ?? 'Book Homework preview source failed.'),
            response.status,
            typeof body.code === 'string' ? body.code : undefined,
        );
    }

    return assertPreviewSourceResponse(responseBody, input);
}
