import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeworkCreateModal } from './HomeworkCreateModal';
import { createHomework } from '../../services/homeworkManager';

const mockGetAllTests = vi.fn();
const mockGetAllQuizzes = vi.fn();
const mockGetClasses = vi.fn();
const mockGetClass = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            uid: 'teacher-1',
            email: 'teacher@test.com',
        },
    }),
}));

vi.mock('../../hooks/useHomeworkTags', () => ({
    useHomeworkTags: () => ({
        tags: [],
    }),
}));

vi.mock('../../services/homeworkManager', () => ({
    createHomework: vi.fn(),
}));

vi.mock('../../services/homeworkTemplateService', () => ({
    createTemplate: vi.fn(),
    getTemplatesByTeacher: vi.fn(async () => []),
}));

vi.mock('../../services/firebaseQueryOptimizer', () => ({
    default: {
        getAllTests: () => mockGetAllTests(),
        getAllQuizzes: () => mockGetAllQuizzes(),
    },
}));

vi.mock('../../services/classManager', () => ({
    getClasses: (...args: any[]) => mockGetClasses(...args),
    getClass: (...args: any[]) => mockGetClass(...args),
}));

vi.mock('./HomeworkConfigPanel', () => ({
    HomeworkConfigPanel: () => <div>Homework config panel</div>,
}));

vi.mock('./HomeworkTagChips', () => ({
    HomeworkTagChips: () => <div>Homework tag chips</div>,
}));

vi.mock('./StudentGroupSelector', () => ({
    StudentGroupSelector: () => <div>Student group selector</div>,
}));

vi.mock('./AntiCheatConfigSection', () => ({
    AntiCheatConfigSection: () => <div>Anti cheat config</div>,
}));

vi.mock('./TemplateSaveModal', () => ({
    default: () => null,
}));

vi.mock('../thcs-editor/THCSHomeworkAssignDialog', () => ({
    THCSHomeworkAssignDialog: () => null,
}));

vi.mock('../modern/ToastNotification', () => ({
    default: () => null,
}));

describe('HomeworkCreateModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClasses.mockResolvedValue([]);
        mockGetClass.mockResolvedValue(null);
        vi.mocked(createHomework).mockResolvedValue('homework-1');
        mockGetAllTests.mockResolvedValue([
            {
                id: 'owned-test',
                title: 'Owned Private Test',
                ownerId: 'teacher-1',
                type: 'test',
                skill: 'reading',
                questions: [{ id: 'q1' }],
            },
            {
                id: 'owned-writing-test',
                title: 'Owned Writing Test',
                ownerId: 'teacher-1',
                type: 'test',
                skill: 'writing',
                questions: [{ id: 'q1' }],
            },
            {
                id: 'public-test',
                title: 'Shared Public Test',
                ownerId: 'teacher-2',
                createdBy: 'teacher-2',
                isPublic: true,
                type: 'test',
                skill: 'listening',
                questions: [{ id: 'q1' }, { id: 'q2' }],
            },
            {
                id: 'foreign-private',
                title: 'Other Private Test',
                ownerId: 'teacher-3',
                createdBy: 'teacher-3',
                type: 'test',
                skill: 'reading',
                questions: [{ id: 'q1' }],
            },
        ]);
        mockGetAllQuizzes.mockResolvedValue([]);
    });

    it('includes public library materials from other teachers in the material list', async () => {
        render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={vi.fn()}
            />
        );

        expect(await screen.findByText('Owned Private Test')).toBeInTheDocument();
        expect(await screen.findByText('Shared Public Test')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByText('Other Private Test')).not.toBeInTheDocument();
        });

        expect(screen.getByText('Public Library')).toBeInTheDocument();
    });

    it('passes selected material type and skill when creating homework', async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        const { container } = render(
            <HomeworkCreateModal
                isOpen={true}
                onClose={vi.fn()}
                onSuccess={onSuccess}
                preselectedTarget={{
                    type: 'class',
                    classId: 'class-1',
                    className: 'Class A',
                }}
            />
        );

        await user.click(await screen.findByText('Owned Writing Test'));
        await user.click(screen.getByRole('button', { name: /Next/ }));
        await user.click(screen.getByRole('button', { name: /Next/ }));

        const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
        await user.type(dateInputs[1], '2026-05-20T10:00');
        await user.click(screen.getByRole('button', { name: /Next/ }));
        await user.click(screen.getByRole('button', { name: /Create Homework/ }));

        await waitFor(() => {
            expect(createHomework).toHaveBeenCalledWith(
                expect.objectContaining({
                    materialId: 'owned-writing-test',
                    materialType: 'test',
                    materialSkill: 'writing',
                })
            );
        });
        expect(onSuccess).toHaveBeenCalled();
    });
});
