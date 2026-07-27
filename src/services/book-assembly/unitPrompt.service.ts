import type {
  BookAssemblyManifestCandidate,
  BookUnitCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';

export const UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION = 'prd0062.unit_activity_import.v1' as const;
export const UNIT_ACTIVITY_IMPORT_PROMPT_VERSION = 'book-unit-json-v1' as const;

export interface UnitPromptInput {
  readonly bookTitle: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly unitKey: string;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
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
}: UnitPromptInput): string => {
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  if (!unit) {
    throw new Error('Selected Unit has no Activity slot contract.');
  }
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
      activitySlots: unit.activitySlots.map((slot) => ({
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
      bookId: manifest.bookId,
      unitKey,
      slots: unit.activitySlots.map((slot) => ({
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
    '',
    JSON.stringify(contract, null, 2),
    '',
    'Rules:',
    '- Return one JSON object only. No Markdown, comments, React, TSX, or custom components.',
    '- Keep the same promptVersion, schemaVersion, bookId, unitKey, and every activityKey exactly.',
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
