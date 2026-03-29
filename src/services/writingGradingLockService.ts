import { get, ref, runTransaction, set, update } from 'firebase/database';
import { database } from './firebase';
import { withRestoreGuard } from './restoreGuard';

const LOCK_ROOT = 'writing_grading_locks';

export const WRITING_GRADING_LOCK_HEARTBEAT_MS = 30_000;
export const WRITING_GRADING_LOCK_TTL_MS = 10 * 60 * 1000;

export interface WritingGradingLock {
    submissionId: string;
    teacherId: string;
    teacherName?: string;
    sessionId: string;
    heartbeatAt: number;
    expiresAt: number;
}

interface AcquireWritingGradingLockInput {
    submissionId: string;
    teacherId: string;
    teacherName?: string;
    sessionId: string;
}

function getLockRef(submissionId: string) {
    return ref(database, `${LOCK_ROOT}/${submissionId}`);
}

function buildLock(
    input: AcquireWritingGradingLockInput,
    now: number
): WritingGradingLock {
    return {
        submissionId: input.submissionId,
        teacherId: input.teacherId,
        teacherName: input.teacherName,
        sessionId: input.sessionId,
        heartbeatAt: now,
        expiresAt: now + WRITING_GRADING_LOCK_TTL_MS,
    };
}

export async function getWritingGradingLock(
    submissionId: string
): Promise<WritingGradingLock | null> {
    const snap = await get(getLockRef(submissionId));
    return snap.exists() ? (snap.val() as WritingGradingLock) : null;
}

export const acquireWritingGradingLock = withRestoreGuard<{
    success: boolean;
    lock?: WritingGradingLock;
    conflict?: WritingGradingLock | null;
    error?: string;
}>(
    'WritingGradingLockAcquire',
    { success: false, error: 'Blocked by restore guard' }
)(async (input: AcquireWritingGradingLockInput) => {
    const now = Date.now();
    let conflict: WritingGradingLock | null = null;
    const nextLock = buildLock(input, now);

    const result = await runTransaction(getLockRef(input.submissionId), (currentLock: WritingGradingLock | null) => {
        const isExpired = !currentLock || typeof currentLock.expiresAt !== 'number' || currentLock.expiresAt <= now;
        const ownedBySameTeacher = currentLock?.teacherId === input.teacherId;

        if (isExpired || ownedBySameTeacher) {
            return nextLock;
        }

        conflict = currentLock;
        return currentLock;
    });

    const currentLock = result.snapshot.exists()
        ? (result.snapshot.val() as WritingGradingLock)
        : null;

    if (!result.committed) {
        return {
            success: false,
            conflict: currentLock,
            error: 'Unable to acquire grading lock',
        };
    }

    if (currentLock?.teacherId !== input.teacherId || currentLock.sessionId !== input.sessionId) {
        return {
            success: false,
            conflict: conflict || currentLock,
            error: 'This submission is already locked by another teacher',
        };
    }

    return {
        success: true,
        lock: currentLock,
    };
});

export const renewWritingGradingLock = withRestoreGuard<{
    success: boolean;
    lock?: WritingGradingLock;
    error?: string;
}>(
    'WritingGradingLockRenew',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    teacherId: string,
    sessionId: string
) => {
    const now = Date.now();
    const lockRef = getLockRef(submissionId);
    const snap = await get(lockRef);

    if (!snap.exists()) {
        return { success: false, error: 'Lock not found' };
    }

    const currentLock = snap.val() as WritingGradingLock;
    if (currentLock.teacherId !== teacherId || currentLock.sessionId !== sessionId) {
        return { success: false, error: 'Cannot renew another teacher lock' };
    }

    const updates = {
        heartbeatAt: now,
        expiresAt: now + WRITING_GRADING_LOCK_TTL_MS,
    };
    await update(lockRef, updates);

    return {
        success: true,
        lock: {
            ...currentLock,
            ...updates,
        },
    };
});

export const releaseWritingGradingLock = withRestoreGuard<{
    success: boolean;
    error?: string;
}>(
    'WritingGradingLockRelease',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    teacherId: string,
    sessionId: string
) => {
    const lockRef = getLockRef(submissionId);
    const snap = await get(lockRef);

    if (!snap.exists()) {
        return { success: true };
    }

    const currentLock = snap.val() as WritingGradingLock;
    if (currentLock.teacherId !== teacherId || currentLock.sessionId !== sessionId) {
        return { success: false, error: 'Cannot release another teacher lock' };
    }

    await set(lockRef, null);
    return { success: true };
});

const writingGradingLockService = {
    WRITING_GRADING_LOCK_HEARTBEAT_MS,
    WRITING_GRADING_LOCK_TTL_MS,
    getWritingGradingLock,
    acquireWritingGradingLock,
    renewWritingGradingLock,
    releaseWritingGradingLock,
};

export default writingGradingLockService;
