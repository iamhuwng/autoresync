import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';
import { HomeworkCard } from './HomeworkCard';

vi.mock('./HomeworkCard.css', () => ({}));

vi.mock('../../services/homeworkSubmissionService', () => ({
    getHomeworkSubmissions: vi.fn(async () => []),
    resetStudentHomework: vi.fn(),
}));

const now = new Date('2026-06-04T00:00:00.000Z').getTime();

function makeHomework(overrides: Partial<HomeworkAssignment>): HomeworkAssignment {
    return {
        id: 'hw-reading-passage',
        createdBy: 'teacher-1',
        createdAt: now,
        updatedAt: now,
        materialId: 'passage-1',
        materialTitle: 'Making Time for Science',
        materialType: 'reading-passage',
        materialSkill: 'reading',
        target: {
            type: 'students',
            studentIds: ['student-1'],
            studentNames: ['Student One'],
        },
        scheduling: {
            availableFrom: now,
            dueDate: now + 86_400_000,
        },
        config: {
            timerMinutes: 60,
            maxAttempts: 1,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: false,
        },
        visibility: {
            showAttempts: true,
            showDueDate: true,
            showDuration: true,
            showQuestionCount: true,
            showTimer: true,
        },
        status: 'active',
        stats: {
            totalAssigned: 1,
            started: 0,
            submitted: 0,
            lateSubmissions: 0,
        },
        ...overrides,
    };
}

describe('HomeworkCard Reading Passage metadata', () => {
    it('shows Reading Passage title, source label, Test Type, and assignment state', () => {
        render(
            <HomeworkCard
                homework={makeHomework({
                    title: 'Making Time for Science',
                    readingPassageSnapshot: {
                        passageMaterialId: 'passage-1',
                        snapshotVersionId: 'snapshot-1',
                        titleSnapshot: 'Making Time for Science',
                        questionCount: 13,
                        testTypeIds: ['ielts'],
                        sourceOrderDisplay: 'Passage 1',
                        sourceFullTestTitle: 'British Council Practice Test 01',
                    },
                })}
                showSubmissionProgress={false}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Making Time for Science' })).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Reading Passage')).toBeInTheDocument();
        expect(screen.getByText('Source:')).toBeInTheDocument();
        expect(screen.getByText('Passage 1 - British Council Practice Test 01')).toBeInTheDocument();
        expect(screen.getByText('Test Type:')).toBeInTheDocument();
        expect(screen.getByText('IELTS')).toBeInTheDocument();
    });
});
