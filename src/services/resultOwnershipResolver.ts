// @ts-nocheck
import { getHomeworkById } from './homeworkManager';
import { getSession } from './sessionManager.js';
import { getClass } from './classManager';
import { getCourse } from './courseManager';
import { getSubmission } from './writingSubmissionService';
import type { EnhancedTestResultRecord } from '../types/results.types';
import type {
    BookResultOwnershipAttemptInput,
    BookResultOwnershipDecision,
    BookResultViewerIdentity,
    ResultOwnerResolutionSource,
    ResultVisibilityContextType,
    ResultVisibilitySnapshot,
    ResultVisibilitySourceType,
    ResultVisibilityUnresolvedReason,
} from '../types/results.types';
import type { ResultContext } from '../types/solo.types';

type HomeworkRecord = {
    createdBy?: string | null;
    title?: string | null;
    name?: string | null;
    archived?: boolean;
    archivedAt?: number | null;
};

type SessionRecord = {
    createdByUserId?: string | null;
    createdBy?: string | null;
    linkedClassId?: string | null;
    classId?: string | null;
    courseId?: string | null;
    status?: string | null;
    title?: string | null;
    name?: string | null;
};

type ClassRecord = {
    createdBy?: string | null;
    className?: string | null;
    status?: string | null;
};

type CourseRecord = {
    ownerId?: string | null;
    name?: string | null;
    archivedAt?: number | null;
};

type WritingSubmissionRecord = {
    context?: {
        type?: 'live-session' | 'solo-practice' | 'homework';
        sessionCode?: string;
        homeworkId?: string;
        classId?: string;
        courseId?: string;
    };
    testMeta?: {
        testTitle?: string;
    };
};

export interface ResolveResultOwnershipInput {
    result?: Partial<EnhancedTestResultRecord> | null;
    context?: ResultContext | null;
    contextType?: ResultVisibilityContextType | null;
    teacherId?: string | null;
    sessionCode?: string | null;
    classId?: string | null;
    courseId?: string | null;
    homeworkId?: string | null;
    assignmentId?: string | null;
    writingSubmissionId?: string | null;
    sourceNameSnapshot?: string | null;
}

export interface ResultOwnershipResolutionResult {
    visibility: ResultVisibilitySnapshot;
    sourceLookupAttempted: boolean;
    strongestKnownSourceClue: string | null;
}

export interface ResultOwnershipResolverDependencies {
    getHomeworkById: (homeworkId: string) => Promise<HomeworkRecord | null>;
    getSession: (sessionCode: string) => Promise<SessionRecord | null>;
    getClass: (classId: string) => Promise<ClassRecord | null>;
    getCourse: (courseId: string) => Promise<CourseRecord | null>;
    getSubmission: (
        submissionId: string
    ) => Promise<{ success: boolean; data?: WritingSubmissionRecord; error?: string }>;
}

export interface BookResultOwnershipResolverDependencies {
    /**
     * Resolves current Homework authority in one bounded call. Projection
     * snapshots are provenance, never current authorization by themselves.
     */
    resolveHomeworkOwners: (
        input: {
            studentId: string;
            contextIds: readonly string[];
        }
    ) => Promise<Readonly<Record<string, string | null | undefined>>>;
}

export interface ResolveBookResultGroupOwnershipInput {
    viewer: BookResultViewerIdentity;
    studentId: string;
    attempts: readonly BookResultOwnershipAttemptInput[];
}

