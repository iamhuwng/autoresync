// Reading V2 Studio workflow boundary: bridges Studio UI actions to V2 services.
// It accepts canonical Reading V2 draft state only; legacy Reading payloads remain outside this boundary.
import {
  READING_V2_ENGINE,
  READING_V2_PRODUCT_LABEL,
} from '../../config/readingV2FeatureFlags';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2DraftId,
  type ReadingV2DraftRecord,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2TaskGroupId,
} from '../../types/readingV2.types';
import type {
  MaterialTestTypeConfig,
  MaterialTestTypeId,
  ReadingPassageVisibilityScope,
} from '../../types/materialCatalog.types';
import {
  createReadingV2DefaultImportCandidate,
  normalizeReadingV2ImportCandidate,
  type ReadingV2ImportCandidate,
} from './readingV2ImportNormalization.service';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { validateReadingV2Draft } from './readingV2Validation.service';
import {
  commitReadingV2PublishPlanToFirebase,
  type ReadingV2FirebasePublishCommitResult,
} from './readingV2FirebasePublishAdapter.service';
import { extractReadingV2TaskGroupMaterialDraft } from './readingV2PassageAssetWorkflow.service';
import {
  generateReadingV2PreviewOnly,
  publishReadingV2Material,
  type ReadingV2AutoSplitDuplicateWarning,
} from './readingV2PublishPipeline.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import type {
  ReadingV2MaterialKind,
  ReadingV2MaterialMetadata,
} from './readingV2MaterialMetadata.service';

export type ReadingV2StudioWorkflowMode =
  | 'create-blank'
  | 'create-from-import'
  | 'create-from-auto'
  | 'resume-draft'
  | 'revise-published'
  | 'duplicate-material'
  | 'extract-task-group-material';

export interface ReadingV2StudioWorkflowMetadata {
  readonly title: string;
  readonly productMarker: string;
  readonly materialKind: ReadingV2MaterialKind;
  readonly durationMinutes: number;
  readonly difficulty: string;
  readonly targetBand: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly visibility: 'private' | 'library-eligible' | 'assigned-only';
  readonly ownerId: string;
  readonly provenanceSummary: string;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
}

export interface ReadingV2StudioWorkflowContext {
  readonly status: 'ready' | 'missing' | 'invalid';
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly draftId: ReadingV2DraftId;
  readonly materialId: ReadingV2MaterialId;
  readonly document: ReadingV2Document;
  readonly metadata: ReadingV2StudioWorkflowMetadata;
  readonly revisionToken: string;
  readonly importCandidate?: ReadingV2ImportCandidate;
  readonly message?: string;
}

export interface ReadingV2StudioWorkflowSnapshot {
  readonly draftId: string;
  readonly materialId?: string;
  readonly document: ReadingV2Document;
  readonly metadata: ReadingV2StudioWorkflowMetadata;
  readonly revisionToken: string;
  readonly returnContext?: string;
}

export interface ReadingV2StudioSaveResult {
  readonly draft: ReadingV2DraftRecord;
}

export interface ReadingV2StudioReloadLatestResult {
  readonly draft: ReadingV2DraftRecord;
}

export interface ReadingV2StudioDuplicateDraftResult {
  readonly draft: ReadingV2DraftRecord;
}

export interface ReadingV2StudioDiffResult {
  readonly latestRevisionToken?: string;
  readonly changedTitle: boolean;
  readonly changedValidationIssueCount: boolean;
}

export interface ReadingV2StudioExtractionRequest {
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
  readonly materialKind: 'task-group-material' | 'extracted-task-group-material';
}

export interface ReadingV2StudioExtractionResult {
  readonly draft: ReadingV2DraftRecord;
}

export interface ReadingV2StudioPublishResult {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: string;
  readonly projectionCount: number;
  readonly relationshipWriteCount: number;
  readonly firebaseCommitStatus: ReadingV2FirebasePublishCommitResult['status'];
  readonly firebaseCommitPath: string;
  readonly firebaseOperationCount: number;
  readonly duplicateWarnings: readonly ReadingV2AutoSplitDuplicateWarning[];
}

export type ReadingV2StudioPublishCommitAdapter = (
  commitPlan: Parameters<typeof commitReadingV2PublishPlanToFirebase>[0],
) => Promise<ReadingV2FirebasePublishCommitResult>;

export const readingV2StudioRepository = createReadingV2Repository();

