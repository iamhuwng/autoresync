/**
 * MetadataStep Unit Tests
 * 
 * Tests for the MetadataStep component used in Test Creation Modal.
 * 
 * @module MetadataStep.test
 * @version 1.0.0
 * @date 2026-02-07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import MetadataStep from './MetadataStep';
import type { DraftMetadata, TestFormat, TestType, SkillType } from '../../types/draft.types';

// ═══════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════

interface RenderMetadataStepProps {
    metadata?: Partial<DraftMetadata>;
    format?: TestFormat;
    testType?: TestType | null;
    skillType?: SkillType | null;
    onUpdate?: (metadata: Partial<DraftMetadata>, format: TestFormat) => void;
}

const renderMetadataStep = (props: RenderMetadataStepProps = {}) => {
    const defaultProps = {
        metadata: {},
        format: 'academic' as TestFormat,
        testType: 'IELTS' as TestType,
        skillType: 'reading' as SkillType,
        onUpdate: vi.fn(),
    };

    const mergedProps = { ...defaultProps, ...props };

    return {
        ...render(
            <MantineProvider>
                <MetadataStep {...mergedProps} />
            </MantineProvider>
        ),
        onUpdate: mergedProps.onUpdate,
    };
};

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe('MetadataStep', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Initial Render', () => {
        it('renders all form fields', () => {
            renderMetadataStep();

            expect(screen.getByText('Test Title')).toBeInTheDocument();
            expect(screen.getByText('Duration')).toBeInTheDocument();
            expect(screen.getByText('CEFR Level')).toBeInTheDocument();
            expect(screen.getByText('Difficulty')).toBeInTheDocument();
            expect(screen.getByText('Description')).toBeInTheDocument();
        });

        it('shows required asterisk on title field', () => {
            renderMetadataStep();

            const titleLabel = screen.getByText('Test Title');
            const parent = titleLabel.parentElement;
            expect(parent?.textContent).toContain('*');
        });

        it('shows format selector for IELTS test type', () => {
            renderMetadataStep({ testType: 'IELTS' });

            expect(screen.getByText('Test Format')).toBeInTheDocument();
            expect(screen.getByText('Academic')).toBeInTheDocument();
            expect(screen.getByText('General Training')).toBeInTheDocument();
        });

        it('shows target band selector for IELTS test type', () => {
            renderMetadataStep({ testType: 'IELTS' });

            expect(screen.getByText('Target Band')).toBeInTheDocument();
        });

        it('hides format and target band for non-IELTS test types', () => {
            renderMetadataStep({ testType: 'TOEIC' });

            expect(screen.queryByText('Test Format')).not.toBeInTheDocument();
            expect(screen.queryByText('Target Band')).not.toBeInTheDocument();
        });
    });

    describe('Default Title Generation', () => {
        it('generates default title from test type and skill type', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                skillType: 'reading',
                metadata: {},
                onUpdate,
            });

            await waitFor(() => {
                expect(onUpdate).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: expect.stringContaining('IELTS'),
                    }),
                    'academic'
                );
            });
        });

        it('does not overwrite existing title', () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                skillType: 'reading',
                metadata: { title: 'My Custom Title' },
                onUpdate,
            });

            // onUpdate should not be called to overwrite existing title
            expect(onUpdate).not.toHaveBeenCalled();
        });
    });

    describe('Title Input', () => {
        it('displays provided title value', () => {
            renderMetadataStep({
                metadata: { title: 'My Test Title' },
            });

            expect(screen.getByDisplayValue('My Test Title')).toBeInTheDocument();
        });

        it('calls onUpdate when title is changed', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                metadata: { title: '' },
                onUpdate,
            });

            // Use role='textbox' to find the input
            const inputs = screen.getAllByRole('textbox');
            const titleInput = inputs[0]; // First textbox is the title input
            // Use fireEvent.change for more reliable testing
            fireEvent.change(titleInput, { target: { value: 'New Title' } });

            expect(onUpdate).toHaveBeenCalled();
            const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
            expect(lastCall[0].title).toBe('New Title');
        });

        it('shows helpful hint text', () => {
            renderMetadataStep();

            expect(screen.getByText(/This will be displayed to students/i)).toBeInTheDocument();
        });
    });

    describe('Format Selection', () => {
        it('highlights selected format option', () => {
            renderMetadataStep({
                testType: 'IELTS',
                format: 'academic',
            });

            const academicOption = screen.getByText('Academic');
            expect(academicOption).toHaveStyle({ color: '#8b5cf6' });
        });

        it('calls onUpdate when format is changed', async () => {
            const user = userEvent.setup();
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                format: 'academic',
                onUpdate,
            });

            await user.click(screen.getByText('General Training'));

            expect(onUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                'general'
            );
        });

        it('supports keyboard navigation for format options', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                format: 'academic',
                onUpdate,
            });

            const generalOption = screen.getByText('General Training').closest('[role="button"]');
            if (generalOption) {
                fireEvent.keyDown(generalOption, { key: 'Enter' });
            }

            expect(onUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                'general'
            );
        });
    });

    describe('Duration Selection', () => {
        it('displays duration options', () => {
            renderMetadataStep();

            // Find the duration select - use getAllByRole since there are multiple comboboxes
            const selects = screen.getAllByRole('combobox');
            expect(selects.length).toBeGreaterThan(0);
            expect(selects[0]).toBeInTheDocument();
        });

        it('calls onUpdate when duration is changed', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                metadata: { duration: 60 },
                onUpdate,
            });

            const durationSelect = screen.getAllByRole('combobox')[0];
            // Use valid duration option (20, 40, 60, 90, 120)
            fireEvent.change(durationSelect, { target: { value: '40' } });

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ duration: 40 }),
                'academic'
            );
        });
    });

    describe('Target Band Selection', () => {
        it('shows band options for IELTS', () => {
            renderMetadataStep({ testType: 'IELTS' });

            const bandSelect = screen.getAllByRole('combobox')[1];
            expect(bandSelect).toBeInTheDocument();
        });

        it('calls onUpdate when band is changed', async () => {
            const user = userEvent.setup();
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                metadata: {},
                onUpdate,
            });

            const bandSelect = screen.getAllByRole('combobox')[1];
            await user.selectOptions(bandSelect, '7.0');

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ targetBand: '7.0' }),
                'academic'
            );
        });
    });

    describe('CEFR Level Selection', () => {
        it('displays CEFR level options', () => {
            renderMetadataStep();

            // Find the CEFR select (third combobox for IELTS)
            const selects = screen.getAllByRole('combobox');
            const cefrSelect = selects[2] || selects[1];
            expect(cefrSelect).toBeInTheDocument();
        });

        it('calls onUpdate when CEFR level is changed', async () => {
            const user = userEvent.setup();
            const onUpdate = vi.fn();
            renderMetadataStep({
                testType: 'IELTS',
                metadata: {},
                onUpdate,
            });

            // For IELTS: 0=duration, 1=band, 2=cefr
            const selects = screen.getAllByRole('combobox');
            const cefrSelect = selects[2];
            await user.selectOptions(cefrSelect, 'B2');

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ cefrLevel: 'B2' }),
                'academic'
            );
        });
    });

    describe('Difficulty Selection', () => {
        it('displays difficulty options', () => {
            renderMetadataStep();

            expect(screen.getByText('Beginner')).toBeInTheDocument();
            expect(screen.getByText('Intermediate')).toBeInTheDocument();
            expect(screen.getByText('Advanced')).toBeInTheDocument();
        });

        it('highlights selected difficulty', () => {
            renderMetadataStep({
                metadata: { difficulty: 'Intermediate' },
            });

            const intermediateOption = screen.getByText('Intermediate');
            // Should have amber color when selected
            expect(intermediateOption).toHaveStyle({ color: '#f59e0b' });
        });

        it('calls onUpdate when difficulty is clicked', async () => {
            const user = userEvent.setup();
            const onUpdate = vi.fn();
            renderMetadataStep({
                metadata: {},
                onUpdate,
            });

            await user.click(screen.getByText('Advanced'));

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ difficulty: 'Advanced' }),
                'academic'
            );
        });

        it('supports keyboard navigation for difficulty', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                metadata: {},
                onUpdate,
            });

            const advancedOption = screen.getByText('Advanced').closest('[role="button"]');
            if (advancedOption) {
                fireEvent.keyDown(advancedOption, { key: ' ' });
            }

            expect(onUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ difficulty: 'Advanced' }),
                'academic'
            );
        });
    });

    describe('Description Input', () => {
        it('displays provided description value', () => {
            renderMetadataStep({
                metadata: { description: 'Test description' },
            });

            expect(screen.getByDisplayValue('Test description')).toBeInTheDocument();
        });

        it('shows placeholder text', () => {
            renderMetadataStep();

            expect(screen.getByPlaceholderText(/optional/i)).toBeInTheDocument();
        });

        it('calls onUpdate when description is changed', async () => {
            const onUpdate = vi.fn();
            renderMetadataStep({
                metadata: {},
                onUpdate,
            });

            const textarea = screen.getByPlaceholderText(/optional/i);
            // Use fireEvent instead of userEvent for textarea  
            fireEvent.change(textarea, { target: { value: 'New description' } });

            expect(onUpdate).toHaveBeenCalled();
            const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
            expect(lastCall[0].description).toBe('New description');
        });

        it('shows helpful hint text for description', () => {
            renderMetadataStep();

            expect(screen.getByText(/Describe what this test covers/i)).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('all interactive elements have accessible roles', () => {
            renderMetadataStep({ testType: 'IELTS' });

            // Format options have role="button"
            const formatButtons = screen.getAllByRole('button');
            expect(formatButtons.length).toBeGreaterThan(0);

            // Select elements have combobox role
            const selects = screen.getAllByRole('combobox');
            expect(selects.length).toBeGreaterThan(0);
        });

        it('difficulty options have tabIndex', () => {
            renderMetadataStep();

            const beginnerOption = screen.getByText('Beginner').closest('[role="button"]');
            expect(beginnerOption).toHaveAttribute('tabindex', '0');
        });

        it('format options have tabIndex', () => {
            renderMetadataStep({ testType: 'IELTS' });

            const academicOption = screen.getByText('Academic').closest('[role="button"]');
            expect(academicOption).toHaveAttribute('tabindex', '0');
        });
    });

    describe('Form Data Preservation', () => {
        it('preserves all metadata fields when updating one field', async () => {
            const user = userEvent.setup();
            const onUpdate = vi.fn();
            const initialMetadata = {
                title: 'Existing Title',
                duration: 60,
                targetBand: '6.5' as const,
                cefrLevel: 'B2' as const,
                difficulty: 'Intermediate' as const,
                description: 'Existing description',
            };

            renderMetadataStep({
                metadata: initialMetadata,
                onUpdate,
            });

            // Update just the title
            const titleInput = screen.getByDisplayValue('Existing Title');
            await user.clear(titleInput);
            await user.type(titleInput, 'New Title');

            // The last call should preserve other fields
            const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
            expect(lastCall[0]).toMatchObject({
                duration: 60,
                targetBand: '6.5',
                cefrLevel: 'B2',
                difficulty: 'Intermediate',
                description: 'Existing description',
            });
        });
    });
});
