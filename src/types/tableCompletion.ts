export type TableCellRole = 'title' | 'column-header' | 'row-header' | 'body' | 'note';

export type TableContentSegment =
  | { kind: 'text'; text: string }
  | { kind: 'blank-anchor'; anchorId: string };

export interface TableColumnDef {
  columnId: string;
  order: number;
}

export interface TableRowDef {
  rowId: string;
  order: number;
  cellIds: string[];
}

export interface TableCellDef {
  cellId: string;
  rowId: string;
  columnId: string;
  rowSpan: number;
  colSpan: number;
  role: TableCellRole;
  segments: TableContentSegment[];
}

export interface TableBlankBreadcrumb {
  rowHeaders: string[];
  columnHeaders: string[];
}

export interface TableBlankConstraints {
  maxWords?: number;
  includesNumber?: boolean;
}

export interface TableBlankDef {
  blankId: string;
  questionNumber: number;
  anchorId: string;
  cellId: string;
  canonicalOrder: number;
  sourceQuestionText?: string;
  acceptedAnswers: string[];
  constraints: TableBlankConstraints;
  breadcrumb: TableBlankBreadcrumb;
}

export type StudentSafeTableBlankDef = Omit<
  TableBlankDef,
  'acceptedAnswers' | 'sourceQuestionText'
>;

export interface TableCompletionSharedContent {
  instructionText: string;
  answerRuleText: string;
  constraints: TableBlankConstraints;
  caption?: string;
}

export type TableCompletionSourceWorkflow = 'in-app-parse' | 'script-material';

export type TableCompletionParseMode = 'deterministic' | 'ai-assisted' | 'unresolved';

export type TableCompletionSourceOutcome =
  | 'deterministic-table'
  | 'degraded-table-source'
  | 'missing-table-source';

export type TableCompletionSourceShape =
  | 'html-table'
  | 'markdown-table'
  | 'tsv'
  | 'aligned-text'
  | 'ai-structured'
  | 'legacy-table-headers-transport';

export type TableCompletionSourceKind =
  | 'html-table'
  | 'markdown-table'
  | 'tsv'
  | 'aligned-text'
  | 'ai-structured'
  | 'legacy-section-headers'
  | 'legacy-options-headers'
  | 'none';

export type TableCompletionFallbackKind =
  | 'none'
  | 'ai-structured'
  | 'legacy-section-headers'
  | 'legacy-options-headers';

export type TableCompletionLossFlag =
  | 'title-row-lost'
  | 'header-band-lost'
  | 'caption-lost'
  | 'span-flattening'
  | 'row-removal'
  | 'blank-anchor-loss'
  | 'deterministic-source-ignored'
  | 'table-instruction-without-usable-table';

export interface TableGroupProvenance {
  sourceWorkflow: TableCompletionSourceWorkflow;
  sourceOutcome?: TableCompletionSourceOutcome;
  sourceShape: TableCompletionSourceShape;
  sourceKind?: TableCompletionSourceKind;
  fallbackKind?: TableCompletionFallbackKind;
  lossFlags?: TableCompletionLossFlag[];
  rawExcerpt: string;
  normalizationVersion: number;
  confidence: number;
  warnings: string[];
  canonicalRevisionHash: string;
}

export interface StudentSafeTableGroupProvenance {
  canonicalRevisionHash: string;
}

export type TableCompletionValidationSeverity =
  | 'none'
  | 'blocking'
  | 'acknowledgement-required'
  | 'informational';

export type TableCompletionUnsupportedRepairState =
  | 'none'
  | 'acknowledgement-required'
  | 're-run-or-reclassify-required';

export interface TableCompletionIssueDiagnostic {
  code: string;
  severity: Exclude<TableCompletionValidationSeverity, 'none'>;
  message: string;
  questionNumber?: number;
  blankId?: string;
  cellId?: string;
}

export interface TableCompletionDiagnostic {
  groupId: string;
  questionRange: { start: number; end: number };
  parseMode: TableCompletionParseMode;
  sourceWorkflow: TableCompletionSourceWorkflow;
  sourceOutcome?: TableCompletionSourceOutcome;
  sourceShape: TableCompletionSourceShape;
  sourceKind?: TableCompletionSourceKind;
  fallbackKind?: TableCompletionFallbackKind;
  lossFlags?: TableCompletionLossFlag[];
  validationSeverity: TableCompletionValidationSeverity;
  issueCodes: string[];
  issues: TableCompletionIssueDiagnostic[];
  unsupportedRepairState: TableCompletionUnsupportedRepairState;
  missingSemanticBreadcrumbs: boolean;
  canonicalRevisionHash?: string;
  hasCanonicalGroup: boolean;
}

export interface TableCompletionGroupV1 {
  schemaVersion: 1;
  groupId: string;
  taskType: 'table-completion';
  passageId: string;
  questionRange: { start: number; end: number };
  sharedContent: TableCompletionSharedContent;
  columns: TableColumnDef[];
  rows: TableRowDef[];
  cells: TableCellDef[];
  blanks: TableBlankDef[];
  provenance: TableGroupProvenance;
  canonicalReadingOrder: string[];
  visualOrderConflict?: boolean;
}

export type StudentSafeTableCompletionGroupV1 =
  Omit<TableCompletionGroupV1, 'provenance' | 'blanks'> & {
    blanks: StudentSafeTableBlankDef[];
    provenance?: StudentSafeTableGroupProvenance;
  };

export type CanonicalQuestionGroup = TableCompletionGroupV1;

export type QuestionGroupsField = TableCompletionGroupV1[];

export type TableCompletionDiagnosticsField = TableCompletionDiagnostic[];

export interface TableCompletionQuestionLinkFields {
  groupId: string;
  blankId: string;
  anchorId: string;
  groupTaskType: 'table-completion';
  sectionInstructionId: string;
  tableGroupSchemaVersion: number;
}

export interface TableCompletionGroupAcknowledgement {
  acknowledgedIssueCodes: string[];
  acknowledgedCanonicalRevisionHash: string;
}

export type GroupAcknowledgementsField = Record<string, TableCompletionGroupAcknowledgement>;

export const TABLE_COMPLETION_SCHEMA_VERSION = 1;

export const isSupportedTableCompletionSchemaVersion = (
  schemaVersion: number,
): schemaVersion is typeof TABLE_COMPLETION_SCHEMA_VERSION =>
  schemaVersion === TABLE_COMPLETION_SCHEMA_VERSION;

export const assertSupportedTableCompletionGroupSchema = (
  group: { schemaVersion: number; groupId?: string },
): void => {
  if (!isSupportedTableCompletionSchemaVersion(group.schemaVersion)) {
    const groupLabel = group.groupId ? `group "${group.groupId}"` : 'table-completion group';
    throw new Error(
      `Unsupported table-completion schemaVersion ${group.schemaVersion} for ${groupLabel}.`,
    );
  }
};