const nowId = (): string => Date.now().toString(36);

export const createReadingV2StudioDefaultMetadata = (
  overrides: Partial<ReadingV2StudioWorkflowMetadata> = {},
): ReadingV2StudioWorkflowMetadata => ({
  title: overrides.title ?? '',
  productMarker: overrides.productMarker ?? READING_V2_PRODUCT_LABEL,
  materialKind: overrides.materialKind ?? 'full-test',
  durationMinutes: overrides.durationMinutes ?? 60,
  difficulty: overrides.difficulty ?? 'intermediate',
  targetBand: overrides.targetBand ?? 'Band 6-7',
  description: overrides.description ?? '',
  tags: overrides.tags ?? [],
  visibility: overrides.visibility ?? 'private',
  ownerId: overrides.ownerId ?? 'current-teacher',
  provenanceSummary: overrides.provenanceSummary ?? 'Original Reading V2 draft',
  primaryTestTypeId: overrides.primaryTestTypeId,
  testTypeIds: overrides.testTypeIds,
  testTypeConfigs: overrides.testTypeConfigs,
});

const toStudioMetadataRecord = (
  metadata: ReadingV2StudioWorkflowMetadata,
): Readonly<Record<string, unknown>> => ({
  ...metadata,
  tags: [...metadata.tags],
  testTypeIds: metadata.testTypeIds ? [...metadata.testTypeIds] : undefined,
  testTypeConfigs: metadata.testTypeConfigs ? [...metadata.testTypeConfigs] : undefined,
});

const toReadingV2StudioMaterialKind = (
  materialKind: ReadingV2MaterialMetadata['materialKind'] | undefined,
): ReadingV2StudioWorkflowMetadata['materialKind'] | undefined => {
  if (materialKind) {
    return materialKind;
  }

  return undefined;
};

const shouldExtractReadingPassagesOnPublish = (
  metadata: ReadingV2StudioWorkflowMetadata,
): boolean =>
  metadata.materialKind === 'full-test';

const toReadingPassageExtractionVisibility = (
  visibility: ReadingV2StudioWorkflowMetadata['visibility'],
): ReadingPassageVisibilityScope =>
  visibility === 'library-eligible' ? 'public' : 'private';

const createDocument = (title?: string): ReadingV2Document => {
  const documentId = readingV2Ids.documentId(`draft-${nowId()}`);
  const sectionId = readingV2Ids.sectionId(`${documentId}-passage-1`);
  const stimulusId = readingV2Ids.stimulusId(`${documentId}-passage-1-content`);
  const anchorId = readingV2Ids.anchorId(`${documentId}-passage-1-paragraph-1`);

  return {
    deliveryEngine: READING_V2_ENGINE,
    plane: 'canonical',
    schemaVersion: READING_V2_SCHEMA_VERSION,
    documentId,
    title: title && title.trim().length > 0 ? title : '',
    sectionIds: [sectionId],
    sections: {
      [sectionId]: {
        sectionId,
        title: '',
        stimulusIds: [stimulusId],
        taskGroupIds: [],
      },
    },
    stimuli: {
      [stimulusId]: {
        stimulusId,
        kind: 'passage',
        title: '',
        content: {
          kind: 'passage-content',
          paragraphs: [
            {
              anchorId,
              label: 'Paragraph 1',
              text: '',
            },
          ],
        },
        anchorIds: [anchorId],
      },
    },
    anchors: {
      [anchorId]: {
        anchorId,
        stimulusId,
        kind: 'paragraph',
        label: 'Paragraph 1',
      },
    },
    taskGroups: {},
    interactions: {},
    optionSets: {},
    validationState: { issues: [] },
  };
};

const createImportPendingDocument = (title?: string): ReadingV2Document => ({
  ...createDocument(title && title.trim().length > 0 ? title : 'Imported Reading V2 draft'),
  validationState: {
    issues: [
      {
        code: 'unresolved-import-uncertainty',
        severity: 'error',
        message: 'Accept or repair the import candidate before preview or publish.',
        objectId: 'create-from-import',
      },
    ],
  },
});

const createInvalidContext = (input: {
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly draftId: ReadingV2DraftId;
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly title: string;
  readonly message: string;
  readonly provenanceSummary: string;
}): ReadingV2StudioWorkflowContext => ({
  status: 'invalid',
  mode: input.mode,
  draftId: input.draftId,
  materialId: input.materialId,
  document: createDocument(input.title),
  metadata: createReadingV2StudioDefaultMetadata({
    title: input.title,
    ownerId: input.ownerId,
    provenanceSummary: input.provenanceSummary,
  }),
  revisionToken: 'invalid-draft',
  message: input.message,
});

