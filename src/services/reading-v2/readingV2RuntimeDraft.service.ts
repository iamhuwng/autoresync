export type ReadingV2RuntimeDraftAnswerValue = string | readonly string[];

export const READING_V2_RUNTIME_DRAFT_SCHEMA_VERSION = 1;

export interface ReadingV2RuntimeDraftHighlight {
  readonly id: string;
  readonly text: string;
  readonly color: string;
  readonly stimulusId: string;
  readonly paragraphAnchorId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface ReadingV2RuntimeDraft {
  readonly schemaVersion: typeof READING_V2_RUNTIME_DRAFT_SCHEMA_VERSION;
  readonly projectionId: string;
  readonly sourceSnapshotVersionId: string;
  readonly answers: Readonly<Record<string, ReadingV2RuntimeDraftAnswerValue>>;
  readonly highlights: readonly ReadingV2RuntimeDraftHighlight[];
  readonly startedAt?: number | null;
  readonly activeSectionId?: string | null;
  readonly activeTaskGroupId?: string | null;
  readonly activeInteractionId?: string | null;
  readonly updatedAt: number;
}

export const buildReadingV2RuntimeDraftKey = (input: {
  readonly studentId?: string;
  readonly materialId?: string;
  readonly projectionId: string;
}): string => `reading-v2:practice:${input.studentId ?? 'anonymous'}:${input.materialId ?? 'unknown'}:${input.projectionId}`;

export const isReadingV2RuntimeAnswerMap = (
  value: unknown,
): value is Readonly<Record<string, ReadingV2RuntimeDraftAnswerValue>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const reservedKeys = new Set(['schemaVersion', 'projectionId', 'sourceSnapshotVersionId', 'highlights', 'updatedAt']);
  return Object.entries(record).every(([key, entry]) => {
    if (reservedKeys.has(key)) {
      return false;
    }
    return typeof entry === 'string'
      || (Array.isArray(entry) && entry.every((item) => typeof item === 'string'));
  });
};

export const isReadingV2RuntimeDraft = (value: unknown): value is ReadingV2RuntimeDraft => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<ReadingV2RuntimeDraft>;
  return record.schemaVersion === READING_V2_RUNTIME_DRAFT_SCHEMA_VERSION
    && typeof record.projectionId === 'string'
    && typeof record.sourceSnapshotVersionId === 'string'
    && Boolean(record.answers && typeof record.answers === 'object' && !Array.isArray(record.answers))
    && Array.isArray(record.highlights)
    && typeof record.updatedAt === 'number';
};
