import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { THCSTest } from '../../types/thcs-test.types';
import { THCSBulkPasteModal } from './THCSBulkPasteModal';
import { THCSSaveTemplateModal } from './THCSSaveTemplateModal';
import { THCSTemplatePicker } from './THCSTemplatePicker';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../../services/thcsTemplateService', () => ({
    getMyTemplates: vi.fn(), getPublicTemplates: vi.fn(), saveTestAsTemplate: vi.fn(),
}));

beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
});

describe('THCS editor child dialogs', () => {
    const test = { metadata: { title: 'Fixture', gradeLevel: 9 }, sections: [] } as THCSTest;
    const cases = [
        ['Paste Questions — Section 1', (opened: boolean, onClose: () => void) =>
            <THCSBulkPasteModal opened={opened} onClose={onClose} onImport={vi.fn()} sectionName="Section 1" />],
        ['Create from Template', (opened: boolean, onClose: () => void) =>
            <THCSTemplatePicker opened={opened} onClose={onClose} onSelect={vi.fn()} />],
        ['Save as Template', (opened: boolean, onClose: () => void) =>
            <THCSSaveTemplateModal opened={opened} onClose={onClose} test={test} />],
    ] as const;

    for (const [name, makeDialog] of cases) {
        it(`${name} opens with the browser top-layer API`, () => {
            const onClose = vi.fn();
            const { rerender } = render(makeDialog(true, onClose));
            const dialog = screen.getByRole('dialog', { name });
            expect(dialog).toHaveAttribute('open');

            fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            expect(onClose).toHaveBeenCalledOnce();

            rerender(makeDialog(false, onClose));
            expect(dialog).not.toHaveAttribute('open');
        });
    }
});
