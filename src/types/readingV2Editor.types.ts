import type {
  ReadingV2AnchorId,
  ReadingV2AnchorKind,
  ReadingV2DocumentId,
  ReadingV2Interaction,
  ReadingV2ImportEvidenceId,
  ReadingV2OptionSet,
  ReadingV2SectionId,
  ReadingV2StimulusId,
  ReadingV2TaskGroup,
  ReadingV2TaskGroupId,
  ReadingV2ValidationIssue,
  ReadingV2ValidationState,
} from './readingV2.types';

declare const readingV2EditorIdBrand: unique symbol;

export type ReadingV2EditorId<K extends string> = string & {
  readonly [readingV2EditorIdBrand]: K;
};

export type ReadingV2EditorBlockId = ReadingV2EditorId<'editorBlockId'>;
export type ReadingV2EditorRowId = ReadingV2EditorId<'editorRowId'>;
export type ReadingV2EditorCellId = ReadingV2EditorId<'editorCellId'>;
export type ReadingV2EditorStepId = ReadingV2EditorId<'editorStepId'>;
export type ReadingV2EditorTargetId = ReadingV2EditorId<'editorTargetId'>;
export type ReadingV2EditorMediaId = ReadingV2EditorId<'editorMediaId'>;

export type ReadingV2EditorInlineMark = 'bold' | 'italic' | 'underline';

export interface ReadingV2EditorInlineTextSegment {
  readonly kind: 'text';
  readonly text: string;
  readonly marks?: readonly ReadingV2EditorInlineMark[];
}

export interface ReadingV2EditorInlineBlank {
  readonly kind: 'blank';
  readonly anchorId: ReadingV2AnchorId;
  readonly label?: string;
  readonly marks?: readonly ReadingV2EditorInlineMark[];
}

export type ReadingV2EditorInlineSegment =
  | ReadingV2EditorInlineTextSegment
  | ReadingV2EditorInlineBlank;

export interface ReadingV2EditorAnchorReference {
  readonly anchorId: ReadingV2AnchorId;
  readonly anchorKind: ReadingV2AnchorKind;
  readonly label?: string;
}

export interface ReadingV2EditorTextBlockBase {
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly stimulusTitle?: string;
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorKind?: ReadingV2AnchorKind;
  readonly anchorLabel?: string;
  readonly label?: string;
  readonly text: string;
  readonly segments?: readonly ReadingV2EditorInlineSegment[];
}

export interface ReadingV2EditorParagraphBlock extends ReadingV2EditorTextBlockBase {
  readonly kind: 'paragraph';
}

export interface ReadingV2EditorHeadingBlock extends ReadingV2EditorTextBlockBase {
  readonly kind: 'heading';
  readonly level: 1 | 2 | 3;
}

export interface ReadingV2EditorListItem {
  readonly itemId: string;
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorLabel?: string;
  readonly label?: string;
  readonly text: string;
  readonly segments?: readonly ReadingV2EditorInlineSegment[];
}

export interface ReadingV2EditorListBlock {
  readonly kind: 'list';
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly stimulusTitle?: string;
  readonly listKind: 'ordered' | 'bullet';
  readonly label?: string;
  readonly items: readonly ReadingV2EditorListItem[];
}

export interface ReadingV2EditorTableCell {
  readonly cellId: ReadingV2EditorCellId;
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorIds?: readonly ReadingV2AnchorId[];
  readonly anchorLabel?: string;
  readonly text: string;
  readonly role?: 'header' | 'body';
  readonly isBlank?: boolean;
  readonly rowSpan?: number;
  readonly colSpan?: number;
}

export interface ReadingV2EditorTableRow {
  readonly rowId: ReadingV2EditorRowId;
  readonly cells: readonly ReadingV2EditorTableCell[];
}

export interface ReadingV2EditorTableBlock {
  readonly kind: 'table';
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly title?: string;
  readonly rows: readonly ReadingV2EditorTableRow[];
}

export interface ReadingV2EditorImageBlock {
  readonly kind: 'image';
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly mediaId?: ReadingV2EditorMediaId;
  readonly title?: string;
  readonly mediaUrl?: string;
  readonly alt: string;
  readonly caption?: string;
  readonly source?: string;
}

export interface ReadingV2EditorDiagramTarget {
  readonly targetId: ReadingV2EditorTargetId;
  readonly anchorId: ReadingV2AnchorId;
  readonly anchorLabel?: string;
  readonly label: string;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly displayNumber?: number;
}

export interface ReadingV2EditorDiagramBlock {
  readonly kind: 'diagram';
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly title?: string;
  readonly imageUrl?: string;
  readonly imageAlt: string;
  readonly targets: readonly ReadingV2EditorDiagramTarget[];
}

export interface ReadingV2EditorFlowchartStep {
  readonly stepId: ReadingV2EditorStepId;
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorLabel?: string;
  readonly text: string;
  readonly isBlank?: boolean;
  readonly nextStepIds?: readonly ReadingV2EditorStepId[];
}

export interface ReadingV2EditorFlowchartBlock {
  readonly kind: 'flowchart';
  readonly blockId: ReadingV2EditorBlockId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly title?: string;
  readonly steps: readonly ReadingV2EditorFlowchartStep[];
}

export type ReadingV2EditorBlock =
  | ReadingV2EditorParagraphBlock
  | ReadingV2EditorHeadingBlock
  | ReadingV2EditorListBlock
  | ReadingV2EditorTableBlock
  | ReadingV2EditorImageBlock
  | ReadingV2EditorDiagramBlock
  | ReadingV2EditorFlowchartBlock;

export interface ReadingV2EditorSection {
  readonly sectionId: ReadingV2SectionId;
  readonly title: string;
  readonly blocks: readonly ReadingV2EditorBlock[];
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
}

export interface ReadingV2EditorDocument {
  readonly documentId: ReadingV2DocumentId;
  readonly title: string;
  readonly sections: readonly ReadingV2EditorSection[];
  readonly importEvidenceIds?: readonly ReadingV2ImportEvidenceId[];
  readonly taskGroups: Readonly<Record<string, ReadingV2TaskGroup>>;
  readonly interactions: Readonly<Record<string, ReadingV2Interaction>>;
  readonly optionSets: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly validationState: ReadingV2ValidationState;
}

export type ReadingV2EditorValidationCode =
  | 'duplicate-block-id'
  | 'duplicate-section-id'
  | 'duplicate-stimulus-id'
  | 'duplicate-anchor-id'
  | 'duplicate-table-row-id'
  | 'duplicate-table-cell-id'
  | 'duplicate-flow-step-id'
  | 'duplicate-diagram-target-id'
  | 'broken-blank-link'
  | 'missing-media-source'
  | 'empty-flow-step'
  | 'duplicate-diagram-target-anchor'
  | 'broken-structured-answer-binding'
  | 'student-visible-structured-mismatch'
  | 'orphan-anchor-reference'
  | 'invalid-structured-shell-reference'
  | 'unsupported-legacy-marker-text';

export interface ReadingV2EditorValidationIssue extends ReadingV2ValidationIssue {
  readonly code: ReadingV2EditorValidationCode | ReadingV2ValidationIssue['code'];
}