const isImportCreateMode = (mode: ReadingV2StudioWorkflowMode): boolean =>
  mode === 'create-from-import' || mode === 'create-from-auto';

const NON_EDITABLE_IMPORT_ISSUE_CODES = new Set([
  'duplicate-stimulus-anchor',
]);

const createInvalidImportCandidateContext = (input: {
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly draftId: ReadingV2DraftId;
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly title?: string;
  readonly issueMessages: readonly string[];
}): ReadingV2StudioWorkflowContext =>
  createInvalidContext({
    mode: input.mode,
    draftId: input.draftId,
    materialId: input.materialId,
    ownerId: input.ownerId,
    title: input.title && input.title.trim().length > 0
      ? input.title
      : 'Auto import needs review',
    message: [
      'Auto import needs review before Studio can open.',
      ...input.issueMessages,
    ].join(' '),
    provenanceSummary: 'Auto import candidate rejected before Studio draft hydration because canonical anchor validation failed',
  });

const createDraftContext = (input: {
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly draftId: ReadingV2DraftId;
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly title?: string;
  readonly initialMetadata?: Partial<ReadingV2StudioWorkflowMetadata>;
  readonly initialImportCandidate?: ReadingV2ImportCandidate;
  readonly provenanceSummary?: string;
}): ReadingV2StudioWorkflowContext => {
  const importCreateMode = isImportCreateMode(input.mode);
  const document = importCreateMode
    ? input.initialImportCandidate
      ? (() => {
          const importedDocument = normalizeReadingV2ImportCandidate(input.initialImportCandidate).document;
          return {
            ...importedDocument,
            title: input.initialMetadata?.title ?? importedDocument.title,
          };
        })()
      : createImportPendingDocument(input.initialMetadata?.title)
    : createDocument(input.initialMetadata?.title ?? input.title);
  const existing = readingV2StudioRepository.loadDraft(input.draftId);

  if (!existing && importCreateMode && input.initialImportCandidate) {
    const validation = validateReadingV2Draft(document);
    const nonEditableImportIssues = validation.blockingIssues.filter((issue) =>
      NON_EDITABLE_IMPORT_ISSUE_CODES.has(issue.code),
    );

    if (nonEditableImportIssues.length > 0) {
      return createInvalidImportCandidateContext({
        mode: input.mode,
        draftId: input.draftId,
        materialId: input.materialId,
        ownerId: input.ownerId,
        title: input.initialMetadata?.title ?? document.title,
        issueMessages: nonEditableImportIssues.map((issue) =>
          `${issue.code.replace(/-/g, ' ')}: ${issue.message}`,
        ),
      });
    }
  }

  const draft = existing ?? readingV2StudioRepository.createDraft({
    draftId: input.draftId,
    ownerId: input.ownerId,
    materialId: input.materialId,
    document,
    studioMetadata: toStudioMetadataRecord(createReadingV2StudioDefaultMetadata({
      ...input.initialMetadata,
      title: document.title,
      ownerId: input.initialMetadata?.ownerId ?? input.ownerId,
      provenanceSummary: input.initialMetadata?.provenanceSummary ?? input.provenanceSummary,
    })),
  });
  const storedMetadata = draft.studioMetadata as Partial<ReadingV2StudioWorkflowMetadata> | undefined;

  return {
    status: 'ready',
    mode: input.mode,
    draftId: draft.draftId,
    materialId: input.materialId,
    document: draft.document,
    metadata: createReadingV2StudioDefaultMetadata({
      ...input.initialMetadata,
      ...storedMetadata,
      title: storedMetadata?.title ?? input.initialMetadata?.title ?? draft.document.title,
      ownerId: storedMetadata?.ownerId ?? input.initialMetadata?.ownerId ?? input.ownerId,
      provenanceSummary:
        storedMetadata?.provenanceSummary ??
        input.initialMetadata?.provenanceSummary ??
        input.provenanceSummary,
    }),
    revisionToken: draft.revisionToken,
    importCandidate: importCreateMode
      ? input.initialImportCandidate ?? createReadingV2DefaultImportCandidate()
      : undefined,
    message: importCreateMode
      ? input.initialImportCandidate
        ? input.mode === 'create-from-auto'
          ? 'Auto-generated Reading V2 draft is ready in Studio. Review and repair before publishing.'
          : 'Imported text is ready in Studio. Review and repair before publishing.'
        : 'Import candidate is ready for review and normalization.'
      : undefined,
  };
};

