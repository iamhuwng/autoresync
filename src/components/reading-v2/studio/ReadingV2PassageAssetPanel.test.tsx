import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2PassageAssetVersion } from '../../../types/readingV2.types';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import type { ReadingV2PassageAssetSearchResult } from '../../../services/reading-v2/readingV2PassageAssetWorkflow.service';
import { ReadingV2PassageAssetPanel } from './ReadingV2PassageAssetPanel';

const createResult = (): ReadingV2PassageAssetSearchResult => {
  const document = createReadingV2CanonicalFixture('sentence-completion');
  const [stimulusId] = Object.keys(document.stimuli);
  const passageAssetId = readingV2Ids.passageAssetId('panel-asset');
  const version: ReadingV2PassageAssetVersion = {
    passageAssetId,
    versionId: 'v1',
    title: 'Reusable climate passage',
    source: 'Teacher source',
    rights: 'Classroom use',
    topic: 'Climate',
    wordCount: 120,
    content: document.stimuli[stimulusId].content,
    paragraphAnchorIds: [],
    provenance: { extractionMethod: 'import' },
  };

  return {
    asset: {
      passageAssetId,
      ownerId: 'teacher-1',
      state: 'published',
      reuseAdvisory: 'reuse-with-caution',
      currentVersionId: 'v1',
    },
    currentVersion: version,
    whereUsed: [{ passageAssetId, ownerId: 'teacher-1', consumerId: 'material-1', consumerKind: 'full-test' }],
  };
};

describe('ReadingV2PassageAssetPanel', () => {
  it('renders passage asset metadata and selects a version into the draft document', () => {
    const document = createReadingV2CanonicalFixture('matching-headings');
    const onDocumentChange = vi.fn();
    const result = createResult();

    render(
      <ReadingV2PassageAssetPanel
        ownerId="teacher-1"
        document={document}
        results={[result]}
        onDocumentChange={onDocumentChange}
        onInspectProvenance={vi.fn()}
        onExtract={vi.fn()}
      />,
    );

    expect(screen.getByText('Reusable climate passage')).toBeInTheDocument();
    expect(screen.getByText('Teacher source')).toBeInTheDocument();
    expect(screen.getByText('Classroom use')).toBeInTheDocument();
    expect(screen.getByText('Climate')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('reuse-with-caution')).toBeInTheDocument();
    expect(screen.getByText('import')).toBeInTheDocument();
    expect(screen.getByText('full-test: material-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use This Version' }));

    const nextDocument = onDocumentChange.mock.calls[0]?.[0];
    const [stimulusId] = Object.keys(nextDocument.stimuli);
    expect(nextDocument.stimuli[stimulusId].title).toBe('Reusable climate passage');
    expect(nextDocument.stimuli[stimulusId].content).toEqual(result.currentVersion?.content);
  });
});
