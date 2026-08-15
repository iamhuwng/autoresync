import type { ActivityAuthoringService } from '../book-activity/activityAuthoring.service';
import type { ActivityStageResult } from '../book-activity/activityAuthoring.repository';
import type { BookAssemblyManifestCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import { UNIT_ACTIVITY_IMPORT_PROMPT_VERSION, UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION } from './unitPrompt.service';

const MAX_IMPORT_BYTES = 512 * 1024;
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
  readonly staged: readonly ActivityStageResult[];
}

export class UnitActivityImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'UnitActivityImportError';
  }
}

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
const allowedEvidenceRefsForSlot = (unit: BookUnitCandidate, activityKey: string): Set<string> => {
  const slot = unit.activitySlots.find((entry) => entry.activityKey === activityKey);
  const refs = new Set<string>([`import:${activityKey}`]);
  if (!slot) return refs;
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  for (const groupKey of slot.pageGroupKeys) {
    const group = groups.get(groupKey);
    if (!group) continue;
    refs.add(`pageGroup:${group.pageGroupKey}`);
    for (const page of group.pages) refs.add(`source:${group.sourceKey}:page:${page}`);
  }
  return refs;
};
const assertSourceRefs = (refs: readonly string[], allowed: Set<string>, label: string): void => {
  for (const ref of refs) {
    if (!allowed.has(ref)) {
      throw new UnitActivityImportError('cross-source-evidence', `${label} references ${ref}, which is outside the selected Unit.`);
    }
  }
};

export const parseUnitActivityImportBundle = (
  text: string,
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
): UnitActivityImportBundle => {
  if (byteLength(text) > MAX_IMPORT_BYTES) {
    throw new UnitActivityImportError('payload-too-large', 'Import bundle is too large.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    throw new UnitActivityImportError('invalid-json', 'Import bundle is malformed JSON.');
  }
  const bundle = record(parsed);
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
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  if (!unit) throw new UnitActivityImportError('missing-unit', 'Selected Unit has no Activity slot contract.');
  if (!Array.isArray(bundle.slots)) {
    throw new UnitActivityImportError('invalid-slots', 'Import bundle slots must be an array.');
  }
  const expected = unit.activitySlots.map((slot) => slot.activityKey).sort();
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  const slots = bundle.slots.map((entry, index): UnitActivityImportSlot => {
    const slot = record(entry, 'invalid-slot');
    exact(slot, ['activityKey', 'content'], ['evidenceRefs', 'sourceEvidenceRefs', 'answerEvidenceRefs'], 'unknown-field');
    if (typeof slot.activityKey !== 'string') {
      throw new UnitActivityImportError('invalid-slot-key', `Slot ${index + 1} activityKey is invalid.`);
    }
    if (seen.has(slot.activityKey)) {
      throw new UnitActivityImportError('duplicate-slot', `Duplicate Activity slot ${slot.activityKey}.`);
    }
    if (!expectedSet.has(slot.activityKey)) {
      throw new UnitActivityImportError('slot-mismatch', 'Import bundle slots must exactly match the selected Unit Activity slots.');
    }
    seen.add(slot.activityKey);
    assertNoForbidden(slot.content, `slots[${index}].content`);
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
    throw new UnitActivityImportError('slot-mismatch', 'Import bundle slots must exactly match the selected Unit Activity slots.');
  }
  return {
    promptVersion: UNIT_ACTIVITY_IMPORT_PROMPT_VERSION,
    schemaVersion: UNIT_ACTIVITY_IMPORT_SCHEMA_VERSION,
    bookId: manifest.bookId,
    unitKey,
    slots,
  };
};

export const discardStagedUnitActivities = async (
  activityAuthoring: ActivityAuthoringService,
  staged: readonly ActivityStageResult[],
): Promise<void> => {
  const failures: string[] = [];
  for (const result of [...staged].reverse()) {
    try {
      await activityAuthoring.discard({
        candidateId: result.candidateId,
        expectedRevision: result.revision,
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
  const staged: ActivityStageResult[] = [];
  try {
    for (const slot of bundle.slots) {
      if (signal?.aborted) {
        throw new UnitActivityImportError('canceled', 'Import was canceled.');
      }
      const targetActivityId = resolveActivityTargetId(slot);
      if (typeof targetActivityId !== 'string' || targetActivityId.length === 0) {
        throw new UnitActivityImportError('unresolved-activity-target', `Activity slot ${slot.activityKey} has no trusted target Activity ID.`);
      }
      const result = await activityAuthoring.stage({
        bookId: manifest.bookId,
        targetActivityId,
        expectedRevision: expectedActivityRevisions[slot.activityKey] ?? 0,
        content: slot.content,
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
      });
      const validated = await activityAuthoring.validate({
        candidateId: result.candidateId,
        expectedRevision: result.revision,
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
      });
      if (validated.status !== 'validated' || validated.lifecycle !== 'validated') {
        throw new UnitActivityImportError('activity-binding-validation-failed', `Activity slot ${slot.activityKey} is not validated.`);
      }
      const saved = await activityAuthoring.saveDraft({
        candidateId: result.candidateId,
        expectedRevision: validated.revision,
        evidenceRefs: [...(slot.evidenceRefs ?? [])],
        sourceEvidenceRefs: [...(slot.sourceEvidenceRefs ?? [])],
        answerEvidenceRefs: [...(slot.answerEvidenceRefs ?? [])],
        unitActivityBinding: { unitKey, activityKey: slot.activityKey },
      });
      if (saved.status !== 'saved' || saved.activityId !== result.targetActivityId) {
        throw new UnitActivityImportError('activity-binding-save-failed', `Activity slot ${slot.activityKey} was not saved.`);
      }
      // Rollback must address the persisted candidate state, not the initial
      // staging revision that validate/save have superseded.
      staged.push({ ...result, revision: saved.candidateRevision });
      if (signal?.aborted) {
        throw new UnitActivityImportError('canceled', 'Import was canceled.');
      }
    }
  } catch (error) {
    if (staged.length > 0) await discardStagedUnitActivities(activityAuthoring, staged);
    throw error;
  }
  return { bundle, staged };
};
