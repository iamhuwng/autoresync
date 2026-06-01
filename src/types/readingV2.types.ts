// Reading V2 type boundary: V1 Reading files are reference-only. These contracts accept explicit
// Reading V2 canonical, packaging, or projection shapes; legacy conversions must live in edge adapters.
import { READING_V2_ENGINE } from '../config/readingV2FeatureFlags';
import type {
  ReadingV2CanonicalTaskType,
  ReadingV2EngineeringFamily,
} from './readingV2Taxonomy';
import type {
  MaterialTestTypeId,
  ReadingPassageVisibilityScope,
} from './materialCatalog.types';

export const READING_V2_SCHEMA_VERSION = 1;

export type ReadingV2SchemaVersion = typeof READING_V2_SCHEMA_VERSION;

declare const readingV2IdBrand: unique symbol;

export type ReadingV2Id<K extends string> = string & {
  readonly [readingV2IdBrand]: K;
};

export type ReadingV2DocumentId = ReadingV2Id<'documentId'>;
export type ReadingV2SectionId = ReadingV2Id<'sectionId'>;
export type ReadingV2StimulusId = ReadingV2Id<'stimulusId'>;
export type ReadingV2TaskGroupId = ReadingV2Id<'taskGroupId'>;
export type ReadingV2InteractionId = ReadingV2Id<'interactionId'>;
export type ReadingV2AnchorId = ReadingV2Id<'anchorId'>;
export type ReadingV2OptionSetId = ReadingV2Id<'optionSetId'>;
export type ReadingV2ImportEvidenceId = ReadingV2Id<'importEvidenceId'>;
export type ReadingV2PassageAssetId = ReadingV2Id<'passageAssetId'>;
export type ReadingV2MaterialId = ReadingV2Id<'materialId'>;
export type ReadingV2FullTestId = ReadingV2Id<'fullTestId'>;
export type ReadingV2ReadingPassageMaterialId = ReadingV2Id<'readingPassageMaterialId'>;
export type ReadingV2FullTestCompositionId = ReadingV2Id<'fullTestCompositionId'>;
export type ReadingV2PassageRefId = ReadingV2Id<'passageRefId'>;
export type ReadingV2SnapshotVersionId = ReadingV2Id<'snapshotVersionId'>;
export type ReadingV2ResultId = ReadingV2Id<'resultId'>;
export type ReadingV2AttemptId = ReadingV2Id<'attemptId'>;
export type ReadingV2DraftId = ReadingV2Id<'draftId'>;

const asReadingV2Id =
  <K extends string>() =>
  (value: string): ReadingV2Id<K> => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new Error('Reading V2 IDs must be non-empty strings.');
    }

    return trimmed as ReadingV2Id<K>;
  };

export const readingV2Ids = {
  documentId: asReadingV2Id<'documentId'>(),
  sectionId: asReadingV2Id<'sectionId'>(),
  stimulusId: asReadingV2Id<'stimulusId'>(),
  taskGroupId: asReadingV2Id<'taskGroupId'>(),
  interactionId: asReadingV2Id<'interactionId'>(),
  anchorId: asReadingV2Id<'anchorId'>(),
  optionSetId: asReadingV2Id<'optionSetId'>(),
  importEvidenceId: asReadingV2Id<'importEvidenceId'>(),
  passageAssetId: asReadingV2Id<'passageAssetId'>(),
  materialId: asReadingV2Id<'materialId'>(),
  fullTestId: asReadingV2Id<'fullTestId'>(),
  readingPassageMaterialId: asReadingV2Id<'readingPassageMaterialId'>(),
  fullTestCompositionId: asReadingV2Id<'fullTestCompositionId'>(),
  passageRefId: asReadingV2Id<'passageRefId'>(),
  snapshotVersionId: asReadingV2Id<'snapshotVersionId'>(),
  resultId: asReadingV2Id<'resultId'>(),
  attemptId: asReadingV2Id<'attemptId'>(),
  draftId: asReadingV2Id<'draftId'>(),
} as const;

export type ReadingV2Plane = 'canonical' | 'packaging' | 'projection';

export interface ReadingV2PlaneMarker<P extends ReadingV2Plane> {
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly plane: P;
  readonly schemaVersion: ReadingV2SchemaVersion;
}