export async function resolveBookResultGroupOwnership(
    input: ResolveBookResultGroupOwnershipInput,
    dependencies: BookResultOwnershipResolverDependencies
): Promise<readonly BookResultOwnershipDecision[]> {
    if (input.viewer.role === 'student') {
        return input.attempts.map((attempt) => ({
            attemptId: attempt.attemptId,
            visible: input.viewer.uid === input.studentId
                && attempt.recipientId === input.studentId,
            viewerRole: 'student',
            reason: input.viewer.uid === input.studentId
                && attempt.recipientId === input.studentId
                ? 'visible'
                : 'wrong_student',
        }));
    }

    const homeworkContextIds = [...new Set(
        input.attempts
            .filter((attempt) => attempt.contextKind === 'homework')
            .map((attempt) => attempt.contextId)
    )];
    const currentOwners = homeworkContextIds.length > 0
        ? await dependencies.resolveHomeworkOwners({
            studentId: input.studentId,
            contextIds: homeworkContextIds,
        })
        : {};

    return input.attempts.map((attempt) => {
        if (attempt.contextKind === 'solo') {
            return {
                attemptId: attempt.attemptId,
                visible: false,
                viewerRole: 'teacher',
                reason: 'private_solo',
            };
        }
        const currentOwner = currentOwners[attempt.contextId] ?? null;
        if (!attempt.ownerTeacherIdSnapshot || !currentOwner) {
            return {
                attemptId: attempt.attemptId,
                visible: false,
                viewerRole: 'teacher',
                reason: 'unresolved_owner',
            };
        }
        const visible = attempt.recipientId === input.studentId
            && attempt.ownerTeacherIdSnapshot === input.viewer.uid
            && currentOwner === input.viewer.uid;
        return {
            attemptId: attempt.attemptId,
            visible,
            viewerRole: 'teacher',
            reason: visible ? 'visible' : 'wrong_teacher',
        };
    });
}

type NormalizedIdentifiers = {
    contextType: ResultVisibilityContextType;
    sourceType: ResultVisibilitySourceType;
    sourceId: string | null;
    sourceNameSnapshot: string | null;
    teacherId: string | null;
    homeworkId: string | null;
    sessionCode: string | null;
    courseId: string | null;
    classId: string | null;
    assignmentId: string | null;
    writingSubmissionId: string | null;
};

type ResolveSuccessArgs = {
    identifiers: NormalizedIdentifiers;
    visibilityOwnerTeacherId: string;
    ownerResolutionSource: ResultOwnerResolutionSource;
    currentSourceName?: string | null;
    sourceArchived?: boolean;
    sourceDeleted?: boolean;
};

type ResolveUnresolvedArgs = {
    identifiers: NormalizedIdentifiers;
    unresolvedReason: ResultVisibilityUnresolvedReason;
    strongestKnownSourceClue: string | null;
    sourceLookupAttempted: boolean;
    currentSourceName?: string | null;
    sourceArchived?: boolean;
    sourceDeleted?: boolean;
};

const defaultDependencies: ResultOwnershipResolverDependencies = {
    getHomeworkById: async (homeworkId) => getHomeworkById(homeworkId),
    getSession: async (sessionCode) => getSession(sessionCode),
    getClass: async (classId) => getClass(classId),
    getCourse: async (courseId) => getCourse(courseId),
    getSubmission: async (submissionId) => getSubmission(submissionId),
};

export async function resolveResultOwnership(
    input: ResolveResultOwnershipInput,
    dependencies: ResultOwnershipResolverDependencies = defaultDependencies
): Promise<ResultOwnershipResolutionResult> {
    const identifiers = normalizeIdentifiers(input);

    if (identifiers.writingSubmissionId) {
        return resolveWritingLinkedOwnership(identifiers, dependencies);
    }

    switch (identifiers.contextType) {
        case 'homework':
            return resolveHomeworkOwnership(identifiers, dependencies);
        case 'class_session':
            return resolveSessionOwnership(identifiers, dependencies, 'class_session');
        case 'course_material':
            return resolveCourseMaterialOwnership(identifiers, dependencies);
        case 'solo_practice':
            return resolveSoloPracticeOwnership(identifiers);
        default:
            return unresolvedResult({
                identifiers,
                unresolvedReason: 'missing_context',
                strongestKnownSourceClue: buildSourceClue(identifiers.sourceType, identifiers.sourceId),
                sourceLookupAttempted: false,
            });
    }
}

