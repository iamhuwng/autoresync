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
  type ReadingV2AuthoringPublicationBase,
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
  resolveReadingV2ImportReview,
  type ReadingV2ImportCandidate,
} from './readingV2ImportNormalization.service';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { normalizeReadingV2MultipleSelectSlots } from './readingV2MultipleSelectNormalization.service';
import { validateReadingV2Draft } from './readingV2Validation.service';
import {
  commitReadingV2PublishPlanToFirebase,
  type ReadingV2FirebasePublishCommitResult,
} from './readingV2FirebasePublishAdapter.service';
import { extractReadingV2TaskGroupMaterialDraft } from './readingV2PassageAssetWorkflow.service';
import {
  generateReadingV2PreviewOnly,
  publishReadingV2Material,
  commitReadingV2PublishPlanToRepository,
  type ReadingV2AutoSplitDuplicateWarning,
} from './readingV2PublishPipeline.service';
import { createReadingV2Repository } from './readingV2Repository.service';
import { createFirebaseReadingV2DraftRepository, readingV2DraftContentEquals } from './readingV2DraftFirebaseRepository.service';
import {
  createReadingV2AuthoringSourceRecord,
  createReadingV2ImportAuthoringContext,
  createReadingV2ManualAuthoringContext,
  evaluateReadingV2AuthoringReadiness,
  type ReadingV2AuthoringSourceRecord,
} from './readingV2AuthoringQuality.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import {
  canonicalizeReadingV2MaterialVisibility,
  isReadingV2PublicVisibility,
  type ReadingV2MaterialVisibility,
} from './readingV2MaterialMetadata.service';
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

export interface ReadingV2StudioActor {
  readonly uid: string;
  readonly role: 'teacher' | 'super_admin';
}

export interface ReadingV2StudioWorkflowOrigin {
  readonly mode: ReadingV2StudioWorkflowMode;
  readonly sourceMaterialId?: string;
  readonly sourceSnapshotVersionId?: string;
  readonly publicationBase?: ReadingV2AuthoringPublicationBase;
}

export interface ReadingV2StudioWorkflowMetadata {
  readonly title: string;
  readonly productMarker: string;
  readonly materialKind: ReadingV2MaterialKind;
  readonly durationMinutes: number;
  readonly difficulty: string;
  readonly targetBand: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly visibility: ReadingV2MaterialVisibility;
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
  readonly revision: number;
  readonly workflowOrigin: ReadingV2StudioWorkflowOrigin;
  readonly authoringContext?: ReadingV2DraftRecord['authoringContext'];
  readonly resolvedSourceEvidence?: readonly ReadingV2AuthoringSourceRecord[];
  readonly importCandidate?: ReadingV2ImportCandidate;
  readonly message?: string;
}

export interface ReadingV2StudioWorkflowSnapshot {
  readonly draftId: string;
  readonly materialId?: string;
  readonly document: ReadingV2Document;
  readonly metadata: ReadingV2StudioWorkflowMetadata;
  readonly revision: number;
  readonly workflowOrigin?: ReadingV2StudioWorkflowOrigin;
  readonly authoringContext?: ReadingV2DraftRecord['authoringContext'];
  readonly returnContext?: string;
}

export interface ReadingV2StudioSaveResult {
  readonly draft: ReadingV2DraftRecord;
}

export interface ReadingV2StudioReloadLatestResult {
  readonly draft: ReadingV2DraftRecord;
  readonly resolvedSourceEvidence: readonly ReadingV2AuthoringSourceRecord[];
}

export interface ReadingV2StudioDuplicateDraftResult {
  readonly draft: ReadingV2DraftRecord;
  readonly resolvedSourceEvidence: readonly ReadingV2AuthoringSourceRecord[];
}

export interface ReadingV2StudioExtractionRequest {
  readonly taskGroupIds: readonly ReadingV2TaskGroupId[];
  readonly materialKind: 'task-group-material' | 'extracted-task-group-material';
}

export interface ReadingV2StudioExtractionResult {
  readonly draft: ReadingV2DraftRecord;
  readonly resolvedSourceEvidence: readonly ReadingV2AuthoringSourceRecord[];
}

