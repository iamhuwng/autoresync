import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { THCSSection, THCSTestMetadata } from '../../types/thcs-test.types';
import { THCSPreviewOverlay } from './THCSPreviewOverlay';

vi.mock('../../services/thcsAutoMarking.service', () => ({ markThcsTest: vi.fn(), thcsResultToTestMarkingResult: vi.fn() }));
vi.mock('./previewLogCollector', () => ({ plog: vi.fn() }));
vi.mock('../thcs-student/THCSQuestionRenderer', () => ({ default: () => <div>Structured question renderer</div> }));
vi.mock('../thcs-student/THCSPassagePanel', () => ({ default: () => null }));
afterEach(cleanup);

it('previews preserved source through the student raw text renderer', () => {
    const sections = [{ id: 'raw', name: 'Source', totalPoints: 1, isRawTextFallback: true,
        rawText: 'Reviewed source text', questions: [{ id: 'q', type: 'raw-text-fallback', questionNumber: 1,
            questionText: 'Reviewed source text', correctAnswer: '' }],
    }] as THCSSection[];
    render(<THCSPreviewOverlay sections={sections}
        metadata={{ title: 'Preview', duration: 30, gradeLevel: 8 } as THCSTestMetadata} onClose={vi.fn()} />);
    expect(screen.getByText('Reviewed source text')).toBeVisible();
    expect(screen.queryByText('Structured question renderer')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your answer here...')).toBeDisabled();
});
