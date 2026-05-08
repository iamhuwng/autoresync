import React from 'react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ResultTimeline } from './ResultTimeline';

const buildResult = (index: number) => ({
    resultId: `result-${index}`,
    testTitle: `Result ${index}`,
    testType: 'reading',
    testSkill: 'reading',
    percentage: 70 + index,
    totalScore: 10 + index,
    maxScore: 20,
    submittedAt: Date.UTC(2026, 3, index + 1),
    correct: 10,
    incorrect: 2,
    partialCredit: 0,
    totalQuestions: 12,
    bandScore: 6.5,
    questionResults: [],
});

describe('ResultTimeline', () => {
    it('keeps the load more control at the 44px mobile touch target', () => {
        render(<ResultTimeline results={Array.from({ length: 11 }, (_, index) => buildResult(index + 1)) as any} />);

        expect(screen.getByRole('button', { name: /Load More/i })).toHaveStyle({ minHeight: '44px' });
    });
});
