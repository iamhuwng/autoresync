import type { ActivityAuthoringService } from '../book-activity/activityAuthoring.service';
import type { ActivityStageResult } from '../book-activity/activityAuthoring.repository';
import { ActivityAuthoringHttpError } from '../book-activity/activityStorage.service';
import type { BookAssemblyManifestCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import {
  allowedActivitySlotEvidenceRefs,
  BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
  UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
  UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
} from './unitPrompt.service';

const MAX_IMPORT_BYTES = 512 * 1024;
const MAX_BULK_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVITY_TARGET_ID_LENGTH = 160;
const FORBIDDEN_KEYS = /^(activityId|candidateId|ownerId|ownerNodeKey|interactionId|itemId|sourceVersionId|providerObjectKey|providerUrl|objectKey|bucket|credential|credentials|token|privateKey|teacherNotes|react|tsx)$/iu;
const FORBIDDEN_TEXT = /(https?:\/\/|b2:\/\/|backblaze|providerObjectKey|private_key|BEGIN PRIVATE KEY|tsx|<script|function\s+[A-Za-z0-9_]+\s*\()/iu;

export interface UnitActivityImportSlot {
  readonly activityKey: string;
  readonly content: unknown;
  readonly evidenceRefs?: readonly string[];
  readonly sourceEvidenceRefs?: readonly string[];
  readonly answerEvidenceRefs?: readonly string[];
}

export interface UnitActivityImportBundle {
  readonly promptVersion: typeof UNIT_ACTIVITY_IMPORT_PROMPT_VERSION;
  readonly schemaVersion: typeof UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION;
  readonly bookId: string;
  readonly unitKey: string;
  readonly slots: readonly UnitActivityImportSlot[];
}

export interface UnitActivityImportResult {
  readonly bundle: UnitActivityImportBundle;
  readonly staged: readonly StagedUnitActivity[];
}

type StagedUnitActivity = ActivityStageResult & {
  readonly unitActivityBinding: { readonly unitKey: string; readonly activityKey: string };
};

export class UnitActivityImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'UnitActivityImportError';
  }
}

export class UnitActivityImportConflictError extends UnitActivityImportError {
  constructor(
    readonly activityKey: string,
    readonly currentRevision: number,
  ) {
    super(
      'activity-revision-conflict',
      `Activity slot ${activityKey} already has a newer draft. Choose whether to replace it before importing again.`,
    );
    this.name = 'UnitActivityImportConflictError';
  }
}

