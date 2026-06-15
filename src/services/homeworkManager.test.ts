import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    HomeworkAssignment,
    HomeworkConfig,
    HomeworkStats,
    HomeworkTarget,
    HomeworkVisibility,
} from '../types/homework.types';
import type { AntiCheatConfig } from '../types/integrity.types';

const firestoreHarness = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    let counter = 0;
    const deleteFieldToken = Symbol('deleteField');

    return {
        store,
        deleteFieldToken,
        nextId: () => `homework-${++counter}`,
        reset: () => {
            store.clear();
            counter = 0;
        },
    };
});

const mockIsRestoreInProgress = vi.hoisted(() => vi.fn());
const mockGetClass = vi.hoisted(() => vi.fn());
const mockGetStudentClasses = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const getValueAtPath = (value: Record<string, unknown>, path: string): unknown =>
        path.split('.').reduce<unknown>((current, segment) => {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            return (current as Record<string, unknown>)[segment];
        }, value);

    const setValueAtPath = (value: Record<string, unknown>, path: string, nextValue: unknown) => {
        const segments = path.split('.');
        const lastSegment = segments.pop();

        if (!lastSegment) {
            return;
        }

        let current: Record<string, unknown> = value;
        for (const segment of segments) {
            const existing = current[segment];
            if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
                current[segment] = {};
            }
            current = current[segment] as Record<string, unknown>;
        }

        current[lastSegment] = nextValue;
    };

    const deleteValueAtPath = (value: Record<string, unknown>, path: string) => {
        const segments = path.split('.');
        const lastSegment = segments.pop();

        if (!lastSegment) {
            return;
        }

        let current: Record<string, unknown> = value;
        for (const segment of segments) {
            const existing = current[segment];
            if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
                return;
            }
            current = existing as Record<string, unknown>;
        }

        delete current[lastSegment];
    };

    const applyUpdates = (currentValue: Record<string, unknown>, updates: Record<string, unknown>) => {
        const nextValue = clone(currentValue);

        Object.entries(updates).forEach(([key, value]) => {
            if (value === firestoreHarness.deleteFieldToken) {
                deleteValueAtPath(nextValue, key);
                return;
            }

            if (key.includes('.')) {
                setValueAtPath(nextValue, key, clone(value));
                return;
            }

            nextValue[key] = clone(value);
        });

        return nextValue;
    };

    const listDocuments = (collectionName: string) =>
        [...firestoreHarness.store.entries()]
            .filter(([path]) => path.startsWith(`${collectionName}/`))
            .map(([path, value]) => {
                const id = path.slice(collectionName.length + 1);
                const ref = { kind: 'doc', collection: collectionName, id, path };
                return {
                    id,
                    ref,
                    data: () => clone(value),
                };
            });

    const matchesCondition = (
        data: Record<string, unknown>,
        condition: { fieldPath: string; op: string; value: unknown },
    ) => {
        const actualValue = getValueAtPath(data, condition.fieldPath);

        if (condition.op === '==') {
            return actualValue === condition.value;
        }

        if (condition.op === 'array-contains') {
            return Array.isArray(actualValue) && actualValue.includes(condition.value);
        }

        return false;
    };

    return {
        collection: vi.fn((_db: unknown, name: string) => ({ kind: 'collection', name })),
        doc: vi.fn((...args: unknown[]) => {
            if ((args[0] as { kind?: string })?.kind === 'collection') {
                const collectionRef = args[0] as { name: string };
                const id = (args[1] as string | undefined) ?? firestoreHarness.nextId();
                return {
                    kind: 'doc',
                    collection: collectionRef.name,
                    id,
                    path: `${collectionRef.name}/${id}`,
                };
            }

            const collectionName = args[1] as string;
            const id = (args[2] as string | undefined) ?? firestoreHarness.nextId();
            return {
                kind: 'doc',
                collection: collectionName,
                id,
                path: `${collectionName}/${id}`,
            };
        }),
        setDoc: vi.fn(async (ref: { path: string }, value: Record<string, unknown>) => {
            firestoreHarness.store.set(ref.path, clone(value));
        }),
        getDoc: vi.fn(async (ref: { path: string }) => {
            const value = firestoreHarness.store.get(ref.path);
            return {
                exists: () => value !== undefined,
                data: () => clone(value),
            };
        }),
        getDocs: vi.fn(async (target: { kind: string; collection: string; conditions?: Array<{ fieldPath: string; op: string; value: unknown }> }) => {
            const docs = listDocuments(target.collection).filter((docSnap) => (
                target.kind !== 'query'
                    ? true
                    : (target.conditions ?? []).every((condition) => matchesCondition(docSnap.data(), condition))
            ));

            return {
                empty: docs.length === 0,
                docs,
            };
        }),
        updateDoc: vi.fn(async (ref: { path: string }, updates: Record<string, unknown>) => {
            const currentValue = firestoreHarness.store.get(ref.path) ?? {};
            firestoreHarness.store.set(ref.path, applyUpdates(currentValue, updates));
        }),
        deleteDoc: vi.fn(async (ref: { path: string }) => {
            firestoreHarness.store.delete(ref.path);
        }),
        query: vi.fn((collectionRef: { name: string }, ...conditions: Array<{ fieldPath: string; op: string; value: unknown }>) => ({
            kind: 'query',
            collection: collectionRef.name,
            conditions,
        })),
        where: vi.fn((fieldPath: string, op: string, value: unknown) => ({
            fieldPath,
            op,
            value,
        })),
        deleteField: vi.fn(() => firestoreHarness.deleteFieldToken),
        writeBatch: vi.fn(() => {
            const operations: Array<() => void> = [];

            return {
                update: (ref: { path: string }, updates: Record<string, unknown>) => {
                    operations.push(() => {
                        const currentValue = firestoreHarness.store.get(ref.path) ?? {};
                        firestoreHarness.store.set(ref.path, applyUpdates(currentValue, updates));
                    });
                },
                commit: async () => {
                    operations.forEach((operation) => operation());
                },
            };
        }),
    };
});

