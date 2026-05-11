// Reading V2 editor-document boundary: editor blocks are authoring truth inside Studio only.
// Canonical Reading V2 documents remain delivery, scoring, projection, runtime, and result truth.
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Anchor,
  type ReadingV2AnchorId,
  type ReadingV2AnchorKind,
  type ReadingV2Document,
  type ReadingV2ImportEvidenceId,
  type ReadingV2Interaction,
  type ReadingV2PassageParagraph,
  type ReadingV2Section,
  type ReadingV2StimulusId,
  type ReadingV2StimulusNode,
  type ReadingV2TaskGroup,
  type ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import type {
  ReadingV2EditorBlock,
  ReadingV2EditorBlockId,
  ReadingV2EditorCellId,
  ReadingV2EditorDiagramBlock,
  ReadingV2EditorDocument,
  ReadingV2EditorFlowchartBlock,
  ReadingV2EditorImageBlock,
  ReadingV2EditorListBlock,
  ReadingV2EditorListItem,
  ReadingV2EditorMediaId,
  ReadingV2EditorRowId,
  ReadingV2EditorSection,
  ReadingV2EditorStepId,
  ReadingV2EditorTableBlock,
  ReadingV2EditorTargetId,
  ReadingV2EditorValidationIssue,
} from '../../types/readingV2Editor.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';

type TextBlock = Extract<ReadingV2EditorBlock, { readonly kind: 'paragraph' | 'heading' }>;

const TEXT_BLOCK_KINDS = new Set<ReadingV2EditorBlock['kind']>(['paragraph', 'heading', 'list']);
const LEGACY_MARKER_PATTERN = /(^|\n)\s*table\s*:|\[(?:image|diagram)\s*:/i;

export const createReadingV2EditorStableId = (
  prefix: string,
  parts: readonly string[],
): string => {
  const stem = [prefix, ...parts]
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');

  if (!stem) {
    throw new Error('Reading V2 editor IDs must include at least one non-empty part.');
  }

  return stem;
};

const withoutUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;

export const readingV2EditorIds = {
  blockId: (prefix: string, parts: readonly string[]): ReadingV2EditorBlockId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorBlockId,
  rowId: (prefix: string, parts: readonly string[]): ReadingV2EditorRowId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorRowId,
  cellId: (prefix: string, parts: readonly string[]): ReadingV2EditorCellId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorCellId,
  stepId: (prefix: string, parts: readonly string[]): ReadingV2EditorStepId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorStepId,
  targetId: (prefix: string, parts: readonly string[]): ReadingV2EditorTargetId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorTargetId,
  mediaId: (prefix: string, parts: readonly string[]): ReadingV2EditorMediaId =>
    createReadingV2EditorStableId(prefix, parts) as ReadingV2EditorMediaId,
  importEvidenceId: (prefix: string, parts: readonly string[]): ReadingV2ImportEvidenceId =>
    readingV2Ids.importEvidenceId(createReadingV2EditorStableId(prefix, parts)),
} as const;

export const createReadingV2EditorBlockIdForStimulus = (
  stimulusId: ReadingV2StimulusId,
  suffix: string,
): ReadingV2EditorBlockId =>
  readingV2EditorIds.blockId('reading-v2-editor-block', [stimulusId, suffix]);

const copyRecord = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, structuredClone(value) as T]));

const issue = (
  code: ReadingV2EditorValidationIssue['code'],
  message: string,
  objectId?: string,
): ReadingV2EditorValidationIssue => ({
  code,
  severity: 'error',
  message,
  objectId,
});

const addUnique = <T extends string>(items: T[], value: T): void => {
  if (!items.includes(value)) {
    items.push(value);
  }
};

const isTextBlock = (block: ReadingV2EditorBlock): block is TextBlock | ReadingV2EditorListBlock =>
  TEXT_BLOCK_KINDS.has(block.kind);

const anchorIdsForTableCell = (
  cell: { readonly anchorId?: ReadingV2AnchorId; readonly anchorIds?: readonly ReadingV2AnchorId[] },
): readonly ReadingV2AnchorId[] => {
  const values = cell.anchorIds && cell.anchorIds.length > 0
    ? cell.anchorIds
    : cell.anchorId
      ? [cell.anchorId]
      : [];

  return values.filter((anchorId, index) => values.indexOf(anchorId) === index);
};

const inlineBlankAnchorIds = (
  segments: readonly { readonly kind: string; readonly anchorId?: ReadingV2AnchorId }[] | undefined,
): readonly ReadingV2AnchorId[] =>
  (segments ?? [])
    .filter((segment): segment is { readonly kind: 'blank'; readonly anchorId: ReadingV2AnchorId } =>
      segment.kind === 'blank' && Boolean(segment.anchorId),
    )
    .map((segment) => segment.anchorId);