const hexUtf8 = (value: string): string => Array.from(
  new TextEncoder().encode(value),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('');

/**
 * Activity authoring storage is owner-scoped, while Assembly slot identities
 * are Book-scoped. Encode both identities into the mutation target so the same
 * logical slot key can be reused safely by another Book without weakening CAS.
 */
export const bookScopedActivityTargetId = (bookId: string, activityKey: string): string => {
  const targetActivityId = `ba_${hexUtf8(bookId)}_${hexUtf8(activityKey)}`;
  if (targetActivityId.length > MAX_ACTIVITY_TARGET_ID_LENGTH) {
    throw new UnitActivityImportError(
      'activity-target-too-long',
      'The Book and Activity slot identifiers are too long for a safe authoring target.',
    );
  }
  return targetActivityId;
};

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;
const record = (value: unknown, code = 'invalid-json'): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnitActivityImportError(code, 'Import bundle must be a JSON object.');
  }
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[], optional: readonly string[] = [], code = 'unknown-field'): void => {
  const allowed = new Set([...keys, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new UnitActivityImportError(code, `Field "${key}" is not allowed.`);
  }
  for (const key of keys) {
    if (!(key in value)) throw new UnitActivityImportError('missing-field', `Field "${key}" is required.`);
  }
};
const stringArray = (value: unknown, label: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new UnitActivityImportError('invalid-evidence', `${label} must be a string array.`);
  }
  return [...value];
};
const assertNoForbidden = (value: unknown, path = '$'): void => {
  if (typeof value === 'string') {
    if (FORBIDDEN_TEXT.test(value)) {
      throw new UnitActivityImportError('forbidden-field', `Forbidden source authority or executable text at ${path}.`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbidden(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(key)) {
      throw new UnitActivityImportError('forbidden-field', `Forbidden field "${key}" at ${path}.`);
    }
    assertNoForbidden(entry, `${path}.${key}`);
  }
};
const allowedEvidenceRefsForSlot = (unit: BookUnitCandidate, activityKey: string): Set<string> => (
  new Set(allowedActivitySlotEvidenceRefs(unit, activityKey))
);
const clientMappedBookPageRefsForSlot = (unit: BookUnitCandidate, activityKey: string): string[] => {
  const slot = unit.activitySlots.find((entry) => entry.activityKey === activityKey);
  if (!slot) return [];
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  return slot.pageGroupKeys.flatMap((groupKey) => {
    const group = groups.get(groupKey);
    return group?.pages.map((page) => `source:${group.sourceKey}:page:${page}`) ?? [];
  });
};

const stageOrSurfaceRevisionConflict = async (
  activityAuthoring: ActivityAuthoringService,
  activityKey: string,
  input: Parameters<ActivityAuthoringService['stage']>[0],
): Promise<ActivityStageResult> => {
  try {
    return await activityAuthoring.stage(input);
  } catch (error) {
    const currentRevision = error instanceof ActivityAuthoringHttpError
      ? error.body.currentRevision
      : undefined;
    if (
      !(error instanceof ActivityAuthoringHttpError)
      || error.statusCode !== 409
      || error.body.status !== 'conflict'
      || typeof currentRevision !== 'number'
      || !Number.isSafeInteger(currentRevision)
      || currentRevision <= 0
    ) {
      throw error;
    }
    // The Worker remains the target and revision authority. Never overwrite a
    // newer draft implicitly; return its CAS revision to an explicit UI choice.
    throw new UnitActivityImportConflictError(activityKey, currentRevision);
  }
};
const assertSourceRefs = (refs: readonly string[], allowed: Set<string>, label: string): void => {
  for (const ref of refs) {
    if (!allowed.has(ref)) {
      throw new UnitActivityImportError('cross-source-evidence', `${label} references ${ref}, which is not mapped to this activity or Unit reference pages.`);
    }
  }
};

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/iu.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
};

const validateAndNormalizeUnitSlots = (
  rawSlots: unknown,
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  unitPrefix = '',
): UnitActivityImportBundle => {
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  if (!unit) throw new UnitActivityImportError('missing-unit', `${unitPrefix}Unit "${unitKey}" has no Activity slot contract.`);
  if (!Array.isArray(rawSlots)) {
    throw new UnitActivityImportError('invalid-slots', `${unitPrefix}Import bundle slots must be an array.`);
  }
  const expected = unit.activitySlots.map((slot) => slot.activityKey).sort();
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  const slots = rawSlots.map((entry, index): UnitActivityImportSlot => {
    const slot = record(entry, 'invalid-slot');
    exact(slot, ['activityKey', 'content'], ['evidenceRefs', 'sourceEvidenceRefs', 'answerEvidenceRefs'], 'unknown-field');
    if (typeof slot.activityKey !== 'string') {
      throw new UnitActivityImportError('invalid-slot-key', `${unitPrefix}Slot ${index + 1} activityKey is invalid.`);
    }
    if (seen.has(slot.activityKey)) {
      throw new UnitActivityImportError('duplicate-slot', `${unitPrefix}Duplicate Activity slot ${slot.activityKey}.`);
    }
    if (!expectedSet.has(slot.activityKey)) {
      throw new UnitActivityImportError('slot-mismatch', `${unitPrefix}Import bundle slots must exactly match the selected Unit Activity slots.`);
    }
    seen.add(slot.activityKey);
    assertNoForbidden(slot.content, `${unitPrefix}slots[${index}].content`);
    const evidenceRefs = stringArray(slot.evidenceRefs, 'evidenceRefs');
    const sourceEvidenceRefs = stringArray(slot.sourceEvidenceRefs, 'sourceEvidenceRefs');
    const answerEvidenceRefs = stringArray(slot.answerEvidenceRefs, 'answerEvidenceRefs');
    const slotRefs = allowedEvidenceRefsForSlot(unit, slot.activityKey);
    assertSourceRefs(evidenceRefs, slotRefs, 'evidenceRefs');
    assertSourceRefs(sourceEvidenceRefs, slotRefs, 'sourceEvidenceRefs');
    assertSourceRefs(answerEvidenceRefs, slotRefs, 'answerEvidenceRefs');
    return {
      activityKey: slot.activityKey,
      content: slot.content,
      evidenceRefs,
      sourceEvidenceRefs,
      answerEvidenceRefs,
    };
  });
  const actual = [...seen].sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new UnitActivityImportError('slot-mismatch', `${unitPrefix}Import bundle slots must exactly match the selected Unit Activity slots.`);
  }
  return {
    promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
    schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
    bookId: manifest.bookId,
    unitKey,
    slots,
  };
};