vi.mock('./firebase', () => ({
    firestore: { name: 'mock-firestore' },
}));

vi.mock('./restoreGuard', () => ({
    isRestoreInProgress: (...args: unknown[]) => mockIsRestoreInProgress(...args),
}));

vi.mock('./classManager', () => ({
    getClass: (...args: unknown[]) => mockGetClass(...args),
    getStudentClasses: (...args: unknown[]) => mockGetStudentClasses(...args),
}));

import {
    createHomework,
    deleteHomework,
    duplicateHomework,
    extendDeadline,
    getHomeworkByClass,
    getHomeworkById,
    getHomeworkByTeacher,
    getHomeworkForStudent,
    updateHomeworkStatus,
} from './homeworkManager';

const mockTeacherId = 'teacher-123';
const mockMaterialId = 'material-456';
const mockClassId = 'class-789';
const mockStudentId = 'student-001';

const mockConfig: HomeworkConfig = {
    timerMinutes: 60,
    maxAttempts: 3,
    feedbackTiming: 'after_completion',
    lateSubmissionAllowed: false,
};

const mockVisibility: HomeworkVisibility = {
    showTimer: true,
    showAttempts: true,
    showDueDate: true,
    showQuestionCount: true,
    showDuration: true,
};

const mockStats: HomeworkStats = {
    totalAssigned: 0,
    started: 0,
    submitted: 0,
    lateSubmissions: 0,
};

const mockAntiCheatConfig: AntiCheatConfig = {
    preset: 'standard',
    detectTabSwitch: true,
    detectCopyPaste: true,
    detectRightClick: true,
    detectFullscreenExit: false,
    detectKeyboardShortcuts: true,
    enableStudentWarnings: true,
    enableAutoSubmit: true,
    autoSubmitThreshold: 5,
    requireFullscreen: false,
    shuffleQuestions: true,
    shuffleOptions: true,
    nullifyRemainingAttempts: true,
};

const mockClassTarget: HomeworkTarget = {
    type: 'class',
    classId: mockClassId,
    className: 'Test Class',
};

