import type { EnhancedTestResultRecord } from '../types/results.types';
import type {
    BookResultEvaluationState,
    BookResultFeedbackReleaseState,
    BookResultOwnershipDecision,
    BookResultVisibilityDecision,
    DeletedSourceDisplayMetadata,
    ResolvedResultVisibilityVerdict,
    ResultVisibilitySnapshot,
    SoloPracticeVisibilityClassification,
} from '../types/results.types';

export interface ClassifyBookResultVisibilityInput {
    ownership: BookResultOwnershipDecision;
    evaluationState: BookResultEvaluationState;
    feedbackRelease: BookResultFeedbackReleaseState;
}

/**
 * Converts trusted Book ownership into field-level visibility. It never grants
 * visibility from browser context or from a projection owner snapshot alone.
 */
export function classifyBookResultVisibility(
    input: ClassifyBookResultVisibilityInput
): BookResultVisibilityDecision {
    if (!input.ownership.visible) {
        return {
            ...input.ownership,
            canViewResponse: false,
            canViewScore: false,
            canViewFeedback: false,
            canViewSafeProvenance: false,
        };
    }

    const isTeacher = input.ownership.viewerRole === 'teacher';
    const evaluationComplete = input.evaluationState !== 'pending_review';
    const releasedToStudent = input.feedbackRelease === 'released';

    return {
        ...input.ownership,
        canViewResponse: true,
        canViewScore: evaluationComplete && (isTeacher || releasedToStudent),
        canViewFeedback: isTeacher || releasedToStudent,
        canViewSafeProvenance: true,
    };
}

export interface ClassifyTeacherResultVisibilityInput {
    result: Pick<EnhancedTestResultRecord, 'visibility'> & Partial<EnhancedTestResultRecord>;
    teacherId: string;
    hasAssignmentAccess: boolean;
}

export function classifyTeacherResultVisibility(
    input: ClassifyTeacherResultVisibilityInput
): ResolvedResultVisibilityVerdict {
    const visibility = input.result.visibility ?? null;
    const deletedSource = buildDeletedSourceDisplayMetadata(visibility);
    const sharedSoloOwner = visibility?.contextType === 'solo_practice' && visibility.ownershipResolved
        && visibility.sourceType === 'class' && visibility.visibilityOwnerTeacherId === input.teacherId
        && input.result.context?.selectedTeacherId === input.teacherId && input.result.context.classId === visibility.classId;
    const soloPractice = classifySoloPracticeVisibility(visibility, Boolean(sharedSoloOwner));

    if (!input.hasAssignmentAccess && !sharedSoloOwner) {
        return buildDeniedVerdict('assignment_gate_denied', visibility, deletedSource, soloPractice);
    }

    if (!visibility) {
        return buildDeniedVerdict('missing_visibility', null, deletedSource, soloPractice);
    }

    if (soloPractice.isSoloPractice) {
        return {
            isVisibleToTeacher: soloPractice.teacherCanView,
            isTeacherOwned: Boolean(sharedSoloOwner),
            shouldDisplayInTeacherHistory: soloPractice.teacherCanView,
            shouldDisplayInTeacherDetail: soloPractice.teacherCanView,
            shouldAllowTeacherActions: Boolean(sharedSoloOwner),
            excludeFromAnalytics: soloPractice.excludeFromAnalytics,
            isUnresolved: false,
            exclusionReason: soloPractice.teacherCanView ? 'visible' : 'teacher_not_owner',
            visibilityOwnerTeacherId: sharedSoloOwner ? input.teacherId : null,
            deletedSource,
            soloPractice,
        };
    }

    if (!visibility.ownershipResolved) {
        return buildDeniedVerdict('unresolved', visibility, deletedSource, soloPractice, true);
    }

    if (!visibility.visibilityOwnerTeacherId || visibility.visibilityOwnerTeacherId !== input.teacherId) {
        return buildDeniedVerdict('teacher_not_owner', visibility, deletedSource, soloPractice);
    }

    return {
        isVisibleToTeacher: true,
        isTeacherOwned: true,
        shouldDisplayInTeacherHistory: true,
        shouldDisplayInTeacherDetail: true,
        shouldAllowTeacherActions: true,
        excludeFromAnalytics: false,
        isUnresolved: false,
        exclusionReason: 'visible',
        visibilityOwnerTeacherId: visibility.visibilityOwnerTeacherId,
        deletedSource,
        soloPractice,
    };
}

export function classifySoloPracticeVisibility(
    visibility: ResultVisibilitySnapshot | null | undefined,
    hasAssignmentAccess: boolean
): SoloPracticeVisibilityClassification {
    const isSoloPractice = visibility?.contextType === 'solo_practice';

    return {
        isSoloPractice,
        teacherCanView: Boolean(isSoloPractice && visibility?.ownershipResolved && visibility.visibilityOwnerTeacherId && hasAssignmentAccess),
        teacherActionsAllowed: Boolean(isSoloPractice && visibility?.ownershipResolved && visibility.visibilityOwnerTeacherId && hasAssignmentAccess),
        tagLabel: isSoloPractice ? 'Solo Practice' : null,
        excludeFromAnalytics: Boolean(isSoloPractice && !visibility?.visibilityOwnerTeacherId),
    };
}

export function buildDeletedSourceDisplayMetadata(
    visibility: ResultVisibilitySnapshot | null | undefined
): DeletedSourceDisplayMetadata | null {
    if (!visibility || (!visibility.sourceDeleted && !visibility.sourceArchived)) {
        return null;
    }

    return {
        sourceType: visibility.sourceType,
        sourceId: visibility.sourceId,
        snapshotName: visibility.sourceNameSnapshot,
        currentName: visibility.currentSourceName ?? null,
        isDeleted: Boolean(visibility.sourceDeleted),
        isArchived: Boolean(visibility.sourceArchived),
    };
}

function buildDeniedVerdict(
    exclusionReason: ResolvedResultVisibilityVerdict['exclusionReason'],
    visibility: ResultVisibilitySnapshot | null,
    deletedSource: DeletedSourceDisplayMetadata | null,
    soloPractice: SoloPracticeVisibilityClassification,
    isUnresolved: boolean = false
): ResolvedResultVisibilityVerdict {
    return {
        isVisibleToTeacher: false,
        isTeacherOwned: false,
        shouldDisplayInTeacherHistory: false,
        shouldDisplayInTeacherDetail: false,
        shouldAllowTeacherActions: false,
        excludeFromAnalytics: true,
        isUnresolved,
        exclusionReason,
        visibilityOwnerTeacherId: visibility?.visibilityOwnerTeacherId ?? null,
        deletedSource,
        soloPractice,
    };
}
