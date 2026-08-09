import type {
  ActivityInteractionFamily,
  ActivityTaskProfile,
  NormalizedActivity,
  StudentActivityProjection,
} from '../../types/bookActivity.types';
import type { SourceQualifiedPageIdentity } from '../../types/bookAssembly.types';
import { projectStudentActivity } from '../book-activity/activityProjection.service';

export const CANONICAL_ACTIVITY_VERSION_SCHEMA_VERSION = 1 as const;

export const CANONICAL_ACTIVITY_VERSION_LIMITS = {
  maxRecordBytes: 1_048_576,
  maxIdLength: 160,
  maxTextLength: 16_384,
  maxShortTextLength: 2_048,
  maxInstructions: 128,
  maxInteractions: 512,
  maxItemsPerInteraction: 512,
  maxAcceptedAnswers: 512,
  maxAcceptedPairs: 512,
  maxAssetRefs: 128,
  maxContextKinds: 32,
  maxPlacementIds: 512,
  maxEvidenceRefs: 128,
  maxSourcePages: 256,
  maxMappedBookPageRefs: 256,
  maxProvenanceEvidenceRefs: 128,
  maxSelectionPath: 32,
  maxSourcePageGroupKeys: 128,
} as const;

const ACTIVITY_FAMILIES = [
  'choice',
  'text-entry',
  'matching',
  'ordering',
  'long-response',
] as const satisfies readonly ActivityInteractionFamily[];
const PRESENTATION_MODES = ['structured', 'source-assisted'] as const;
const CONTEXT_MODES = ['none', 'optional', 'required'] as const;
const NORMALIZATIONS = ['exact', 'trim-case-and-spacing'] as const;
const FEEDBACK_VISIBILITIES = ['none', 'after-submit', 'after-review'] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
// Destination fork identities are SHA-256/base64url and therefore may contain
// `_`; RTDB path validation must accept the complete base64url alphabet.
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,159}$/u;
const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/u;
const FINGERPRINT = /^fnv1a64:[0-9a-f]{16}$/u;
const SOURCE_CONTEXT_FINGERPRINT = /^(?:fnv1a64:[0-9a-f]{16}|sha256:[A-Za-z0-9_-]{43})$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

export interface CanonicalInitialBookPublicationProvenance {
  readonly kind: 'initial-book-publication';
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly unitKey: string;
  readonly activityKey: string;
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
}

export interface CanonicalActivityRevisionContext {
  readonly fingerprint?: string;
  readonly sourceContextFingerprint?: string | null;
  readonly sourceVersionId?: string;
  readonly pageGroupId?: string;
  readonly mappedBookPageRefs?: readonly string[];
}

export interface CanonicalActivityRevisionProvenance {
  readonly kind: 'activity-revision';
  readonly candidateId: string;
  readonly candidateRevision?: number;
  readonly evidenceRefs: readonly string[];
  readonly sourceEvidenceRefs?: readonly string[];
  readonly answerEvidenceRefs?: readonly string[];
  readonly context?: CanonicalActivityRevisionContext | null;
  readonly sourceContext?: CanonicalActivityRevisionContext | null;
}

export interface CanonicalPublicBookForkPublicationBinding {
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
}

export interface CanonicalPublicBookForkProvenance {
  readonly kind: 'public-book-fork';
  readonly sourceBookId: string;
  readonly sourceOwnerId: string;
  readonly sourceManifestVersionId: string;
  readonly sourcePublicationId: string;
  readonly sourcePublicationRevision: number;
  readonly sourceVersionId: string;
  readonly sourcePublicationBinding: CanonicalPublicBookForkPublicationBinding;
  readonly sourceActivityId: string;
  readonly sourceActivityVersionId: string;
  readonly sourceActivityVersion: number;
  readonly sourcePayloadFingerprint: string;
  readonly sourcePlacementIds: readonly string[];
  readonly sourcePlacementSetFingerprint: string;
  readonly sourceNodeKey: string;
  readonly sourcePlacementId: string;
  readonly sourceUnitKey: string;
  readonly sourceActivityKey: string;
  readonly selectionKind: 'activity';
  readonly selectionPath: readonly string[];
  readonly selectionOrder: number;
  readonly sourcePages: readonly SourceQualifiedPageIdentity[];
  readonly sourcePageGroupKeys: readonly string[];
  readonly sourceContextFingerprint: string | null;
  readonly targetBookId: string;
  readonly targetOwnerId: string;
  readonly targetOriginalNodeId: string;
  readonly targetPlacementId: string;
  readonly targetAppendOrder: number;
  readonly targetBookUpdatedAt: string;
}

export type CanonicalPublishedActivityVersionProvenance =
  | CanonicalInitialBookPublicationProvenance
  | CanonicalActivityRevisionProvenance
  | CanonicalPublicBookForkProvenance;

export interface CanonicalPublishedActivityVersionRecord {
  readonly schemaVersion: 1;
  readonly lifecycle: 'published';
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly ownerId: string;
  readonly activity: NormalizedActivity;
  readonly projection: StudentActivityProjection;
  readonly payloadFingerprint: string;
  readonly predecessorActivityVersionId?: string;
  readonly placementIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly sourceContextFingerprint: string | null;
  readonly createdByOperationId: string;
  readonly publishedAt: string;
  readonly provenance: CanonicalPublishedActivityVersionProvenance;
}

export type CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint = Omit<
  CanonicalPublishedActivityVersionRecord,
  'payloadFingerprint'
>;

type PlainRecord = Record<string, unknown>;
type ValidationErrors = string[];

const isPlainRecord = (value: unknown): value is PlainRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const pathKey = (path: string, key: PropertyKey): string =>
  `${path}.${typeof key === 'string' ? key : String(key)}`;

const isOwnEnumerable = (value: object, key: PropertyKey): boolean =>
  Object.prototype.propertyIsEnumerable.call(value, key);

const add = (errors: ValidationErrors, path: string, reason: string): void => {
  errors.push(`${path}:${reason}`);
};

const isSensitiveKey = (key: string): boolean =>
  /(?:^|_)(?:answer|answers|credential|credentials|secret|token|privateKey|teacherNotes|authorNotes|pdfBytes|sourceBytes|rawPayload|importEvidence)(?:$|_)/iu.test(key)
  || /^(?:answer|answers|acceptedAnswers|acceptedOptionIndexes|acceptedPairs|acceptedOrder)$/iu.test(key);

const exactRecord = (
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  errors: ValidationErrors,
): value is PlainRecord => {
  if (!isPlainRecord(value)) {
    add(errors, path, 'invalid-record');
    return false;
  }
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedSet.has(key)) {
      add(errors, pathKey(path, key), isSensitiveKey(String(key)) ? 'sensitive-field' : 'unknown-field');
    } else if (!isOwnEnumerable(value, key)) {
      add(errors, pathKey(path, key), 'non-enumerable-field');
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key) || !isOwnEnumerable(value, key)) {
      add(errors, pathKey(path, key), 'missing-field');
    }
  }
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) add(errors, pathKey(path, key), 'undefined-field');
  }
  return true;
};

const validString = (
  value: unknown,
  path: string,
  errors: ValidationErrors,
  maximum: number = CANONICAL_ACTIVITY_VERSION_LIMITS.maxTextLength,
  nonEmpty: boolean = true,
): value is string => {
  if (typeof value !== 'string' || value.length > maximum || (nonEmpty && value.length === 0)) {
    add(errors, path, 'invalid-string');
    return false;
  }
  return true;
};

