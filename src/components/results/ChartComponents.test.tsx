
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock Recharts to avoid extensive SVG/Canvas JSDOM issues
// We just want to ensure our wrapper passes data correctly
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
    LineChart: () => <div data-testid="line-chart" />,
    RadarChart: () => <div data-testid="radar-chart" />,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    Radar: () => null,
    PolarGrid: () => null,
    PolarAngleAxis: () => null,
    PolarRadiusAxis: () => null,
}));

// Components to test
import { ProgressLineChart } from './ProgressLineChart';
import { SkillRadarChart } from './SkillRadarChart';
import { BandScoreProgress } from './BandScoreProgress';

describe('Result Chart Components', () => {

    describe('ProgressLineChart', () => {
        it('renders empty state when no data provided', () => {
            render(<ProgressLineChart data={[]} />);
            expect(screen.getByText(/No progress data available/i)).toBeTruthy();
        });

        it('renders chart when data is present', () => {
            const data = [{
                date: 'Jan 1',
                timestamp: 100,
                score: 80,
                percentage: 80,
                bandScore: 7,
                testTitle: 'Test'
            }];
            render(<ProgressLineChart data={data} />);
            expect(screen.getByTestId('line-chart')).toBeTruthy();
            expect(screen.getByText(/Performance History/i)).toBeTruthy();
        });
    });

    describe('SkillRadarChart', () => {
        it('renders empty state when no data provided', () => {
            render(<SkillRadarChart data={[]} />);
            expect(screen.getByText(/No skill data available/i)).toBeTruthy();
        });

        it('renders chart when data is present', () => {
            const data = [{
                skill: 'reading',
                score: 80,
                fullMark: 100
            }];
            render(<SkillRadarChart data={data} />);
            expect(screen.getByTestId('radar-chart')).toBeTruthy();
            expect(screen.getByText(/Skill Breakdown/i)).toBeTruthy();
        });
    });

    describe('BandScoreProgress', () => {
        it('renders current and target band', () => {
            render(<BandScoreProgress currentBand={6.5} targetBand={7.5} />);

            expect(screen.getByText(/Band Score Journey/i)).toBeTruthy();
            expect(screen.getAllByText(/6.5/).length).toBeGreaterThan(0); // Current + Milestone
            expect(screen.getAllByText(/7.5/).length).toBeGreaterThan(0); // Target + Milestone
        });

        it('renders milestones', () => {
            render(<BandScoreProgress currentBand={6.0} />);
            // Check for a few milestones
            expect(screen.getByText(/5.0/)).toBeTruthy();
            expect(screen.getByText(/9.0/)).toBeTruthy();
        });
    });

});