async function resolveWritingLinkedOwnership(
    identifiers: NormalizedIdentifiers,
    dependencies: ResultOwnershipResolverDependencies
): Promise<ResultOwnershipResolutionResult> {
    const clue = buildSourceClue('writing_submission', identifiers.writingSubmissionId);
    const submissionResult = await dependencies.getSubmission(identifiers.writingSubmissionId!);

    if (!submissionResult.success || !submissionResult.data) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'writing_submission',
                sourceId: identifiers.writingSubmissionId,
            },
            unresolvedReason: 'writing_submission_not_found',
            strongestKnownSourceClue: clue,
            sourceLookupAttempted: true,
            sourceDeleted: true,
        });
    }

    const submission = submissionResult.data;
    const linkedIdentifiers: NormalizedIdentifiers = {
        ...identifiers,
        contextType: mapWritingContextType(submission.context?.type),
        sourceType: mapWritingSourceType(submission.context?.type),
        sourceId:
            submission.context?.homeworkId
            ?? submission.context?.sessionCode
            ?? submission.context?.classId
            ?? submission.context?.courseId
            ?? identifiers.writingSubmissionId,
        sourceNameSnapshot: identifiers.sourceNameSnapshot ?? submission.testMeta?.testTitle ?? null,
        homeworkId: submission.context?.homeworkId ?? identifiers.homeworkId,
        sessionCode: submission.context?.sessionCode ?? identifiers.sessionCode,
        classId: submission.context?.classId ?? identifiers.classId,
        courseId: submission.context?.courseId ?? identifiers.courseId,
    };

    if (linkedIdentifiers.contextType === 'solo_practice') {
        return {
            ...resolveSoloPracticeOwnership(linkedIdentifiers),
            sourceLookupAttempted: true,
            strongestKnownSourceClue: clue,
        };
    }

    if (linkedIdentifiers.contextType === 'homework' && linkedIdentifiers.homeworkId) {
        const result = await resolveHomeworkOwnership(linkedIdentifiers, dependencies);
        return {
            ...result,
            strongestKnownSourceClue: clue,
        };
    }

    if (linkedIdentifiers.contextType === 'class_session' && linkedIdentifiers.sessionCode) {
        const result = await resolveSessionOwnership(linkedIdentifiers, dependencies, 'class_session');
        return {
            ...result,
            strongestKnownSourceClue: clue,
        };
    }

    if (linkedIdentifiers.classId || linkedIdentifiers.courseId || linkedIdentifiers.sessionCode) {
        const result = await resolveCourseMaterialOwnership(linkedIdentifiers, dependencies);
        return {
            ...result,
            strongestKnownSourceClue: clue,
        };
    }

    return unresolvedResult({
        identifiers: {
            ...linkedIdentifiers,
            sourceType: 'writing_submission',
            sourceId: identifiers.writingSubmissionId,
        },
        unresolvedReason: 'missing_writing_linked_source',
        strongestKnownSourceClue: clue,
        sourceLookupAttempted: true,
    });
}

async function resolveHomeworkOwnership(
    identifiers: NormalizedIdentifiers,
    dependencies: ResultOwnershipResolverDependencies
): Promise<ResultOwnershipResolutionResult> {
    if (!identifiers.homeworkId) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'homework',
            },
            unresolvedReason: 'missing_homework_id',
            strongestKnownSourceClue: buildSourceClue('homework', identifiers.sourceId),
            sourceLookupAttempted: false,
        });
    }

    const homework = await dependencies.getHomeworkById(identifiers.homeworkId);
    if (!homework) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'homework',
                sourceId: identifiers.homeworkId,
            },
            unresolvedReason: 'homework_not_found',
            strongestKnownSourceClue: buildSourceClue('homework', identifiers.homeworkId),
            sourceLookupAttempted: true,
            sourceDeleted: true,
        });
    }

    const ownerId = sanitizeTeacherUid(homework.createdBy);
    if (!ownerId) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'homework',
                sourceId: identifiers.homeworkId,
            },
            unresolvedReason: 'owner_not_resolved',
            strongestKnownSourceClue: buildSourceClue('homework', identifiers.homeworkId),
            sourceLookupAttempted: true,
            currentSourceName: getDisplayName(homework),
            sourceArchived: isArchivedRecord(homework),
        });
    }

    return resolvedResult({
        identifiers: {
            ...identifiers,
            sourceType: 'homework',
            sourceId: identifiers.homeworkId,
        },
        visibilityOwnerTeacherId: ownerId,
        ownerResolutionSource: 'homework.createdBy',
        currentSourceName: getDisplayName(homework),
        sourceArchived: isArchivedRecord(homework),
    });
}