const validId = (value: unknown, path: string, errors: ValidationErrors): value is string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    add(errors, path, 'invalid-id');
    return false;
  }
  return true;
};

const validPathId = (value: unknown, path: string, errors: ValidationErrors): value is string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) {
    add(errors, path, 'invalid-path-id');
    return false;
  }
  return true;
};

const validEvidenceRef = (value: unknown, path: string, errors: ValidationErrors): value is string => {
  if (typeof value !== 'string' || !EVIDENCE_REF.test(value)) {
    add(errors, path, 'invalid-evidence-ref');
    return false;
  }
  return true;
};

const validPositiveInteger = (value: unknown, path: string, errors: ValidationErrors): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    add(errors, path, 'invalid-positive-integer');
    return false;
  }
  return true;
};

const validNonNegativeInteger = (value: unknown, path: string, errors: ValidationErrors): value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    add(errors, path, 'invalid-non-negative-integer');
    return false;
  }
  return true;
};

const validFiniteNumber = (value: unknown, path: string, errors: ValidationErrors): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    add(errors, path, 'invalid-number');
    return false;
  }
  return true;
};

const validBoundedArray = (
  value: unknown,
  path: string,
  errors: ValidationErrors,
  maximum: number,
  minimum = 0,
): value is unknown[] => {
  if (!Array.isArray(value)) {
    add(errors, path, 'invalid-array');
    return false;
  }
  if (value.length < minimum || value.length > maximum) add(errors, path, 'array-limit-exceeded');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    const index = typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) ? Number(key) : -1;
    if (index < 0 || index >= value.length || !isOwnEnumerable(value, key)) {
      add(errors, `${path}.${String(key)}`, 'invalid-array-property');
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) add(errors, `${path}[${index}]`, 'sparse-array');
  }
  return true;
};

const validateStringArray = (
  value: unknown,
  path: string,
  errors: ValidationErrors,
  maximum: number,
  pattern: 'id' | 'evidence' | 'text' = 'id',
  minimum = 0,
): string[] => {
  if (!validBoundedArray(value, path, errors, maximum, minimum)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const stringEntry = pattern === 'id'
      ? (validId(entry, entryPath, errors) ? entry : null)
      : pattern === 'evidence'
        ? (validEvidenceRef(entry, entryPath, errors) ? entry : null)
        : (validString(entry, entryPath, errors) ? entry : null);
    if (stringEntry === null) return;
    if (seen.has(stringEntry)) add(errors, entryPath, 'duplicate-identity');
    seen.add(stringEntry);
    result.push(stringEntry);
  });
  return result;
};

const validateSourcePages = (
  value: unknown,
  path: string,
  errors: ValidationErrors,
): SourceQualifiedPageIdentity[] => {
  if (!validBoundedArray(value, path, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxSourcePages)) return [];
  const result: SourceQualifiedPageIdentity[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!exactRecord(entry, ['sourceKey', 'sourceVersionId', 'physicalPageNumber'], ['sourceKey', 'sourceVersionId', 'physicalPageNumber'], entryPath, errors)) return;
    const sourceKey = entry.sourceKey;
    const sourceVersionId = entry.sourceVersionId;
    const physicalPageNumber = entry.physicalPageNumber;
    const sourceKeyValid = validId(sourceKey, `${entryPath}.sourceKey`, errors);
    const sourceVersionValid = validId(sourceVersionId, `${entryPath}.sourceVersionId`, errors);
    const pageValid = validPositiveInteger(physicalPageNumber, `${entryPath}.physicalPageNumber`, errors);
    if (!sourceKeyValid || !sourceVersionValid || !pageValid) return;
    const identity = `${sourceKey}\u0000${sourceVersionId}\u0000${physicalPageNumber}`;
    if (seen.has(identity)) add(errors, entryPath, 'duplicate-source-page');
    seen.add(identity);
    result.push({
      sourceKey,
      sourceVersionId,
      physicalPageNumber,
    });
  });
  return result;
};

