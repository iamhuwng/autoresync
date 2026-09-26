import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { THCSSection, THCSTestMetadata } from '../../types/thcs-test.types';
import THCSReviewStep from './THCSReviewStep';

vi.mock('./THCSPreviewOverlay', () => ({ THCSPreviewOverlay: () => null }));
vi.mock('./THCSVersionDropdown', () => ({ THCSVersionDropdown: () => null }));
vi.mock('./THCSSaveTemplateModal', () => ({ THCSSaveTemplateModal: () => null }));

beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
});

afterEach(cleanup);

describe('THCS publish warnings', () => {
    it('opens a native dialog and lets the teacher proceed', () => {
        const onPublish = vi.fn();
        const metadata = { title: 'Practice test', gradeLevel: 11, duration: 90 } as THCSTestMetadata;
        const sections = [{ id: 'section-1', name: 'Questions', totalPoints: 8.86, questions: [] }] as THCSSection[];
        const props = {
            metadata, sections, isPublic: false, errors: [],
            warnings: ['Total points is 8.86 (standard is 10).'], isValid: true,
            isPublishing: false, isSavingDraft: false, publishedTestId: null, draftId: null,
            userId: 'teacher', showPublishWarnings: true, onPublish,
            onSaveDraft: vi.fn(), onDuplicate: vi.fn(),
            onSetShowPublishWarnings: vi.fn(), onIsPublicChange: vi.fn(),
        };
        const { rerender } = render(<THCSReviewStep {...props} />);

        const dialog = screen.getByRole('dialog', { name: 'Publish with Warnings?' });
        expect(dialog).toHaveAttribute('open');
        const outerEscape = vi.fn();
        document.addEventListener('keydown', outerEscape);
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(outerEscape).not.toHaveBeenCalled();
        document.removeEventListener('keydown', outerEscape);
        fireEvent.click(screen.getByRole('button', { name: 'Proceed Anyway' }));
        expect(onPublish).toHaveBeenCalledOnce();

        rerender(<THCSReviewStep {...props} showPublishWarnings={false} />);
        expect(dialog).not.toHaveAttribute('open');

        rerender(<THCSReviewStep {...props} showPublishWarnings={false} isSavingDraft />);
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
});
