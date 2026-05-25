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

  it('labels Auto V4 import candidates distinctly for teacher review', () => {
    render(
      <ReadingV2ImportReviewPanel
        teacherFacing
        candidate={{
          sourceKind: 'auto-gemini',
          fileName: 'Auto V4 import',
          rawText: 'Auto generated structured payload',
          importSourceArtifact: {
            artifactId: 'source-artifact-1',
            createdAt: '2026-05-25T00:00:00.000Z',
            sourceKind: 'teacher-paste',
            rawTextSha256: 'abc123def4567890',
            normalizedTextSha256: 'def456abc1237890',
            lineIndex: [
              {
                lineId: 'line-0001',
                lineNumber: 1,
                rawText: 'READING PASSAGE 1',
                normalizedText: 'reading passage 1',
              },
            ],
            retention: {
              scope: 'draft-author-only',
              includeInStudentProjection: false,
              includeInSessionProjection: false,
              includeInPublicPayload: false,
            },
          },
          evidence: ['Detected 1 structured passage'],
          uncertaintyMarkers: ['Teacher should review Auto V4 output'],
          publishBlockingPlaceholders: [],
        }}
        onInspectEvidence={vi.fn()}
        onAnalyzeSource={vi.fn()}
        onAcceptImport={vi.fn()}
      />,
    );

    expect(screen.getByText('Auto V4 + source verifier')).toBeInTheDocument();
    expect(screen.getByText(/Review the Auto V4 import, source verifier findings/)).toBeInTheDocument();
    expect(screen.getByText(/Source verifier: 1 source lines, hash abc123def456/)).toBeInTheDocument();
    expect(screen.getAllByText(/Auto V4 import/).length).toBeGreaterThan(0);
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