const validateSourceAssisted = (
  value: unknown,
  family: string,
  path: string,
  errors: ValidationErrors,
): void => {
  if (!exactRecord(value, ['questionLabel', 'accessiblePrompt', 'responseShape', 'sourceExerciseLabel', 'sourcePartLabel'], ['questionLabel', 'accessiblePrompt', 'responseShape'], path, errors)) return;
  validString(value.questionLabel, `${path}.questionLabel`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
  validString(value.accessiblePrompt, `${path}.accessiblePrompt`, errors);
  if (value.sourceExerciseLabel !== undefined) validString(value.sourceExerciseLabel, `${path}.sourceExerciseLabel`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
  if (value.sourcePartLabel !== undefined) validString(value.sourcePartLabel, `${path}.sourcePartLabel`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
  if (value.sourceExerciseLabel === undefined && value.sourcePartLabel === undefined) add(errors, path, 'missing-source-correspondence');
  const expectedShapes: Record<string, readonly string[]> = {
    choice: ['choice', 'single-choice', 'multiple-choice'],
    'text-entry': ['text', 'short-text'],
    matching: ['matching'],
    ordering: ['ordering'],
    'long-response': ['long-response', 'long-text'],
  };
  if (!validString(value.responseShape, `${path}.responseShape`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength)
    || !(expectedShapes[family] ?? []).includes(value.responseShape)) {
    add(errors, `${path}.responseShape`, 'cross-family-mismatch');
  }
};

const itemIdentityValues = (value: PlainRecord): string[] => {
  const identities = value.itemIdentities as PlainRecord;
  if (identities.family === 'choice') return identities.optionIds as string[];
  if (identities.family === 'matching') return [...identities.leftItemIds as string[], ...identities.rightItemIds as string[]];
  return identities.itemIds as string[];
};

const validateTaskProfile = (value: unknown, path: string, errors: ValidationErrors): ActivityTaskProfile | null => {
  if (value === null) return null;
  if (!exactRecord(value, ['taxonomyId', 'typeId', 'taxonomyVersion'], ['taxonomyId', 'typeId', 'taxonomyVersion'], path, errors)) return null;
  const taxonomyId = value.taxonomyId;
  const typeId = value.typeId;
  const taxonomyVersion = value.taxonomyVersion;
  const taxonomyValid = validId(taxonomyId, `${path}.taxonomyId`, errors);
  const typeValid = validId(typeId, `${path}.typeId`, errors);
  const versionValid = validPositiveInteger(taxonomyVersion, `${path}.taxonomyVersion`, errors);
  if (!taxonomyValid || !typeValid || !versionValid) return null;
  return { taxonomyId, typeId, taxonomyVersion };
};

const validateActivity = (value: unknown, path: string, errors: ValidationErrors): NormalizedActivity | null => {
  const activityKeys = [
    'schemaVersion', 'title', 'taskProfile', 'presentationMode', 'contextRequirement',
    'instructions', 'stimulus', 'assetRefs', 'interaction', 'answerRule', 'interactions', 'scoring',
  ] as const;
  if (!exactRecord(value, activityKeys, [...activityKeys], path, errors)) return null;
  if (value.schemaVersion !== 1) add(errors, `${path}.schemaVersion`, 'unsupported-schema-version');
  validString(value.title, `${path}.title`, errors);
  const taskProfile = validateTaskProfile(value.taskProfile, `${path}.taskProfile`, errors);
  if (!PRESENTATION_MODES.includes(value.presentationMode as never)) add(errors, `${path}.presentationMode`, 'invalid-enum');
  const presentationMode = value.presentationMode as string;

  let contextMode: string | undefined;
  let contextAcceptedKinds: string[] = [];
  if (exactRecord(value.contextRequirement, ['mode', 'acceptedKinds'], ['mode', 'acceptedKinds'], `${path}.contextRequirement`, errors)) {
    contextMode = value.contextRequirement.mode as string;
    if (!CONTEXT_MODES.includes(contextMode as never)) add(errors, `${path}.contextRequirement.mode`, 'invalid-enum');
    contextAcceptedKinds = validateStringArray(value.contextRequirement.acceptedKinds, `${path}.contextRequirement.acceptedKinds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxContextKinds, 'text');
  }

  if (validBoundedArray(value.instructions, `${path}.instructions`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxInstructions)) {
    value.instructions.forEach((entry, index) => {
      const entryPath = `${path}.instructions[${index}]`;
      if (exactRecord(entry, ['text'], ['text'], entryPath, errors)) validString(entry.text, `${entryPath}.text`, errors);
    });
  }

  if (value.stimulus !== null && exactRecord(value.stimulus, ['kind', 'text'], ['kind'], `${path}.stimulus`, errors)) {
    validString(value.stimulus.kind, `${path}.stimulus.kind`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
    if (value.stimulus.text !== undefined) validString(value.stimulus.text, `${path}.stimulus.text`, errors);
  }

  const assetRefs: Array<{ kind: 'image' | 'audio'; assetId: string }> = [];
  if (validBoundedArray(value.assetRefs, `${path}.assetRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAssetRefs)) {
    value.assetRefs.forEach((entry, index) => {
      const entryPath = `${path}.assetRefs[${index}]`;
      if (!exactRecord(entry, ['kind', 'assetId'], ['kind', 'assetId'], entryPath, errors)) return;
      if (entry.kind !== 'image' && entry.kind !== 'audio') add(errors, `${entryPath}.kind`, 'invalid-enum');
      if (validId(entry.assetId, `${entryPath}.assetId`, errors) && (entry.kind === 'image' || entry.kind === 'audio')) {
        assetRefs.push({ kind: entry.kind, assetId: entry.assetId });
      }
    });
  }

  let family: string | undefined;
  let variant: string | undefined;
  if (exactRecord(value.interaction, ['family', 'variant'], ['family', 'variant'], `${path}.interaction`, errors)) {
    family = value.interaction.family as string;
    variant = value.interaction.variant as string;
    if (!ACTIVITY_FAMILIES.includes(family as never)) add(errors, `${path}.interaction.family`, 'invalid-enum');
    validString(variant, `${path}.interaction.variant`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
  }

  const answerRule = value.answerRule;
  if (!exactRecord(answerRule, ['defaultPoints', 'normalization', 'requiredSelectionCount', 'allowOptionReuse'], ['defaultPoints', 'normalization'], `${path}.answerRule`, errors)) {
    // Continue validating the rest of the Activity so callers receive all useful errors.
  } else {
    validFiniteNumber(answerRule.defaultPoints, `${path}.answerRule.defaultPoints`, errors);
    if (!NORMALIZATIONS.includes(answerRule.normalization as never)) add(errors, `${path}.answerRule.normalization`, 'invalid-enum');
    if (answerRule.requiredSelectionCount !== undefined) {
      validPositiveInteger(answerRule.requiredSelectionCount, `${path}.answerRule.requiredSelectionCount`, errors);
      if (family !== 'choice') add(errors, `${path}.answerRule.requiredSelectionCount`, 'cross-family-mismatch');
    }
    if (answerRule.allowOptionReuse !== undefined) {
      if (typeof answerRule.allowOptionReuse !== 'boolean') add(errors, `${path}.answerRule.allowOptionReuse`, 'invalid-boolean');
      if (family !== 'matching') add(errors, `${path}.answerRule.allowOptionReuse`, 'cross-family-mismatch');
    }
  }

  const interactions: PlainRecord[] = [];
  const interactionIds = new Set<string>();
  const itemIds = new Set<string>();
  if (validBoundedArray(value.interactions, `${path}.interactions`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxInteractions, 1)) {
    value.interactions.forEach((entry, index) => {
      const entryPath = `${path}.interactions[${index}]`;
      const common = ['family', 'interactionId', 'prompt', 'feedback', 'points', 'sourceAssisted', 'itemIdentities', 'answerKey'];
      const familyFields: Record<string, readonly string[]> = {
        choice: [...common, 'options'],
        'text-entry': common,
        matching: [...common, 'leftItems', 'rightItems'],
        ordering: [...common, 'orderingItems'],
        'long-response': [...common, 'rubric'],
      };
      if (!exactRecord(entry, familyFields[family ?? ''] ?? common, ['family', 'interactionId', 'prompt', 'itemIdentities', 'answerKey'], entryPath, errors)) return;
      if (entry.family !== family) add(errors, `${entryPath}.family`, 'cross-family-mismatch');
       const interactionId = entry.interactionId;
       const interactionIdValid = validId(interactionId, `${entryPath}.interactionId`, errors);
       if (interactionIdValid && interactionIds.has(interactionId)) add(errors, `${entryPath}.interactionId`, 'duplicate-identity');
       if (interactionIdValid) interactionIds.add(interactionId);
      validString(entry.prompt, `${entryPath}.prompt`, errors);
      if (entry.feedback !== undefined) validString(entry.feedback, `${entryPath}.feedback`, errors);
      if (entry.points !== undefined) validFiniteNumber(entry.points, `${entryPath}.points`, errors);
      if (entry.sourceAssisted !== undefined) {
        validateSourceAssisted(entry.sourceAssisted, family ?? '', `${entryPath}.sourceAssisted`, errors);
        if (presentationMode !== 'source-assisted') add(errors, `${entryPath}.sourceAssisted`, 'cross-family-mismatch');
      } else if (presentationMode === 'source-assisted') {
        add(errors, `${entryPath}.sourceAssisted`, 'missing-source-assistance');
      }

      if (!family || !ACTIVITY_FAMILIES.includes(family as never)) return;
      const identityKeys: Record<string, readonly string[]> = {
        choice: ['family', 'optionIds'],
        'text-entry': ['family', 'itemIds'],
        matching: ['family', 'leftItemIds', 'rightItemIds'],
        ordering: ['family', 'itemIds'],
        'long-response': ['family', 'itemIds'],
      };
      if (!exactRecord(entry.itemIdentities, identityKeys[family]!, identityKeys[family]!, `${entryPath}.itemIdentities`, errors)) return;
      if (entry.itemIdentities.family !== family) add(errors, `${entryPath}.itemIdentities.family`, 'cross-family-mismatch');
      const identityArrays: string[][] = [];
      if (family === 'choice') identityArrays.push(validateStringArray(entry.itemIdentities.optionIds, `${entryPath}.itemIdentities.optionIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 'id', 1));
      else if (family === 'matching') {
        identityArrays.push(validateStringArray(entry.itemIdentities.leftItemIds, `${entryPath}.itemIdentities.leftItemIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 'id', 1));
        identityArrays.push(validateStringArray(entry.itemIdentities.rightItemIds, `${entryPath}.itemIdentities.rightItemIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 'id', 1));
      } else {
        identityArrays.push(validateStringArray(entry.itemIdentities.itemIds, `${entryPath}.itemIdentities.itemIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction));
        if (family === 'ordering' && identityArrays[0]!.length === 0) add(errors, `${entryPath}.itemIdentities.itemIds`, 'empty-items');
      }
      for (const id of identityArrays.flat()) {
        if (itemIds.has(id)) add(errors, `${entryPath}.itemIdentities`, 'duplicate-identity');
        itemIds.add(id);
      }

      if (family === 'choice') {
        if (!validBoundedArray(entry.options, `${entryPath}.options`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 1)) return;
        entry.options.forEach((option, optionIndex) => validString(option, `${entryPath}.options[${optionIndex}]`, errors));
        if (entry.options.length !== identityArrays[0]!.length) add(errors, `${entryPath}.options`, 'identity-cardinality-mismatch');
      } else if (family === 'matching') {
        const leftItemsValue = entry.leftItems;
        const rightItemsValue = entry.rightItems;
        const leftItems = validBoundedArray(leftItemsValue, `${entryPath}.leftItems`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 1)
          ? leftItemsValue
          : null;
        const rightItems = validBoundedArray(rightItemsValue, `${entryPath}.rightItems`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 1)
          ? rightItemsValue
          : null;
        if (leftItems !== null) leftItems.forEach((item, itemIndex) => validString(item, `${entryPath}.leftItems[${itemIndex}]`, errors));
        if (rightItems !== null) rightItems.forEach((item, itemIndex) => validString(item, `${entryPath}.rightItems[${itemIndex}]`, errors));
        if (leftItems !== null && leftItems.length !== identityArrays[0]!.length) add(errors, `${entryPath}.leftItems`, 'identity-cardinality-mismatch');
        if (rightItems !== null && rightItems.length !== identityArrays[1]!.length) add(errors, `${entryPath}.rightItems`, 'identity-cardinality-mismatch');
      } else if (family === 'ordering') {
        if (validBoundedArray(entry.orderingItems, `${entryPath}.orderingItems`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 1)) {
          entry.orderingItems.forEach((item, itemIndex) => validString(item, `${entryPath}.orderingItems[${itemIndex}]`, errors));
          if (entry.orderingItems.length !== identityArrays[0]!.length) add(errors, `${entryPath}.orderingItems`, 'identity-cardinality-mismatch');
        }
      } else if (family === 'long-response') {
        if (!exactRecord(entry.rubric, ['criteria'], ['criteria'], `${entryPath}.rubric`, errors)) return;
        validateStringArray(entry.rubric.criteria, `${entryPath}.rubric.criteria`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 'text', 1);
      }

      const answerKeys: Record<string, readonly string[]> = {
        choice: ['family', 'acceptedOptionItemIds'],
        'text-entry': ['family', 'acceptedAnswers'],
        matching: ['family', 'acceptedPairs'],
        ordering: ['family', 'acceptedOrderItemIds'],
        'long-response': ['family', 'rubric'],
      };
      if (!exactRecord(entry.answerKey, answerKeys[family]!, answerKeys[family]!, `${entryPath}.answerKey`, errors)) return;
      if (entry.answerKey.family !== family) add(errors, `${entryPath}.answerKey.family`, 'cross-family-mismatch');
      if (family === 'choice') {
        const accepted = validateStringArray(entry.answerKey.acceptedOptionItemIds, `${entryPath}.answerKey.acceptedOptionItemIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAcceptedAnswers, 'id', 1);
        if (accepted.some((id) => !identityArrays[0]!.includes(id))) add(errors, `${entryPath}.answerKey.acceptedOptionItemIds`, 'answer-identity-mismatch');
      } else if (family === 'text-entry') {
        validateStringArray(entry.answerKey.acceptedAnswers, `${entryPath}.answerKey.acceptedAnswers`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAcceptedAnswers, 'text', 1);
      } else if (family === 'matching') {
        if (validBoundedArray(entry.answerKey.acceptedPairs, `${entryPath}.answerKey.acceptedPairs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAcceptedPairs, 1)) {
          const leftSeen = new Set<string>();
          const rightSeen = new Set<string>();
          entry.answerKey.acceptedPairs.forEach((pair, pairIndex) => {
            const pairPath = `${entryPath}.answerKey.acceptedPairs[${pairIndex}]`;
            if (!exactRecord(pair, ['leftItemId', 'rightItemId'], ['leftItemId', 'rightItemId'], pairPath, errors)) return;
             const leftItemId = pair.leftItemId;
             const rightItemId = pair.rightItemId;
             const leftValid = validId(leftItemId, `${pairPath}.leftItemId`, errors);
             const rightValid = validId(rightItemId, `${pairPath}.rightItemId`, errors);
             const answerRulePresent = Boolean(answerRule);
             const answerRuleAllowsOptionReuse = answerRule !== null
               && (typeof answerRule === 'object' || typeof answerRule === 'function')
               && Reflect.get(answerRule, 'allowOptionReuse') === true;
             if (leftValid && !identityArrays[0]!.includes(leftItemId)) add(errors, `${pairPath}.leftItemId`, 'answer-identity-mismatch');
             if (rightValid && !identityArrays[1]!.includes(rightItemId)) add(errors, `${pairPath}.rightItemId`, 'answer-identity-mismatch');
             if (leftValid && leftSeen.has(leftItemId)) add(errors, `${pairPath}.leftItemId`, 'duplicate-identity');
             if (rightValid && answerRulePresent && !answerRuleAllowsOptionReuse && rightSeen.has(rightItemId)) add(errors, `${pairPath}.rightItemId`, 'duplicate-identity');
             if (leftValid) leftSeen.add(leftItemId);
             if (rightValid) rightSeen.add(rightItemId);
          });
          if (entry.answerKey.acceptedPairs.length !== identityArrays[0]!.length) add(errors, `${entryPath}.answerKey.acceptedPairs`, 'answer-cardinality-mismatch');
        }
      } else if (family === 'ordering') {
        const accepted = validateStringArray(entry.answerKey.acceptedOrderItemIds, `${entryPath}.answerKey.acceptedOrderItemIds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAcceptedAnswers, 'id', 1);
        if (accepted.length !== identityArrays[0]!.length) add(errors, `${entryPath}.answerKey.acceptedOrderItemIds`, 'answer-cardinality-mismatch');
        if (accepted.some((id) => !identityArrays[0]!.includes(id))) add(errors, `${entryPath}.answerKey.acceptedOrderItemIds`, 'answer-identity-mismatch');
      } else {
        if (!exactRecord(entry.answerKey.rubric, ['criteria'], ['criteria'], `${entryPath}.answerKey.rubric`, errors)) return;
        validateStringArray(entry.answerKey.rubric.criteria, `${entryPath}.answerKey.rubric.criteria`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 'text', 1);
      }
      interactions.push(entry);
    });
  }

  if (exactRecord(value.scoring, ['mode'], ['mode'], `${path}.scoring`, errors)) {
    const modes = family === 'long-response' ? ['review-required'] : ['auto-where-possible', 'review-required'];
    if (!modes.includes(value.scoring.mode as string)) add(errors, `${path}.scoring.mode`, 'invalid-enum');
  }
  if (contextMode === 'none' && presentationMode === 'source-assisted') add(errors, `${path}.contextRequirement.mode`, 'cross-family-mismatch');

  if (errors.some((error) => error.startsWith(`${path}.`))) return null;
  return {
    schemaVersion: 1,
    title: value.title as string,
    taskProfile,
    presentationMode: value.presentationMode as NormalizedActivity['presentationMode'],
    contextRequirement: {
      mode: contextMode as NormalizedActivity['contextRequirement']['mode'],
      acceptedKinds: contextAcceptedKinds,
    },
    instructions: (value.instructions as PlainRecord[]).map((entry) => ({ text: entry.text as string })),
    stimulus: value.stimulus === null ? null : {
      kind: (value.stimulus as PlainRecord).kind as string,
      ...((value.stimulus as PlainRecord).text === undefined ? {} : { text: (value.stimulus as PlainRecord).text as string }),
    },
    assetRefs,
    interaction: { family: family as NormalizedActivity['interaction']['family'], variant: variant as string },
    answerRule: {
      defaultPoints: (answerRule as PlainRecord).defaultPoints as number,
      normalization: (answerRule as PlainRecord).normalization as NormalizedActivity['answerRule']['normalization'],
      ...((answerRule as PlainRecord).requiredSelectionCount === undefined ? {} : { requiredSelectionCount: (answerRule as PlainRecord).requiredSelectionCount as number }),
      ...((answerRule as PlainRecord).allowOptionReuse === undefined ? {} : { allowOptionReuse: (answerRule as PlainRecord).allowOptionReuse as boolean }),
    } as NormalizedActivity['answerRule'],
    interactions: interactions as unknown as NormalizedActivity['interactions'],
    scoring: { mode: (value.scoring as PlainRecord).mode as NormalizedActivity['scoring']['mode'] },
  } as NormalizedActivity;
};

const projectionInteractionKeys = ['interactionId', 'prompt', 'sourceAssisted'] as const;

const validateProjection = (value: unknown, activity: NormalizedActivity, path: string, errors: ValidationErrors): StudentActivityProjection | null => {
  const keys = ['schemaVersion', 'title', 'taskProfile', 'presentationMode', 'contextRequirement', 'instructions', 'stimulus', 'assetRefs', 'interaction', 'answerRule', 'interactions', 'scoring'] as const;
  if (!exactRecord(value, keys, [...keys], path, errors)) return null;
  if (value.schemaVersion !== 1) add(errors, `${path}.schemaVersion`, 'unsupported-schema-version');
  validString(value.title, `${path}.title`, errors);
  validateTaskProfile(value.taskProfile, `${path}.taskProfile`, errors);
  if (value.presentationMode !== activity.presentationMode) add(errors, `${path}.presentationMode`, 'cross-family-mismatch');
  if (exactRecord(value.contextRequirement, ['mode', 'acceptedKinds'], ['mode', 'acceptedKinds'], `${path}.contextRequirement`, errors)) {
    if (value.contextRequirement.mode !== activity.contextRequirement.mode) add(errors, `${path}.contextRequirement.mode`, 'cross-family-mismatch');
    validateStringArray(value.contextRequirement.acceptedKinds, `${path}.contextRequirement.acceptedKinds`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxContextKinds, 'text');
  }
  if (validBoundedArray(value.instructions, `${path}.instructions`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxInstructions)) {
    value.instructions.forEach((entry, index) => {
      if (exactRecord(entry, ['text'], ['text'], `${path}.instructions[${index}]`, errors)) validString(entry.text, `${path}.instructions[${index}].text`, errors);
    });
  }
  if (value.stimulus !== null && exactRecord(value.stimulus, ['kind', 'text'], ['kind'], `${path}.stimulus`, errors)) {
    validString(value.stimulus.kind, `${path}.stimulus.kind`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
    if (value.stimulus.text !== undefined) validString(value.stimulus.text, `${path}.stimulus.text`, errors);
  }
  if (validBoundedArray(value.assetRefs, `${path}.assetRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxAssetRefs)) {
    value.assetRefs.forEach((entry, index) => {
      if (!exactRecord(entry, ['kind', 'assetId'], ['kind', 'assetId'], `${path}.assetRefs[${index}]`, errors)) return;
      if (entry.kind !== 'image' && entry.kind !== 'audio') add(errors, `${path}.assetRefs[${index}].kind`, 'invalid-enum');
      validId(entry.assetId, `${path}.assetRefs[${index}].assetId`, errors);
    });
  }
  const family = value.interaction && isPlainRecord(value.interaction) ? value.interaction.family as string : '';
  if (exactRecord(value.interaction, ['family', 'variant'], ['family', 'variant'], `${path}.interaction`, errors)) {
    if (family !== activity.interaction.family) add(errors, `${path}.interaction.family`, 'cross-family-mismatch');
    validString(value.interaction.variant, `${path}.interaction.variant`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength);
  }
  const answerRuleKeys = family === 'choice'
    ? ['defaultPoints', 'normalization', 'requiredSelectionCount']
    : family === 'matching'
      ? ['defaultPoints', 'normalization', 'allowOptionReuse']
      : ['defaultPoints', 'normalization'];
  if (exactRecord(value.answerRule, answerRuleKeys, ['defaultPoints', 'normalization'], `${path}.answerRule`, errors)) {
    validFiniteNumber(value.answerRule.defaultPoints, `${path}.answerRule.defaultPoints`, errors);
    if (!NORMALIZATIONS.includes(value.answerRule.normalization as never)) add(errors, `${path}.answerRule.normalization`, 'invalid-enum');
    if (value.answerRule.requiredSelectionCount !== undefined) validPositiveInteger(value.answerRule.requiredSelectionCount, `${path}.answerRule.requiredSelectionCount`, errors);
    if (value.answerRule.allowOptionReuse !== undefined && typeof value.answerRule.allowOptionReuse !== 'boolean') add(errors, `${path}.answerRule.allowOptionReuse`, 'invalid-boolean');
  }
  if (validBoundedArray(value.interactions, `${path}.interactions`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxInteractions, 1)) {
    const seen = new Set<string>();
    value.interactions.forEach((entry, index) => {
      const entryPath = `${path}.interactions[${index}]`;
      const familyKeys: Record<string, readonly string[]> = {
        choice: [...projectionInteractionKeys, 'family', 'options'],
        'text-entry': [...projectionInteractionKeys, 'family'],
        matching: [...projectionInteractionKeys, 'family', 'leftItems', 'rightItems'],
        ordering: [...projectionInteractionKeys, 'family', 'items'],
        'long-response': [...projectionInteractionKeys, 'family'],
      };
      if (!exactRecord(entry, familyKeys[family] ?? [...projectionInteractionKeys, 'family'], ['family', 'interactionId', 'prompt'], entryPath, errors)) return;
      if (entry.family !== family) add(errors, `${entryPath}.family`, 'cross-family-mismatch');
      if (validId(entry.interactionId, `${entryPath}.interactionId`, errors) && seen.has(entry.interactionId)) add(errors, `${entryPath}.interactionId`, 'duplicate-identity');
      seen.add(entry.interactionId as string);
      validString(entry.prompt, `${entryPath}.prompt`, errors);
      if (entry.sourceAssisted !== undefined) validateSourceAssisted(entry.sourceAssisted, family, `${entryPath}.sourceAssisted`, errors);
      const validateItems = (items: unknown, itemPath: string): void => {
        if (!validBoundedArray(items, itemPath, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxItemsPerInteraction, 1)) return;
        items.forEach((item, itemIndex) => {
          if (!exactRecord(item, ['itemId', 'label'], ['itemId', 'label'], `${itemPath}[${itemIndex}]`, errors)) return;
          validId(item.itemId, `${itemPath}[${itemIndex}].itemId`, errors);
          validString(item.label, `${itemPath}[${itemIndex}].label`, errors);
        });
      };
      if (family === 'choice') validateItems((entry as PlainRecord).options, `${entryPath}.options`);
      if (family === 'matching') {
        validateItems((entry as PlainRecord).leftItems, `${entryPath}.leftItems`);
        validateItems((entry as PlainRecord).rightItems, `${entryPath}.rightItems`);
      }
      if (family === 'ordering') validateItems((entry as PlainRecord).items, `${entryPath}.items`);
    });
  }
  if (exactRecord(value.scoring, ['mode', 'feedbackVisibility'], ['mode', 'feedbackVisibility'], `${path}.scoring`, errors)) {
    if (value.scoring.mode !== activity.scoring.mode) add(errors, `${path}.scoring.mode`, 'cross-family-mismatch');
    if (!FEEDBACK_VISIBILITIES.includes(value.scoring.feedbackVisibility as never)) add(errors, `${path}.scoring.feedbackVisibility`, 'invalid-enum');
  }
  if (errors.some((error) => error.startsWith(`${path}.`))) return null;
  return value as unknown as StudentActivityProjection;
};

const validateContext = (value: unknown, path: string, errors: ValidationErrors): CanonicalActivityRevisionContext | null => {
  const keys = ['fingerprint', 'sourceContextFingerprint', 'sourceVersionId', 'pageGroupId', 'mappedBookPageRefs'] as const;
  if (!exactRecord(value, keys, [], path, errors)) return null;
  if (value.fingerprint !== undefined && (typeof value.fingerprint !== 'string' || !FINGERPRINT.test(value.fingerprint))) add(errors, `${path}.fingerprint`, 'invalid-fingerprint');
  if (value.sourceContextFingerprint !== undefined && value.sourceContextFingerprint !== null && !validString(value.sourceContextFingerprint, `${path}.sourceContextFingerprint`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength)) return null;
  if (value.sourceVersionId !== undefined) validId(value.sourceVersionId, `${path}.sourceVersionId`, errors);
  if (value.pageGroupId !== undefined) validId(value.pageGroupId, `${path}.pageGroupId`, errors);
  if (value.mappedBookPageRefs !== undefined) validateStringArray(value.mappedBookPageRefs, `${path}.mappedBookPageRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxMappedBookPageRefs, 'evidence');
  if (value.fingerprint === undefined && value.sourceContextFingerprint === undefined && value.sourceVersionId === undefined && value.pageGroupId === undefined && value.mappedBookPageRefs === undefined) add(errors, path, 'empty-context');
  return value as unknown as CanonicalActivityRevisionContext;
};

const validateProvenance = (
  value: unknown,
  path: string,
  activityVersion: number,
  hasPredecessor: boolean,
  activityId: string,
  ownerId: string,
  placementIds: readonly string[],
  recordSourceContextFingerprint: string | null,
  errors: ValidationErrors,
): CanonicalPublishedActivityVersionProvenance | null => {
  if (!isPlainRecord(value)) {
    add(errors, path, 'invalid-record');
    return null;
  }
  if (value.kind === 'initial-book-publication') {
    const keys = ['kind', 'bookId', 'manifestVersionId', 'publicationId', 'publicationRevision', 'unitKey', 'activityKey', 'sourcePages'] as const;
    if (!exactRecord(value, keys, [...keys], path, errors)) return null;
    validPathId(value.bookId, `${path}.bookId`, errors);
    validPathId(value.manifestVersionId, `${path}.manifestVersionId`, errors);
    validPathId(value.publicationId, `${path}.publicationId`, errors);
    validPositiveInteger(value.publicationRevision, `${path}.publicationRevision`, errors);
    validId(value.unitKey, `${path}.unitKey`, errors);
    validId(value.activityKey, `${path}.activityKey`, errors);
    const sourcePages = validateSourcePages(value.sourcePages, `${path}.sourcePages`, errors);
    if (hasPredecessor || activityVersion !== 1) add(errors, path, 'cross-family-mismatch');
    return {
      kind: 'initial-book-publication',
      bookId: value.bookId as string,
      manifestVersionId: value.manifestVersionId as string,
      publicationId: value.publicationId as string,
      publicationRevision: value.publicationRevision as number,
      unitKey: value.unitKey as string,
      activityKey: value.activityKey as string,
      sourcePages,
    };
  }
  if (value.kind === 'public-book-fork') {
    const keys = [
      'kind', 'sourceBookId', 'sourceOwnerId', 'sourceManifestVersionId', 'sourcePublicationId',
      'sourcePublicationRevision', 'sourceVersionId', 'sourcePublicationBinding', 'sourceActivityId',
      'sourceActivityVersionId', 'sourceActivityVersion', 'sourcePayloadFingerprint',
      'sourcePlacementIds', 'sourcePlacementSetFingerprint', 'sourceNodeKey', 'sourcePlacementId',
      'sourceUnitKey', 'sourceActivityKey', 'selectionKind', 'selectionPath', 'selectionOrder',
      'sourcePages', 'sourcePageGroupKeys', 'sourceContextFingerprint', 'targetBookId',
      'targetOwnerId', 'targetOriginalNodeId', 'targetPlacementId', 'targetAppendOrder',
      'targetBookUpdatedAt',
    ] as const;
    if (!exactRecord(value, keys, [...keys], path, errors)) return null;

    validPathId(value.sourceBookId, `${path}.sourceBookId`, errors);
    validId(value.sourceOwnerId, `${path}.sourceOwnerId`, errors);
    validPathId(value.sourceManifestVersionId, `${path}.sourceManifestVersionId`, errors);
    validPathId(value.sourcePublicationId, `${path}.sourcePublicationId`, errors);
    validPositiveInteger(value.sourcePublicationRevision, `${path}.sourcePublicationRevision`, errors);
    validId(value.sourceVersionId, `${path}.sourceVersionId`, errors);

    let sourcePublicationBinding: CanonicalPublicBookForkPublicationBinding | null = null;
    if (exactRecord(
      value.sourcePublicationBinding,
      ['manifestVersionId', 'publicationId', 'publicationRevision'],
      ['manifestVersionId', 'publicationId', 'publicationRevision'],
      `${path}.sourcePublicationBinding`,
      errors,
    )) {
      const binding = value.sourcePublicationBinding as PlainRecord;
      validPathId(binding.manifestVersionId, `${path}.sourcePublicationBinding.manifestVersionId`, errors);
      validPathId(binding.publicationId, `${path}.sourcePublicationBinding.publicationId`, errors);
      validPositiveInteger(binding.publicationRevision, `${path}.sourcePublicationBinding.publicationRevision`, errors);
      sourcePublicationBinding = {
        manifestVersionId: binding.manifestVersionId as string,
        publicationId: binding.publicationId as string,
        publicationRevision: binding.publicationRevision as number,
      };
    }

    validPathId(value.sourceActivityId, `${path}.sourceActivityId`, errors);
    validPathId(value.sourceActivityVersionId, `${path}.sourceActivityVersionId`, errors);
    validPositiveInteger(value.sourceActivityVersion, `${path}.sourceActivityVersion`, errors);
    if (typeof value.sourcePayloadFingerprint !== 'string' || !FINGERPRINT.test(value.sourcePayloadFingerprint)) {
      add(errors, `${path}.sourcePayloadFingerprint`, 'invalid-fingerprint');
    }
    const sourcePlacementIds = validateStringArray(
      value.sourcePlacementIds,
      `${path}.sourcePlacementIds`,
      errors,
      CANONICAL_ACTIVITY_VERSION_LIMITS.maxPlacementIds,
      'id',
      1,
    );
    const sortedSourcePlacementIds = [...sourcePlacementIds].sort();
    if (sourcePlacementIds.some((id, index) => id !== sortedSourcePlacementIds[index])) {
      add(errors, `${path}.sourcePlacementIds`, 'not-sorted');
    }
    if (typeof value.sourcePlacementSetFingerprint !== 'string' || !FINGERPRINT.test(value.sourcePlacementSetFingerprint)) {
      add(errors, `${path}.sourcePlacementSetFingerprint`, 'invalid-fingerprint');
    } else if (value.sourcePlacementSetFingerprint !== createCanonicalPublicBookForkPlacementSetFingerprint(sourcePlacementIds)) {
      add(errors, `${path}.sourcePlacementSetFingerprint`, 'fingerprint-mismatch');
    }
    validId(value.sourceNodeKey, `${path}.sourceNodeKey`, errors);
    const sourcePlacementIdValid = validId(value.sourcePlacementId, `${path}.sourcePlacementId`, errors);
    if (sourcePlacementIdValid && !sourcePlacementIds.includes(value.sourcePlacementId as string)) {
      add(errors, `${path}.sourcePlacementId`, 'placement-set-mismatch');
    }
    validId(value.sourceUnitKey, `${path}.sourceUnitKey`, errors);
    validId(value.sourceActivityKey, `${path}.sourceActivityKey`, errors);
    if (value.selectionKind !== 'activity') add(errors, `${path}.selectionKind`, 'invalid-enum');
    const selectionPath = validateStringArray(
      value.selectionPath,
      `${path}.selectionPath`,
      errors,
      CANONICAL_ACTIVITY_VERSION_LIMITS.maxSelectionPath,
      'id',
      1,
    );
    validNonNegativeInteger(value.selectionOrder, `${path}.selectionOrder`, errors);
    const sourcePages = validateSourcePages(value.sourcePages, `${path}.sourcePages`, errors);
    const sourcePageGroupKeys = validateStringArray(
      value.sourcePageGroupKeys,
      `${path}.sourcePageGroupKeys`,
      errors,
      CANONICAL_ACTIVITY_VERSION_LIMITS.maxSourcePageGroupKeys,
      'id',
    );
    if (value.sourceContextFingerprint !== null
      && (typeof value.sourceContextFingerprint !== 'string' || !SOURCE_CONTEXT_FINGERPRINT.test(value.sourceContextFingerprint))) {
      add(errors, `${path}.sourceContextFingerprint`, 'invalid-fingerprint');
    }
    validPathId(value.targetBookId, `${path}.targetBookId`, errors);
    validId(value.targetOwnerId, `${path}.targetOwnerId`, errors);
    validPathId(value.targetOriginalNodeId, `${path}.targetOriginalNodeId`, errors);
    const targetPlacementIdValid = validPathId(value.targetPlacementId, `${path}.targetPlacementId`, errors);
    validNonNegativeInteger(value.targetAppendOrder, `${path}.targetAppendOrder`, errors);
    if (typeof value.targetBookUpdatedAt !== 'string'
      || !ISO_DATE.test(value.targetBookUpdatedAt)
      || Number.isNaN(Date.parse(value.targetBookUpdatedAt))) {
      add(errors, `${path}.targetBookUpdatedAt`, 'invalid-iso-date');
    }

    if (activityVersion !== 1 || hasPredecessor) add(errors, path, 'cross-family-mismatch');
    if (value.sourceActivityId === activityId) add(errors, `${path}.sourceActivityId`, 'cross-family-mismatch');
    if (value.targetOwnerId !== ownerId) add(errors, `${path}.targetOwnerId`, 'owner-mismatch');
    if (targetPlacementIdValid && (placementIds.length !== 1 || placementIds[0] !== value.targetPlacementId)) {
      add(errors, `${path}.targetPlacementId`, 'placement-mismatch');
    }
    if (sourcePublicationBinding !== null && (
      sourcePublicationBinding.manifestVersionId !== value.sourceManifestVersionId
      || sourcePublicationBinding.publicationId !== value.sourcePublicationId
      || sourcePublicationBinding.publicationRevision !== value.sourcePublicationRevision
    )) {
      add(errors, `${path}.sourcePublicationBinding`, 'binding-mismatch');
    }
    if (value.sourceContextFingerprint !== recordSourceContextFingerprint) {
      add(errors, `${path}.sourceContextFingerprint`, 'context-mismatch');
    }
    const bindingValue = isPlainRecord(value.sourcePublicationBinding)
      ? value.sourcePublicationBinding
      : {};

    return {
      kind: 'public-book-fork',
      sourceBookId: value.sourceBookId as string,
      sourceOwnerId: value.sourceOwnerId as string,
      sourceManifestVersionId: value.sourceManifestVersionId as string,
      sourcePublicationId: value.sourcePublicationId as string,
      sourcePublicationRevision: value.sourcePublicationRevision as number,
      sourceVersionId: value.sourceVersionId as string,
      sourcePublicationBinding: sourcePublicationBinding ?? {
        manifestVersionId: bindingValue.manifestVersionId as string,
        publicationId: bindingValue.publicationId as string,
        publicationRevision: bindingValue.publicationRevision as number,
      },
      sourceActivityId: value.sourceActivityId as string,
      sourceActivityVersionId: value.sourceActivityVersionId as string,
      sourceActivityVersion: value.sourceActivityVersion as number,
      sourcePayloadFingerprint: value.sourcePayloadFingerprint as string,
      sourcePlacementIds,
      sourcePlacementSetFingerprint: value.sourcePlacementSetFingerprint as string,
      sourceNodeKey: value.sourceNodeKey as string,
      sourcePlacementId: value.sourcePlacementId as string,
      sourceUnitKey: value.sourceUnitKey as string,
      sourceActivityKey: value.sourceActivityKey as string,
      selectionKind: 'activity',
      selectionPath,
      selectionOrder: value.selectionOrder as number,
      sourcePages,
      sourcePageGroupKeys,
      sourceContextFingerprint: value.sourceContextFingerprint as string | null,
      targetBookId: value.targetBookId as string,
      targetOwnerId: value.targetOwnerId as string,
      targetOriginalNodeId: value.targetOriginalNodeId as string,
      targetPlacementId: value.targetPlacementId as string,
      targetAppendOrder: value.targetAppendOrder as number,
      targetBookUpdatedAt: value.targetBookUpdatedAt as string,
    };
  }
  if (value.kind === 'activity-revision') {
    const keys = ['kind', 'candidateId', 'candidateRevision', 'evidenceRefs', 'sourceEvidenceRefs', 'answerEvidenceRefs', 'context', 'sourceContext'] as const;
    if (!exactRecord(value, keys, ['kind', 'candidateId', 'evidenceRefs'], path, errors)) return null;
    validId(value.candidateId, `${path}.candidateId`, errors);
    if (value.candidateRevision !== undefined) validPositiveInteger(value.candidateRevision, `${path}.candidateRevision`, errors);
    const evidenceRefs = validateStringArray(value.evidenceRefs, `${path}.evidenceRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxProvenanceEvidenceRefs, 'evidence');
    const sourceEvidenceRefs = value.sourceEvidenceRefs === undefined ? undefined : validateStringArray(value.sourceEvidenceRefs, `${path}.sourceEvidenceRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxProvenanceEvidenceRefs, 'evidence');
    const answerEvidenceRefs = value.answerEvidenceRefs === undefined ? undefined : validateStringArray(value.answerEvidenceRefs, `${path}.answerEvidenceRefs`, errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxProvenanceEvidenceRefs, 'evidence');
    if (value.context === undefined && value.sourceContext === undefined) add(errors, path, 'missing-context');
    if (value.context !== undefined) validateContext(value.context, `${path}.context`, errors);
    if (value.sourceContext !== undefined) validateContext(value.sourceContext, `${path}.sourceContext`, errors);
    if (!hasPredecessor || activityVersion <= 1) add(errors, path, 'cross-family-mismatch');
    return {
      kind: 'activity-revision',
      candidateId: value.candidateId as string,
      ...(value.candidateRevision === undefined ? {} : { candidateRevision: value.candidateRevision as number }),
      evidenceRefs,
      ...(sourceEvidenceRefs === undefined ? {} : { sourceEvidenceRefs }),
      ...(answerEvidenceRefs === undefined ? {} : { answerEvidenceRefs }),
      ...(value.context === undefined ? {} : { context: value.context as CanonicalActivityRevisionContext | null }),
      ...(value.sourceContext === undefined ? {} : { sourceContext: value.sourceContext as CanonicalActivityRevisionContext | null }),
    };
  }
  add(errors, `${path}.kind`, 'invalid-provenance-kind');
  return null;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as PlainRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const fnv1a64 = (value: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

export const createCanonicalActivityVersionFingerprint = (
  recordWithoutPayloadFingerprint: CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint,
): string => fnv1a64(stable(recordWithoutPayloadFingerprint));

export const createCanonicalPublicBookForkPlacementSetFingerprint = (
  placementIds: readonly string[],
): string => fnv1a64(stable([...placementIds].sort()));

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
    Object.freeze(value);
  }
  return value;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export type CanonicalPublishedActivityVersionValidationResult =
  | { readonly valid: true; readonly value: CanonicalPublishedActivityVersionRecord }
  | { readonly valid: false; readonly errors: readonly string[] };

export const validateCanonicalPublishedActivityVersion = (
  value: unknown,
): CanonicalPublishedActivityVersionValidationResult => {
  const errors: ValidationErrors = [];
  const keys = [
    'schemaVersion', 'lifecycle', 'activityId', 'activityVersionId', 'activityVersion', 'ownerId',
    'activity', 'projection', 'payloadFingerprint', 'predecessorActivityVersionId', 'placementIds',
    'evidenceRefs', 'sourceContextFingerprint', 'createdByOperationId', 'publishedAt', 'provenance',
  ] as const;
  if (!exactRecord(value, keys, [
    'schemaVersion', 'lifecycle', 'activityId', 'activityVersionId', 'activityVersion', 'ownerId',
    'activity', 'projection', 'payloadFingerprint', 'placementIds', 'evidenceRefs',
    'sourceContextFingerprint', 'createdByOperationId', 'publishedAt', 'provenance',
  ], '$', errors)) return { valid: false, errors: [...errors] };

  if (value.schemaVersion !== CANONICAL_ACTIVITY_VERSION_SCHEMA_VERSION) add(errors, '$.schemaVersion', 'unsupported-schema-version');
  if (value.lifecycle !== 'published') add(errors, '$.lifecycle', 'invalid-lifecycle');
  validPathId(value.activityId, '$.activityId', errors);
  validPathId(value.activityVersionId, '$.activityVersionId', errors);
  const activityVersionValue = value.activityVersion;
  const validActivityVersion = validPositiveInteger(activityVersionValue, '$.activityVersion', errors)
    ? activityVersionValue
    : null;
  validId(value.ownerId, '$.ownerId', errors);
  if (value.predecessorActivityVersionId !== undefined) {
    validId(value.predecessorActivityVersionId, '$.predecessorActivityVersionId', errors);
    if (value.predecessorActivityVersionId === value.activityVersionId) add(errors, '$.predecessorActivityVersionId', 'self-reference');
  }
  const activity = validateActivity(value.activity, '$.activity', errors);
  const projection = activity ? validateProjection(value.projection, activity, '$.projection', errors) : null;
  if (value.payloadFingerprint !== undefined && (typeof value.payloadFingerprint !== 'string' || !FINGERPRINT.test(value.payloadFingerprint))) add(errors, '$.payloadFingerprint', 'invalid-fingerprint');
  const placementIds = validateStringArray(value.placementIds, '$.placementIds', errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxPlacementIds, 'id');
  const evidenceRefs = validateStringArray(value.evidenceRefs, '$.evidenceRefs', errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxEvidenceRefs, 'evidence');
  if (value.sourceContextFingerprint !== null && !validString(value.sourceContextFingerprint, '$.sourceContextFingerprint', errors, CANONICAL_ACTIVITY_VERSION_LIMITS.maxShortTextLength)) {
    // The helper records the useful path-specific reason.
  }
  validId(value.createdByOperationId, '$.createdByOperationId', errors);
  if (typeof value.publishedAt !== 'string' || !ISO_DATE.test(value.publishedAt) || Number.isNaN(Date.parse(value.publishedAt))) add(errors, '$.publishedAt', 'invalid-iso-date');
  const provenance = validActivityVersion === null
    ? null
    : validateProvenance(
      value.provenance,
      '$.provenance',
      validActivityVersion,
      value.predecessorActivityVersionId !== undefined,
      value.activityId as string,
      value.ownerId as string,
      placementIds,
      value.sourceContextFingerprint as string | null,
      errors,
    );

  if (activity && projection) {
    let expectedProjection: StudentActivityProjection | null = null;
    try {
      expectedProjection = projectStudentActivity(activity);
    } catch {
      add(errors, '$.projection', 'projection-generation-failed');
    }
    if (expectedProjection && stable(expectedProjection) !== stable(value.projection)) add(errors, '$.projection', 'projection-mismatch');
  }

  if (typeof value.payloadFingerprint === 'string' && FINGERPRINT.test(value.payloadFingerprint)) {
    const withoutFingerprint = { ...value } as CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint;
    delete (withoutFingerprint as PlainRecord).payloadFingerprint;
    if (createCanonicalActivityVersionFingerprint(withoutFingerprint) !== value.payloadFingerprint) add(errors, '$.payloadFingerprint', 'fingerprint-mismatch');
  }

  let byteLength = 0;
  try {
    byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    add(errors, '$', 'unserializable-payload');
  }
  if (byteLength > CANONICAL_ACTIVITY_VERSION_LIMITS.maxRecordBytes) add(errors, '$', 'payload-too-large');

  if (errors.length > 0 || !activity || !projection || !provenance) return { valid: false, errors: [...errors] };
  const parsed = clone({
    schemaVersion: 1 as const,
    lifecycle: 'published' as const,
    activityId: value.activityId as string,
    activityVersionId: value.activityVersionId as string,
    activityVersion: value.activityVersion as number,
    ownerId: value.ownerId as string,
    activity,
    projection,
    payloadFingerprint: value.payloadFingerprint as string,
    ...(value.predecessorActivityVersionId === undefined ? {} : { predecessorActivityVersionId: value.predecessorActivityVersionId as string }),
    placementIds,
    evidenceRefs,
    sourceContextFingerprint: value.sourceContextFingerprint as string | null,
    createdByOperationId: value.createdByOperationId as string,
    publishedAt: value.publishedAt as string,
    provenance,
  });
  return { valid: true, value: deepFreeze(parsed) };
};

export const assertCanonicalPublishedActivityVersion = (
  value: unknown,
): CanonicalPublishedActivityVersionRecord => {
  const result = validateCanonicalPublishedActivityVersion(value);
  if (result.valid === false) throw new Error(`invalid_canonical_activity_version:${result.errors[0] ?? 'invalid-record'}`);
  return result.value;
};
