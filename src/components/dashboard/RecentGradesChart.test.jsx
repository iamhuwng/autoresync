import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import RecentGradesChart from './RecentGradesChart';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const mockCanvasContext = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
    })),
    setLineDash: vi.fn(),
};

beforeAll(() => {
    global.ResizeObserver = ResizeObserverMock;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: vi.fn(() => mockCanvasContext),
    });
});

describe('RecentGradesChart', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps the category selector at the 44px mobile touch target', () => {
        render(
            <RecentGradesChart
                availableCategories={['ielts', 'thcs']}
                testResults={[
                    {
                        percentage: 82,
                        submittedAt: Date.UTC(2026, 3, 1),
                        testTitle: 'Reading Test 1',
                        testSkill: 'Reading',
                        testType: 'reading',
                        typeCategory: 'ielts',
                    },
                ]}
            />
        );

        const trigger = screen.getByRole('button', { name: /IELTS/i });
        expect(trigger).toHaveStyle({ minHeight: '44px' });

        fireEvent.click(trigger);

        expect(screen.getByRole('option', { name: /IELTS/i })).toHaveStyle({ minHeight: '44px' });
        expect(screen.getByRole('option', { name: /THCS/i })).toHaveStyle({ minHeight: '44px' });
    });
});
