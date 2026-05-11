import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2ImportReviewPanel } from './ReadingV2ImportReviewPanel';

describe('ReadingV2ImportReviewPanel', () => {
  it('keeps import evidence, uncertainty, and placeholders visible until accepted', () => {
    const onInspectEvidence = vi.fn();
    const onAnalyzeSource = vi.fn();
    const onAcceptImport = vi.fn();

    render(
      <ReadingV2ImportReviewPanel
        candidate={{
          sourceKind: 'pasted-text',
          evidence: ['Paragraph boundaries detected'],
          uncertaintyMarkers: ['Ambiguous matching options'],
          publishBlockingPlaceholders: ['Missing scoring rule'],
        }}
        onInspectEvidence={onInspectEvidence}
        onAnalyzeSource={onAnalyzeSource}
        onAcceptImport={onAcceptImport}
      />,
    );

    expect(screen.getByText('Paragraph boundaries detected')).toBeInTheDocument();
    expect(screen.getByText('Ambiguous matching options')).toBeInTheDocument();
    expect(screen.getByText('Missing scoring rule')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Inspect import evidence' }));
    fireEvent.change(screen.getByLabelText('Reading V2 import source text'), {
      target: { value: '## Imported Reading passage\n\nA paragraph long enough to be detected as imported Reading content.\n\n#### Questions 1-1\nComplete the sentence.\n**1** answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze pasted source' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept into canonical draft' }));

    expect(onInspectEvidence).toHaveBeenCalledTimes(1);
    expect(onAnalyzeSource).toHaveBeenCalledTimes(1);
    expect(onAcceptImport).toHaveBeenCalledTimes(1);
  });

  it('fails closed for unsupported uploaded files', () => {
    render(
      <ReadingV2ImportReviewPanel
        candidate={{
          sourceKind: 'uploaded-file',
          fileName: 'reading.xls',
          evidence: [],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        }}
        onInspectEvidence={vi.fn()}
        onAnalyzeSource={vi.fn()}
        onAcceptImport={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported uploaded source file/);
    expect(screen.getByRole('button', { name: 'Accept into canonical draft' })).toBeDisabled();
  });

  it('labels Auto Gemini import candidates distinctly for teacher review', () => {
    render(
      <ReadingV2ImportReviewPanel
        teacherFacing
        candidate={{
          sourceKind: 'auto-gemini',
          fileName: 'Auto Gemini import',
          rawText: 'Auto generated structured payload',
          evidence: ['Detected 1 structured passage'],
          uncertaintyMarkers: ['Teacher should review Gemini output'],
          publishBlockingPlaceholders: [],
        }}
        onInspectEvidence={vi.fn()}
        onAnalyzeSource={vi.fn()}
        onAcceptImport={vi.fn()}
      />,
    );

    expect(screen.getByText('Auto Gemini')).toBeInTheDocument();
    expect(screen.getByText(/Gemini-generated import/)).toBeInTheDocument();
    expect(screen.getByText(/Auto Gemini import/)).toBeInTheDocument();
  });

  it('shows teacher key authority, grouped diagnostics, raw key rows, and jump actions', () => {
    const onJumpToDiagnostic = vi.fn();

    render(
      <ReadingV2ImportReviewPanel
        teacherFacing
        candidate={{
          sourceKind: 'pasted-text',
          evidence: ['Detected 2 teacher answer key rows'],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        }}
        diagnostics={{
          authority: {
            status: 'partial',
            label: 'Teacher key partially bound',
            message: '1 of 2 visible questions have bound teacher-key answers.',
            boundQuestionCount: 1,
            totalQuestionCount: 2,
            blocking: true,
          },
          groups: [
            {
              id: 'answer-key',
              title: 'Teacher Answer Key',
              summary: '1 blocking item.',
              severity: 'error',
              items: [
                {
                  id: 'line-2',
                  severity: 'error',
                  message: 'Answer key line 2 must start with a question number.',
                  detail: 'Line 2: Passage answers',
                  target: { kind: 'answer-key-line', sourceLine: 2, step: 'Questions' },
                },
              ],
            },
            {
              id: 'projection-safety',
              title: 'Projection Safety',
              summary: 'No issues found.',
              severity: 'success',
              items: [],
            },
          ],
        }}
        onInspectEvidence={vi.fn()}
        onAnalyzeSource={vi.fn()}
        onAcceptImport={vi.fn()}
        onJumpToDiagnostic={onJumpToDiagnostic}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Teacher key partially bound');
    expect(screen.getByLabelText('Reading V2 import diagnostics')).toHaveTextContent('Teacher Answer Key');
    expect(screen.getByText('Line 2: Passage answers')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(onJumpToDiagnostic).toHaveBeenCalledWith({
      kind: 'answer-key-line',
      sourceLine: 2,
      step: 'Questions',
    });
  });
});
