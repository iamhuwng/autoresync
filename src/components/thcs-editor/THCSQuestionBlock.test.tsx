import { fireEvent, render, screen, waitFor } from '../../test/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { THCSQuestion } from '../../types/thcs-test.types';
import THCSQuestionBlock from './THCSQuestionBlock';

const { clipboardState, mockRefreshImage, mockUploadImageReplacement } = vi.hoisted(() => ({
    clipboardState: { image: null as File | null },
    mockRefreshImage: vi.fn(),
    mockUploadImageReplacement: vi.fn(),
}));

vi.mock('../../core/platform/hooks/useClipboard', () => ({
    useClipboard: () => ({
        availableImage: clipboardState.image,
        refreshImage: mockRefreshImage,
        readImage: vi.fn(),
        writeText: vi.fn(),
    }),
}));

vi.mock('../../services/r2Storage', () => ({
    default: { uploadImageReplacement: mockUploadImageReplacement },
}));

const question = (overrides: Partial<THCSQuestion> = {}): THCSQuestion => ({
    id: 'q1',
    questionNumber: 1,
    type: 'mcq-sign-notice',
    intent: 'mcq-sign-notice',
    questionText: 'What does this sign mean?',
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: 'A',
    ...overrides,
});

const renderQuestion = (value = question()) => {
    const onUpdate = vi.fn();
    render(
        <THCSQuestionBlock
            question={value}
            questionIndex={0}
            globalNumber={1}
            sectionPointMode="auto"
            draftId={null}
            onUpdate={onUpdate}
            onDelete={vi.fn()}
            onMoveUp={vi.fn()}
            onMoveDown={vi.fn()}
            canMoveUp={false}
            canMoveDown={false}
        />,
    );
    return onUpdate;
};

describe('THCSQuestionBlock visual prompts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clipboardState.image = null;
    });

    it('stores teacher-entered visual text as the image alternative', () => {
        const onUpdate = renderQuestion();
        fireEvent.change(screen.getByRole('textbox', { name: 'Visual text alternative' }), {
            target: { value: 'NO PARKING' },
        });
        expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ imageCaption: 'NO PARKING' }));
    });

    it('offers paste only when an image is available and uploads it', async () => {
        const screenshot = new File(['image'], 'clipboard-image.png', { type: 'image/png' });
        clipboardState.image = screenshot;
        mockRefreshImage.mockResolvedValue(screenshot);
        mockUploadImageReplacement.mockResolvedValue({ url: 'https://example.test/sign.png', key: 'temp/sign.png' });
        const onUpdate = renderQuestion();

        fireEvent.click(screen.getByRole('button', { name: /Paste screenshot/i }));

        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
            imageUrl: 'https://example.test/sign.png',
            _imageKey: 'temp/sign.png',
        })));
    });

    it('hides paste when the clipboard has no image', () => {
        renderQuestion();
        expect(screen.queryByRole('button', { name: /Paste screenshot/i })).not.toBeInTheDocument();
    });

    it('hides paste after an image is present', () => {
        renderQuestion(question({ imageUrl: 'https://example.test/sign.png' }));
        expect(screen.queryByRole('button', { name: /Paste screenshot/i })).not.toBeInTheDocument();
    });
});