const addAnchor = (
  anchors: Record<string, ReadingV2Anchor>,
  anchorId: ReadingV2AnchorId | undefined,
  stimulusId: ReadingV2StimulusId,
  kind: ReadingV2AnchorKind,
  label?: string,
): void => {
  if (!anchorId) {
    return;
  }

  anchors[anchorId] = {
    anchorId,
    stimulusId,
    kind,
    label,
  };
};

const anchorLabelFor = (
  anchors: Readonly<Record<string, ReadingV2Anchor>>,
  anchorId: ReadingV2AnchorId,
): string | undefined =>
  anchors[anchorId]?.label;

const headingLevelFor = (value: number | undefined): 1 | 2 | 3 => {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 2;
};

const inferPassageParagraphKind = (
  paragraph: ReadingV2PassageParagraph,
): {
  readonly blockKind: 'paragraph' | 'heading' | 'list-item';
  readonly text: string;
  readonly headingLevel?: 1 | 2 | 3;
  readonly listKind?: 'ordered' | 'bullet';
} => {
  if (paragraph.blockKind === 'heading') {
    return {
      blockKind: 'heading',
      text: paragraph.text,
      headingLevel: headingLevelFor(paragraph.headingLevel),
    };
  }

  if (paragraph.blockKind === 'list-item') {
    return {
      blockKind: 'list-item',
      text: paragraph.text,
      listKind: paragraph.listKind ?? 'bullet',
    };
  }

  const headingMatch = paragraph.text.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch?.[1] && headingMatch[2]) {
    return {
      blockKind: 'heading',
      text: headingMatch[2],
      headingLevel: headingLevelFor(headingMatch[1].length),
    };
  }

  const orderedMatch = paragraph.text.match(/^\d+[.)]\s+(.+)$/);
  if (orderedMatch?.[1]) {
    return {
      blockKind: 'list-item',
      text: orderedMatch[1],
      listKind: 'ordered',
    };
  }

  const bulletMatch = paragraph.text.match(/^[-*]\s+(.+)$/);
  if (bulletMatch?.[1]) {
    return {
      blockKind: 'list-item',
      text: bulletMatch[1],
      listKind: 'bullet',
    };
  }

  return {
    blockKind: 'paragraph',
    text: paragraph.text,
  };
};

const deserializePassageStimulus = (
  stimulus: ReadingV2StimulusNode,
  anchors: Readonly<Record<string, ReadingV2Anchor>>,
): readonly ReadingV2EditorBlock[] => {
  if (stimulus.content.kind !== 'passage-content') {
    return [];
  }

  const blocks: ReadingV2EditorBlock[] = [];
  let pendingList:
    | {
        readonly listKind: 'ordered' | 'bullet';
        readonly startIndex: number;
        readonly items: ReadingV2EditorListItem[];
      }
    | undefined;

  const flushList = (): void => {
    if (!pendingList) {
      return;
    }

    blocks.push({
      kind: 'list',
      blockId: createReadingV2EditorBlockIdForStimulus(
        stimulus.stimulusId,
        `list-${pendingList.startIndex + 1}`,
      ),
      stimulusId: stimulus.stimulusId,
      stimulusTitle: stimulus.title,
      listKind: pendingList.listKind,
      items: pendingList.items,
    });
    pendingList = undefined;
  };

  stimulus.content.paragraphs.forEach((paragraph, index) => {
    const inferred = inferPassageParagraphKind(paragraph);

    if (inferred.blockKind === 'list-item') {
      if (!pendingList || pendingList.listKind !== inferred.listKind) {
        flushList();
        pendingList = {
          listKind: inferred.listKind ?? 'bullet',
          startIndex: index,
          items: [],
        };
      }

      pendingList.items.push({
        itemId: paragraph.itemId ?? `item-${index + 1}`,
        anchorId: paragraph.anchorId,
        anchorLabel: paragraph.anchorId ? anchorLabelFor(anchors, paragraph.anchorId) : undefined,
        label: paragraph.label,
        text: inferred.text,
        segments: [{ kind: 'text', text: inferred.text }],
      });
      return;
    }

    flushList();

    if (inferred.blockKind === 'heading') {
      blocks.push({
        kind: 'heading',
        blockId: createReadingV2EditorBlockIdForStimulus(
          stimulus.stimulusId,
          paragraph.anchorId ?? `heading-${index + 1}`,
        ),
        stimulusId: stimulus.stimulusId,
        stimulusTitle: stimulus.title,
        anchorId: paragraph.anchorId,
        anchorKind: 'paragraph',
        anchorLabel: paragraph.anchorId ? anchorLabelFor(anchors, paragraph.anchorId) : undefined,
        label: paragraph.label,
        text: inferred.text,
        segments: [{ kind: 'text', text: inferred.text }],
        level: inferred.headingLevel ?? 2,
      });
      return;
    }

    blocks.push({
      kind: 'paragraph',
      blockId: createReadingV2EditorBlockIdForStimulus(
        stimulus.stimulusId,
        paragraph.anchorId ?? `paragraph-${index + 1}`,
      ),
      stimulusId: stimulus.stimulusId,
      stimulusTitle: stimulus.title,
      anchorId: paragraph.anchorId,
      anchorKind: 'paragraph',
      anchorLabel: paragraph.anchorId ? anchorLabelFor(anchors, paragraph.anchorId) : undefined,
      label: paragraph.label,
      text: inferred.text,
      segments: [{ kind: 'text', text: inferred.text }],
    });
  });

  flushList();
  return blocks;
};

