import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { TableCompletionGroupReview } from './TableCompletionGroupReview';

const createGroup = () => ({
    schemaVersion: 1 as const,
    groupId: 'table-group-1',
    taskType: 'table-completion' as const,
    passageId: 'passage-1',
    questionRange: { start: 18, end: 18 },
    sharedContent: {
        instructionText: 'Complete the table below.',
        answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
        constraints: { maxWords: 2 },
        caption: 'Medicinal plants',
    },
    columns: [
        { columnId: 'column-1', order: 0 },
        { columnId: 'column-2', order: 1 },
    ],
    rows: [
        { rowId: 'row-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
        { rowId: 'row-1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
    ],
    cells: [
        {
            cellId: 'cell-header-1',
            rowId: 'row-header-1',
            columnId: 'column-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header' as const,
            segments: [{ kind: 'text' as const, text: 'Plant' }],
        },
        {
            cellId: 'cell-header-2',
            rowId: 'row-header-1',
            columnId: 'column-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'column-header' as const,
            segments: [{ kind: 'text' as const, text: 'Region' }],
        },
        {
            cellId: 'cell-row-header',
            rowId: 'row-1',
            columnId: 'column-1',
            rowSpan: 1,
            colSpan: 1,
            role: 'row-header' as const,
            segments: [{ kind: 'text' as const, text: 'Ginkgo Biloba' }],
        },
        {
            cellId: 'cell-1',
            rowId: 'row-1',
            columnId: 'column-2',
            rowSpan: 1,
            colSpan: 1,
            role: 'body' as const,
            segments: [
                { kind: 'text' as const, text: 'Native region ' },
                { kind: 'blank-anchor' as const, anchorId: 'anchor-18' },
            ],
        },
    ],
    blanks: [{
        blankId: 'blank-18',
        questionNumber: 18,
        anchorId: 'anchor-18',
        cellId: 'cell-1',
        canonicalOrder: 0,
        acceptedAnswers: ['China'],
        constraints: { maxWords: 2 },
        breadcrumb: { rowHeaders: ['Ginkgo Biloba'], columnHeaders: ['Region'] },
    }],
    provenance: {
        sourceWorkflow: 'in-app-parse' as const,
        sourceShape: 'markdown-table' as const,
        rawExcerpt: '| Plant | Region |',
        normalizationVersion: 1,
        confidence: 0.95,
        warnings: ['inferred-headers'],
        canonicalRevisionHash: 'abc12345',
    },
    canonicalReadingOrder: ['blank-18'],
});

describe('TableCompletionGroupReview', () => {
    it('renders the six required regions and supports acknowledgement and unsupported-repair actions', async () => {
        const user = userEvent.setup();
        const onGroupChange = vi.fn();
        const onAcknowledgeIssues = vi.fn();
        const onUnsupportedRepair = vi.fn();
        const onReviewAction = vi.fn();

        render(
            <TableCompletionGroupReview
                group={createGroup()}
                issues={[
                    {
                        code: 'inferred-headers',
                        severity: 'acknowledgement-required',
                        message: 'Headers were inferred.',
                        groupId: 'table-group-1',
                    },
                ]}
                onGroupChange={onGroupChange}
                onAcknowledgeIssues={onAcknowledgeIssues}
                onUnsupportedRepair={onUnsupportedRepair}
                onReviewAction={onReviewAction}
            />,
        );

        expect(screen.getByText('Shared Content')).toBeInTheDocument();
        expect(screen.getByText('Validation Summary')).toBeInTheDocument();
        expect(screen.getByText('Acknowledgement')).toBeInTheDocument();
        expect(screen.getByText('Grouped Table Surface')).toBeInTheDocument();
        expect(screen.getByText('Per-Blank Inspector')).toBeInTheDocument();
        expect(screen.getByText('Unsupported Repair Actions')).toBeInTheDocument();

        await user.click(screen.getByText('Acknowledge Current Warnings'));
        expect(onAcknowledgeIssues).toHaveBeenCalledWith(
            'table-group-1',
            ['inferred-headers'],
            'abc12345',
        );

        await user.click(screen.getByText('Re-run parse'));
        await user.click(screen.getByText('Discard grouped candidate'));
        await user.click(screen.getByText('Reclassify away from table-completion'));

        expect(onUnsupportedRepair).toHaveBeenCalledWith('table-group-1', 're-run-parse');
        expect(onUnsupportedRepair).toHaveBeenCalledWith('table-group-1', 'discard-grouped-candidate');
        expect(onUnsupportedRepair).toHaveBeenCalledWith('table-group-1', 'reclassify-away');
        expect(onReviewAction).toHaveBeenCalledWith(
            'acknowledgeGroupedWarning',
            expect.objectContaining({ groupId: 'table-group-1', issueCodeCount: 1 }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'reRunGroupedParse',
            expect.objectContaining({ groupId: 'table-group-1' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'discardGroupedCandidate',
            expect.objectContaining({ groupId: 'table-group-1' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'reclassifyGroupedCandidate',
            expect.objectContaining({ groupId: 'table-group-1' }),
        );
    });

    it('emits canonical group edits through onGroupChange', async () => {
        const onGroupChange = vi.fn();

        render(
            <TableCompletionGroupReview
                group={createGroup()}
                issues={[]}
                onGroupChange={onGroupChange}
                onAcknowledgeIssues={vi.fn()}
                onUnsupportedRepair={vi.fn()}
            />,
        );

        const instructionInput = screen.getByDisplayValue('Complete the table below.');
        fireEvent.change(instructionInput, { target: { value: 'Complete the updated table.' } });

        expect(onGroupChange).toHaveBeenCalled();
        const latestGroup = onGroupChange.mock.calls.at(-1)?.[0];
        expect(latestGroup.sharedContent.instructionText).toBe('Complete the updated table.');
        expect(latestGroup.provenance.canonicalRevisionHash).not.toBe('abc12345');
    });

    it('rebuilds semantic breadcrumbs when table labels change', async () => {
        const onGroupChange = vi.fn();

        render(
            <TableCompletionGroupReview
                group={createGroup()}
                issues={[]}
                onGroupChange={onGroupChange}
                onAcknowledgeIssues={vi.fn()}
                onUnsupportedRepair={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByDisplayValue('Ginkgo Biloba'), {
            target: { value: 'Turmeric' },
        });

        const latestGroup = onGroupChange.mock.calls.at(-1)?.[0];
        expect(latestGroup.blanks[0].breadcrumb).toEqual({
            rowHeaders: ['Turmeric'],
            columnHeaders: ['Region'],
        });
        expect(latestGroup.canonicalReadingOrder).toEqual(['blank-18']);
    });

    it('emits repair actions while updating the canonical group in-place', async () => {
        const user = userEvent.setup();
        const onReviewAction = vi.fn();

        const ReviewHarness = () => {
            const [group, setGroup] = useState(createGroup());

            return (
                <TableCompletionGroupReview
                    group={group}
                    issues={[]}
                    onGroupChange={setGroup}
                    onAcknowledgeIssues={vi.fn()}
                    onUnsupportedRepair={vi.fn()}
                    onReviewAction={onReviewAction}
                />
            );
        };

        render(<ReviewHarness />);

        await user.click(screen.getByText('Enable Manual Repair'));
        await user.click(screen.getByText('Merge Right'));
        await user.click(screen.getByText('Split Horizontal'));
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'note' },
        });
        await user.click(screen.getByText('Add Row'));
        await user.click(screen.getByText('Insert Blank'));
        await user.click(screen.getByText('Remove Selected Blank'));

        expect(onReviewAction).toHaveBeenCalledWith(
            'toggleTableRepairMode',
            expect.objectContaining({ groupId: 'table-group-1', active: true }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'mergeTableCell',
            expect.objectContaining({ groupId: 'table-group-1', direction: 'horizontal' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'splitTableCell',
            expect.objectContaining({ groupId: 'table-group-1', direction: 'horizontal' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'changeTableCellRole',
            expect.objectContaining({ groupId: 'table-group-1', role: 'note' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'addTableRow',
            expect.objectContaining({ groupId: 'table-group-1', rowCount: 3 }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'insertTableBlankAnchor',
            expect.objectContaining({ groupId: 'table-group-1' }),
        );
        expect(onReviewAction).toHaveBeenCalledWith(
            'removeTableBlankAnchor',
            expect.objectContaining({ groupId: 'table-group-1' }),
        );
    });
});
