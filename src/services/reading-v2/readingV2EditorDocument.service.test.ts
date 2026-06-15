import { describe, expect, it } from 'vitest';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2PublishedSnapshot,
} from '../../types/readingV2.types';
import type { ReadingV2EditorDocument } from '../../types/readingV2Editor.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  assertReadingV2ProjectionIsStudentSanitized,
  generateReadingV2StudentSafeProjection,
} from './readingV2Projection.service';
import {
  assertValidReadingV2EditorDocument,
  createReadingV2EditorStableId,
  deserializeReadingV2CanonicalToEditorDocument,
  readingV2EditorIds,
  serializeReadingV2EditorDocumentToCanonical,
  validateReadingV2EditorDocument,
} from './readingV2EditorDocument.service';

const fixtureDocumentFor = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES[taskType]) as ReadingV2Document;

const snapshotFor = (document: ReadingV2Document): ReadingV2PublishedSnapshot => ({
  snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-editor-document-test'),
  materialId: readingV2Ids.materialId('material-editor-document-test'),
  ownerId: 'teacher-1',
  document,
  publishedAt: '2026-05-07T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

const editorDocumentWithBlocks = (): ReadingV2EditorDocument => {
  const sectionId = readingV2Ids.sectionId('editor-section-1');
  const paragraphStimulusId = readingV2Ids.stimulusId('editor-passage-stimulus');
  const paragraphAnchorId = readingV2Ids.anchorId('editor-paragraph-anchor');
  const inlineBlankAnchorId = readingV2Ids.anchorId('editor-inline-blank-anchor');
  const headingAnchorId = readingV2Ids.anchorId('editor-heading-anchor');
  const listAnchorId = readingV2Ids.anchorId('editor-list-anchor');
  const tableStimulusId = readingV2Ids.stimulusId('editor-table-stimulus');
  const tableAnchorId = readingV2Ids.anchorId('editor-table-blank-anchor');
  const imageStimulusId = readingV2Ids.stimulusId('editor-image-stimulus');
  const diagramStimulusId = readingV2Ids.stimulusId('editor-diagram-stimulus');
  const diagramAnchorId = readingV2Ids.anchorId('editor-diagram-target-anchor');
  const flowchartStimulusId = readingV2Ids.stimulusId('editor-flowchart-stimulus');
  const flowchartAnchorId = readingV2Ids.anchorId('editor-flowchart-step-anchor');

  return {
    documentId: readingV2Ids.documentId('editor-document-foundation'),
    title: 'Editor block foundation',
    sections: [
      {
        sectionId,
        title: 'Reading Passage 1',
        taskGroupIds: [],
        blocks: [
          {
            kind: 'paragraph',
            blockId: readingV2EditorIds.blockId('block', ['paragraph']),
            stimulusId: paragraphStimulusId,
            anchorId: paragraphAnchorId,
            text: 'Paragraph with one inline blank.',
            segments: [
              { kind: 'text', text: 'Paragraph with ' },
              { kind: 'blank', anchorId: inlineBlankAnchorId, label: 'Question 1 blank' },
              { kind: 'text', text: ' inline blank.' },
            ],
          },
          {
            kind: 'heading',
            blockId: readingV2EditorIds.blockId('block', ['heading']),
            stimulusId: paragraphStimulusId,
            anchorId: headingAnchorId,
            level: 2,
            text: 'A headed section',
          },
          {
            kind: 'list',
            blockId: readingV2EditorIds.blockId('block', ['list']),
            stimulusId: paragraphStimulusId,
            listKind: 'bullet',
            items: [
              {
                itemId: 'list-item-1',
                anchorId: listAnchorId,
                text: 'A visible list item',
              },
            ],
          },
          {
            kind: 'table',
            blockId: readingV2EditorIds.blockId('block', ['table']),
            stimulusId: tableStimulusId,
            title: 'Editor table',
            rows: [
              {
                rowId: readingV2EditorIds.rowId('row', ['header']),
                cells: [
                  {
                    cellId: readingV2EditorIds.cellId('cell', ['header']),
                    text: 'Feature',
                    role: 'header',
                  },
                  {
                    cellId: readingV2EditorIds.cellId('cell', ['detail']),
                    text: 'Detail',
                    role: 'header',
                  },
                ],
              },
              {
                rowId: readingV2EditorIds.rowId('row', ['body']),
                cells: [
                  {
                    cellId: readingV2EditorIds.cellId('cell', ['blank']),
                    anchorId: tableAnchorId,
                    anchorIds: [tableAnchorId],
                    text: '___',
                    role: 'body',
                    isBlank: true,
                  },
                  {
                    cellId: readingV2EditorIds.cellId('cell', ['body']),
                    text: 'Teacher-authored detail',
                    role: 'body',
                  },
                ],
              },
            ],
          },
          {
            kind: 'image',
            blockId: readingV2EditorIds.blockId('block', ['image']),
            stimulusId: imageStimulusId,
            mediaUrl: 'https://example.test/image.png',
            alt: 'A labelled reading image',
            caption: 'Image caption',
            source: 'Image source',
          },
          {
            kind: 'diagram',
            blockId: readingV2EditorIds.blockId('block', ['diagram']),
            stimulusId: diagramStimulusId,
            imageUrl: 'https://example.test/diagram.png',
            imageAlt: 'Diagram with printed target numbers',
            targets: [
              {
                targetId: readingV2EditorIds.targetId('target', ['one']),
                anchorId: diagramAnchorId,
                label: 'Target 1',
                xPercent: 35,
                yPercent: 45,
              },
            ],
          },
          {
            kind: 'flowchart',
            blockId: readingV2EditorIds.blockId('block', ['flowchart']),
            stimulusId: flowchartStimulusId,
            title: 'Editor flowchart',
            steps: [
              {
                stepId: readingV2EditorIds.stepId('step', ['one']),
                anchorId: flowchartAnchorId,
                text: 'First blank step',
                isBlank: true,
                nextStepIds: [readingV2EditorIds.stepId('step', ['two'])],
              },
              {
                stepId: readingV2EditorIds.stepId('step', ['two']),
                text: 'Second step',
              },
            ],
          },
        ],
      },
    ],
    taskGroups: {},
    interactions: {},
    optionSets: {},
    validationState: { issues: [] },
  };
};

describe('readingV2EditorDocument.service', () => {
  it('creates deterministic stable editor IDs from noisy parts', () => {
    expect(createReadingV2EditorStableId('Block', [' Passage 1 ', 'A/B target ']))
      .toBe('block-passage-1-a-b-target');
    expect(readingV2EditorIds.rowId('row', [' Passage 1 ', 'R 2 '])).toBe('row-passage-1-r-2');
    expect(readingV2EditorIds.mediaId('media', [' Passage 1 ', 'Image A '])).toBe('media-passage-1-image-a');
    expect(readingV2EditorIds.importEvidenceId('evidence', [' Passage 1 ', 'range 1-3 ']))
      .toBe(readingV2Ids.importEvidenceId('evidence-passage-1-range-1-3'));
    expect(() => createReadingV2EditorStableId(' ', ['  '])).toThrow(/non-empty/);
  });

  it('round-trips canonical table drafts without losing stable IDs, anchors, or task meaning', () => {
    const canonical = fixtureDocumentFor('table-completion');
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(canonical);

    expect(validateReadingV2EditorDocument(editorDocument)).toEqual([]);
    expect(() => assertValidReadingV2EditorDocument(editorDocument)).not.toThrow();
    expect(editorDocument.sections[0]?.blocks.some((block) => block.kind === 'table')).toBe(true);

    const roundTrip = serializeReadingV2EditorDocumentToCanonical(editorDocument);

    expect(roundTrip).toEqual(canonical);
    expect(roundTrip.sections[canonical.sectionIds[0]!]?.taskGroupIds).toEqual(
      canonical.sections[canonical.sectionIds[0]!]!.taskGroupIds,
    );
    expect(Object.keys(roundTrip.interactions).sort()).toEqual(Object.keys(canonical.interactions).sort());
  });

  it('serializes paragraph, heading, list, table, image, diagram, and flowchart blocks to canonical stimuli', () => {
    const canonical = serializeReadingV2EditorDocumentToCanonical(editorDocumentWithBlocks());

    expect(() => validateReadingV2EditorDocument(deserializeReadingV2CanonicalToEditorDocument(canonical))).not.toThrow();
    expect(Object.values(canonical.stimuli).map((stimulus) => stimulus.content.kind).sort()).toEqual([
      'diagram-content',
      'flowchart-content',
      'media-content',
      'passage-content',
      'table-content',
    ]);
    expect(Object.values(canonical.anchors).map((anchor) => anchor.kind).sort()).toEqual([
      'diagram-hotspot',
      'flow-step',
      'inline-blank',
      'paragraph',
      'paragraph',
      'paragraph',
      'table-cell',
    ]);
    expect(
      Object.values(canonical.stimuli).find((stimulus) => stimulus.content.kind === 'passage-content')?.content,
    ).toMatchObject({
      kind: 'passage-content',
      paragraphs: expect.arrayContaining([
        expect.objectContaining({ text: 'Paragraph with ___ inline blank.' }),
        expect.objectContaining({ label: 'Heading 2', text: 'A headed section' }),
        expect.objectContaining({ label: 'List item 1', text: 'A visible list item' }),
      ]),
    });
    expect(
      Object.values(canonical.stimuli).find((stimulus) => stimulus.content.kind === 'media-content')?.content,
    ).toMatchObject({
      kind: 'media-content',
      caption: 'Image caption',
      source: 'Image source',
    });
  });

  it('reports duplicate IDs, broken blank links, orphan anchors, and legacy marker text before serialization', () => {
    const editorDocument = editorDocumentWithBlocks();
    const firstSection = editorDocument.sections[0]!;
    const tableBlock = firstSection.blocks.find((block) => block.kind === 'table');
    const paragraphBlock = firstSection.blocks.find((block) => block.kind === 'paragraph');

    if (!tableBlock || tableBlock.kind !== 'table' || !paragraphBlock || paragraphBlock.kind !== 'paragraph') {
      throw new Error('Expected editor fixture blocks.');
    }

    const brokenDocument: ReadingV2EditorDocument = {
      ...editorDocument,
      sections: [
        {
          ...firstSection,
          blocks: [
            { ...paragraphBlock, text: '[Image: describe the image]' },
            { ...paragraphBlock },
            {
              ...tableBlock,
              rows: [
                {
                  ...tableBlock.rows[0]!,
                  cells: [
                    {
                      ...tableBlock.rows[0]!.cells[0]!,
                      isBlank: true,
                      anchorId: undefined,
                      anchorIds: [],
                    },
                  ],
                },
              ],
            },
          ],
          taskGroupIds: [readingV2Ids.taskGroupId('missing-group')],
        },
      ],
      taskGroups: {
        [readingV2Ids.taskGroupId('missing-group')]: {
          taskGroupId: readingV2Ids.taskGroupId('missing-group'),
          sectionId: firstSection.sectionId,
          officialTaskType: 'table-completion',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction-1', text: 'Complete the table.' }],
          answerRule: {
            responseShape: { kind: 'structured-entry', structure: 'table' },
          },
          stimulusRefs: [{
            stimulusId: tableBlock.stimulusId,
            anchorIds: [readingV2Ids.anchorId('missing-anchor')],
          }],
          optionSetRefs: [],
          interactionIds: [],
          validationState: { issues: [] },
        },
      },
    };
    const codes = validateReadingV2EditorDocument(brokenDocument).map((candidate) => candidate.code);

    expect(codes).toEqual(expect.arrayContaining([
      'duplicate-block-id',
      'broken-blank-link',
      'orphan-anchor-reference',
      'unsupported-legacy-marker-text',
    ]));
    expect(() => serializeReadingV2EditorDocumentToCanonical(brokenDocument)).toThrow(/legacy marker|Duplicate|Blank|missing/);
  });

  it('reports structured block media, flow step, target, and answer-binding problems before serialization', () => {
    const editorDocument = editorDocumentWithBlocks();
    const firstSection = editorDocument.sections[0]!;
    const tableBlock = firstSection.blocks.find((block) => block.kind === 'table');
    const imageBlock = firstSection.blocks.find((block) => block.kind === 'image');
    const diagramBlock = firstSection.blocks.find((block) => block.kind === 'diagram');
    const flowchartBlock = firstSection.blocks.find((block) => block.kind === 'flowchart');

    if (
      !tableBlock
      || tableBlock.kind !== 'table'
      || !imageBlock
      || imageBlock.kind !== 'image'
      || !diagramBlock
      || diagramBlock.kind !== 'diagram'
      || !flowchartBlock
      || flowchartBlock.kind !== 'flowchart'
    ) {
      throw new Error('Expected structured editor fixture blocks.');
    }

    const tableAnchorId = tableBlock.rows[1]?.cells[0]?.anchorId;
    const taskGroupId = readingV2Ids.taskGroupId('editor-structured-binding-group');
    const interactionId = readingV2Ids.interactionId('editor-structured-binding-interaction');
    const brokenDocument: ReadingV2EditorDocument = {
      ...editorDocument,
      sections: [
        {
          ...firstSection,
          taskGroupIds: [taskGroupId],
          blocks: firstSection.blocks.map((block) => {
            if (block.kind === 'image') {
              return { ...block, mediaUrl: '', alt: '' };
            }

            if (block.kind === 'diagram') {
              const firstTarget = block.targets[0]!;
              return {
                ...block,
                imageUrl: '',
                imageAlt: '',
                targets: [
                  firstTarget,
                  {
                    ...firstTarget,
                    targetId: readingV2EditorIds.targetId('target', ['duplicate-anchor']),
                  },
                ],
              };
            }

            if (block.kind === 'flowchart') {
              return {
                ...block,
                steps: block.steps.map((step, index) =>
                  index === 0 ? { ...step, text: '' } : step,
                ),
              };
            }

            return block;
          }),
        },
      ],
      taskGroups: {
        [taskGroupId]: {
          taskGroupId,
          sectionId: firstSection.sectionId,
          officialTaskType: 'table-completion',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction-1', text: 'Complete the table.' }],
          answerRule: {
            responseShape: { kind: 'structured-entry', structure: 'table' },
          },
          stimulusRefs: [{
            stimulusId: tableBlock.stimulusId,
            anchorIds: tableAnchorId ? [tableAnchorId] : [],
          }],
          optionSetRefs: [],
          interactionIds: [interactionId],
          validationState: { issues: [] },
        },
      },
      interactions: {
        [interactionId]: {
          interactionId,
          taskGroupId,
          responseShape: { kind: 'free-text', wordLimit: 1 },
          scoringRule: { maxScore: 1, acceptableAnswers: [] },
          reviewLabel: {},
          promptText: 'Broken structured answer binding',
        },
      },
    };
    const codes = validateReadingV2EditorDocument(brokenDocument).map((candidate) => candidate.code);

    expect(codes).toEqual(expect.arrayContaining([
      'missing-media-source',
      'student-visible-structured-mismatch',
      'empty-flow-step',
      'duplicate-diagram-target-anchor',
      'broken-structured-answer-binding',
    ]));
    expect(() => serializeReadingV2EditorDocumentToCanonical(brokenDocument)).toThrow(/Cannot serialize invalid/);
  });

  it('reports duplicate editor anchors across blocks and task-group stimulus references', () => {
    const editorDocument = editorDocumentWithBlocks();
    const firstSection = editorDocument.sections[0]!;
    const tableBlock = firstSection.blocks.find((block) => block.kind === 'table');
    const paragraphBlock = firstSection.blocks.find((block) => block.kind === 'paragraph');
    const flowchartBlock = firstSection.blocks.find((block) => block.kind === 'flowchart');
    const diagramBlock = firstSection.blocks.find((block) => block.kind === 'diagram');

    if (
      !tableBlock
      || tableBlock.kind !== 'table'
      || !paragraphBlock
      || paragraphBlock.kind !== 'paragraph'
      || !flowchartBlock
      || flowchartBlock.kind !== 'flowchart'
      || !diagramBlock
      || diagramBlock.kind !== 'diagram'
    ) {
      throw new Error('Expected editor duplicate-anchor fixture blocks.');
    }

    const tableAnchorId = tableBlock.rows[1]?.cells[0]?.anchorId;
    const taskGroupId = readingV2Ids.taskGroupId('editor-duplicate-anchor-ref-group');

    if (!tableAnchorId) {
      throw new Error('Expected table anchor fixture.');
    }

    const brokenDocument: ReadingV2EditorDocument = {
      ...editorDocument,
      sections: [
        {
          ...firstSection,
          taskGroupIds: [taskGroupId],
          blocks: firstSection.blocks.map((block) => {
            if (block.kind === 'paragraph') {
              return { ...block, anchorId: tableAnchorId };
            }

            if (block.kind === 'flowchart') {
              return {
                ...block,
                steps: block.steps.map((step, index) =>
                  index === 0 ? { ...step, anchorId: tableAnchorId } : step,
                ),
              };
            }

            if (block.kind === 'diagram') {
              const firstTarget = block.targets[0]!;
              return {
                ...block,
                targets: [
                  firstTarget,
                  {
                    ...firstTarget,
                    targetId: readingV2EditorIds.targetId('target', ['duplicate-ref-anchor']),
                  },
                ],
              };
            }

            return block;
          }),
        },
      ],
      taskGroups: {
        [taskGroupId]: {
          taskGroupId,
          sectionId: firstSection.sectionId,
          officialTaskType: 'table-completion',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction-1', text: 'Complete the table.' }],
          answerRule: {
            responseShape: { kind: 'structured-entry', structure: 'table' },
          },
          stimulusRefs: [{
            stimulusId: tableBlock.stimulusId,
            anchorIds: [tableAnchorId, tableAnchorId],
          }],
          optionSetRefs: [],
          interactionIds: [],
          validationState: { issues: [] },
        },
      },
    };
    const issues = validateReadingV2EditorDocument(brokenDocument);
    const codes = issues.map((candidate) => candidate.code);

    expect(codes).toEqual(expect.arrayContaining([
      'duplicate-anchor-id',
      'duplicate-diagram-target-anchor',
      'duplicate-task-group-anchor-reference',
    ]));
    expect(issues.filter((candidate) => candidate.code === 'duplicate-anchor-id').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps teacher answer rules in canonical output while student-safe projections strip answers and editor internals', () => {
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(fixtureDocumentFor('diagram-labeling'));
    const canonical = serializeReadingV2EditorDocumentToCanonical(editorDocument);
    const firstInteraction = Object.values(canonical.interactions)[0]!;

    expect(firstInteraction.scoringRule.acceptableAnswers).toEqual(['answer one']);

    const studentSafe = generateReadingV2StudentSafeProjection(snapshotFor(canonical));

    expect(() => assertReadingV2ProjectionIsStudentSanitized(studentSafe)).not.toThrow();
    expect(JSON.stringify(studentSafe)).not.toContain('acceptableAnswers');
    expect(JSON.stringify(studentSafe)).not.toContain('scoringRule');
    expect(JSON.stringify(studentSafe)).not.toContain('editorBlock');
  });
});