const deserializeStimulus = (
  stimulus: ReadingV2StimulusNode,
  anchors: Readonly<Record<string, ReadingV2Anchor>>,
): readonly ReadingV2EditorBlock[] => {
  if (stimulus.content.kind === 'passage-content') {
    return deserializePassageStimulus(stimulus, anchors);
  }

  if (stimulus.content.kind === 'table-content') {
    const tableBlock: ReadingV2EditorTableBlock = {
      kind: 'table',
      blockId: createReadingV2EditorBlockIdForStimulus(stimulus.stimulusId, 'table'),
      stimulusId: stimulus.stimulusId,
      title: stimulus.title,
      rows: stimulus.content.rows.map((row, rowIndex) => ({
        rowId: readingV2EditorIds.rowId('reading-v2-editor-row', [
          stimulus.stimulusId,
          String(rowIndex + 1),
        ]),
        cells: row.map((cell, cellIndex) => ({
          cellId: (cell.cellId
            ?? readingV2EditorIds.cellId('reading-v2-editor-cell', [
              stimulus.stimulusId,
              `${rowIndex + 1}-${cellIndex + 1}`,
            ])) as ReadingV2EditorCellId,
          anchorId: cell.anchorId,
          anchorIds: cell.anchorIds,
          anchorLabel: cell.anchorId ? anchorLabelFor(anchors, cell.anchorId) : undefined,
          text: cell.text,
          role: cell.role,
          isBlank: cell.isBlank,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        })),
      })),
    };

    return [tableBlock];
  }

  if (stimulus.content.kind === 'flowchart-content') {
    const flowchartBlock: ReadingV2EditorFlowchartBlock = {
      kind: 'flowchart',
      blockId: createReadingV2EditorBlockIdForStimulus(stimulus.stimulusId, 'flowchart'),
      stimulusId: stimulus.stimulusId,
      title: stimulus.title,
      steps: stimulus.content.steps.map((step) => ({
        stepId: step.stepId as ReadingV2EditorStepId,
        anchorId: step.anchorId,
        anchorLabel: step.anchorId ? anchorLabelFor(anchors, step.anchorId) : undefined,
        text: step.text,
        isBlank: Boolean(step.anchorId),
        nextStepIds: step.nextStepIds?.map((stepId) => stepId as ReadingV2EditorStepId),
      })),
    };

    return [flowchartBlock];
  }

  if (stimulus.content.kind === 'diagram-content') {
    const diagramBlock: ReadingV2EditorDiagramBlock = {
      kind: 'diagram',
      blockId: createReadingV2EditorBlockIdForStimulus(stimulus.stimulusId, 'diagram'),
      stimulusId: stimulus.stimulusId,
      title: stimulus.title,
      imageUrl: stimulus.content.imageUrl,
      imageAlt: stimulus.content.imageAlt,
      targets: stimulus.content.hotspots.map((hotspot) => ({
        targetId: readingV2EditorIds.targetId('reading-v2-editor-target', [stimulus.stimulusId, hotspot.anchorId]),
        anchorId: hotspot.anchorId,
        anchorLabel: anchorLabelFor(anchors, hotspot.anchorId),
        label: hotspot.label,
        xPercent: hotspot.xPercent,
        yPercent: hotspot.yPercent,
      })),
    };

    return [diagramBlock];
  }

  const imageBlock: ReadingV2EditorImageBlock = {
    kind: 'image',
    blockId: createReadingV2EditorBlockIdForStimulus(stimulus.stimulusId, 'media'),
    stimulusId: stimulus.stimulusId,
    title: stimulus.title,
    mediaUrl: stimulus.content.mediaUrl,
    alt: stimulus.content.alt,
    caption: stimulus.content.caption,
    source: stimulus.content.source,
  };

  return [imageBlock];
};

