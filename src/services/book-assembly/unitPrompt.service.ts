import type {
  BookAssemblyManifestCandidate,
  BookUnitCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type { EditableActivity } from '../../types/bookActivity.types';
import { BOOK_ACTIVITY_MAX_EVIDENCE_REFS } from '../book-activity/activityCandidate.service';

export const UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION = 'prd0062.unit_activity_import.v1' as const;
export const UNIT_ACTIVITY_IMPORT_PROMPT_VERSION = 'book-unit-json-v1' as const;
export const BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION = 'prd0062.book_unit_activities_bulk_import.v1' as const;
export const BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION = 'book-units-bulk-json-v1' as const;

export interface UnitPromptInput {
  readonly bookTitle: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly unitKey: string;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
}

export interface BulkUnitPromptInput {
  readonly bookTitle: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly unitKeys?: readonly string[];
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
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

const collectSlotEvidenceRefs = (
  unit: BookUnitCandidate,
  activityKey: string,
  includeTeacherOnly: boolean,
): string[] => {
  const slot = unit.activitySlots.find((entry) => entry.activityKey === activityKey);
  const refs = new Set<string>([`import:${activityKey}`]);
  if (!slot) return [...refs];
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  const addGroup = (group: BookUnitCandidate['pageGroups'][number] | undefined) => {
    if (!group) return;
    refs.add(`pageGroup:${group.pageGroupKey}`);
    for (const page of group.pages) refs.add(`source:${group.sourceKey}:page:${page}`);
  };
  for (const pageGroupKey of slot.pageGroupKeys) {
    const group = groups.get(pageGroupKey);
    if (group && group.mode === 'activity') addGroup(group);
  }
  for (const group of unit.pageGroups) {
    if (group.mode === 'reference_only' || (includeTeacherOnly && group.mode === 'teacher_only')) {
      addGroup(group);
    }
  }
  return [...refs].sort();
};

/** Student-safe evidence refs for sourceEvidenceRefs (excludes teacher_only). */
export const allowedActivitySlotSourceEvidenceRefs = (
  unit: BookUnitCandidate,
  activityKey: string,
): string[] => collectSlotEvidenceRefs(unit, activityKey, false);

/** Authoring evidence refs for answerEvidenceRefs (includes unit teacher_only answer keys). */
export const allowedActivitySlotAnswerEvidenceRefs = (
  unit: BookUnitCandidate,
  activityKey: string,
): string[] => collectSlotEvidenceRefs(unit, activityKey, true);

/** Full authoring evidence refs for legacy evidenceRefs provenance. */
export const allowedActivitySlotEvidenceRefs = (
  unit: BookUnitCandidate,
  activityKey: string,
): string[] => allowedActivitySlotAnswerEvidenceRefs(unit, activityKey);

const slotSourcePageRefs = (
  unit: BookUnitCandidate,
  slot: BookUnitCandidate['activitySlots'][number],
): string[] => allowedActivitySlotSourceEvidenceRefs(unit, slot.activityKey);

const slotAnswerPageRefs = (
  unit: BookUnitCandidate,
  slot: BookUnitCandidate['activitySlots'][number],
): string[] => allowedActivitySlotAnswerEvidenceRefs(unit, slot.activityKey);

const supportedActivityContract = {
  families: [
    {
      family: 'choice',
      variants: ['single-select', 'multi-select'],
      interactionFields: ['prompt', 'options', 'acceptedOptionIndexes'],
      sourceAssistedResponseShapes: ['single-choice (when requiredSelectionCount is 1)', 'multiple-choice (when requiredSelectionCount >= 2)'],
      answerRule: 'accepted options stay inside trusted Activity content; set requiredSelectionCount to match acceptedOptionIndexes.length',
    },
    {
      family: 'text-entry',
      variants: ['short-text', 'sentence-completion'],
      interactionFields: ['prompt', 'acceptedAnswers'],
      sourceAssistedResponseShapes: ['short-text', 'text'],
      answerRule: 'normalization (recommend "trim-case-and-spacing") and accepted text stay inside trusted Activity content; omit requiredSelectionCount (choice-only)',
    },
    {
      family: 'matching',
      variants: ['matching-pairs'],
      interactionFields: ['prompt', 'leftItems', 'rightItems', 'acceptedPairs (array of { left: string, right: string } objects matching leftItems/rightItems)'],
      sourceAssistedResponseShapes: ['matching'],
      answerRule: 'each leftItem must appear in acceptedPairs once; set answerRule.allowOptionReuse: true when a rightItem can match multiple leftItems; omit requiredSelectionCount (choice-only)',
    },
    {
      family: 'ordering',
      variants: ['sequence'],
      interactionFields: ['prompt', 'orderingItems', 'acceptedOrder (permutation of 0..n-1)'],
      sourceAssistedResponseShapes: ['ordering'],
      answerRule: 'ordered labels stay local to the editable Activity content; omit requiredSelectionCount (choice-only)',
    },
    {
      family: 'long-response',
      variants: ['draft-response', 'v1'],
      interactionFields: ['prompt', 'rubric: { criteria: string[] }'],
      sourceAssistedResponseShapes: ['long-response', 'long-text'],
      answerRule: 'scoring.mode must be review-required; no objective scoring; omit requiredSelectionCount (choice-only)',
    },
  ],
  stimulusAndMedia: [
    'Use plain text stimulus when the source page context needs quotation or paraphrase.',
    'Use assetRefs only for pre-authorized Activity assets already represented by safe asset IDs.',
    'Do not include provider object keys, provider URLs, buckets, credentials, or private source authority.',
  ],
  presentationExamples: [
    {
      presentationMode: 'structured',
      useWhen: 'slot.contextRequirement is none or optional',
      contextRequirement: 'mode "none" with acceptedKinds [], OR mode "optional" with acceptedKinds ["book-pages"]; omit interactions[].sourceAssisted',
    },
    {
      presentationMode: 'source-assisted',
      useWhen: 'slot.contextRequirement is required',
      contextRequirement: 'mode "required" with acceptedKinds ["book-pages"]; every interaction MUST include sourceAssisted: { questionLabel, accessiblePrompt, responseShape, sourceExerciseLabel } with unique questionLabel values',
    },
  ],
  maxEvidenceRefsPerField: BOOK_ACTIVITY_MAX_EVIDENCE_REFS,
  forbiddenObjectTypes: ['Resource', 'Task Group', 'Task Set'],
};

const exampleActivityContent = (slot: BookUnitCandidate['activitySlots'][number]) => {
  const isSourceAssisted = slot.contextRequirement === 'required';
  const interaction = isSourceAssisted
    ? {
      prompt: 'Question text.',
      options: ['A', 'B'],
      acceptedOptionIndexes: [0],
      sourceAssisted: {
        questionLabel: 'Q1',
        accessiblePrompt: 'Question 1: choose the best option based on the mapped book page.',
        responseShape: 'single-choice',
        sourceExerciseLabel: 'Exercise 1',
      },
    }
    : {
      prompt: 'Question text.',
      options: ['A', 'B'],
      acceptedOptionIndexes: [0],
    };
  return {
    schemaVersion: 1,
    title: 'Teacher-visible Activity title',
    taskProfile: null,
    presentationMode: isSourceAssisted ? 'source-assisted' : 'structured',
    contextRequirement: {
      mode: slot.contextRequirement,
      acceptedKinds: slot.contextRequirement === 'none' ? [] : ['book-pages'],
    },
    instructions: [{ text: 'Student instructions.' }],
    stimulus: null,
    assetRefs: [],
    interaction: { family: 'choice', variant: 'single-select' },
    answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
    interactions: [interaction],
    scoring: { mode: 'auto-where-possible' },
  };
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
        allowedEvidenceRefs: slotAnswerPageRefs(unit, slot),
        allowedSourceEvidenceRefs: slotSourcePageRefs(unit, slot),
        allowedAnswerEvidenceRefs: slotAnswerPageRefs(unit, slot),
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
        content: exampleActivityContent(slot),
        evidenceRefs: [`import:${slot.activityKey}`],
        sourceEvidenceRefs: slotSourcePageRefs(unit, slot).filter((ref) => !ref.startsWith('import:')).slice(0, 1),
        answerEvidenceRefs: slotAnswerPageRefs(unit, slot).filter((ref) => !ref.startsWith('import:')).slice(0, 1),
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
    '- Use only allowed source/page evidence refs from the contract. Page groups with mode "teacher_only" (such as Answer Keys) may ONLY be cited in answerEvidenceRefs (or evidenceRefs), never in sourceEvidenceRefs, stimulus, or student-facing instructions.',
    `- Each evidence array (evidenceRefs, sourceEvidenceRefs, answerEvidenceRefs) may contain at most ${BOOK_ACTIVITY_MAX_EVIDENCE_REFS} unique entries; include only the specific page or group refs used for that slot.`,
    '- Do not include hidden IDs, editable IDs, sourceVersionId, provider object keys, provider URLs, credentials, private source authority, teacher notes, guessed offsets, unsupported visual approximation, or accepted answers from unrelated sources.',
  ].join('\n');
};

export const buildBulkUnitActivityImportPrompt = ({
  bookTitle,
  manifest,
  unitKeys,
  sourceVersions,
}: BulkUnitPromptInput): string => {
  const requestedSet = unitKeys && unitKeys.length > 0 ? new Set(unitKeys) : null;
  const targetUnits = manifest.units.filter((entry) => (
    entry.activitySlots.length > 0 && (!requestedSet || requestedSet.has(entry.unitKey))
  ));
  if (targetUnits.length === 0) {
    throw new Error('No Units with Activity slots are available for bulk import.');
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
  const exampleUnit = targetUnits[0]!;
  const exampleSlot = exampleUnit.activitySlots[0]!;
  const contract = {
    promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
    schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
    book: {
      bookId: manifest.bookId,
      title: bookTitle,
      sourceStrategy: manifest.sourceSet.sourceStrategy,
      sources: sourceSummary,
    },
    units: targetUnits.map((unit) => ({
      unitKey: unit.unitKey,
      hierarchy: unitPath(manifest, unit.unitKey),
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
        allowedEvidenceRefs: slotAnswerPageRefs(unit, slot),
        allowedSourceEvidenceRefs: slotSourcePageRefs(unit, slot),
        allowedAnswerEvidenceRefs: slotAnswerPageRefs(unit, slot),
      })),
    })),
    supportedActivityContract,
    outputBundleShape: {
      promptVersion: BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
      schemaVersion: BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
      bookId: manifest.bookId,
      units: [
        {
          unitKey: exampleUnit.unitKey,
          slots: [
            {
              activityKey: exampleSlot.activityKey,
              content: exampleActivityContent(exampleSlot),
              evidenceRefs: [`import:${exampleSlot.activityKey}`],
              sourceEvidenceRefs: slotSourcePageRefs(exampleUnit, exampleSlot).filter((ref) => !ref.startsWith('import:')).slice(0, 1),
              answerEvidenceRefs: slotAnswerPageRefs(exampleUnit, exampleSlot).filter((ref) => !ref.startsWith('import:')).slice(0, 1),
            },
          ],
        },
      ],
    },
  };

  return [
    `Create bulk Activity JSON for ${targetUnits.length} PRD0062 Book Unit${targetUnits.length === 1 ? '' : 's'}.`,
    '',
    JSON.stringify(contract, null, 2),
    '',
    'Rules:',
    '- Return one JSON object only. No Markdown, comments, React, TSX, or custom components.',
    '- Keep promptVersion, schemaVersion, bookId, every unitKey, and every activityKey exact.',
    '- You may return all requested units together or a partial batch (for example 5 units at a time); every included unit must contain all of its activitySlots.',
    '- Every slot must use exactly one interaction family from supportedActivityContract.',
    '- Keep answer rules inside editable Activity content only. Use review-required for long-response.',
    '- Use only allowedEvidenceRefs belonging to that exact unit and slot. Page groups with mode "teacher_only" (such as Answer Keys) may ONLY be cited in answerEvidenceRefs (or evidenceRefs), never in sourceEvidenceRefs, stimulus, or student-facing instructions.',
    `- Each evidence array (evidenceRefs, sourceEvidenceRefs, answerEvidenceRefs) may contain at most ${BOOK_ACTIVITY_MAX_EVIDENCE_REFS} unique entries; include only the specific page or group refs used for that slot.`,
    '- Do not include hidden IDs, sourceVersionId, provider URLs, credentials, teacher notes, or Resource/Task Group/Task Set objects.',
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
