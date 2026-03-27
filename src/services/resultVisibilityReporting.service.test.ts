import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultVisibilitySnapshot } from '../types/results.types';
import {
    buildUnresolvedResultVisibilityReportEntry,
    clearUnresolvedResultVisibilityReport,
    UNRESOLVED_RESULT_VISIBILITY_REPORT_VERSION,
    upsertUnresolvedResultVisibilityReport,
} from './resultVisibilityReporting.service';

function createUnresolvedVisibility(
    overrides: Partial<ResultVisibilitySnapshot> = {}
): ResultVisibilitySnapshot {
    return {
        contextType: 'class_session',
        sourceType: 'session',
        sourceId: 'SESSION-1',
        sourceNameSnapshot: 'Session 1',
        visibilityOwnerTeacherId: null,
        ownerResolutionSource: 'unresolved',
        ownershipResolved: false,
        unresolvedReason: 'owner_not_resolved',
        homeworkId: null,
        sessionCode: 'SESSION-1',
        courseId: null,
        classId: null,
        assignmentId: null,
        ...overrides,
    };
}

describe('resultVisibilityReporting.service', () => {
    const updateMock = vi.fn();
    const dependencies = {
        update: updateMock,
        rootRef: () => '__root__' as any,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        updateMock.mockResolvedValue(undefined);
    });

    it('builds the unresolved report entry with the locked schema', () => {
        const entry = buildUnresolvedResultVisibilityReportEntry({
            resultId: 'result-1',
            studentId: 'student-1',
            visibility: createUnresolvedVisibility(),
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'session:SESSION-1',
            now: 2000,
            existingCreatedAt: 1000,
        });

        expect(entry).toEqual({
            resultId: 'result-1',
            studentId: 'student-1',
            contextType: 'class_session',
            unresolvedReason: 'owner_not_resolved',
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'session:SESSION-1',
            ownershipResolved: false,
            reportVersion: UNRESOLVED_RESULT_VISIBILITY_REPORT_VERSION,
            createdAt: 1000,
            updatedAt: 2000,
        });
    });

    it('writes unresolved reports to the canonical admin diagnostics path', async () => {
        const entry = await upsertUnresolvedResultVisibilityReport({
            resultId: 'result-2',
            studentId: 'student-2',
            visibility: createUnresolvedVisibility({
                contextType: 'unresolved',
                sourceType: 'unknown',
                sourceId: null,
                sourceNameSnapshot: 'Unknown Source',
                sessionCode: null,
                unresolvedReason: 'missing_context',
            }),
            sourceLookupAttempted: false,
            strongestKnownSourceClue: null,
            now: 1000,
        }, dependencies);

        const updates = updateMock.mock.calls[0][1];
        expect(updates).toEqual({
            'reports/result_visibility/unresolved/result-2': entry,
        });
    });

    it('clears unresolved reports through the same admin path', async () => {
        await clearUnresolvedResultVisibilityReport('result-3', dependencies);

        expect(updateMock).toHaveBeenCalledWith('__root__', {
            'reports/result_visibility/unresolved/result-3': null,
        });
    });
});
