import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { ReadingV2StimulusEditor } from './ReadingV2StimulusEditor';

describe('ReadingV2StimulusEditor', () => {
  it('edits passage paragraphs in canonical stimulus content', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Paragraph 1 text'), {
      target: { value: 'Edited canonical paragraph.' },
    });

    const nextDocument = onDocumentChange.mock.calls[0]?.[0];
    const [stimulusId] = Object.keys(nextDocument.stimuli);
    expect(nextDocument.stimuli[stimulusId].content.paragraphs[0].text).toBe('Edited canonical paragraph.');
  });

  it('shows linked task-group summaries and warns when anchor edits can affect them', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={vi.fn()} />);

    expect(screen.getByLabelText('Linked task-group summary')).toHaveTextContent('Linked task groups: 1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Anchor edits on this stimulus can invalidate linked task groups until references are repaired.',
    );
    expect(screen.getByText('sentence-completion')).toBeInTheDocument();
  });

  it('adds paragraph anchors to both stimuli and the document anchor map', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Paragraph Anchor' }));

    const nextDocument = onDocumentChange.mock.calls[0]?.[0];
    const [stimulusId] = Object.keys(nextDocument.stimuli);
    const nextStimulus = nextDocument.stimuli[stimulusId];
    const newAnchorId = nextStimulus.anchorIds[nextStimulus.anchorIds.length - 1];

    expect(nextDocument.anchors[newAnchorId].kind).toBe('paragraph');
    expect(nextStimulus.content.paragraphs.at(-1)?.anchorId).toBe(newAnchorId);
  });

  it('creates, edits, and removes inline blank anchors with publish-blocking repair issues', () => {
    const document = createReadingV2CanonicalFixture('sentence-completion');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Inline blank 1 label'), { target: { value: 'Blank A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Inline Blank Anchor' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Inline Blank' })[0]!);

    const labelDocument = onDocumentChange.mock.calls[0]?.[0];
    const addedDocument = onDocumentChange.mock.calls[1]?.[0];
    const removedDocument = onDocumentChange.mock.calls[2]?.[0];
    const [stimulusId] = Object.keys(document.stimuli);
    const firstAnchorId = document.stimuli[stimulusId].anchorIds[0];
    const addedAnchorId = addedDocument.stimuli[stimulusId].anchorIds.at(-1);

    expect(labelDocument.anchors[firstAnchorId].label).toBe('Blank A');
    expect(addedDocument.anchors[addedAnchorId].kind).toBe('inline-blank');
    expect(removedDocument.anchors[firstAnchorId]).toBeUndefined();
    expect(removedDocument.validationState.issues.map((issue) => issue.code)).toContain(
      'deleted-stimulus-or-anchor-reference',
    );
  });

  it('edits table shells with rows, columns, roles, and blank cells', () => {
    const document = createReadingV2CanonicalFixture('table-completion');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Table cell 1.1'), { target: { value: 'Edited header' } });
    fireEvent.change(screen.getByLabelText('Table cell 1.1 role'), { target: { value: 'body' } });
    fireEvent.click(screen.getByLabelText('Table cell 1.1 blank'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Table Row' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Table Column' }));

    expect(onDocumentChange).toHaveBeenCalledWith(expect.objectContaining({
      stimuli: expect.any(Object),
    }));
    const textDocument = onDocumentChange.mock.calls[0]?.[0];
    const roleDocument = onDocumentChange.mock.calls[1]?.[0];
    const blankDocument = onDocumentChange.mock.calls[2]?.[0];
    const rowDocument = onDocumentChange.mock.calls[3]?.[0];
    const columnDocument = onDocumentChange.mock.calls[4]?.[0];
    const [stimulusId] = Object.keys(textDocument.stimuli);
    expect(textDocument.stimuli[stimulusId].content.rows[0][0].text).toBe('Edited header');
    expect(roleDocument.stimuli[stimulusId].content.rows[0][0].role).toBe('body');
    expect(blankDocument.stimuli[stimulusId].content.rows[0][0].isBlank).toBe(true);
    expect(rowDocument.stimuli[stimulusId].content.rows).toHaveLength(document.stimuli[stimulusId].content.rows.length + 1);
    expect(columnDocument.stimuli[stimulusId].content.rows[0]).toHaveLength(document.stimuli[stimulusId].content.rows[0].length + 1);
  });

  it('edits flowchart step text and links while adding flow-step anchors', () => {
    const document = createReadingV2CanonicalFixture('flowchart-completion');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Flowchart step 1'), { target: { value: 'Edited step' } });
    fireEvent.change(screen.getByLabelText('Flowchart step 1 next links'), { target: { value: 'step-2, step-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Flow Step' }));

    const textDocument = onDocumentChange.mock.calls[0]?.[0];
    const linkedDocument = onDocumentChange.mock.calls[1]?.[0];
    const [stimulusId] = Object.keys(linkedDocument.stimuli);
    expect(textDocument.stimuli[stimulusId].content.steps[0].text).toBe('Edited step');
    expect(linkedDocument.stimuli[stimulusId].content.steps[0].nextStepIds).toEqual(['step-2', 'step-3']);
    const addedDocument = onDocumentChange.mock.calls[2]?.[0];
    const addedAnchorId = addedDocument.stimuli[stimulusId].anchorIds.at(-1);
    expect(addedDocument.anchors[addedAnchorId].kind).toBe('flow-step');
  });

  it('edits diagram image source while adding answer-field anchors', () => {
    const document = createReadingV2CanonicalFixture('diagram-labeling');
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText('Diagram image URL'), { target: { value: 'https://example.test/diagram.png' } });
    expect(screen.queryByLabelText('Diagram image alt text')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Diagram hotspot 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Diagram hotspot 1 x percent')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Diagram Answer Field' }));

    const urlDocument = onDocumentChange.mock.calls[0]?.[0];
    const [stimulusId] = Object.keys(urlDocument.stimuli);
    expect(urlDocument.stimuli[stimulusId].content.imageUrl).toBe('https://example.test/diagram.png');
    const addedDocument = onDocumentChange.mock.calls[1]?.[0];
    const addedAnchorId = addedDocument.stimuli[stimulusId].anchorIds.at(-1);
    expect(addedDocument.anchors[addedAnchorId].kind).toBe('diagram-hotspot');
  });

  it.each([
    ['table-completion', 'Table cell 2.1', 'Edited table target'],
    ['flowchart-completion', 'Flowchart step 1', 'Edited flow target'],
  ] as const)('keeps structured-layout target identity while editing %s content', (taskType, label, value) => {
    const document = createReadingV2CanonicalFixture(taskType);
    const interaction = Object.values(document.interactions)[0]!;
    const onDocumentChange = vi.fn();

    render(<ReadingV2StimulusEditor document={document} onDocumentChange={onDocumentChange} />);

    fireEvent.change(screen.getByLabelText(label), { target: { value } });

    const nextDocument = onDocumentChange.mock.calls[0]?.[0];
    expect(nextDocument.interactions[interaction.interactionId].primaryAnchorId).toBe(interaction.primaryAnchorId);
    expect(nextDocument.anchors[interaction.primaryAnchorId!]).toEqual(document.anchors[interaction.primaryAnchorId!]);
  });
});
