import { getAuth } from 'firebase/auth';
import type { HomeworkContentRef } from '../types/homework.types';
import type { CreateHomeworkInput } from './homeworkManager';

const WORKER_BASE_URL = import.meta.env.VITE_BACKUP_WORKER_URL || '';
const HOMEWORK_ASSIGNMENTS_PATH = '/api/homework/assignments';

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