const mockStudentsTarget: HomeworkTarget = {
    type: 'students',
    studentIds: ['student-001', 'student-002', 'student-003'],
};

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const buildHomeworkRecord = (overrides: Partial<HomeworkAssignment> = {}): HomeworkAssignment => {
    const homework: HomeworkAssignment = {
        id: overrides.id ?? 'homework-seeded',
        createdBy: overrides.createdBy ?? mockTeacherId,
        createdAt: overrides.createdAt ?? Date.now() - 10_000,
        updatedAt: overrides.updatedAt ?? Date.now() - 5_000,
        materialId: overrides.materialId ?? mockMaterialId,
        materialTitle: overrides.materialTitle ?? 'Seeded Material',
        materialType: overrides.materialType ?? 'quiz',
        materialSkill: overrides.materialSkill ?? 'reading',
        target: overrides.target ?? mockClassTarget,
        scheduling: overrides.scheduling ?? {
            availableFrom: Date.now() - 1_000,
            dueDate: Date.now() + 86_400_000,
        },
        config: overrides.config ?? mockConfig,
        visibility: overrides.visibility ?? mockVisibility,
        status: overrides.status ?? 'active',
        tags: overrides.tags ?? [],
        archived: overrides.archived ?? false,
        studentOverrides: overrides.studentOverrides ?? {},
        description: overrides.description ?? '',
        stats: overrides.stats ?? mockStats,
    };

    if (overrides.title !== undefined) {
        homework.title = overrides.title;
    }

    if (overrides.antiCheatConfig !== undefined) {
        homework.antiCheatConfig = overrides.antiCheatConfig;
    }

    return homework;
};

const seedHomework = (overrides: Partial<HomeworkAssignment> = {}) => {
    const homework = buildHomeworkRecord(overrides);
    firestoreHarness.store.set(`homework_assignments/${homework.id}`, cloneValue(homework) as Record<string, unknown>);
    return homework;
};