export const deserializeReadingV2CanonicalToEditorDocument = (
  document: ReadingV2Document,
): ReadingV2EditorDocument => {
  assertValidReadingV2CanonicalDocument(document);

  return {
    documentId: document.documentId,
    title: document.title,
    sections: document.sectionIds.map((sectionId) => {
      const section = document.sections[sectionId];
      if (!section) {
        throw new Error(`Cannot deserialize missing Reading V2 section ${sectionId}.`);
      }

      return {
        sectionId,
        title: section.title,
        taskGroupIds: [...section.taskGroupIds],
        blocks: section.stimulusIds.flatMap((stimulusId) => {
          const stimulus = document.stimuli[stimulusId];
          if (!stimulus) {
            throw new Error(`Cannot deserialize missing Reading V2 stimulus ${stimulusId}.`);
          }

          return deserializeStimulus(stimulus, document.anchors);
        }),
      };
    }),
    taskGroups: copyRecord(document.taskGroups),
    interactions: copyRecord(document.interactions),
    optionSets: copyRecord(document.optionSets),
    validationState: structuredClone(document.validationState),
  };
};

const textForBlock = (block: TextBlock): string =>
  block.segments?.map((segment) => segment.kind === 'blank' ? '___' : segment.text).join('') ?? block.text;

const anchorIdsForTextBlocks = (
  blocks: readonly (TextBlock | ReadingV2EditorListBlock)[],
): readonly ReadingV2AnchorId[] => {
  const anchorIds: ReadingV2AnchorId[] = [];

  blocks.forEach((block) => {
    if (block.kind === 'list') {
      block.items.forEach((item) => {
        if (item.anchorId) {
          addUnique(anchorIds, item.anchorId);
        }
        inlineBlankAnchorIds(item.segments).forEach((anchorId) => addUnique(anchorIds, anchorId));
      });
      return;
    }

    if (block.anchorId) {
      addUnique(anchorIds, block.anchorId);
    }
    inlineBlankAnchorIds(block.segments).forEach((anchorId) => addUnique(anchorIds, anchorId));
  });

  return anchorIds;
};

const serializeTextBlocks = (
  blocks: readonly (TextBlock | ReadingV2EditorListBlock)[],
  stimulusId: ReadingV2StimulusId,
  title: string | undefined,
  anchors: Record<string, ReadingV2Anchor>,
): ReadingV2StimulusNode => {
  const paragraphs: ReadingV2PassageParagraph[] = [];

  blocks.forEach((block) => {
    if (block.kind === 'list') {
      block.items.forEach((item, index) => {
        addAnchor(
          anchors,
          item.anchorId,
          stimulusId,
          'paragraph',
          item.anchorLabel ?? item.label ?? `List item ${index + 1}`,
        );
        inlineBlankAnchorIds(item.segments).forEach((anchorId) =>
          addAnchor(anchors, anchorId, stimulusId, 'inline-blank', `List item ${index + 1} blank`),
        );
        paragraphs.push(withoutUndefined({
          anchorId: item.anchorId,
          label: item.label ?? `List item ${index + 1}`,
          blockKind: 'list-item' as const,
          listKind: block.listKind,
          itemId: item.itemId,
          text: item.segments?.map((segment) => segment.kind === 'blank' ? '___' : segment.text).join('') ?? item.text,
        }));
      });
      return;
    }

    const label = block.label ?? (block.kind === 'heading' ? `Heading ${block.level}` : undefined);
    addAnchor(anchors, block.anchorId, stimulusId, block.anchorKind ?? 'paragraph', block.anchorLabel ?? label);
    inlineBlankAnchorIds(block.segments).forEach((anchorId) =>
      addAnchor(anchors, anchorId, stimulusId, 'inline-blank', label ? `${label} blank` : 'Inline blank'),
    );
    paragraphs.push(withoutUndefined({
      anchorId: block.anchorId,
      label,
      blockKind: block.kind === 'heading' ? 'heading' as const : 'paragraph' as const,
      headingLevel: block.kind === 'heading' ? block.level : undefined,
      text: textForBlock(block),
    }));
  });

  return {
    stimulusId,
    kind: 'passage',
    title,
    content: {
      kind: 'passage-content',
      paragraphs: paragraphs.length > 0 ? paragraphs : [{ text: '' }],
    },
    anchorIds: anchorIdsForTextBlocks(blocks),
  };
};