const loadLatestPublishedSnapshotForMaterial = (materialId: ReadingV2MaterialId) =>
  Array.from(readingV2StudioRepository.store.publishedSnapshots.values())
    .filter((snapshot) => snapshot.materialId === materialId)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0] ?? null;

export const resolveReadingV2StudioWorkflowContext = (input: {
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly draftId?: string;
  readonly materialId?: string;
  readonly ownerId?: string;
  readonly initialMetadata?: Partial<ReadingV2StudioWorkflowMetadata>;
  readonly initialImportCandidate?: ReadingV2ImportCandidate;
  readonly sourceSnapshot?: ReadingV2PublishedSnapshot | null;
  readonly sourceMetadata?: ReadingV2MaterialMetadata | null;
  readonly deferPublishedRevisionFallback?: boolean;
}): ReadingV2StudioWorkflowContext => {
  const ownerId = input.ownerId ?? 'current-teacher';
  const draftId = readingV2Ids.draftId(
    input.draftId ?? `studio-${input.mode}-${nowId()}`,
  );
  const materialId = readingV2Ids.materialId(
    input.materialId ?? `studio-material-${nowId()}`,
  );

  if (input.mode === 'resume-draft' && input.draftId) {
    const existing = readingV2StudioRepository.loadDraft(draftId);
    if (!existing) {
      return {
        status: 'missing',
        mode: input.mode,
        draftId,
        materialId,
        document: createDocument(`Missing draft ${input.draftId}`),
        metadata: createReadingV2StudioDefaultMetadata({
          title: `Missing draft ${input.draftId}`,
          ownerId,
          provenanceSummary: 'Missing draft route failed closed without hydrating editable source truth',
        }),
        revisionToken: 'missing-draft',
        message: `No persisted draft was found for ${input.draftId}.`,
      };
    }

    if (existing.ownerId !== ownerId) {
      return createInvalidContext({
        mode: input.mode,
        draftId,
        materialId,
        ownerId,
        title: `Unauthorized draft ${input.draftId}`,
        message: `Draft ${input.draftId} is not owned by ${ownerId}.`,
        provenanceSummary: 'Unauthorized draft route failed closed without hydrating editable source truth',
      });
    }

    if (existing.state === 'discarded') {
      return createInvalidContext({
        mode: input.mode,
        draftId,
        materialId,
        ownerId,
        title: `Deleted draft ${input.draftId}`,
        message: `Draft ${input.draftId} was discarded and cannot be resumed.`,
        provenanceSummary: 'Discarded draft route failed closed without hydrating editable source truth',
      });
    }

    try {
      assertValidReadingV2CanonicalDocument(existing.document);
    } catch (error) {
      return createInvalidContext({
        mode: input.mode,
        draftId,
        materialId,
        ownerId,
        title: `Invalid draft ${input.draftId}`,
        message: error instanceof Error ? error.message : `Draft ${input.draftId} is malformed.`,
        provenanceSummary: 'Malformed or unsupported-schema draft failed closed before Studio hydration',
      });
    }
  }

  if (input.mode === 'revise-published') {
    const latestSnapshot = input.sourceSnapshot ?? loadLatestPublishedSnapshotForMaterial(materialId);

    if (latestSnapshot) {
      if (!readingV2StudioRepository.loadPublishedSnapshot(latestSnapshot.materialId, latestSnapshot.snapshotVersionId)) {
        readingV2StudioRepository.publishSnapshot({
          materialId: latestSnapshot.materialId,
          snapshotVersionId: latestSnapshot.snapshotVersionId,
          ownerId: latestSnapshot.ownerId,
          document: latestSnapshot.document,
          publishedBy: latestSnapshot.publishedBy,
          publishedAt: latestSnapshot.publishedAt,
        });
      }
      const existingRevisionDraft = readingV2StudioRepository.loadDraft(draftId);
      const draft = existingRevisionDraft ?? readingV2StudioRepository.createDraft({
        draftId,
        ownerId,
        materialId,
        document: latestSnapshot.document,
        studioMetadata: toStudioMetadataRecord(createReadingV2StudioDefaultMetadata({
          title: input.sourceMetadata?.title ?? latestSnapshot.document.title,
          ownerId,
          materialKind: toReadingV2StudioMaterialKind(input.sourceMetadata?.materialKind),
          durationMinutes: input.sourceMetadata?.durationMinutes,
          difficulty: input.sourceMetadata?.difficulty,
          targetBand: input.sourceMetadata?.targetBand,
          description: input.sourceMetadata?.description,
          tags: input.sourceMetadata?.tags,
          visibility: input.sourceMetadata?.visibility,
          primaryTestTypeId: input.sourceMetadata?.primaryTestTypeId,
          testTypeIds: input.sourceMetadata?.testTypeIds,
          provenanceSummary: `Revision draft from published snapshot ${latestSnapshot.snapshotVersionId}; live snapshot remains immutable`,
        })),
      });
      const storedMetadata = draft.studioMetadata as Partial<ReadingV2StudioWorkflowMetadata> | undefined;

      return {
        status: 'ready',
        mode: input.mode,
        draftId: draft.draftId,
        materialId,
        document: draft.document,
        metadata: createReadingV2StudioDefaultMetadata({
          ...storedMetadata,
          title: storedMetadata?.title ?? draft.document.title,
          ownerId,
          provenanceSummary:
            storedMetadata?.provenanceSummary ??
            `Revision draft from published snapshot ${latestSnapshot.snapshotVersionId}; live snapshot remains immutable`,
        }),
        revisionToken: draft.revisionToken,
        message: `Loaded published snapshot ${latestSnapshot.snapshotVersionId} into an editable draft revision.`,
      };
    }

    if (input.deferPublishedRevisionFallback) {
      return {
        status: 'missing',
        mode: input.mode,
        draftId,
        materialId,
        document: createDocument(`Loading ${materialId}`),
        metadata: createReadingV2StudioDefaultMetadata({
          title: `Loading ${materialId}`,
          ownerId,
          provenanceSummary: 'Waiting for published snapshot hydration before opening an editable revision',
        }),
        revisionToken: 'loading-published-revision',
        message: `Loading published Reading V2 material ${materialId}.`,
      };
    }
  }

  return createDraftContext({
    mode: input.mode,
    draftId,
    materialId,
    ownerId,
    initialMetadata: input.initialMetadata,
    initialImportCandidate: input.initialImportCandidate,
    title: input.mode === 'revise-published' ? `Revision for ${materialId}` : undefined,
    provenanceSummary:
      input.mode === 'revise-published'
        ? 'Published edit opens a draft revision; live snapshot remains active until republish'
        : undefined,
  });
};