export type ReadingV2ValidationSeverity = 'info' | 'warning' | 'error';

export type ReadingV2PublishBlockCode =
  | 'orphan-interaction'
  | 'orphan-anchor-reference'
  | 'unresolved-draft-placeholder'
  | 'missing-scoring-response-shape'
  | 'duplicate-numbering'
  | 'unsupported-import-structure'
  | 'unresolved-import-uncertainty'
  | 'missing-primary-stimulus-reference'
  | 'deleted-stimulus-or-anchor-reference'
  | 'invalid-packaged-material-assembly';

export interface ReadingV2ValidationIssue {
  readonly code: ReadingV2PublishBlockCode | string;
  readonly severity: ReadingV2ValidationSeverity;
  readonly message: string;
  readonly objectId?: string;
}

export interface ReadingV2ValidationState {
  readonly issues: readonly ReadingV2ValidationIssue[];
}

export type ReadingV2AnchorKind =
  | 'paragraph'
  | 'inline-blank'
  | 'table-cell'
  | 'flow-step'
  | 'diagram-hotspot'
  | 'annotation';

export type ReadingV2StimulusKind =
  | 'passage'
  | 'table-shell'
  | 'flowchart-shell'
  | 'diagram-shell'
  | 'media'
  | 'summary-shell'
  | 'note-shell';

export interface ReadingV2Anchor {
  readonly anchorId: ReadingV2AnchorId;
  readonly stimulusId: ReadingV2StimulusId;
  readonly kind: ReadingV2AnchorKind;
  readonly label?: string;
}

export interface ReadingV2PassageParagraph {
  readonly anchorId?: ReadingV2AnchorId;
  readonly label?: string;
  readonly text: string;
  readonly blockKind?: 'paragraph' | 'heading' | 'list-item';
  readonly headingLevel?: 1 | 2 | 3;
  readonly listKind?: 'ordered' | 'bullet';
  readonly itemId?: string;
}

export interface ReadingV2TableCellContent {
  readonly cellId?: string;
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorIds?: readonly ReadingV2AnchorId[];
  readonly text: string;
  readonly role?: 'header' | 'body';
  readonly isBlank?: boolean;
  readonly rowSpan?: number;
  readonly colSpan?: number;
  readonly splitSourceCells?: readonly ReadingV2TableSplitSourceCellContent[];
}

export interface ReadingV2TableSplitSourceCellContent {
  readonly anchorId?: ReadingV2AnchorId;
  readonly anchorIds?: readonly ReadingV2AnchorId[];
  readonly text: string;
  readonly role?: 'header' | 'body';
  readonly isBlank?: boolean;
}

export interface ReadingV2FlowchartStepContent {
  readonly anchorId?: ReadingV2AnchorId;
  readonly stepId: string;
  readonly text: string;
  readonly nextStepIds?: readonly string[];
}

export interface ReadingV2DiagramHotspotContent {
  readonly anchorId: ReadingV2AnchorId;
  readonly label: string;
  readonly xPercent: number;
  readonly yPercent: number;
}

export type ReadingV2StimulusContent =
  | {
      readonly kind: 'passage-content';
      readonly paragraphs: readonly ReadingV2PassageParagraph[];
    }
  | {
      readonly kind: 'table-content';
      readonly rows: readonly (readonly ReadingV2TableCellContent[])[];
    }
  | {
      readonly kind: 'flowchart-content';
      readonly steps: readonly ReadingV2FlowchartStepContent[];
    }
  | {
      readonly kind: 'diagram-content';
      readonly imageAlt: string;
      readonly imageUrl?: string;
      readonly hotspots: readonly ReadingV2DiagramHotspotContent[];
    }
  | {
      readonly kind: 'media-content';
      readonly mediaUrl?: string;
      readonly alt: string;
      readonly caption?: string;
      readonly source?: string;
    };

export interface ReadingV2StimulusNode {
  readonly stimulusId: ReadingV2StimulusId;
  readonly kind: ReadingV2StimulusKind;
  readonly title?: string;
  readonly content: ReadingV2StimulusContent;
  readonly anchorIds: readonly ReadingV2AnchorId[];
}

export interface ReadingV2InstructionBlock {
  readonly id: string;
  readonly text: string;
}