const serializeTableBlock = (
  block: ReadingV2EditorTableBlock,
  anchors: Record<string, ReadingV2Anchor>,
): ReadingV2StimulusNode => {
  const anchorIds: ReadingV2AnchorId[] = [];

  block.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, cellIndex) => {
      anchorIdsForTableCell(cell).forEach((anchorId) => {
        addUnique(anchorIds, anchorId);
        addAnchor(
          anchors,
          anchorId,
          block.stimulusId,
          'table-cell',
          cell.anchorLabel ?? `Table cell ${rowIndex + 1}.${cellIndex + 1}`,
        );
      });
    });
  });

  return {
    stimulusId: block.stimulusId,
    kind: 'table-shell',
    title: block.title,
    content: {
      kind: 'table-content',
      rows: block.rows.map((row) =>
        row.cells.map((cell) => withoutUndefined({
          cellId: cell.cellId,
          anchorId: cell.anchorId,
          anchorIds: cell.anchorIds,
          text: cell.text,
          role: cell.role,
          isBlank: cell.isBlank,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
        })),
      ),
    },
    anchorIds,
  };
};

const serializeFlowchartBlock = (
  block: ReadingV2EditorFlowchartBlock,
  anchors: Record<string, ReadingV2Anchor>,
): ReadingV2StimulusNode => {
  const anchorIds: ReadingV2AnchorId[] = [];

  block.steps.forEach((step, index) => {
    if (step.anchorId) {
      addUnique(anchorIds, step.anchorId);
      addAnchor(anchors, step.anchorId, block.stimulusId, 'flow-step', step.anchorLabel ?? `Flowchart step ${index + 1}`);
    }
  });

  return {
    stimulusId: block.stimulusId,
    kind: 'flowchart-shell',
    title: block.title,
    content: {
      kind: 'flowchart-content',
      steps: block.steps.map((step) => withoutUndefined({
        anchorId: step.anchorId,
        stepId: step.stepId,
        text: step.text,
        nextStepIds: step.nextStepIds,
      })),
    },
    anchorIds,
  };
};

const serializeDiagramBlock = (
  block: ReadingV2EditorDiagramBlock,
  anchors: Record<string, ReadingV2Anchor>,
): ReadingV2StimulusNode => {
  block.targets.forEach((target) =>
    addAnchor(anchors, target.anchorId, block.stimulusId, 'diagram-hotspot', target.anchorLabel ?? target.label),
  );

  return {
    stimulusId: block.stimulusId,
    kind: 'diagram-shell',
    title: block.title,
    content: {
      kind: 'diagram-content',
      ...withoutUndefined({ imageUrl: block.imageUrl }),
      imageAlt: block.imageAlt,
      hotspots: block.targets.map((target) => ({
        anchorId: target.anchorId,
        label: target.label,
        xPercent: target.xPercent,
        yPercent: target.yPercent,
      })),
    },
    anchorIds: block.targets.map((target) => target.anchorId),
  };
};

const serializeImageBlock = (block: ReadingV2EditorImageBlock): ReadingV2StimulusNode => ({
  stimulusId: block.stimulusId,
  kind: 'media',
  title: block.title ?? block.caption,
  content: {
    kind: 'media-content',
    mediaUrl: block.mediaUrl,
    alt: block.alt,
    ...withoutUndefined({ caption: block.caption, source: block.source }),
  },
  anchorIds: [],
});

const serializeSectionBlocks = (
  section: ReadingV2EditorSection,
  anchors: Record<string, ReadingV2Anchor>,
): {
  readonly stimulusIds: readonly ReadingV2StimulusId[];
  readonly stimuli: Readonly<Record<string, ReadingV2StimulusNode>>;
} => {
  const stimulusIds: ReadingV2StimulusId[] = [];
  const stimuli: Record<string, ReadingV2StimulusNode> = {};
  const textBlocksByStimulus = new Map<string, (TextBlock | ReadingV2EditorListBlock)[]>();
  const textStimulusTitles = new Map<string, string | undefined>();

  section.blocks.forEach((block) => {
    addUnique(stimulusIds, block.stimulusId);

    if (isTextBlock(block)) {
      const existing = textBlocksByStimulus.get(block.stimulusId) ?? [];
      existing.push(block);
      textBlocksByStimulus.set(block.stimulusId, existing);

      if (!textStimulusTitles.has(block.stimulusId)) {
        textStimulusTitles.set(block.stimulusId, block.stimulusTitle);
      }
      return;
    }

    if (block.kind === 'table') {
      stimuli[block.stimulusId] = serializeTableBlock(block, anchors);
      return;
    }

    if (block.kind === 'flowchart') {
      stimuli[block.stimulusId] = serializeFlowchartBlock(block, anchors);
      return;
    }

    if (block.kind === 'diagram') {
      stimuli[block.stimulusId] = serializeDiagramBlock(block, anchors);
      return;
    }

    stimuli[block.stimulusId] = serializeImageBlock(block);
  });

  textBlocksByStimulus.forEach((blocks, stimulusId) => {
    stimuli[stimulusId] = serializeTextBlocks(
      blocks,
      readingV2Ids.stimulusId(stimulusId),
      textStimulusTitles.get(stimulusId),
      anchors,
    );
  });

  return { stimulusIds, stimuli };
};