async function resolveSessionOwnership(
    identifiers: NormalizedIdentifiers,
    dependencies: ResultOwnershipResolverDependencies,
    contextType: ResultVisibilityContextType
): Promise<ResultOwnershipResolutionResult> {
    if (!identifiers.sessionCode) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                contextType,
                sourceType: 'session',
            },
            unresolvedReason: 'missing_session_code',
            strongestKnownSourceClue: buildSourceClue('session', identifiers.sourceId),
            sourceLookupAttempted: false,
        });
    }

    const session = await dependencies.getSession(identifiers.sessionCode);
    if (!session) {
        const fallbackTeacherId = sanitizeTeacherUid(identifiers.teacherId);
        if (fallbackTeacherId) {
            return resolvedResult({
                identifiers: {
                    ...identifiers,
                    contextType,
                    sourceType: 'session',
                    sourceId: identifiers.sessionCode,
                },
                visibilityOwnerTeacherId: fallbackTeacherId,
                ownerResolutionSource: 'result.teacherId',
                currentSourceName: identifiers.sourceNameSnapshot,
            });
        }

        return unresolvedResult({
            identifiers: {
                ...identifiers,
                contextType,
                sourceType: 'session',
                sourceId: identifiers.sessionCode,
            },
            unresolvedReason: 'session_not_found',
            strongestKnownSourceClue: buildSourceClue('session', identifiers.sessionCode),
            sourceLookupAttempted: true,
            sourceDeleted: true,
        });
    }

    const createdByUserId = sanitizeTeacherUid(session.createdByUserId);
    if (createdByUserId) {
        return resolvedResult({
            identifiers: {
                ...identifiers,
                contextType,
                sourceType: 'session',
                sourceId: identifiers.sessionCode,
                classId: identifiers.classId ?? session.linkedClassId ?? session.classId ?? null,
                courseId: identifiers.courseId ?? session.courseId ?? null,
            },
            visibilityOwnerTeacherId: createdByUserId,
            ownerResolutionSource: 'session.createdByUserId',
            currentSourceName: getDisplayName(session),
        });
    }

    const createdBy = sanitizeLegacySessionOwner(session.createdBy);
    if (createdBy) {
        return resolvedResult({
            identifiers: {
                ...identifiers,
                contextType,
                sourceType: 'session',
                sourceId: identifiers.sessionCode,
                classId: identifiers.classId ?? session.linkedClassId ?? session.classId ?? null,
                courseId: identifiers.courseId ?? session.courseId ?? null,
            },
            visibilityOwnerTeacherId: createdBy,
            ownerResolutionSource: 'session.createdBy',
            currentSourceName: getDisplayName(session),
        });
    }

    const fallbackTeacherId = sanitizeTeacherUid(identifiers.teacherId);
    if (fallbackTeacherId) {
        return resolvedResult({
            identifiers: {
                ...identifiers,
                contextType,
                sourceType: 'session',
                sourceId: identifiers.sessionCode,
                classId: identifiers.classId ?? session.linkedClassId ?? session.classId ?? null,
                courseId: identifiers.courseId ?? session.courseId ?? null,
            },
            visibilityOwnerTeacherId: fallbackTeacherId,
            ownerResolutionSource: 'result.teacherId',
            currentSourceName: getDisplayName(session),
        });
    }

    return unresolvedResult({
        identifiers: {
            ...identifiers,
            contextType,
            sourceType: 'session',
            sourceId: identifiers.sessionCode,
            classId: identifiers.classId ?? session.linkedClassId ?? session.classId ?? null,
            courseId: identifiers.courseId ?? session.courseId ?? null,
        },
        unresolvedReason: 'owner_not_resolved',
        strongestKnownSourceClue: buildSourceClue('session', identifiers.sessionCode),
        sourceLookupAttempted: true,
        currentSourceName: getDisplayName(session),
    });
}

