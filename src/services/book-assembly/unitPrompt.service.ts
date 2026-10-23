import type {
  BookAssemblyManifestCandidate,
  BookUnitCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type { EditableActivity } from '../../types/bookActivity.types';

export const UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION = 'prd0062.unit_activity_import.v1' as const;
export const UNIT_ACTIVITY_IMPORT_PROMPT_VERSION = 'book-unit-json-v1' as const;

export const BOOK_ACTIVITY_MODEL_GUIDANCE = [
  'Book authoring model:',
  '- The immutable PDF is source context. The Book Content Tree organizes sections and Units; its manifest maps Activity slots to source-qualified physical pages through Page Groups. Activity JSON supplies the interactive educational content, not a replacement PDF or custom UI.',
  '- An Activity is the smallest reusable, editable, submitted, and graded task. It has one coherent interaction family and one shared answer rule, with one or more question/response Interactions. A printed heading can contain several Activities; several Activities may share the same passage or PDF pages.',
  '- Separate tasks when their interaction family or shared answer rule changes. For example, matching questions and true/false questions on the same passage need separate Activities, not one mixed Activity or one generic essay.',
  '- Shared Activity defaults include normalization, default points, selection count, and option reuse where supported. Individual Interactions hold their prompt, accepted answer, feedback, and optional points override. Instructions, stimulus, and source context are presentation, not new interaction families.',
  '- Book/placement identity, source provenance, publication versions, and hidden Interaction IDs belong to the app. Keep them out of generated editable content. The app validates the JSON and renders it with shared components; the teacher reviews its meaning and exact student preview.',
].join('\n');

export interface UnitPromptInput {
  readonly bookTitle: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly unitKey: string;
  readonly sourceVersions: readonly Pick<TrustedBookSourceVersionProjection, 'sourceVersionId' | 'physicalPageCount'>[];
  readonly localAuthoring?: boolean;
  readonly selectedActivityKey?: string;
}

export interface ActivityRevisionPromptInput {
  readonly current: EditableActivity;
  readonly sourceEvidenceRefs: readonly string[];
  readonly answerEvidenceRefs: readonly string[];
}

const nodeLabel = (manifest: BookAssemblyManifestCandidate, nodeKey: string): string => {
  const node = manifest.nodes.find((entry) => entry.nodeKey === nodeKey);
  if (!node) return nodeKey;
  return `${node.nodeType}:${node.nodeKey}`;
};

const unitPath = (manifest: BookAssemblyManifestCandidate, unitKey: string): string[] => {
  const result: string[] = [];
  let current = manifest.nodes.find((node) => node.nodeKey === unitKey);
  const seen = new Set<string>();
  while (current && !seen.has(current.nodeKey)) {
    seen.add(current.nodeKey);
    result.unshift(nodeLabel(manifest, current.nodeKey));
    current = current.parentNodeKey
      ? manifest.nodes.find((node) => node.nodeKey === current?.parentNodeKey)
      : undefined;
  }
  return result;
};

const sourcePageRefs = (unit: BookUnitCandidate): string[] => {
  const refs = new Set<string>();
  for (const group of unit.pageGroups) {
    refs.add(`pageGroup:${group.pageGroupKey}`);
    for (const page of group.pages) refs.add(`source:${group.sourceKey}:page:${page}`);
  }
  return [...refs].sort();
};

const supportedActivityContract = {
  families: [
    { family: 'choice', variants: ['single-select', 'multi-select'], answerRule: 'accepted options stay inside trusted Activity content' },
    { family: 'text-entry', variants: ['short-answer', 'sentence-completion'], answerRule: 'normalization and accepted text stay inside trusted Activity content' },
    { family: 'matching', variants: ['matching-pairs'], answerRule: 'pair keys stay local to the editable Activity content' },
    { family: 'ordering', variants: ['sequence'], answerRule: 'ordered labels stay local to the editable Activity content' },
    { family: 'long-response', variants: ['draft-response'], answerRule: 'review-required only; no objective scoring' },
  ],
  stimulusAndMedia: [
    'Use plain text stimulus when the source page context needs quotation or paraphrase.',
    'Use assetRefs only for pre-authorized Activity assets already represented by safe asset IDs.',
    'Do not include provider object keys, provider URLs, buckets, credentials, or private source authority.',
  ],
  presentationExamples: [
    { presentationMode: 'structured', useWhen: 'standalone prompt can be answered without viewing mapped book pages' },
    { presentationMode: 'source-assisted', useWhen: 'student must use mapped pageGroup/source page evidence' },
  ],
  forbiddenObjectTypes: ['Resource', 'Task Group', 'Task Set'],
};

export const buildUnitActivityImportPrompt = ({
  bookTitle,
  manifest,
  unitKey,
  sourceVersions,
  localAuthoring = false,
  selectedActivityKey,
}: UnitPromptInput): string => {
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  if (!unit) {
    throw new Error('Selected Unit has no Activity slot contract.');
  }
  const activitySlots = selectedActivityKey
    ? unit.activitySlots.filter((slot) => slot.activityKey === selectedActivityKey)
    : unit.activitySlots;
  if (activitySlots.length === 0) throw new Error('Selected Activity is unavailable.');
  const sourcePageCounts = new Map(sourceVersions.map((source) => [
    source.sourceVersionId,
    source.physicalPageCount,
  ]));
  const sourceSummary = manifest.sourceSet.sources.map((source) => ({
    sourceKey: source.sourceKey,
    sourceOrder: source.sourceOrder,
    physicalPageCount: sourcePageCounts.get(source.sourceVersionId) ?? null,
  }));
  const contract = {
    promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
    schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
    book: { title: bookTitle },
    unit: {
      unitKey,
      hierarchy: unitPath(manifest, unitKey),
      sourceStrategy: manifest.sourceSet.sourceStrategy,
      sources: sourceSummary,
      sourceLocalPages: unit.pageGroups.map((group) => ({
        pageGroupKey: group.pageGroupKey,
        sourceKey: group.sourceKey,
        pages: group.pages,
        defaultPhysicalPageNumber: group.defaultPhysicalPageNumber ?? null,
        mode: group.mode,
      })),
      activitySlots: activitySlots.map((slot) => ({
        activityKey: slot.activityKey,
        order: slot.order,
        contextRequirement: slot.contextRequirement,
        pageGroupKeys: slot.pageGroupKeys,
      })),
      allowedEvidenceRefs: sourcePageRefs(unit),
    },
    supportedActivityContract,
    outputBundleShape: {
      promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
      schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
      ...(localAuthoring ? {} : { bookId: manifest.bookId, unitKey }),
      slots: activitySlots.map((slot) => ({
        activityKey: slot.activityKey,
        content: {
          schemaVersion: 1,
          title: 'Teacher-visible Activity title',
          taskProfile: null,
          presentationMode: 'structured',
          contextRequirement: {
            mode: slot.contextRequirement === 'none' ? 'none' : slot.contextRequirement,
            acceptedKinds: slot.contextRequirement === 'none' ? [] : ['book-pages'],
          },
          instructions: [{ text: 'Student instructions.' }],
          stimulus: null,
          assetRefs: [],
          interaction: { family: 'choice', variant: 'single-select' },
          answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
          interactions: [{ prompt: 'Question text.', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
          scoring: { mode: 'auto-where-possible' },
        },
        evidenceRefs: [`import:${slot.activityKey}`],
        sourceEvidenceRefs: sourcePageRefs(unit).slice(0, 1),
        answerEvidenceRefs: sourcePageRefs(unit).slice(0, 1),
      })),
    },
  };

  return [
    'Create Activity JSON for this exact PRD0062 Book Unit.',
    BOOK_ACTIVITY_MODEL_GUIDANCE,
    '',
    JSON.stringify(contract, null, 2),
    '',
    'Rules:',
    '- Return one JSON object only. No Markdown, comments, React, TSX, or custom components.',
    localAuthoring
      ? '- Return only promptVersion, schemaVersion, slots. Do not generate bookId or unitKey; the local editor binds the selected Unit. Keep every activityKey exactly.'
      : '- Keep the same promptVersion, schemaVersion, bookId, unitKey, and every activityKey exactly.',
    '- Every slot must use exactly one interaction family. Do not mix families inside one Activity.',
    '- Supported interaction families and variants are listed in supportedActivityContract; do not invent another family or variant.',
    '- Keep answer rules inside the editable Activity content only. Use review-required for long-response.',
    '- Use structured mode for standalone questions and source-assisted mode when page context is required; follow the presentation examples.',
    '- Include accessibility-facing labels/instructions in editable Activity text. Do not rely on visual layout alone.',
    '- taskProfile may be null. If namespaced, use only a real registered taxonomy/type/version.',
    '- Do not create Resource, Task Group, or Task Set objects. This import accepts Activity content only.',
    '- Use only allowed source/page evidence refs from the contract.',
    '- Do not include hidden IDs, editable IDs, sourceVersionId, provider object keys, provider URLs, credentials, private source authority, teacher notes, guessed offsets, unsupported visual approximation, or accepted answers from unrelated sources.',
  ].join('\n');
};

/** Revision prompt adapter. Editable JSON is explicit; identity/provenance stays outside it. */
export const buildActivityRevisionPrompt = ({
  current,
  sourceEvidenceRefs,
  answerEvidenceRefs,
}: ActivityRevisionPromptInput): string => [
  'Replace the complete Activity JSON. Do not merge selected fields.',
  'Current editable Activity JSON:',
  JSON.stringify(current, null, 2),
  '',
  'Requirements:',
  `schemaVersion: ${current.schemaVersion}`,
  `taskProfile: ${current.taskProfile ? `${current.taskProfile.taxonomyId}/${current.taskProfile.typeId}@${current.taskProfile.taxonomyVersion}` : 'null or a registered profile'}`,
  `presentationMode: ${current.presentationMode} (change only in this complete replacement)`,
  `contextRequirement: ${current.contextRequirement.mode}/${current.contextRequirement.acceptedKinds.join(',') || 'none'}`,
  `interaction family/variant: ${current.interaction.family}/${current.interaction.variant}`,
  `source evidence references: ${sourceEvidenceRefs.join(', ') || 'none'}`,
  `answer evidence references: ${answerEvidenceRefs.join(', ') || 'none'}`,
  'Return only editable Activity fields. Do not include IDs, owner, placement, source-page, answer-key, or provenance fields.',
  'Manual-copy fallback: if clipboard access is unavailable, select and copy the visible prompt text above.',
].join('\n');