export interface ReadingV2StudioPublishResult {
  readonly materialId: ReadingV2MaterialId;
  readonly snapshotVersionId: string;
  readonly publicationBase: ReadingV2AuthoringPublicationBase;
  readonly projectionCount: number;
  readonly relationshipWriteCount: number;
  readonly firebaseCommitStatus: ReadingV2FirebasePublishCommitResult['status'];
  readonly firebaseCommitPath: string;
  readonly firebaseOperationCount: number;
  readonly duplicateWarnings: readonly ReadingV2AutoSplitDuplicateWarning[];
  readonly generatedReadingPassages: readonly {
    readonly materialId: ReadingV2MaterialId;
    readonly snapshotVersionId: string;
    readonly title: string;
  }[];
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
  visibility: canonicalizeReadingV2MaterialVisibility(overrides.visibility),
  ownerId: overrides.ownerId ?? '',
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

const importMaterialKindFromSourceCategory = (
  candidate: ReadingV2ImportCandidate | undefined,
): ReadingV2MaterialKind | undefined =>
  candidate?.sourceLedgerCategory === 'single-passage-or-partial-extract'
    ? 'reading-passage'
    : undefined;

const toReadingPassageExtractionVisibility = (
  visibility: ReadingV2StudioWorkflowMetadata['visibility'],
): ReadingPassageVisibilityScope =>
  isReadingV2PublicVisibility(visibility) ? 'public' : 'private';

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
  revision: 0,
  workflowOrigin: { mode: input.mode },
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
  const inferredImportMaterialKind = input.initialMetadata?.materialKind
    ?? importMaterialKindFromSourceCategory(input.initialImportCandidate);
  const initialMetadata = inferredImportMaterialKind
    ? { ...input.initialMetadata, materialKind: inferredImportMaterialKind }
    : input.initialMetadata;
  const document = importCreateMode
    ? input.initialImportCandidate
      ? (() => {
          const importedDocument = normalizeReadingV2ImportCandidate(input.initialImportCandidate).document;
          const resolvedDocument = input.mode === 'create-from-auto'
            ? resolveReadingV2ImportReview(importedDocument)
            : importedDocument;
          return {
            ...resolvedDocument,
            title: initialMetadata?.title ?? resolvedDocument.title,
          };
        })()
      : createImportPendingDocument(initialMetadata?.title)
    : createDocument(initialMetadata?.title ?? input.title);
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
        title: initialMetadata?.title ?? document.title,
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
      ...initialMetadata,
      title: document.title,
      ownerId: initialMetadata?.ownerId ?? input.ownerId,
      provenanceSummary: initialMetadata?.provenanceSummary ?? input.provenanceSummary,
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
      ...initialMetadata,
      ...storedMetadata,
      title: storedMetadata?.title ?? initialMetadata?.title ?? draft.document.title,
      ownerId: storedMetadata?.ownerId ?? initialMetadata?.ownerId ?? input.ownerId,
      provenanceSummary:
        storedMetadata?.provenanceSummary ??
        initialMetadata?.provenanceSummary ??
        input.provenanceSummary,
    }),
    revision: draft.revision,
    workflowOrigin: { mode: input.mode },
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
  const ownerId = input.ownerId ?? '';
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
        revision: 0,
        workflowOrigin: { mode: input.mode },
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
      const revisionOwnerId = input.sourceMetadata?.ownerId ?? latestSnapshot.ownerId ?? ownerId;
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
        ownerId: revisionOwnerId,
        materialId,
        document: normalizeReadingV2MultipleSelectSlots(latestSnapshot.document),
        studioMetadata: toStudioMetadataRecord(createReadingV2StudioDefaultMetadata({
          title: input.sourceMetadata?.title ?? latestSnapshot.document.title,
          ownerId: revisionOwnerId,
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
          ownerId: revisionOwnerId,
          provenanceSummary:
            storedMetadata?.provenanceSummary ??
            `Revision draft from published snapshot ${latestSnapshot.snapshotVersionId}; live snapshot remains immutable`,
        }),
        revision: draft.revision,
        workflowOrigin: { mode: input.mode, sourceMaterialId: materialId, sourceSnapshotVersionId: latestSnapshot.snapshotVersionId },
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
        revision: 0,
        workflowOrigin: { mode: input.mode },
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

export const studioContextFromDraft = (
  draft: ReadingV2DraftRecord,
  fallbackMode: ReadingV2StudioWorkflowMode = 'resume-draft',
): ReadingV2StudioWorkflowContext => {
  const workflowOrigin = (draft.workflowOrigin ?? { mode: fallbackMode }) as ReadingV2StudioWorkflowOrigin;
  return {
    status: draft.state === 'discarded' ? 'invalid' : 'ready',
    mode: workflowOrigin.mode,
    draftId: draft.draftId,
    materialId: draft.materialId ?? readingV2Ids.materialId(`material-${draft.draftId}`),
    document: draft.document,
    metadata: createReadingV2StudioDefaultMetadata({ ...draft.studioMetadata, ownerId: draft.ownerId }),
    revision: draft.revision,
    authoringContext: draft.authoringContext,
    workflowOrigin,
    message: draft.state === 'discarded' ? 'This draft was discarded and cannot be resumed.' : undefined,
  };
};

const draftRepositoryFor = (actor: ReadingV2StudioActor) => {
  if (!actor.uid || !['teacher', 'super_admin'].includes(actor.role)) {
    throw new Error('An authenticated teacher is required to edit Reading V2 drafts.');
  }
  return createFirebaseReadingV2DraftRepository({ actorId: actor.uid, role: actor.role });
};

const loadSourceEvidence = async (
  context: ReadingV2DraftRecord['authoringContext'],
  actor: ReadingV2StudioActor,
): Promise<readonly ReadingV2AuthoringSourceRecord[]> => {
  const sourceIds = new Set(context?.requirements.map((item) => item.sourceId) ?? []);
  if (context?.origin.kind === 'import') sourceIds.add(context.origin.sourceId);
  const repository = draftRepositoryFor(actor);
  return Promise.all([...sourceIds].map(async (sourceId) => {
    const source = await repository.loadSource(sourceId);
    if (!source) throw new Error('The supplied source for this draft is unavailable. Your draft is retained.');
    return source;
  }));
};

const assertSnapshotActor = (snapshot: ReadingV2StudioWorkflowSnapshot, actor: ReadingV2StudioActor) => {
  if (snapshot.metadata.ownerId !== actor.uid && actor.role !== 'super_admin') {
    throw new Error('This draft belongs to another teacher.');
  }
};

export const openReadingV2StudioDraft = async (
  input: Parameters<typeof resolveReadingV2StudioWorkflowContext>[0] & {
    readonly actor: ReadingV2StudioActor;
    readonly sourceAuthoringContext?: ReadingV2DraftRecord['authoringContext'];
    readonly sourceWorkflowOrigin?: ReadingV2StudioWorkflowOrigin;
    readonly sourceAuthoringMetadata?: Readonly<Record<string, unknown>>;
  },
): Promise<ReadingV2StudioWorkflowContext> => {
  const repository = draftRepositoryFor(input.actor);
  if (input.mode === 'resume-draft' && input.draftId) {
    const draft = await repository.loadDraft(readingV2Ids.draftId(input.draftId));
    if (!draft) throw new Error('This saved draft could not be found.');
    readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
    return { ...studioContextFromDraft(draft), resolvedSourceEvidence: await loadSourceEvidence(draft.authoringContext, input.actor) };
  }
  if (input.sourceSnapshot && input.sourceSnapshot.ownerId !== input.actor.uid && input.actor.role !== 'super_admin') {
    throw new Error('Create your own copy before editing another teacher’s published material.');
  }
  if (isImportCreateMode(input.mode)
    && !(input.initialImportCandidate?.sourceRawText ?? input.initialImportCandidate?.rawText)?.trim()) {
    throw new Error('The supplied import source is unavailable. Return to import and provide the source again.');
  }
  const prepared = resolveReadingV2StudioWorkflowContext({
    ...input,
    ownerId: input.actor.uid,
    initialMetadata: { ...input.initialMetadata, ownerId: input.actor.uid },
  });
  if (prepared.status !== 'ready') return prepared;
  let authoringContext = input.sourceAuthoringContext ?? createReadingV2ManualAuthoringContext();
  if (input.initialImportCandidate) {
    const sourceId = `import-${crypto.randomUUID()}`;
    const source = createReadingV2AuthoringSourceRecord({
      sourceId, ownerId: prepared.metadata.ownerId, createdAt: new Date().toISOString(), candidate: input.initialImportCandidate,
    });
    await repository.storeSource(source);
    authoringContext = createReadingV2ImportAuthoringContext({
      sourceId, candidate: input.initialImportCandidate, document: prepared.document,
    });
  }
  const draft = await repository.createDraft({
    operationId: crypto.randomUUID(),
    draftId: prepared.draftId,
    materialId: prepared.materialId,
    ownerId: prepared.metadata.ownerId,
    document: prepared.document,
    studioMetadata: toStudioMetadataRecord(createReadingV2StudioDefaultMetadata({
      ...prepared.metadata, ...input.sourceAuthoringMetadata, ownerId: prepared.metadata.ownerId,
    })),
    authoringContext,
    workflowOrigin: input.sourceWorkflowOrigin ?? prepared.workflowOrigin,
  });
  readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
  return { ...studioContextFromDraft(draft, input.mode), resolvedSourceEvidence: await loadSourceEvidence(authoringContext, input.actor) };
};

export const saveReadingV2StudioDraft = async (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  actor: ReadingV2StudioActor,
): Promise<ReadingV2StudioSaveResult> => {
  assertSnapshotActor(snapshot, actor);
  const draftId = readingV2Ids.draftId(snapshot.draftId);
  const draft = await draftRepositoryFor(actor).saveDraft({
    draftId,
    expectedRevision: snapshot.revision,
    operationId: crypto.randomUUID(),
    document: snapshot.document,
    studioMetadata: toStudioMetadataRecord(snapshot.metadata),
    authoringContext: snapshot.authoringContext,
    workflowOrigin: snapshot.workflowOrigin,
    state: 'draft',
  });
  readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
  return { draft };
};

export const reloadLatestReadingV2StudioDraft = async (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  actor: ReadingV2StudioActor,
): Promise<ReadingV2StudioReloadLatestResult> => {
  const draft = await draftRepositoryFor(actor).loadDraft(readingV2Ids.draftId(snapshot.draftId));

  if (!draft) {
    throw new Error(`Cannot reload missing Reading V2 draft ${snapshot.draftId}.`);
  }

  readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
  return { draft, resolvedSourceEvidence: await loadSourceEvidence(draft.authoringContext, actor) };
};

export const duplicateReadingV2StudioDraft = async (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  actor: ReadingV2StudioActor,
): Promise<ReadingV2StudioDuplicateDraftResult> => {
  assertSnapshotActor(snapshot, actor);
  const draftId = readingV2Ids.draftId(`studio-copy-${crypto.randomUUID()}`);
  const draft = await draftRepositoryFor(actor).createDraft({
    operationId: crypto.randomUUID(),
    draftId,
    ownerId: actor.uid,
    materialId: readingV2Ids.materialId(`studio-material-${crypto.randomUUID()}`),
    document: snapshot.document,
    studioMetadata: toStudioMetadataRecord({ ...snapshot.metadata, ownerId: actor.uid }),
    authoringContext: snapshot.authoringContext,
    workflowOrigin: { mode: 'duplicate-material', sourceMaterialId: snapshot.materialId },
  });
  readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
  return { draft, resolvedSourceEvidence: await loadSourceEvidence(draft.authoringContext, actor) };
};

export const extractReadingV2StudioTaskGroupDraft = async (
  snapshot: ReadingV2StudioWorkflowSnapshot,
  request: ReadingV2StudioExtractionRequest,
  actor: ReadingV2StudioActor,
): Promise<ReadingV2StudioExtractionResult> => {
  assertSnapshotActor(snapshot, actor);
  if (request.taskGroupIds.length === 0) {
    throw new Error('Reading V2 Studio extraction requires at least one task group.');
  }

  const sourceMaterialId = readingV2Ids.materialId(snapshot.materialId ?? `studio-source-${nowId()}`);
  const newMaterialId = readingV2Ids.materialId(`${sourceMaterialId}-extract-${nowId()}`);
  const extracted = extractReadingV2TaskGroupMaterialDraft(readingV2StudioRepository, {
    sourceDocument: snapshot.document,
    authoringContext: snapshot.authoringContext,
    taskGroupIds: request.taskGroupIds,
    sourceMaterialId,
    sourcePassageAssetId: readingV2Ids.passageAssetId(`${sourceMaterialId}-passage-asset`),
    sourcePassageAssetVersion: 'local-unsaved-authoring',
    newDraftId: `${newMaterialId}-draft`,
    newMaterialId,
    ownerId: snapshot.metadata.ownerId,
    extractedBy: snapshot.metadata.ownerId,
  });
  const draft = await draftRepositoryFor(actor).createDraft({
    draftId: extracted.draftId,
    materialId: extracted.materialId,
    ownerId: actor.uid,
    document: extracted.document,
    studioMetadata: toStudioMetadataRecord({ ...snapshot.metadata, ownerId: actor.uid, materialKind: request.materialKind }),
    authoringContext: extracted.authoringContext,
    workflowOrigin: { mode: 'extract-task-group-material', sourceMaterialId: snapshot.materialId },
    operationId: crypto.randomUUID(),
  });
  readingV2StudioRepository.store.drafts.set(draft.draftId, draft);
  return { draft, resolvedSourceEvidence: await loadSourceEvidence(draft.authoringContext, actor) };
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
  actor: ReadingV2StudioActor,
  commitAdapter: ReadingV2StudioPublishCommitAdapter = commitReadingV2PublishPlanToFirebase,
): Promise<ReadingV2StudioPublishResult> => {
  assertSnapshotActor(snapshot, actor);
  const acknowledged = readingV2StudioRepository.loadDraft(readingV2Ids.draftId(snapshot.draftId));
  if (!acknowledged || acknowledged.revision !== snapshot.revision
    || !readingV2DraftContentEquals(acknowledged.document, snapshot.document)
    || !readingV2DraftContentEquals(acknowledged.studioMetadata, toStudioMetadataRecord(snapshot.metadata))
    || !readingV2DraftContentEquals(acknowledged.authoringContext, snapshot.authoringContext)) {
    throw new Error('Save this version of the draft before publishing.');
  }
  const sourceEvidence = await loadSourceEvidence(snapshot.authoringContext, actor);
  const readiness = evaluateReadingV2AuthoringReadiness(snapshot, sourceEvidence);
  if (!readiness.canPublish) throw new Error(`Review ${readiness.blockingFindings.length} issues before publishing.`);
  const materialId = readingV2Ids.materialId(
    snapshot.materialId ?? `studio-material-${nowId()}`,
  );
  const result = publishReadingV2Material({
    repository: createReadingV2Repository(),
    materialId,
    ownerId: snapshot.metadata.ownerId,
    document: {
      ...snapshot.document,
      deliveryEngine: READING_V2_ENGINE,
    },
    publishedBy: snapshot.metadata.ownerId,
    operationId: crypto.randomUUID(),
    snapshotVersionId: readingV2Ids.snapshotVersionId(`snapshot-${crypto.randomUUID()}`),
    draftId: snapshot.draftId,
    draftRevision: snapshot.revision,
    authoringContext: snapshot.authoringContext,
    resolvedSourceEvidence: sourceEvidence,
    workflowOrigin: snapshot.workflowOrigin,
    authoringMetadata: toStudioMetadataRecord(snapshot.metadata),
    expectedMaterialRevision: snapshot.workflowOrigin?.publicationBase?.materialRevision,
    expectedBases: snapshot.workflowOrigin?.publicationBase ? { ...snapshot.workflowOrigin.publicationBase } : undefined,
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
  commitReadingV2PublishPlanToRepository(readingV2StudioRepository, result.commitPlan);

  return {
    materialId,
    snapshotVersionId: result.snapshotVersionId,
    publicationBase: {
      materialRevision: result.metadata.materialRevision ?? 1,
      snapshotVersionId: result.snapshotVersionId,
      ...(result.metadata.compositionId ? { compositionId: result.metadata.compositionId } : {}),
      ...(result.readingPassageExtraction
        ? {
            generatedPassages: result.readingPassageExtraction.passages.map((passage) => ({
              sectionId: passage.sectionId,
              materialId: passage.material.passageMaterialId,
              snapshotVersionId: passage.material.currentSnapshotVersionId,
              materialRevision: passage.material.materialRevision ?? 1,
            })),
          }
        : {}),
    },
    projectionCount: result.projections.length,
    relationshipWriteCount: result.relationshipIndexWrites.length,
    firebaseCommitStatus: firebaseCommit.status,
    firebaseCommitPath: firebaseCommit.commitPath,
    firebaseOperationCount: firebaseCommit.operationKeys.length,
    duplicateWarnings: result.duplicateWarnings,
    generatedReadingPassages: result.readingPassageExtraction?.passages.map((passage) => ({
      materialId: readingV2Ids.materialId(passage.material.passageMaterialId),
      snapshotVersionId: passage.material.currentSnapshotVersionId,
      title: passage.material.title,
    })) ?? [],
  };
};