export type ReadingV2ResponseShape =
  | { readonly kind: 'free-text'; readonly wordLimit?: number }
  | { readonly kind: 'single-choice'; readonly optionSetId: ReadingV2OptionSetId }
  | {
      readonly kind: 'multi-select';
      readonly optionSetId: ReadingV2OptionSetId;
      readonly selectionLimit: number;
    }
  | { readonly kind: 'binary-judgement'; readonly vocabulary: 'TFNG' | 'YNNG' }
  | {
      readonly kind: 'matching';
      readonly optionSetId: ReadingV2OptionSetId;
      readonly optionReuse: 'allowed' | 'disallowed';
    }
  | {
      readonly kind: 'structured-entry';
      readonly structure: 'table' | 'flowchart' | 'diagram';
    };

export interface ReadingV2ScoringRule {
  readonly maxScore: number;
  readonly acceptableAnswers?: readonly string[];
  readonly caseSensitive?: boolean;
  readonly punctuationSensitive?: boolean;
  readonly orderMatters?: boolean;
}

export interface ReadingV2ReviewLabel {
  readonly displayNumber?: number;
  readonly localLabel?: string;
}

export interface ReadingV2Interaction {
  readonly interactionId: ReadingV2InteractionId;
  readonly taskGroupId: ReadingV2TaskGroupId;
  readonly responseShape: ReadingV2ResponseShape;
  readonly scoringRule: ReadingV2ScoringRule;
  readonly reviewLabel: ReadingV2ReviewLabel;
  readonly promptText?: string;
  readonly primaryAnchorId?: ReadingV2AnchorId;
  readonly contextAnchorIds?: readonly ReadingV2AnchorId[];
  readonly placeholder?: boolean;
}

export interface ReadingV2Option {
  readonly optionId: string;
  readonly label: string;
  readonly text: string;
}

export interface ReadingV2OptionSet {
  readonly optionSetId: ReadingV2OptionSetId;
  readonly taskGroupId: ReadingV2TaskGroupId;
  readonly options: readonly ReadingV2Option[];
}

export interface ReadingV2AnswerRule {
  readonly responseShape: ReadingV2ResponseShape;
  readonly wordLimit?: number;
  readonly optionReuse?: 'allowed' | 'disallowed';
  readonly casing?: 'ignored' | 'sensitive';
  readonly punctuation?: 'ignored' | 'sensitive';
}

export interface ReadingV2StimulusRef {
  readonly stimulusId: ReadingV2StimulusId;
  readonly anchorIds?: readonly ReadingV2AnchorId[];
}

export interface ReadingV2TaskGroup {
  readonly taskGroupId: ReadingV2TaskGroupId;
  readonly sectionId: ReadingV2SectionId;
  readonly officialTaskType: ReadingV2CanonicalTaskType;
  readonly engineeringFamily: ReadingV2EngineeringFamily;
  readonly groupTitle?: string;
  readonly instructionBlocks: readonly ReadingV2InstructionBlock[];
  readonly answerRule: ReadingV2AnswerRule;
  readonly stimulusRefs: readonly ReadingV2StimulusRef[];
  readonly optionSetRefs: readonly ReadingV2OptionSetId[];
  readonly interactionIds: readonly ReadingV2InteractionId[];
  readonly layoutHint?: string;
  readonly validationState: ReadingV2ValidationState;
  readonly importEvidenceRefs?: readonly ReadingV2ImportEvidenceId[];
}

export interface ReadingV2Section {
  readonly sectionId: ReadingV2SectionId;
  readonly title: string;
  readonly stimulusIds: readonly ReadingV2StimulusId[];
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
}

export interface ReadingV2Document
  extends ReadingV2PlaneMarker<'canonical'> {
  readonly documentId: ReadingV2DocumentId;
  readonly title: string;
  readonly sectionIds: readonly ReadingV2SectionId[];
  readonly sections: Readonly<Record<string, ReadingV2Section>>;
  readonly stimuli: Readonly<Record<string, ReadingV2StimulusNode>>;
  readonly anchors: Readonly<Record<string, ReadingV2Anchor>>;
  readonly taskGroups: Readonly<Record<string, ReadingV2TaskGroup>>;
  readonly interactions: Readonly<Record<string, ReadingV2Interaction>>;
  readonly optionSets: Readonly<Record<string, ReadingV2OptionSet>>;
  readonly validationState: ReadingV2ValidationState;
}