async function resolveCourseMaterialOwnership(
    identifiers: NormalizedIdentifiers,
    dependencies: ResultOwnershipResolverDependencies
): Promise<ResultOwnershipResolutionResult> {
    let resolvedClassId = identifiers.classId;
    let sessionLookupAttempted = false;

    if (!resolvedClassId && identifiers.sessionCode) {
        sessionLookupAttempted = true;
        const session = await dependencies.getSession(identifiers.sessionCode);
        if (session) {
            resolvedClassId = session.linkedClassId ?? session.classId ?? null;
        }
    }

    if (resolvedClassId) {
        const classRecord = await dependencies.getClass(resolvedClassId);
        if (!classRecord) {
            return unresolvedResult({
                identifiers: {
                    ...identifiers,
                    sourceType: 'class',
                    sourceId: resolvedClassId,
                    classId: resolvedClassId,
                },
                unresolvedReason: 'class_not_found',
                strongestKnownSourceClue: buildSourceClue('class', resolvedClassId),
                sourceLookupAttempted: true,
                sourceDeleted: true,
            });
        }

        const ownerId = sanitizeTeacherUid(classRecord.createdBy);
        if (!ownerId) {
            return unresolvedResult({
                identifiers: {
                    ...identifiers,
                    sourceType: 'class',
                    sourceId: resolvedClassId,
                    classId: resolvedClassId,
                },
                unresolvedReason: 'owner_not_resolved',
                strongestKnownSourceClue: buildSourceClue('class', resolvedClassId),
                sourceLookupAttempted: true,
                currentSourceName: getDisplayName(classRecord),
                sourceArchived: isArchivedRecord(classRecord),
            });
        }

        return resolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'class',
                sourceId: resolvedClassId,
                classId: resolvedClassId,
            },
            visibilityOwnerTeacherId: ownerId,
            ownerResolutionSource: 'class.createdBy',
            currentSourceName: getDisplayName(classRecord),
            sourceArchived: isArchivedRecord(classRecord),
        });
    }

    if (!identifiers.courseId) {
        return unresolvedResult({
            identifiers,
            unresolvedReason: sessionLookupAttempted ? 'missing_class_id' : 'missing_course_id',
            strongestKnownSourceClue:
                buildSourceClue('class', resolvedClassId)
                ?? buildSourceClue('course', identifiers.courseId),
            sourceLookupAttempted: sessionLookupAttempted,
        });
    }

    const course = await dependencies.getCourse(identifiers.courseId);
    if (!course) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'course',
                sourceId: identifiers.courseId,
            },
            unresolvedReason: 'course_not_found',
            strongestKnownSourceClue: buildSourceClue('course', identifiers.courseId),
            sourceLookupAttempted: true,
            sourceDeleted: true,
        });
    }

    const ownerId = sanitizeTeacherUid(course.ownerId);
    if (!ownerId) {
        return unresolvedResult({
            identifiers: {
                ...identifiers,
                sourceType: 'course',
                sourceId: identifiers.courseId,
            },
            unresolvedReason: 'owner_not_resolved',
            strongestKnownSourceClue: buildSourceClue('course', identifiers.courseId),
            sourceLookupAttempted: true,
            currentSourceName: getDisplayName(course),
            sourceArchived: isArchivedRecord(course),
        });
    }

    return resolvedResult({
        identifiers: {
            ...identifiers,
            sourceType: 'course',
            sourceId: identifiers.courseId,
        },
        visibilityOwnerTeacherId: ownerId,
        ownerResolutionSource: 'course.ownerId',
        currentSourceName: getDisplayName(course),
        sourceArchived: isArchivedRecord(course),
    });
}

function resolveSoloPracticeOwnership(
    identifiers: NormalizedIdentifiers
): ResultOwnershipResolutionResult {
    return {
        visibility: {
            contextType: 'solo_practice',
            sourceType: 'solo_practice',
            sourceId: identifiers.sourceId,
            sourceNameSnapshot: identifiers.sourceNameSnapshot,
            visibilityOwnerTeacherId: null,
            ownerResolutionSource: 'solo_practice',
            ownershipResolved: true,
            unresolvedReason: null,
            homeworkId: identifiers.homeworkId,
            sessionCode: identifiers.sessionCode,
            courseId: identifiers.courseId,
            classId: identifiers.classId,
            assignmentId: identifiers.assignmentId,
        },
        sourceLookupAttempted: false,
        strongestKnownSourceClue: buildSourceClue('solo_practice', identifiers.sourceId),
    };
}

