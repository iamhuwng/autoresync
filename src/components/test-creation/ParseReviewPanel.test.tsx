import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';

import { ParseReviewPanel } from './ParseReviewPanel';

vi.mock('../test/table-completion/TableCompletionGroupReview', () => ({
    TableCompletionGroupReview: (props: any) => (
        <div data-testid="table-completion-group-review">
            <span>{props.group.groupId}</span>
            <span>{props.issues.length}</span>
            <span>{props.diagnostic?.parseMode ?? 'no-diagnostic'}</span>
        </div>
    ),
}));

const renderWithProviders = (ui: ReactNode) => render(
    <MantineProvider>
        {ui}
    </MantineProvider>,
);

describe('ParseReviewPanel', () => {
    it('renders TableCompletionGroupReview for canonical table-completion sections instead of flat question cards', () => {
        renderWithProviders(
            <ParseReviewPanel
                passages={[{ id: 'passage-1', title: 'Passage 1', content: 'Body text' }]}
                questions={[
                    {
                        questionNumber: 18,
                        questionText: 'Native region ___',
                        type: 'table-completion',
                        answer: 'China',
                        passageId: 'passage-1',
                        sectionInstructionId: 'table-group-1',
                        confidence: 95,
                        uncertain: false,
                        groupId: 'table-group-1',
                        blankId: 'blank-18',
                        anchorId: 'anchor-18',
                        groupTaskType: 'table-completion',
                        tableGroupSchemaVersion: 1,
                    },
                ]}
                sectionInstructions={[
                    {
                        id: 'table-group-1',
                        text: 'Complete the table below.',
                        questionRange: { start: 18, end: 18 },
                    },
                ]}
                questionGroups={[
                    {
                        schemaVersion: 1,
                        groupId: 'table-group-1',
                        taskType: 'table-completion',
                        passageId: 'passage-1',
                        questionRange: { start: 18, end: 18 },
                        sharedContent: {
                            instructionText: 'Complete the table below.',
                            answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
                            constraints: { maxWords: 2 },
                            caption: 'Medicinal plants',
                        },
                        columns: [{ columnId: 'column-1', order: 1 }],
                        rows: [{ rowId: 'row-1', order: 1, cellIds: ['cell-1'] }],
                        cells: [{
                            cellId: 'cell-1',
                            rowId: 'row-1',
                            columnId: 'column-1',
                            rowSpan: 1,
                            colSpan: 1,
                            role: 'body',
                            segments: [{ kind: 'blank-anchor', anchorId: 'anchor-18' }],
                        }],
                        blanks: [{
                            blankId: 'blank-18',
                            questionNumber: 18,
                            anchorId: 'anchor-18',
                            cellId: 'cell-1',
                            canonicalOrder: 1,
                            acceptedAnswers: ['China'],
                            constraints: { maxWords: 2 },
                            breadcrumb: { rowHeaders: ['Plant'], columnHeaders: ['Region'] },
                        }],
                        provenance: {
                            sourceWorkflow: 'in-app-parse',
                            sourceShape: 'markdown-table',
                            rawExcerpt: '| Plant | Region |',
                            normalizationVersion: 1,
                            confidence: 0.95,
                            warnings: [],
                            canonicalRevisionHash: 'abc12345',
                        },
                        canonicalReadingOrder: ['anchor-18'],
                    },
                ]}
                tableCompletionIssues={[
                    {
                        code: 'inferred-headers',
                        severity: 'acknowledgement-required',
                        message: 'Headers were inferred.',
                        groupId: 'table-group-1',
                    },
                ]}
                tableCompletionDiagnostics={[
                    {
                        groupId: 'table-group-1',
                        questionRange: { start: 18, end: 18 },
                        parseMode: 'deterministic',
                        sourceWorkflow: 'in-app-parse',
                        sourceShape: 'markdown-table',
                        validationSeverity: 'acknowledgement-required',
                        issueCodes: ['inferred-headers'],
                        issues: [
                            {
                                code: 'inferred-headers',
                                severity: 'acknowledgement-required',
                                message: 'Headers were inferred.',
                            },
                        ],
                        unsupportedRepairState: 'acknowledgement-required',
                        missingSemanticBreadcrumbs: false,
                        canonicalRevisionHash: 'abc12345',
                        hasCanonicalGroup: true,
                    },
                ]}
                onPassageChange={vi.fn()}
                onQuestionChange={vi.fn()}
                onQuestionGroupChange={vi.fn()}
                onGroupAcknowledge={vi.fn()}
                onUnsupportedRepair={vi.fn()}
            />,
        );

        expect(screen.getByTestId('table-completion-group-review')).toBeInTheDocument();
        expect(screen.getByText('deterministic')).toBeInTheDocument();
        expect(screen.queryByText('Native region ___')).not.toBeInTheDocument();
    });
});
