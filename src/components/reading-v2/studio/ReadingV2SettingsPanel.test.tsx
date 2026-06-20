import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2SettingsPanel } from './ReadingV2SettingsPanel';
import type { ReadingV2StudioMetadata } from './ReadingV2MetadataPanel';

const metadata: ReadingV2StudioMetadata = {
  title: 'Reading V2 Set',
  productMarker: 'Reading V2',
  materialKind: 'full-test',
  durationMinutes: 60,
  difficulty: 'advanced',
  targetBand: 'Band 7-8',
  description: 'Practice set',
  tags: ['academic'],
  visibility: 'library-eligible',
  ownerId: 'teacher-1',
  provenanceSummary: 'Original draft',
};

describe('ReadingV2SettingsPanel', () => {
  it('limits Settings to material-level ownership boundaries', () => {
    render(
      <ReadingV2SettingsPanel
        metadata={metadata}
        validationIssues={[]}
        publishBlocked={false}
        onMetadataChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Settings title')).toBeInTheDocument();
    expect(screen.getByLabelText('Settings visibility')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Due date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Assigned students/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Live session code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Course placement/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Result release/i)).not.toBeInTheDocument();
  });

  it('shows publish readiness from validation state', () => {
    render(
      <ReadingV2SettingsPanel
        metadata={metadata}
        validationIssues={[{ code: 'missing-scoring-response-shape', severity: 'error', message: 'Missing key' }]}
        publishBlocked
        answerKeyAuthority={{
          status: 'partial',
          label: 'Teacher key partially bound',
          message: '1 of 2 visible questions have bound teacher-key answers.',
          boundQuestionCount: 1,
          totalQuestionCount: 2,
          blocking: true,
        }}
        onMetadataChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Publish blocked until validation issues are resolved/)).toBeInTheDocument();
    expect(screen.getByText(/Publish is blocked by teacher answer-key binding/)).toBeInTheDocument();
    expect(screen.getByText('Issues: 1')).toBeInTheDocument();
  });

  it('uses the neutral authoring section for runtime advisory guidance', () => {
    render(
      <ReadingV2SettingsPanel
        metadata={metadata}
        validationIssues={[]}
        publishBlocked={false}
        onMetadataChange={vi.fn()}
      />,
    );

    const advisorySection = screen.getByRole('region', { name: 'Accessibility and runtime advisories' });

    expect(advisorySection).toContainElement(
      screen.getByRole('heading', { level: 3, name: 'Accessibility And Runtime Advisories' }),
    );
    expect(advisorySection).toHaveClass('assessment-authoring-section');
    expect(advisorySection).toHaveClass('reading-v2-editor-section');
    expect(advisorySection).toHaveTextContent(
      'Dense table, flowchart, and diagram tasks require runtime-specific advisories before publish.',
    );
  });
});