export type ReadingV2DraftState =
  | 'draft'
  | 'needs-review'
  | 'ready-to-publish'
  | 'superseded'
  | 'discarded';

export interface ReadingV2DraftRecord {
  readonly draftId: ReadingV2DraftId;
  readonly ownerId: string;
  readonly materialId?: ReadingV2MaterialId;
  readonly document: ReadingV2Document;
  readonly studioMetadata?: Readonly<Record<string, unknown>>;
  readonly revisionToken: string;
  readonly state: ReadingV2DraftState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingV2ProvenanceRecord {
  readonly sourceTestId?: string;
  readonly sourceMaterialId?: string;
  readonly sourceSnapshotVersionId?: string;
  readonly sourcePassageAssetId?: ReadingV2PassageAssetId;
  readonly sourcePassageAssetVersion?: string;
  readonly sourceTaskGroupIds?: readonly ReadingV2TaskGroupId[];
  readonly extractedBy?: string;
  readonly extractedAt?: string;
  readonly extractionMethod?: 'manual' | 'import' | 'duplicate';
}

export type ReadingV2GovernanceState = 'draft' | 'published' | 'archived' | 'retired';

export type ReadingV2ReuseAdvisory = 'reusable' | 'reuse-with-caution' | 'do-not-reuse';

export type ReadingV2SourceOrderKind = 'numeric' | 'label' | 'unknown';

export interface ReadingV2SourceOrderSnapshot {
  readonly kind: ReadingV2SourceOrderKind;
  readonly value: number | string | null;
  readonly labelSnapshot: string;
  readonly displaySnapshot: string;
}

export type ReadingV2SensitiveRuleLocation =
  | 'canonical'
  | 'published-snapshot'
  | 'review-projection';

export interface ReadingV2ReadingPassageMaterial
  extends ReadingV2PlaneMarker<'canonical'> {
  readonly passageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly ownerId: string;
  readonly visibility: ReadingPassageVisibilityScope;
  readonly state: ReadingV2GovernanceState;
  readonly currentSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly title: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly stimulusId: ReadingV2StimulusId;
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
  readonly interactionIds: readonly ReadingV2InteractionId[];
  readonly answerKeyLocation: ReadingV2SensitiveRuleLocation;
  readonly scoringRuleLocation: ReadingV2SensitiveRuleLocation;
  readonly sourceFullTestId?: ReadingV2FullTestId;
  readonly sourceSnapshotVersionId?: ReadingV2SnapshotVersionId;
  readonly sourceOrder: ReadingV2SourceOrderSnapshot;
  readonly sourceQuestionRange?: string;
  readonly sourceTitleSnapshot?: string;
  readonly durationMinutes?: number;
  readonly provenance?: ReadingV2ProvenanceRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingV2PassageAsset {
  readonly passageAssetId: ReadingV2PassageAssetId;
  readonly ownerId: string;
  readonly state: ReadingV2GovernanceState;
  readonly reuseAdvisory?: ReadingV2ReuseAdvisory;
  readonly currentVersionId: string;
}

export interface ReadingV2PassageAssetVersion {
  readonly passageAssetId: ReadingV2PassageAssetId;
  readonly versionId: string;
  readonly title: string;
  readonly content: ReadingV2StimulusContent;
  readonly source?: string;
  readonly rights?: string;
  readonly topic?: string;
  readonly wordCount?: number;
  readonly paragraphAnchorIds: readonly ReadingV2AnchorId[];
  readonly provenance?: ReadingV2ProvenanceRecord;
}

export interface ReadingV2WhereUsedEntry {
  readonly passageAssetId: ReadingV2PassageAssetId;
  readonly ownerId: string;
  readonly consumerId: string;
  readonly consumerKind: 'draft-material' | 'task-group-material' | 'full-test' | 'archived-material';
}

export interface ReadingV2TaskGroupMaterial
  extends ReadingV2PlaneMarker<'packaging'> {
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly state: ReadingV2GovernanceState;
  readonly primaryPassageAssetVersionId: string;
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
  readonly provenance?: ReadingV2ProvenanceRecord;
}

export interface ReadingV2FullTest extends ReadingV2PlaneMarker<'packaging'> {
  readonly fullTestId: ReadingV2FullTestId;
  readonly ownerId: string;
  readonly state: ReadingV2GovernanceState;
  readonly materialIds: readonly ReadingV2MaterialId[];
}

export interface ReadingV2PassageRef {
  readonly refId: ReadingV2PassageRefId;
  readonly passageMaterialId: ReadingV2ReadingPassageMaterialId;
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly order: number;
  readonly sourcePassageNumber?: number | null;
  readonly sourceOrderLabelSnapshot: string;
  readonly sourceOrderDisplaySnapshot: string;
  readonly titleSnapshot: string;
  readonly questionRangeSnapshot?: string;
  readonly questionCountSnapshot: number;
  readonly durationSnapshot?: number;
  readonly testTypeIdsSnapshot: readonly MaterialTestTypeId[];
}

export interface ReadingV2FullTestComposition
  extends ReadingV2PlaneMarker<'packaging'> {
  readonly compositionId: ReadingV2FullTestCompositionId;
  readonly testMaterialId: ReadingV2MaterialId;
  readonly title: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly skill: string;
  readonly passageRefs: readonly ReadingV2PassageRef[];
  readonly questionCount: number;
  readonly durationMinutes?: number;
  readonly visibility: ReadingPassageVisibilityScope;
  readonly ownerId: string;
  readonly publishedVersionId: ReadingV2SnapshotVersionId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingV2PublishedSnapshot {
  readonly snapshotVersionId: ReadingV2SnapshotVersionId;
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

export type ReadingV2ProjectionKind =
  | 'preview'
  | 'student-safe'
  | 'session-safe'
  | 'review'
  | 'analytics';

export interface ReadingV2ProjectionPayload
  extends ReadingV2PlaneMarker<'projection'> {
  readonly ownerId: string;
  readonly projectionKind: ReadingV2ProjectionKind;
  readonly sourceSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly generatedAt: string;
}

export interface ReadingV2AttemptContext {
  readonly mode:
    | 'preview'
    | 'solo-practice'
    | 'homework'
    | 'course-material'
    | 'public-library'
    | 'live-session';
  readonly sessionCode?: string;
  readonly homeworkId?: string;
  readonly courseId?: string;
  readonly classId?: string;
  readonly assignmentId?: string;
  readonly sourceName?: string;
  readonly materialId?: ReadingV2MaterialId;
}

export interface ReadingV2Attempt {
  readonly attemptId: ReadingV2AttemptId;
  readonly studentId: string;
  readonly sourceSnapshotVersionId: ReadingV2SnapshotVersionId;
  readonly context: ReadingV2AttemptContext;
  readonly answers: Readonly<Record<string, unknown>>;
}

export interface ReadingV2ResultInteraction {
  readonly interactionId: ReadingV2InteractionId;
  readonly taskGroupId: ReadingV2TaskGroupId;
  readonly displayNumber: number;
  readonly taskFamily: ReadingV2EngineeringFamily;
  readonly officialTaskType: ReadingV2CanonicalTaskType;
  readonly studentAnswer: unknown;
  readonly scoredAnswer: unknown;
  readonly score: number;
  readonly maxScore: number;
  readonly reviewState: 'pending' | 'released' | 'withheld';
  readonly anchorRef?: ReadingV2AnchorId;
}

export interface ReadingV2Result {
  readonly resultId: ReadingV2ResultId;
  readonly testId: string;
  readonly studentId: string;
  readonly ownerId: string;
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly publishedSnapshotVersion: ReadingV2SnapshotVersionId;
  readonly attemptContext: ReadingV2AttemptContext;
  readonly submittedAt: string;
  readonly interactions: readonly ReadingV2ResultInteraction[];
}

export interface ReadingV2ReleasePolicyView {
  readonly resultId: ReadingV2ResultId;
  readonly visibleToStudent: boolean;
  readonly interactions: readonly ReadingV2ResultInteraction[];
}

export interface ReadingV2RegradeArtifact {
  readonly resultId: ReadingV2ResultId;
  readonly regradeId: string;
  readonly originalScore: number;
  readonly reviewedScore: number;
  readonly changedBy: string;
  readonly changedAt: string;
  readonly reason: string;
}
