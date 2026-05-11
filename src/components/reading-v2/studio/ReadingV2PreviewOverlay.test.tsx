import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { generateReadingV2PreviewOnly } from '../../../services/reading-v2/readingV2PublishPipeline.service';
import { ReadingV2PreviewOverlay } from './ReadingV2PreviewOverlay';

describe('ReadingV2PreviewOverlay', () => {
  it('renders the real runtime shell with local-only teacher preview state', () => {
    const projection = generateReadingV2PreviewOnly({
      draftId: 'overlay-preview-draft',
      ownerId: 'teacher-1',
      document: createReadingV2CanonicalFixture('sentence-completion'),
    }).projection;
    const onClose = vi.fn();

    render(<ReadingV2PreviewOverlay projection={projection} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Reading V2 teacher preview' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Runtime Preview' })).not.toBeInTheDocument();
    expect(screen.queryByText(/writes no assignments, sessions, attempts, or permanent results/)).not.toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Reading V2 Runtime Shell' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Preview' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
