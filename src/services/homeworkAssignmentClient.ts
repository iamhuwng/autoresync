import { getAuth } from 'firebase/auth';
import type { HomeworkContentRef } from '../types/homework.types';
import type { CreateHomeworkInput } from './homeworkManager';
import type {
    BookHomeworkSagaCommand,
    BookHomeworkSagaState,
} from './book-homework/bookHomeworkSaga.types';

const WORKER_BASE_URL = import.meta.env.VITE_BACKUP_WORKER_URL || '';
const HOMEWORK_ASSIGNMENTS_PATH = '/api/homework/assignments';
const BOOK_HOMEWORK_ASSIGNMENTS_PATH = '/book-homework/assignments';
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

const isBookState = (value: unknown): value is BookHomeworkSagaState => (
    typeof value === 'string' && BOOK_STATUSES.has(value)
);

const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

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
    readonly status: BookHomeworkSagaState;
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
        || !isBookState(result.status)
        || !isBookState(result.state)
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
