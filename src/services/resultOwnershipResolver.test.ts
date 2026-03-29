import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultContext } from '../types/solo.types';
import {
    resolveResultOwnership,
    type ResultOwnershipResolverDependencies,
} from './resultOwnershipResolver';

function createDependencies(): ResultOwnershipResolverDependencies {
    return {
        getHomeworkById: vi.fn(async () => null),
        getSession: vi.fn(async () => null),
        getClass: vi.fn(async () => null),
        getCourse: vi.fn(async () => null),
        getSubmission: vi.fn(async () => ({ success: false })),
    };
}

function createContext(overrides: Partial<ResultContext> = {}): ResultContext {
    return {
        type: 'homework',
        source: {
            type: 'homework',
            id: 'hw-1',
            name: 'Homework 1',
        },
        assignment: {
            homeworkId: 'hw-1',
            attemptNumber: 1,
        },
        configApplied: {
            timerMinutes: null,
            feedbackTiming: 'after_each',
            source: 'material_default',
        },
        ...overrides,
    };
}

describe('resultOwnershipResolver', () => {
    let dependencies: ResultOwnershipResolverDependencies;

    beforeEach(() => {
        dependencies = createDependencies();
    });

    it('resolves homework ownership from homework.createdBy', async () => {
        (dependencies.getHomeworkById as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher-homework',
            title: 'Homework 1',
        });

        const result = await resolveResultOwnership({
            contextType: 'homework',
            context: createContext(),
            homeworkId: 'hw-1',
            sessionCode: 'SESSION-1',
            classId: 'class-1',
            courseId: 'course-1',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'homework',
            sourceType: 'homework',
            sourceId: 'hw-1',
            visibilityOwnerTeacherId: 'teacher-homework',
            ownerResolutionSource: 'homework.createdBy',
            ownershipResolved: true,
            homeworkId: 'hw-1',
        });
        expect(dependencies.getSession).not.toHaveBeenCalled();
        expect(dependencies.getClass).not.toHaveBeenCalled();
        expect(dependencies.getCourse).not.toHaveBeenCalled();
    });

    it('uses createdByUserId as the authoritative session owner', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdByUserId: 'teacher-session',
            createdBy: 'abcdefghijklmnopqrstuvwxyz12',
            linkedClassId: 'class-1',
            courseId: 'course-1',
            title: 'Session A',
        });

        const result = await resolveResultOwnership({
            contextType: 'class_session',
            sessionCode: 'SESSION-A',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'class_session',
            sourceType: 'session',
            sourceId: 'SESSION-A',
            visibilityOwnerTeacherId: 'teacher-session',
            ownerResolutionSource: 'session.createdByUserId',
            ownershipResolved: true,
            classId: 'class-1',
            courseId: 'course-1',
        });
    });

    it('falls back to session.createdBy only for a probable legacy auth uid', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'abcdefghijklmnopqrstuvwxyz12',
            title: 'Legacy Session',
        });

        const result = await resolveResultOwnership({
            contextType: 'class_session',
            sessionCode: 'SESSION-B',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            visibilityOwnerTeacherId: 'abcdefghijklmnopqrstuvwxyz12',
            ownerResolutionSource: 'session.createdBy',
            ownershipResolved: true,
        });
    });

    it('marks session rows unresolved when only the synthetic teacher id exists', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher_123',
            title: 'Broken Session',
        });

        const result = await resolveResultOwnership({
            contextType: 'class_session',
            sessionCode: 'SESSION-C',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'class_session',
            sourceType: 'session',
            sourceId: 'SESSION-C',
            ownershipResolved: false,
            unresolvedReason: 'owner_not_resolved',
        });
        expect(result.sourceLookupAttempted).toBe(true);
        expect(result.strongestKnownSourceClue).toBe('session:SESSION-C');
    });

    it('falls back to result.teacherId for class-session rows when the session owner cannot be resolved', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher_123',
            title: 'Broken Session',
        });

        const result = await resolveResultOwnership({
            contextType: 'class_session',
            sessionCode: 'SESSION-D',
            teacherId: 'teacher-session-fallback',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'class_session',
            sourceType: 'session',
            sourceId: 'SESSION-D',
            visibilityOwnerTeacherId: 'teacher-session-fallback',
            ownerResolutionSource: 'result.teacherId',
            ownershipResolved: true,
        });
    });

    it('falls back to result.teacherId when the class-session source cannot be loaded', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const result = await resolveResultOwnership({
            contextType: 'class_session',
            sessionCode: 'SESSION-E',
            result: {
                teacherId: 'teacher-session-fallback',
                testTitle: 'Session E',
            },
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'class_session',
            sourceType: 'session',
            sourceId: 'SESSION-E',
            visibilityOwnerTeacherId: 'teacher-session-fallback',
            ownerResolutionSource: 'result.teacherId',
            ownershipResolved: true,
        });
    });

    it('resolves class-linked course material from class.createdBy', async () => {
        (dependencies.getClass as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher-class',
            className: 'Class A',
        });

        const result = await resolveResultOwnership({
            contextType: 'course_material',
            classId: 'class-1',
            context: createContext({
                type: 'course_material',
                source: {
                    type: 'class',
                    id: 'class-1',
                    classId: 'class-1',
                    name: 'Class A',
                },
            }),
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'course_material',
            sourceType: 'class',
            sourceId: 'class-1',
            visibilityOwnerTeacherId: 'teacher-class',
            ownerResolutionSource: 'class.createdBy',
            ownershipResolved: true,
        });
    });

    it('bridges class-linked course material through session.linkedClassId when class id is missing', async () => {
        (dependencies.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
            linkedClassId: 'class-2',
        });
        (dependencies.getClass as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher-class-2',
            className: 'Class B',
        });

        const result = await resolveResultOwnership({
            contextType: 'course_material',
            sessionCode: 'SESSION-D',
        }, dependencies);

        expect(dependencies.getSession).toHaveBeenCalledWith('SESSION-D');
        expect(dependencies.getClass).toHaveBeenCalledWith('class-2');
        expect(result.visibility).toMatchObject({
            sourceType: 'class',
            sourceId: 'class-2',
            classId: 'class-2',
            visibilityOwnerTeacherId: 'teacher-class-2',
        });
    });

    it('resolves standalone course material from course.ownerId', async () => {
        (dependencies.getCourse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ownerId: 'teacher-course',
            name: 'Course A',
        });

        const result = await resolveResultOwnership({
            contextType: 'course_material',
            courseId: 'course-1',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'course_material',
            sourceType: 'course',
            sourceId: 'course-1',
            visibilityOwnerTeacherId: 'teacher-course',
            ownerResolutionSource: 'course.ownerId',
            ownershipResolved: true,
        });
    });

    it('resolves writing submissions through the linked authoritative source', async () => {
        (dependencies.getSubmission as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: {
                context: {
                    type: 'homework',
                    homeworkId: 'hw-2',
                },
                testMeta: {
                    testTitle: 'Writing Homework',
                },
            },
        });
        (dependencies.getHomeworkById as ReturnType<typeof vi.fn>).mockResolvedValue({
            createdBy: 'teacher-writing-homework',
            title: 'Homework Writing',
        });

        const result = await resolveResultOwnership({
            writingSubmissionId: 'submission-1',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'homework',
            sourceType: 'homework',
            sourceId: 'hw-2',
            visibilityOwnerTeacherId: 'teacher-writing-homework',
            ownerResolutionSource: 'homework.createdBy',
            ownershipResolved: true,
        });
        expect(result.sourceLookupAttempted).toBe(true);
        expect(result.strongestKnownSourceClue).toBe('writing_submission:submission-1');
    });

    it('classifies self-study rows as solo practice with no teacher-owner lookup', async () => {
        const result = await resolveResultOwnership({
            context: createContext({
                type: 'self_study',
                source: {
                    type: 'library',
                    id: 'material-1',
                    name: 'Library Reading',
                },
            }),
        }, dependencies);

        expect(result.visibility).toMatchObject({
            contextType: 'solo_practice',
            sourceType: 'solo_practice',
            sourceId: 'material-1',
            visibilityOwnerTeacherId: null,
            ownerResolutionSource: 'solo_practice',
            ownershipResolved: true,
        });
        expect(result.sourceLookupAttempted).toBe(false);
        expect(dependencies.getHomeworkById).not.toHaveBeenCalled();
        expect(dependencies.getSession).not.toHaveBeenCalled();
    });

    it('marks missing authoritative source rows as unresolved deleted-source cases', async () => {
        const result = await resolveResultOwnership({
            contextType: 'homework',
            homeworkId: 'hw-missing',
        }, dependencies);

        expect(result.visibility).toMatchObject({
            sourceType: 'homework',
            sourceId: 'hw-missing',
            ownershipResolved: false,
            unresolvedReason: 'homework_not_found',
            sourceDeleted: true,
        });
    });
});