function resolvedResult(args: ResolveSuccessArgs): ResultOwnershipResolutionResult {
    const visibility: ResultVisibilitySnapshot = {
        contextType: args.identifiers.contextType,
        sourceType: args.identifiers.sourceType,
        sourceId: args.identifiers.sourceId,
        sourceNameSnapshot: args.identifiers.sourceNameSnapshot,
        visibilityOwnerTeacherId: args.visibilityOwnerTeacherId,
        ownerResolutionSource: args.ownerResolutionSource,
        ownershipResolved: true,
        unresolvedReason: null,
        homeworkId: args.identifiers.homeworkId,
        sessionCode: args.identifiers.sessionCode,
        courseId: args.identifiers.courseId,
        classId: args.identifiers.classId,
        assignmentId: args.identifiers.assignmentId,
        currentSourceName: args.currentSourceName ?? null,
        ...(args.sourceDeleted !== undefined ? { sourceDeleted: args.sourceDeleted } : {}),
        ...(args.sourceArchived !== undefined ? { sourceArchived: args.sourceArchived } : {}),
    };

    return {
        visibility,
        sourceLookupAttempted: true,
        strongestKnownSourceClue: buildSourceClue(
            args.identifiers.sourceType,
            args.identifiers.sourceId
        ),
    };
}

function unresolvedResult(args: ResolveUnresolvedArgs): ResultOwnershipResolutionResult {
    const visibility: ResultVisibilitySnapshot = {
        contextType: args.identifiers.contextType,
        sourceType: args.identifiers.sourceType,
        sourceId: args.identifiers.sourceId,
        sourceNameSnapshot: args.identifiers.sourceNameSnapshot,
        visibilityOwnerTeacherId: null,
        ownerResolutionSource: 'unresolved',
        ownershipResolved: false,
        unresolvedReason: args.unresolvedReason,
        homeworkId: args.identifiers.homeworkId,
        sessionCode: args.identifiers.sessionCode,
        courseId: args.identifiers.courseId,
        classId: args.identifiers.classId,
        assignmentId: args.identifiers.assignmentId,
        currentSourceName: args.currentSourceName ?? null,
        ...(args.sourceDeleted !== undefined ? { sourceDeleted: args.sourceDeleted } : {}),
        ...(args.sourceArchived !== undefined ? { sourceArchived: args.sourceArchived } : {}),
    };

    return {
        visibility,
        sourceLookupAttempted: args.sourceLookupAttempted,
        strongestKnownSourceClue: args.strongestKnownSourceClue,
    };
}

function normalizeIdentifiers(input: ResolveResultOwnershipInput): NormalizedIdentifiers {
    const result = input.result ?? {};
    const context = input.context ?? result.context ?? null;
    const visibility = result.visibility ?? null;
    const resultTeacherId =
        typeof result.teacherId === 'string'
            ? result.teacherId
            : null;

    const sessionCode =
        input.sessionCode
        ?? context?.sessionCode
        ?? context?.source?.sessionCode
        ?? visibility?.sessionCode
        ?? result.sessionCode
        ?? null;
    const classId =
        input.classId
        ?? context?.classId
        ?? context?.source?.classId
        ?? visibility?.classId
        ?? result.classId
        ?? null;
    const courseId =
        input.courseId
        ?? context?.courseId
        ?? context?.source?.courseId
        ?? visibility?.courseId
        ?? result.courseId
        ?? null;
    const homeworkId =
        input.homeworkId
        ?? context?.assignment?.homeworkId
        ?? visibility?.homeworkId
        ?? null;
    const assignmentId =
        input.assignmentId
        ?? context?.assignment?.assignmentId
        ?? visibility?.assignmentId
        ?? null;
    const writingSubmissionId =
        input.writingSubmissionId
        ?? result.writingData?.submissionId
        ?? null;

    return {
        contextType: inferContextType(input, context),
        sourceType: inferSourceType(input, context),
        sourceId:
            visibility?.sourceId
            ?? context?.source?.id
            ?? classId
            ?? courseId
            ?? homeworkId
            ?? sessionCode
            ?? writingSubmissionId
            ?? null,
        sourceNameSnapshot:
            input.sourceNameSnapshot
            ?? visibility?.sourceNameSnapshot
            ?? context?.source?.name
            ?? result.className
            ?? result.courseName
            ?? result.testTitle
            ?? null,
        teacherId:
            input.teacherId
            ?? visibility?.visibilityOwnerTeacherId
            ?? resultTeacherId
            ?? null,
        homeworkId,
        sessionCode,
        courseId,
        classId,
        assignmentId,
        writingSubmissionId,
    };
}