describe('homeworkManager', () => {
    beforeEach(() => {
        firestoreHarness.reset();
        vi.clearAllMocks();
        mockIsRestoreInProgress.mockResolvedValue(false);
        mockGetClass.mockResolvedValue({
            id: mockClassId,
            students: {
                'student-001': { uid: 'student-001' },
                'student-002': { uid: 'student-002' },
            },
        });
        mockGetStudentClasses.mockResolvedValue([]);
    });

    describe('createHomework', () => {
        it('creates class-target homework, resolves assigned count, and strips undefined title fields', async () => {
            const homeworkId = await createHomework({
                materialId: mockMaterialId,
                materialTitle: 'Test Material',
                teacherId: mockTeacherId,
                target: mockClassTarget,
                config: mockConfig,
                availableFrom: new Date(Date.now() - 1_000),
                dueDate: new Date(Date.now() + 86_400_000),
                instructions: 'Complete all questions',
            });

            const storedHomework = await getHomeworkById(homeworkId);
            const rawHomework = firestoreHarness.store.get(`homework_assignments/${homeworkId}`);

            expect(storedHomework).toMatchObject({
                id: homeworkId,
                createdBy: mockTeacherId,
                description: 'Complete all questions',
                status: 'active',
                stats: expect.objectContaining({ totalAssigned: 2 }),
            });
            expect(rawHomework).not.toHaveProperty('title');
        });

        it('creates student-target homework with the student count as totalAssigned', async () => {
            const homeworkId = await createHomework({
                materialId: mockMaterialId,
                materialTitle: 'Direct Assignment',
                teacherId: mockTeacherId,
                target: mockStudentsTarget,
                config: mockConfig,
                dueDate: new Date(Date.now() + 86_400_000),
            });

            const storedHomework = await getHomeworkById(homeworkId);

            expect(storedHomework?.stats.totalAssigned).toBe(3);
            expect(storedHomework?.target).toEqual(mockStudentsTarget);
        });

        it('persists homework anti-cheat configuration when provided', async () => {
            const homeworkId = await createHomework({
                materialId: mockMaterialId,
                materialTitle: 'Protected Homework',
                teacherId: mockTeacherId,
                target: mockStudentsTarget,
                config: mockConfig,
                dueDate: new Date(Date.now() + 86_400_000),
                antiCheatConfig: mockAntiCheatConfig,
            });

            const storedHomework = await getHomeworkById(homeworkId);

            expect(storedHomework?.antiCheatConfig).toEqual(mockAntiCheatConfig);
        });

        it('creates single Reading Passage homework with frozen snapshot metadata', async () => {
            const homeworkId = await createHomework({
                materialId: 'reading-passage-1',
                materialTitle: 'Making Time for Science',
                materialType: 'reading-passage',
                materialSkill: 'reading',
                teacherId: mockTeacherId,
                target: mockStudentsTarget,
                config: mockConfig,
                dueDate: new Date(Date.now() + 86_400_000),
                readingPassageSnapshot: {
                    passageMaterialId: 'reading-passage-1',
                    snapshotVersionId: 'snapshot-passage-1',
                    titleSnapshot: 'Making Time for Science',
                    questionCount: 13,
                    testTypeIds: ['ielts'],
                    sourceOrderDisplay: 'Passage 1',
                    sourceFullTestTitle: 'British Council Practice Test 01',
                },
            });

            const storedHomework = await getHomeworkById(homeworkId);

            expect(storedHomework).toMatchObject({
                materialId: 'reading-passage-1',
                materialTitle: 'Making Time for Science',
                materialType: 'reading-passage',
                readingPassageSnapshot: {
                    passageMaterialId: 'reading-passage-1',
                    snapshotVersionId: 'snapshot-passage-1',
                    titleSnapshot: 'Making Time for Science',
                    questionCount: 13,
                    testTypeIds: ['ielts'],
                    sourceOrderDisplay: 'Passage 1',
                    sourceFullTestTitle: 'British Council Practice Test 01',
                },
            });
        });

        it('creates Reading Passage set homework with assignment-owned material id and ordered snapshots', async () => {
            const homeworkId = await createHomework({
                materialId: 'ignored-before-homework-id-exists',
                materialTitle: 'IELTS Passage Set',
                materialType: 'reading-passage-set',
                materialSkill: 'reading',
                teacherId: mockTeacherId,
                target: mockStudentsTarget,
                config: mockConfig,
                dueDate: new Date(Date.now() + 86_400_000),
                readingPassageSet: {
                    titleSnapshot: 'IELTS Passage Set',
                    items: [
                        {
                            order: 1,
                            passageMaterialId: 'reading-passage-1',
                            snapshotVersionId: 'snapshot-passage-1',
                            titleSnapshot: 'Passage One',
                            questionCount: 13,
                            testTypeIds: ['ielts'],
                            sourceOrderDisplay: 'Passage 1',
                        },
                        {
                            order: 2,
                            passageMaterialId: 'reading-passage-2',
                            snapshotVersionId: 'snapshot-passage-2',
                            titleSnapshot: 'Passage Two',
                            questionCount: 13,
                            testTypeIds: ['ielts'],
                            sourceOrderDisplay: 'Passage 2',
                        },
                    ],
                },
            });

            const storedHomework = await getHomeworkById(homeworkId);

            expect(storedHomework).toMatchObject({
                materialId: `reading-passage-set:${homeworkId}`,
                materialTitle: 'IELTS Passage Set',
                materialType: 'reading-passage-set',
                readingPassageSet: {
                    titleSnapshot: 'IELTS Passage Set',
                    items: [
                        expect.objectContaining({
                            order: 1,
                            passageMaterialId: 'reading-passage-1',
                            snapshotVersionId: 'snapshot-passage-1',
                        }),
                        expect.objectContaining({
                            order: 2,
                            passageMaterialId: 'reading-passage-2',
                            snapshotVersionId: 'snapshot-passage-2',
                        }),
                    ],
                },
            });
        });
    });

    describe('queries', () => {
        it('returns teacher homework sorted by createdAt descending', async () => {
            seedHomework({ id: 'older', createdAt: 100, updatedAt: 100 });
            seedHomework({ id: 'newer', createdAt: 200, updatedAt: 200 });
            seedHomework({ id: 'other-teacher', createdBy: 'teacher-999' });

            const homework = await getHomeworkByTeacher(mockTeacherId);

            expect(homework.map((item) => item.id)).toEqual(['newer', 'older']);
        });

        it('returns class homework sorted by dueDate descending', async () => {
            seedHomework({
                id: 'first-class',
                target: mockClassTarget,
                scheduling: { availableFrom: Date.now() - 1_000, dueDate: 1_000 },
            });
            seedHomework({
                id: 'second-class',
                target: mockClassTarget,
                scheduling: { availableFrom: Date.now() - 1_000, dueDate: 2_000 },
            });
            seedHomework({
                id: 'other-class',
                target: { type: 'class', classId: 'class-other', className: 'Other Class' },
            });

            const homework = await getHomeworkByClass(mockClassId);

            expect(homework.map((item) => item.id)).toEqual(['second-class', 'first-class']);
        });

        it('combines direct and class homework for a student while filtering exemptions', async () => {
            mockGetStudentClasses.mockResolvedValue([{ id: mockClassId }]);

            seedHomework({
                id: 'direct-assignment',
                target: {
                    type: 'students',
                    studentIds: [mockStudentId],
                },
                scheduling: { availableFrom: Date.now() - 1_000, dueDate: 1_000 },
            });
            seedHomework({
                id: 'class-assignment',
                target: mockClassTarget,
                scheduling: { availableFrom: Date.now() - 1_000, dueDate: 2_000 },
            });
            seedHomework({
                id: 'exempted-assignment',
                target: mockClassTarget,
                studentOverrides: {
                    [mockStudentId]: { exempted: true },
                },
                scheduling: { availableFrom: Date.now() - 1_000, dueDate: 3_000 },
            });

            const homework = await getHomeworkForStudent(mockStudentId);

            expect(homework.map((item) => item.id)).toEqual(['class-assignment', 'direct-assignment']);
        });
    });

    describe('mutations', () => {
        it('archives homework on delete', async () => {
            seedHomework({ id: 'archive-me' });

            await deleteHomework('archive-me');

            const storedHomework = await getHomeworkById('archive-me');
            expect(storedHomework?.archived).toBe(true);
            expect(typeof storedHomework?.trashExpiresAt).toBe('number');
        });

        it('duplicates homework using a generated copy title', async () => {
            seedHomework({
                id: 'original-homework',
                target: mockStudentsTarget,
                title: 'Original Homework',
            });

            const duplicatedId = await duplicateHomework('original-homework');
            const duplicatedHomework = await getHomeworkById(duplicatedId);

            expect(duplicatedId).not.toBe('original-homework');
            expect(duplicatedHomework).toMatchObject({
                title: 'Original Homework (Copy)',
                materialId: mockMaterialId,
                target: mockStudentsTarget,
            });
        });

        it('preserves anti-cheat configuration when duplicating homework', async () => {
            seedHomework({
                id: 'protected-homework',
                antiCheatConfig: mockAntiCheatConfig,
            });

            const duplicatedId = await duplicateHomework('protected-homework');
            const duplicatedHomework = await getHomeworkById(duplicatedId);

            expect(duplicatedHomework?.antiCheatConfig).toEqual(mockAntiCheatConfig);
        });

        it('extends a deadline and recalculates status', async () => {
            seedHomework({
                id: 'deadline-homework',
                scheduling: {
                    availableFrom: Date.now() - 86_400_000,
                    dueDate: Date.now() - 1_000,
                },
                status: 'past_due',
            });

            await extendDeadline('deadline-homework', new Date(Date.now() + 86_400_000));

            const storedHomework = await getHomeworkById('deadline-homework');
            expect(storedHomework?.status).toBe('active');
            expect(storedHomework?.scheduling.dueDate).toBeGreaterThan(Date.now());
        });

        it('updates stale homework status from active to past_due', async () => {
            seedHomework({
                id: 'status-homework',
                scheduling: {
                    availableFrom: Date.now() - 86_400_000,
                    dueDate: Date.now() - 1_000,
                },
                status: 'active',
            });

            await updateHomeworkStatus('status-homework');

            const storedHomework = await getHomeworkById('status-homework');
            expect(storedHomework?.status).toBe('past_due');
        });
    });
});