export const saveReadingV2StudioDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
): ReadingV2StudioSaveResult => {
  const draftId = readingV2Ids.draftId(snapshot.draftId);
  const existing = readingV2StudioRepository.loadDraft(draftId);

  if (!existing) {
    const draft = readingV2StudioRepository.createDraft({
      draftId,
      ownerId: snapshot.metadata.ownerId,
      materialId: snapshot.materialId ? readingV2Ids.materialId(snapshot.materialId) : undefined,
      document: snapshot.document,
      studioMetadata: snapshot.metadata as unknown as Readonly<Record<string, unknown>>,
    });
    return { draft };
  }

  return {
    draft: readingV2StudioRepository.saveDraft({
      draftId,
      baseRevisionToken: snapshot.revisionToken,
      document: snapshot.document,
      studioMetadata: snapshot.metadata as unknown as Readonly<Record<string, unknown>>,
      state: 'draft',
    }),
  };
};

export const reloadLatestReadingV2StudioDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
): ReadingV2StudioReloadLatestResult => {
  const draft = readingV2StudioRepository.loadDraft(readingV2Ids.draftId(snapshot.draftId));

  if (!draft) {
    throw new Error(`Cannot reload missing Reading V2 draft ${snapshot.draftId}.`);
  }

  return { draft };
};

export const duplicateReadingV2StudioDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
): ReadingV2StudioDuplicateDraftResult => {
  const draftId = readingV2Ids.draftId(`${snapshot.draftId}-duplicate-${nowId()}`);
  const draft = readingV2StudioRepository.createDraft({
    draftId,
    ownerId: snapshot.metadata.ownerId,
    materialId: snapshot.materialId ? readingV2Ids.materialId(snapshot.materialId) : undefined,
    document: snapshot.document,
  });

  return { draft };
};