export const detectBulkUnitActivityPayload = (text: string): boolean => {
  const normalized = stripCodeFences(text);
  if (!normalized) return false;
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.length > 0 && parsed.every((entry) => (
        entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        && (('unitKey' in entry && 'slots' in entry) || ('units' in entry && Array.isArray((entry as Record<string, unknown>).units) && !('nodes' in entry)))
      ));
    }
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (obj.schemaVersion === BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION) return true;
      if (Array.isArray(obj.units) && !('nodes' in obj) && obj.units.some((entry) => (
        entry !== null && typeof entry === 'object' && !Array.isArray(entry) && 'slots' in entry
      ))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

export const parseUnitActivityImportBundle = (
  text: string,
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
): UnitActivityImportBundle => {
  const normalizedText = stripCodeFences(text);
  if (byteLength(normalizedText) > MAX_IMPORT_BYTES) {
    throw new UnitActivityImportError('payload-too-large', 'Import bundle is too large.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(normalizedText); } catch {
    throw new UnitActivityImportError('invalid-json', 'That text is not valid JSON. Copy only the JSON object returned by your AI tool and try again.');
  }
  const bundle = record(parsed);
  if (Array.isArray(bundle.nodes) && Array.isArray(bundle.units) && !('slots' in bundle)) {
    throw new UnitActivityImportError(
      'wrong-import-surface',
      'This looks like Book Outline JSON, not Unit Activity JSON. Paste it in the Book outline tab instead.',
    );
  }
  exact(bundle, ['promptVersion', 'schemaVersion', 'bookId', 'unitKey', 'slots']);
  if (bundle.promptVersion !== UNIT_ACTIVITY_IMPORT_PROMPT_VERSION) {
    throw new UnitActivityImportError('invalid-prompt-version', 'Import bundle prompt version is unsupported.');
  }
  if (bundle.schemaVersion !== UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION) {
    throw new UnitActivityImportError('invalid-schema-version', 'Import bundle schema version is unsupported.');
  }
  if (bundle.bookId !== manifest.bookId || bundle.unitKey !== unitKey) {
    throw new UnitActivityImportError('foreign-unit', 'Import bundle does not target the selected Book Unit.');
  }
  return validateAndNormalizeUnitSlots(bundle.slots, manifest, unitKey);
};

const parseBulkEnvelopeUnits = (
  root: Record<string, unknown>,
  manifest: BookAssemblyManifestCandidate,
): unknown[] => {
  exact(root, ['promptVersion', 'schemaVersion', 'bookId', 'units']);
  if (root.promptVersion !== BULK_UNIT_ACTIVITY_IMPORT_PROMPT_VERSION) {
    throw new UnitActivityImportError('invalid-prompt-version', 'Bulk import prompt version is unsupported.');
  }
  if (root.schemaVersion !== BULK_UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION) {
    throw new UnitActivityImportError('invalid-schema-version', 'Bulk import schema version is unsupported.');
  }
  if (root.bookId !== manifest.bookId) {
    throw new UnitActivityImportError('foreign-unit', 'Bulk import does not target this Book.');
  }
  if (!Array.isArray(root.units) || root.units.length === 0) {
    throw new UnitActivityImportError('empty-bulk', 'Bulk import must contain at least one Unit in "units".');
  }
  return root.units;
};

export const parseBulkUnitActivityImportBundles = (
  text: string,
  manifest: BookAssemblyManifestCandidate,
): readonly UnitActivityImportBundle[] => {
  const normalizedText = stripCodeFences(text);
  if (byteLength(normalizedText) > MAX_BULK_IMPORT_BYTES) {
    throw new UnitActivityImportError('payload-too-large', 'Bulk import JSON exceeds the 4 MB size limit.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(normalizedText); } catch {
    throw new UnitActivityImportError('invalid-json', 'That text is not valid JSON. Paste a valid bulk or unit JSON object/array.');
  }

  const rawUnits: Array<{ readonly item: Record<string, unknown>; readonly requireBundleMetadata: boolean }> = [];
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new UnitActivityImportError('empty-bulk', 'Bulk import array must contain at least one Unit.');
    }
    for (let index = 0; index < parsed.length; index += 1) {
      const entry = record(parsed[index], 'invalid-unit');
      if (Array.isArray(entry.nodes) && Array.isArray(entry.units) && !('slots' in entry)) {
        throw new UnitActivityImportError(
          'wrong-import-surface',
          'This looks like Book Outline JSON, not Unit Activity JSON. Paste it in the Book outline tab instead.',
        );
      }
      if ('units' in entry && !('unitKey' in entry)) {
        for (const unitEntry of parseBulkEnvelopeUnits(entry, manifest)) {
          rawUnits.push({ item: record(unitEntry, 'invalid-unit'), requireBundleMetadata: false });
        }
      } else {
        rawUnits.push({ item: entry, requireBundleMetadata: true });
      }
    }
  } else {
    const root = record(parsed);
    if (Array.isArray(root.nodes) && Array.isArray(root.units) && !('slots' in root)) {
      throw new UnitActivityImportError(
        'wrong-import-surface',
        'This looks like Book Outline JSON, not Unit Activity JSON. Paste it in the Book outline tab instead.',
      );
    }
    if ('unitKey' in root && 'slots' in root && !('units' in root)) {
      if (typeof root.unitKey !== 'string' || !root.unitKey.trim()) {
        throw new UnitActivityImportError('invalid-unit-key', 'Import bundle unitKey is invalid.');
      }
      if (!manifest.units.some((entry) => entry.unitKey === root.unitKey)) {
        throw new UnitActivityImportError('unknown-unit', `Unit "${root.unitKey}" does not exist in this Book outline.`);
      }
      return [parseUnitActivityImportBundle(normalizedText, manifest, root.unitKey)];
    }
    for (const unitEntry of parseBulkEnvelopeUnits(root, manifest)) {
      rawUnits.push({ item: record(unitEntry, 'invalid-unit'), requireBundleMetadata: false });
    }
  }

  const seenUnits = new Set<string>();
  const bundles: UnitActivityImportBundle[] = [];
  for (let index = 0; index < rawUnits.length; index += 1) {
    const { item, requireBundleMetadata } = rawUnits[index]!;
    if (requireBundleMetadata) {
      exact(item, ['promptVersion', 'schemaVersion', 'bookId', 'unitKey', 'slots']);
    } else {
      exact(item, ['unitKey', 'slots'], ['promptVersion', 'schemaVersion', 'bookId']);
    }
    if (typeof item.unitKey !== 'string' || !item.unitKey.trim()) {
      throw new UnitActivityImportError('invalid-unit-key', `Unit entry ${index + 1} has an invalid unitKey.`);
    }
    const unitKey = item.unitKey.trim();
    if ((requireBundleMetadata || item.promptVersion !== undefined) && item.promptVersion !== UNIT_ACTIVITY_IMPORT_PROMPT_VERSION) {
      throw new UnitActivityImportError('invalid-prompt-version', `${unitKey}: unsupported promptVersion.`);
    }
    if ((requireBundleMetadata || item.schemaVersion !== undefined) && item.schemaVersion !== UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION) {
      throw new UnitActivityImportError('invalid-schema-version', `${unitKey}: unsupported schemaVersion.`);
    }
    if ((requireBundleMetadata || item.bookId !== undefined) && item.bookId !== manifest.bookId) {
      throw new UnitActivityImportError('foreign-unit', `${unitKey}: bundle belongs to a different Book.`);
    }
    if (seenUnits.has(unitKey)) {
      throw new UnitActivityImportError('duplicate-unit', `Duplicate Unit "${unitKey}" in bulk import.`);
    }
    if (!manifest.units.some((entry) => entry.unitKey === unitKey)) {
      throw new UnitActivityImportError('unknown-unit', `Unit "${unitKey}" does not exist in this Book outline.`);
    }
    seenUnits.add(unitKey);
    bundles.push(validateAndNormalizeUnitSlots(item.slots, manifest, unitKey, `${unitKey}: `));
  }
  return bundles;
};

export const discardStagedUnitActivities = async (
  activityAuthoring: ActivityAuthoringService,
  staged: readonly StagedUnitActivity[],
): Promise<void> => {
  const failures: string[] = [];
  for (const result of [...staged].reverse()) {
    try {
      await activityAuthoring.discard({
        candidateId: result.candidateId,
        expectedRevision: result.revision,
        unitActivityBinding: result.unitActivityBinding,
      });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) {
    throw new UnitActivityImportError('rollback-failed', `Could not discard staged Activity candidates: ${failures.join('; ')}`);
  }
};

export const stageUnitActivityImportBundle = async ({
  text,
  manifest,
  unitKey,
  activityAuthoring,
  expectedActivityRevisions = {},
  resolveActivityTargetId,
  signal,
}: {
  readonly text: string;
  readonly manifest: BookAssemblyManifestCandidate;
  readonly unitKey: string;
  readonly activityAuthoring: ActivityAuthoringService;
  readonly expectedActivityRevisions?: Readonly<Record<string, number>>;
  readonly resolveActivityTargetId: (slot: UnitActivityImportSlot) => string | null | undefined;
  readonly signal?: AbortSignal;
}): Promise<UnitActivityImportResult> => {
  const bundle = parseUnitActivityImportBundle(text, manifest, unitKey);
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  if (!unit) throw new UnitActivityImportError('missing-unit', 'Selected Unit has no Activity slot contract.');
  const staged: StagedUnitActivity[] = [];
  const validatedSlots: Array<{
    readonly slot: UnitActivityImportSlot;
    readonly result: ActivityStageResult;
    readonly validatedRevision: number;
  }> = [];
  let committedAnySlot = false;
  try {
    // Phase 1: stage and validate every slot BEFORE saving any draft or writing
    // any unit binding, so a revision conflict, schema error, or cancel on a
    // later slot cleanly discards only unsaved candidates without mutating
    // activity revisions or leaving bindings pointing at discarded tombstones.
    for (const slot of bundle.slots) {
      if (signal?.aborted) {
        throw new UnitActivityImportError('canceled', 'Import was canceled.');
      }
      const targetActivityId = resolveActivityTargetId(slot);
      if (typeof targetActivityId !== 'string' || targetActivityId.length === 0) {
        throw new UnitActivityImportError('unresolved-activity-target', `Activity slot ${slot.activityKey} has no trusted target Activity ID.`);
      }
      const result = await stageOrSurfaceRevisionConflict(activityAuthoring, slot.activityKey, {
        bookId: manifest.bookId,
        targetActivityId,
        expectedRevision: expectedActivityRevisions[slot.activityKey] ?? 0,
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
        clientValidationContext: {
          mappedBookPageRefs: clientMappedBookPageRefsForSlot(unit, slot.activityKey),
        },
        content: slot.content,
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
      });
      const stagedEntry: StagedUnitActivity = {
        ...result,
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
      };
      staged.push(stagedEntry);
      const validated = await activityAuthoring.validate({
        candidateId: result.candidateId,
        expectedRevision: result.revision,
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
      });
      staged[staged.length - 1] = {
        ...stagedEntry,
        revision: validated.revision,
      };
      if (validated.status !== 'validated' || validated.lifecycle !== 'validated') {
        throw new UnitActivityImportError('activity-binding-validation-failed', `Activity slot ${slot.activityKey} is not validated.`);
      }
      validatedSlots.push({ slot, result, validatedRevision: validated.revision });
      if (signal?.aborted) {
        throw new UnitActivityImportError('canceled', 'Import was canceled.');
      }
    }

    // Phase 2: commit all validated slots once every slot is conflict-free.
    const committed: StagedUnitActivity[] = [];
    for (const { slot, result, validatedRevision } of validatedSlots) {
      committedAnySlot = true;
      const saved = await activityAuthoring.saveDraft({
        candidateId: result.candidateId,
        expectedRevision: validatedRevision,
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
        ...((expectedActivityRevisions[slot.activityKey] ?? 0) > 0
          ? { replaceExistingUnitActivityBinding: true }
          : {}),
      });
      if (saved.status !== 'saved' || saved.activityId !== result.targetActivityId) {
        throw new UnitActivityImportError('activity-binding-save-failed', `Activity slot ${slot.activityKey} was not saved.`);
      }
      committed.push({
        ...result,
        revision: saved.candidateRevision,
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
      });
    }
    return { bundle, staged: committed };
  } catch (error) {
    if (!committedAnySlot && staged.length > 0) {
      await discardStagedUnitActivities(activityAuthoring, staged);
    }
    throw error;
  }
};