export const serializeReadingV2EditorDocumentToCanonical = (
  editorDocument: ReadingV2EditorDocument,
): ReadingV2Document => {
  const blockingIssues = validateReadingV2EditorDocument(editorDocument)
    .filter((candidate) => candidate.severity === 'error');

  if (blockingIssues[0]) {
    throw new Error(`Cannot serialize invalid Reading V2 editor document: ${blockingIssues[0].message}`);
  }

  const anchors: Record<string, ReadingV2Anchor> = {};
  const stimuli: Record<string, ReadingV2StimulusNode> = {};
  const sections: Record<string, ReadingV2Section> = {};
  const sectionIds = editorDocument.sections.map((section) => section.sectionId);

  editorDocument.sections.forEach((section) => {
    const serialized = serializeSectionBlocks(section, anchors);
    Object.assign(stimuli, serialized.stimuli);
    sections[section.sectionId] = {
      sectionId: section.sectionId,
      title: section.title,
      stimulusIds: serialized.stimulusIds,
      taskGroupIds: section.taskGroupIds,
    };
  });

  const document: ReadingV2Document = {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId: editorDocument.documentId,
    title: editorDocument.title,
    sectionIds,
    sections,
    stimuli,
    anchors,
    taskGroups: copyRecord(editorDocument.taskGroups),
    interactions: copyRecord(editorDocument.interactions),
    optionSets: copyRecord(editorDocument.optionSets),
    validationState: structuredClone(editorDocument.validationState),
  };

  assertValidReadingV2CanonicalDocument(document);
  return document;
};

const anchorIdsForBlock = (block: ReadingV2EditorBlock): readonly ReadingV2AnchorId[] => {
  if (block.kind === 'paragraph' || block.kind === 'heading') {
    return [
      ...(block.anchorId ? [block.anchorId] : []),
      ...inlineBlankAnchorIds(block.segments),
    ];
  }

  if (block.kind === 'list') {
    return block.items.flatMap((item) => [
      ...(item.anchorId ? [item.anchorId] : []),
      ...inlineBlankAnchorIds(item.segments),
    ]);
  }

  if (block.kind === 'table') {
    return block.rows.flatMap((row) => row.cells.flatMap((cell) => anchorIdsForTableCell(cell)));
  }

  if (block.kind === 'flowchart') {
    return block.steps
      .map((step) => step.anchorId)
      .filter((anchorId): anchorId is ReadingV2AnchorId => Boolean(anchorId));
  }

  if (block.kind === 'diagram') {
    return block.targets.map((target) => target.anchorId);
  }

  return [];
};

const addDuplicateIssue = (
  seen: Set<string>,
  value: string,
  issues: ReadingV2EditorValidationIssue[],
  code: ReadingV2EditorValidationIssue['code'],
  label: string,
): void => {
  if (seen.has(value)) {
    issues.push(issue(code, `Duplicate ${label} ${value}.`, value));
    return;
  }

  seen.add(value);
};