export const compareLatestReadingV2StudioDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
): ReadingV2StudioDiffResult => {
  const latest = readingV2StudioRepository.loadDraft(readingV2Ids.draftId(snapshot.draftId));

  if (!latest) {
    return {
      changedTitle: true,
      changedValidationIssueCount: true,
    };
  }

  return {
    latestRevisionToken: latest.revisionToken,
    changedTitle: latest.document.title !== snapshot.document.title,
    changedValidationIssueCount:
      latest.document.validationState.issues.length !== snapshot.document.validationState.issues.length,
  };
};

export const extractReadingV2StudioTaskGroupDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  request: ReadingV2StudioExtractionRequest,
): ReadingV2StudioExtractionResult => {
  if (request.taskGroupIds.length === 0) {
    throw new Error('Reading V2 Studio extraction requires at least one task group.');
  }

  const sourceMaterialId = readingV2Ids.materialId(snapshot.materialId ?? `studio-source-${nowId()}`);
  const newMaterialId = readingV2Ids.materialId(`${sourceMaterialId}-extract-${nowId()}`);
  const draft = extractReadingV2TaskGroupMaterialDraft(readingV2StudioRepository, {
    sourceDocument: snapshot.document,
    taskGroupIds: request.taskGroupIds,
    sourceMaterialId,
    sourcePassageAssetId: readingV2Ids.passageAssetId(`${sourceMaterialId}-passage-asset`),
    sourcePassageAssetVersion: 'studio-current-draft',
    newDraftId: `${newMaterialId}-draft`,
    newMaterialId,
    ownerId: snapshot.metadata.ownerId,
    extractedBy: snapshot.metadata.ownerId,
  });

  return { draft };
};

export const previewReadingV2StudioDraft = (
  snapshot: ReadingV2StudioWorkflowSnapshot,
): ReadingV2DerivedProjection =>
  generateReadingV2PreviewOnly({
    draftId: snapshot.draftId,
    ownerId: snapshot.metadata.ownerId,
    document: snapshot.document,
  }).projection;

export const publishReadingV2StudioDraft = async (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  commitAdapter: ReadingV2StudioPublishCommitAdapter = commitReadingV2PublishPlanToFirebase,
): Promise<ReadingV2StudioPublishResult> => {
  const materialId = readingV2Ids.materialId(
    snapshot.materialId ?? `studio-material-${nowId()}`,
  );
  const result = publishReadingV2Material({
    repository: readingV2StudioRepository,
    materialId,
    ownerId: snapshot.metadata.ownerId,
    document: {
      ...snapshot.document,
      title: snapshot.metadata.title || snapshot.document.title,
      deliveryEngine: READING_V2_ENGINE,
    },
    publishedBy: snapshot.metadata.ownerId,
    metadata: {
      title: snapshot.metadata.title || snapshot.document.title,
      materialKind: snapshot.metadata.materialKind,
      visibility: snapshot.metadata.visibility,
      durationMinutes: snapshot.metadata.durationMinutes,
      difficulty: snapshot.metadata.difficulty,
      targetBand: snapshot.metadata.targetBand,
      description: snapshot.metadata.description,
      tags: snapshot.metadata.tags,
      primaryTestTypeId: snapshot.metadata.primaryTestTypeId,
      testTypeIds: snapshot.metadata.testTypeIds,
      testTypeConfigs: snapshot.metadata.testTypeConfigs,
    },
    readingPassageExtraction: shouldExtractReadingPassagesOnPublish(snapshot.metadata)
      ? {
          primaryTestTypeId: snapshot.metadata.primaryTestTypeId,
          testTypeIds: snapshot.metadata.testTypeIds,
          testTypeConfigs: snapshot.metadata.testTypeConfigs,
          visibility: toReadingPassageExtractionVisibility(snapshot.metadata.visibility),
          durationMinutes: snapshot.metadata.durationMinutes,
        }
      : undefined,
    returnContext: snapshot.returnContext ?? 'studio',
  });
  const firebaseCommit = await commitAdapter(result.commitPlan);

  return {
    materialId,
    snapshotVersionId: result.snapshotVersionId,
    projectionCount: result.projections.length,
    relationshipWriteCount: result.relationshipIndexWrites.length,
    firebaseCommitStatus: firebaseCommit.status,
    firebaseCommitPath: firebaseCommit.commitPath,
    firebaseOperationCount: firebaseCommit.operationKeys.length,
    duplicateWarnings: result.duplicateWarnings,
  };
};
