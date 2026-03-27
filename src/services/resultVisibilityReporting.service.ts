import { ref, update } from 'firebase/database';
import { database } from './firebase';
import type {
    ResultVisibilitySnapshot,
    UnresolvedResultVisibilityReportEntry,
} from '../types/results.types';

export interface BuildUnresolvedResultVisibilityReportInput {
    resultId: string;
    studentId: string;
    visibility: ResultVisibilitySnapshot;
    sourceLookupAttempted: boolean;
    strongestKnownSourceClue: string | null;
    now?: number;
    existingCreatedAt?: number;
}

export interface ResultVisibilityReportingDependencies {
    update: typeof update;
    rootRef: () => ReturnType<typeof ref>;
}

const defaultDependencies: ResultVisibilityReportingDependencies = {
    update,
    rootRef: () => ref(database),
};

export const UNRESOLVED_RESULT_VISIBILITY_REPORT_VERSION = 1;

export function buildUnresolvedResultVisibilityReportEntry(
    input: BuildUnresolvedResultVisibilityReportInput
): UnresolvedResultVisibilityReportEntry {
    if (input.visibility.ownershipResolved || !input.visibility.unresolvedReason) {
        throw new Error('Unresolved reports require an unresolved visibility snapshot');
    }

    const timestamp = input.now ?? Date.now();

    return {
        resultId: input.resultId,
        studentId: input.studentId,
        contextType: input.visibility.contextType,
        unresolvedReason: input.visibility.unresolvedReason,
        sourceLookupAttempted: input.sourceLookupAttempted,
        strongestKnownSourceClue: input.strongestKnownSourceClue,
        ownershipResolved: false,
        reportVersion: UNRESOLVED_RESULT_VISIBILITY_REPORT_VERSION,
        createdAt: input.existingCreatedAt ?? timestamp,
        updatedAt: timestamp,
    };
}

export async function upsertUnresolvedResultVisibilityReport(
    input: BuildUnresolvedResultVisibilityReportInput,
    dependencies: ResultVisibilityReportingDependencies = defaultDependencies
): Promise<UnresolvedResultVisibilityReportEntry> {
    const entry = buildUnresolvedResultVisibilityReportEntry(input);

    await dependencies.update(dependencies.rootRef(), {
        [`reports/result_visibility/unresolved/${input.resultId}`]: entry,
    });

    return entry;
}

export async function clearUnresolvedResultVisibilityReport(
    resultId: string,
    dependencies: ResultVisibilityReportingDependencies = defaultDependencies
): Promise<void> {
    await dependencies.update(dependencies.rootRef(), {
        [`reports/result_visibility/unresolved/${resultId}`]: null,
    });
}