function mapContextType(
    contextType: ResultContext['type'] | null | undefined
): ResultVisibilityContextType {
    if (contextType === 'homework') return 'homework';
    if (contextType === 'class_session') return 'class_session';
    if (contextType === 'course_material') return 'course_material';
    if (contextType === 'self_study') return 'solo_practice';
    return 'unresolved';
}

function inferContextType(
    input: ResolveResultOwnershipInput,
    context: ResultContext | null
): ResultVisibilityContextType {
    if (input.contextType) {
        return input.contextType;
    }

    const fromContext = mapContextType(context?.type);
    if (fromContext !== 'unresolved') {
        return fromContext;
    }

    if (input.homeworkId) {
        return 'homework';
    }
    if (input.classId || input.courseId) {
        return 'course_material';
    }
    if (input.sessionCode) {
        return 'class_session';
    }

    return 'unresolved';
}

function mapWritingContextType(
    writingContextType: WritingSubmissionRecord['context'] extends infer T
        ? T extends { type?: infer U }
            ? U
            : never
        : never
): ResultVisibilityContextType {
    if (writingContextType === 'homework') return 'homework';
    if (writingContextType === 'live-session') return 'class_session';
    if (writingContextType === 'solo-practice') return 'solo_practice';
    return 'unresolved';
}

function mapContextSourceType(context: ResultContext | null): ResultVisibilitySourceType {
    switch (context?.type) {
        case 'homework':
            return 'homework';
        case 'class_session':
            return 'session';
        case 'course_material':
            return context.source.classId ? 'class' : 'course';
        case 'self_study':
            return 'solo_practice';
        default:
            return 'unknown';
    }
}

function inferSourceType(
    input: ResolveResultOwnershipInput,
    context: ResultContext | null
): ResultVisibilitySourceType {
    const fromContext = mapContextSourceType(context);
    if (fromContext !== 'unknown') {
        return fromContext;
    }

    if (input.homeworkId) {
        return 'homework';
    }
    if (input.classId) {
        return 'class';
    }
    if (input.courseId) {
        return 'course';
    }
    if (input.sessionCode) {
        return 'session';
    }
    if (input.writingSubmissionId) {
        return 'writing_submission';
    }

    return 'unknown';
}

function mapWritingSourceType(
    writingContextType: WritingSubmissionRecord['context'] extends infer T
        ? T extends { type?: infer U }
            ? U
            : never
        : never
): ResultVisibilitySourceType {
    if (writingContextType === 'homework') return 'homework';
    if (writingContextType === 'live-session') return 'session';
    if (writingContextType === 'solo-practice') return 'solo_practice';
    return 'writing_submission';
}

function buildSourceClue(
    sourceType: ResultVisibilitySourceType,
    sourceId: string | null
): string | null {
    return sourceId ? `${sourceType}:${sourceId}` : null;
}

function sanitizeTeacherUid(value: string | null | undefined): string | null {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed || trimmed === 'unknown' || trimmed.startsWith('teacher_')) {
        return null;
    }
    return trimmed;
}

function sanitizeLegacySessionOwner(value: string | null | undefined): string | null {
    const sanitized = sanitizeTeacherUid(value);
    if (!sanitized) {
        return null;
    }
    return sanitized.length >= 20 ? sanitized : null;
}

function getDisplayName(record: Record<string, unknown>): string | null {
    const value = [
        record.title,
        record.name,
        record.className,
        (record.metadata as { title?: string } | undefined)?.title,
    ].find((entry) => typeof entry === 'string' && entry.trim().length > 0);

    return typeof value === 'string' ? value : null;
}

function isArchivedRecord(record: Record<string, unknown>): boolean {
    if (record.archived === true) {
        return true;
    }
    if (typeof record.archivedAt === 'number' && record.archivedAt > 0) {
        return true;
    }
    return record.status === 'archived' || record.status === 'deleted';
}