const validateBlockInternals = (
  block: ReadingV2EditorBlock,
  issues: ReadingV2EditorValidationIssue[],
): void => {
  if ((block.kind === 'paragraph' || block.kind === 'heading') && LEGACY_MARKER_PATTERN.test(block.text)) {
    issues.push(issue(
      'unsupported-legacy-marker-text',
      `Block ${block.blockId} still contains legacy marker text instead of a durable editor block.`,
      block.blockId,
    ));
  }

  if (block.kind === 'list') {
    block.items.forEach((item) => {
      if (LEGACY_MARKER_PATTERN.test(item.text)) {
        issues.push(issue(
          'unsupported-legacy-marker-text',
          `List item ${item.itemId} still contains legacy marker text instead of a durable editor block.`,
          item.itemId,
        ));
      }
    });
  }

  if (block.kind === 'table') {
    const rowIds = new Set<string>();
    const cellIds = new Set<string>();
    if (block.rows.length === 0 || block.rows.every((row) => row.cells.length === 0)) {
      issues.push(issue(
        'student-visible-structured-mismatch',
        `Table block ${block.blockId} needs at least one visible cell.`,
        block.blockId,
      ));
    }
    block.rows.forEach((row) => {
      addDuplicateIssue(rowIds, row.rowId, issues, 'duplicate-table-row-id', 'table row ID');
      row.cells.forEach((cell) => {
        addDuplicateIssue(cellIds, cell.cellId, issues, 'duplicate-table-cell-id', 'table cell ID');
        if (cell.isBlank === true && anchorIdsForTableCell(cell).length === 0) {
          issues.push(issue(
            'broken-blank-link',
            `Blank table cell ${cell.cellId} needs at least one anchor.`,
            cell.cellId,
          ));
        }
      });
    });
  }

  if (block.kind === 'flowchart') {
    const stepIds = new Set<string>();
    if (block.steps.length === 0) {
      issues.push(issue(
        'empty-flow-step',
        `Flowchart block ${block.blockId} needs at least one visible step.`,
        block.blockId,
      ));
    }
    block.steps.forEach((step) => {
      addDuplicateIssue(stepIds, step.stepId, issues, 'duplicate-flow-step-id', 'flow step ID');
      if (step.text.trim().length === 0) {
        issues.push(issue(
          'empty-flow-step',
          `Flowchart step ${step.stepId} needs visible student text.`,
          step.stepId,
        ));
      }
      if (step.isBlank === true && !step.anchorId) {
        issues.push(issue(
          'broken-blank-link',
          `Blank flowchart step ${step.stepId} needs an anchor.`,
          step.stepId,
        ));
      }
    });
  }

  if (block.kind === 'diagram') {
    const targetIds = new Set<string>();
    const targetAnchorIds = new Set<string>();
    if (!block.imageUrl?.trim()) {
      issues.push(issue(
        'missing-media-source',
        `Diagram block ${block.blockId} needs an image source before it can be student-visible.`,
        block.blockId,
      ));
    }
    if (!block.imageAlt.trim()) {
      issues.push(issue(
        'student-visible-structured-mismatch',
        `Diagram block ${block.blockId} needs student-safe image alt text.`,
        block.blockId,
      ));
    }
    block.targets.forEach((target) => {
      addDuplicateIssue(targetIds, target.targetId, issues, 'duplicate-diagram-target-id', 'diagram target ID');
      addDuplicateIssue(
        targetAnchorIds,
        target.anchorId,
        issues,
        'duplicate-diagram-target-anchor',
        'diagram target anchor',
      );
    });
  }

  if (block.kind === 'image') {
    if (!block.mediaUrl?.trim()) {
      issues.push(issue(
        'missing-media-source',
        `Image block ${block.blockId} needs a media source before it can be student-visible.`,
        block.blockId,
      ));
    }
    if (!block.alt.trim()) {
      issues.push(issue(
        'student-visible-structured-mismatch',
        `Image block ${block.blockId} needs student-safe alt text.`,
        block.blockId,
      ));
    }
  }
};

const blockKindByStimulus = (
  sections: readonly ReadingV2EditorSection[],
): Map<string, ReadingV2EditorBlock['kind']> => {
  const result = new Map<string, ReadingV2EditorBlock['kind']>();

  sections.forEach((section) => {
    section.blocks.forEach((block) => {
      if (!result.has(block.stimulusId)) {
        result.set(block.stimulusId, isTextBlock(block) ? 'paragraph' : block.kind);
      }
    });
  });

  return result;
};

const requiredStructuredBlockKindFor = (
  taskGroup: ReadingV2TaskGroup,
): ReadingV2EditorBlock['kind'] | null => {
  if (taskGroup.officialTaskType === 'table-completion') {
    return 'table';
  }

  if (taskGroup.officialTaskType === 'flowchart-completion') {
    return 'flowchart';
  }

  if (taskGroup.officialTaskType === 'diagram-labeling') {
    return 'diagram';
  }

  return null;
};

const requiredStructuredResponseFor = (
  taskGroup: ReadingV2TaskGroup,
): 'table' | 'flowchart' | 'diagram' | null => {
  if (taskGroup.officialTaskType === 'table-completion') {
    return 'table';
  }

  if (taskGroup.officialTaskType === 'flowchart-completion') {
    return 'flowchart';
  }

  if (taskGroup.officialTaskType === 'diagram-labeling') {
    return 'diagram';
  }

  return null;
};

