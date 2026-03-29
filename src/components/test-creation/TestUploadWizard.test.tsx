import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TestUploadWizard } from './TestUploadWizard';

describe('TestUploadWizard', () => {
    it('does not loop when parent state updates through onChange', () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const ParentHarness = () => {
            const [, setContent] = useState<unknown>(null);

            return (
                <TestUploadWizard
                    defaultFormat="academic"
                    onChange={(content) => {
                        setContent({ ...content });
                    }}
                />
            );
        };

        render(<ParentHarness />);

        expect(screen.getByLabelText('Drop file or click to upload')).toBeInTheDocument();
        expect(consoleErrorSpy.mock.calls.flat().join(' ')).not.toContain('Maximum update depth exceeded');

        consoleErrorSpy.mockRestore();
    });
});