const validateTaskGroupReferences = (
  document: ReadingV2EditorDocument,
  anchorsByStimulus: Map<string, Set<string>>,
  issues: ReadingV2EditorValidationIssue[],
): void => {
  const blockKinds = blockKindByStimulus(document.sections);

  Object.values(document.taskGroups).forEach((taskGroup) => {
    const requiredKind = requiredStructuredBlockKindFor(taskGroup);
    const requiredResponse = requiredStructuredResponseFor(taskGroup);
    if (requiredKind) {
      const hasStructuredStimulus = taskGroup.stimulusRefs.some((stimulusRef) =>
        blockKinds.get(stimulusRef.stimulusId) === requiredKind,
      );

      if (!hasStructuredStimulus) {
        issues.push(issue(
          'invalid-structured-shell-reference',
          `${taskGroup.taskGroupId} needs a ${requiredKind} editor block reference.`,
          taskGroup.taskGroupId,
        ));
      }
    }

    const taskGroupAnchorScope = new Set<string>();
    taskGroup.stimulusRefs.forEach((stimulusRef) => {
      const stimulusAnchors = anchorsByStimulus.get(stimulusRef.stimulusId);
      if (!stimulusAnchors) {
        issues.push(issue(
          'invalid-structured-shell-reference',
          `${taskGroup.taskGroupId} references missing editor stimulus ${stimulusRef.stimulusId}.`,
          taskGroup.taskGroupId,
        ));
        return;
      }

      (stimulusRef.anchorIds ?? Array.from(stimulusAnchors)).forEach((anchorId) => {
        if (!stimulusAnchors.has(anchorId)) {
          issues.push(issue(
            'orphan-anchor-reference',
            `${taskGroup.taskGroupId} references missing editor anchor ${anchorId}.`,
            anchorId,
          ));
          return;
        }

        taskGroupAnchorScope.add(anchorId);
      });
    });

    taskGroup.interactionIds.forEach((interactionId) => {
      const interaction: ReadingV2Interaction | undefined = document.interactions[interactionId];
      if (!interaction) {
        issues.push(issue(
          'orphan-anchor-reference',
          `${taskGroup.taskGroupId} references missing interaction ${interactionId}.`,
          interactionId,
        ));
        return;
      }

      if (requiredResponse) {
        if (interaction.responseShape.kind !== 'structured-entry' || interaction.responseShape.structure !== requiredResponse) {
          issues.push(issue(
            'broken-structured-answer-binding',
            `Interaction ${interactionId} needs a ${requiredResponse} structured answer binding.`,
            interactionId,
          ));
        }

        if (!interaction.primaryAnchorId) {
          issues.push(issue(
            'broken-structured-answer-binding',
            `Interaction ${interactionId} needs a primary structured anchor.`,
            interactionId,
          ));
        }
      }

      [
        interaction.primaryAnchorId,
        ...(interaction.contextAnchorIds ?? []),
      ].filter((anchorId): anchorId is ReadingV2AnchorId => Boolean(anchorId))
        .forEach((anchorId) => {
          if (!taskGroupAnchorScope.has(anchorId)) {
            issues.push(issue(
              'orphan-anchor-reference',
              `Interaction ${interactionId} references anchor ${anchorId} outside editor task-group scope.`,
              interactionId,
            ));
          }
        });
    });
  });
};

export const validateReadingV2EditorDocument = (
  document: ReadingV2EditorDocument,
): readonly ReadingV2EditorValidationIssue[] => {
  const issues: ReadingV2EditorValidationIssue[] = [];
  const sectionIds = new Set<string>();
  const blockIds = new Set<string>();
  const anchorIds = new Set<string>();
  const structuredStimulusIds = new Set<string>();
  const anchorsByStimulus = new Map<string, Set<string>>();

  document.sections.forEach((section) => {
    addDuplicateIssue(sectionIds, section.sectionId, issues, 'duplicate-section-id', 'section ID');

    section.blocks.forEach((block) => {
      addDuplicateIssue(blockIds, block.blockId, issues, 'duplicate-block-id', 'block ID');
      validateBlockInternals(block, issues);

      if (!isTextBlock(block)) {
        addDuplicateIssue(
          structuredStimulusIds,
          block.stimulusId,
          issues,
          'duplicate-stimulus-id',
          'structured stimulus ID',
        );
      }

      const stimulusAnchorScope = anchorsByStimulus.get(block.stimulusId) ?? new Set<string>();
      anchorIdsForBlock(block).forEach((anchorId) => {
        addDuplicateIssue(anchorIds, anchorId, issues, 'duplicate-anchor-id', 'anchor ID');
        stimulusAnchorScope.add(anchorId);
      });
      anchorsByStimulus.set(block.stimulusId, stimulusAnchorScope);
    });
  });

  validateTaskGroupReferences(document, anchorsByStimulus, issues);
  return issues;
};

export const assertValidReadingV2EditorDocument = (
  document: ReadingV2EditorDocument,
): void => {
  const blockingIssue = validateReadingV2EditorDocument(document)
    .find((candidate) => candidate.severity === 'error');

  if (blockingIssue) {
    throw new Error(blockingIssue.message);
  }
};

export const editorIssuesAsCanonicalIssues = (
  issues: readonly ReadingV2EditorValidationIssue[],
): readonly ReadingV2ValidationIssue[] =>
  issues.map((candidate) => ({
    code: candidate.code,
    severity: candidate.severity,
    message: candidate.message,
    objectId: candidate.objectId,
  }));
