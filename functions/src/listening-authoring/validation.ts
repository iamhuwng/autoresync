import type {
  ListeningAuthoringDocumentV1,
  ListeningLifecycleRequest,
  PublishListeningDraftRequest,
  SaveListeningDraftRequest,
} from './contracts';
import { parseDocument } from './validation.document';
import {
  assertAllowedFields,
  isPlainObject,
  isRecord,
  optionalPositiveInteger,
  optionalString,
  rejectBrowserOwnerId,
  requirePositiveInteger,
  requireString,
} from './validation.primitives';

type DraftDocumentParseResult = {
  document: ListeningAuthoringDocumentV1;
  warnings: readonly string[];
};

export type ParsedSaveListeningDraftRequest = SaveListeningDraftRequest & {
  warnings: readonly string[];
};

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const recordOrDefault = (
  value: unknown,
  fieldName: string,
): Record<string, unknown> => {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be a record.`);
  }

  return { ...value };
};

const missingDefault = (
  record: Record<string, unknown>,
  key: string,
  value: unknown,
  warnings: string[],
  warning?: string,
): void => {
  if (!hasOwn(record, key)) {
    record[key] = value;
    if (warning !== undefined) {
      warnings.push(warning);
    }
  }
};

const normalizeDraftAudioSections = (
  value: unknown,
  warnings: string[],
): unknown => {
  if (value === undefined) {
    warnings.push('document.audioSections is missing.');
    return [];
  }

  if (!Array.isArray(value)) {
    return value;
  }
  if (value.length === 0) {
    warnings.push('document.audioSections is empty.');
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      return entry;
    }

    const section = { ...entry };
    const fieldName = `document.audioSections[${index}]`;
    missingDefault(section, 'number', index + 1, warnings, `${fieldName}.number is missing.`);
    missingDefault(section, 'name', '', warnings, `${fieldName}.name is missing.`);
    missingDefault(section, 'audioUrl', '', warnings, `${fieldName}.audioUrl is missing.`);
    missingDefault(
      section,
      'startQuestion',
      0,
      warnings,
      `${fieldName}.startQuestion is missing.`,
    );
    missingDefault(section, 'endQuestion', 0, warnings, `${fieldName}.endQuestion is missing.`);
    return section;
  });
};

const normalizeDraftQuestions = (
  value: unknown,
  warnings: string[],
): unknown => {
  if (value === undefined) {
    warnings.push('document.questions is missing.');
    return [];
  }

  if (!Array.isArray(value)) {
    return value;
  }
  if (value.length === 0) {
    warnings.push('document.questions is empty.');
  }

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      return entry;
    }

    const question = { ...entry };
    const fieldName = `document.questions[${index}]`;
    missingDefault(question, 'number', index + 1, warnings, `${fieldName}.number is missing.`);
    missingDefault(question, 'type', 'short-answer', warnings, `${fieldName}.type is missing.`);
    missingDefault(question, 'question', '', warnings, `${fieldName}.question is missing.`);
    missingDefault(question, 'answer', '', warnings, `${fieldName}.answer is missing.`);
    missingDefault(
      question,
      'sectionNumber',
      0,
      warnings,
      `${fieldName}.sectionNumber is missing.`,
    );
    missingDefault(question, 'points', 0, warnings, `${fieldName}.points is missing.`);
    return question;
  });
};

const normalizeDraftSettings = (
  value: unknown,
  warnings: string[],
): Record<string, unknown> => {
  const settings = recordOrDefault(value, 'document.settings');
  missingDefault(settings, 'allowPause', true, warnings, 'document.settings.allowPause is missing.');
  missingDefault(settings, 'showTimer', true, warnings, 'document.settings.showTimer is missing.');
  missingDefault(
    settings,
    'shuffleQuestions',
    false,
    warnings,
    'document.settings.shuffleQuestions is missing.',
  );
  missingDefault(
    settings,
    'showResults',
    'after-submission',
    warnings,
    'document.settings.showResults is missing.',
  );
  missingDefault(settings, 'allowReview', true, warnings, 'document.settings.allowReview is missing.');
  missingDefault(settings, 'passingScore', 0, warnings, 'document.settings.passingScore is missing.');
  missingDefault(settings, 'allowReplay', true, warnings, 'document.settings.allowReplay is missing.');
  return settings;
};

const parseDraftDocument = (value: unknown): DraftDocumentParseResult => {
  if (!isRecord(value)) {
    throw new Error('document must be an object.');
  }

  const warnings: string[] = [];
  const metadata = recordOrDefault(value.metadata, 'document.metadata');
  missingDefault(
    metadata,
    'description',
    '',
    warnings,
    'document.metadata.description is missing.',
  );
  missingDefault(
    metadata,
    'instructions',
    '',
    warnings,
    'document.metadata.instructions is missing.',
  );
  missingDefault(metadata, 'tags', [], warnings);

  const audioSections = normalizeDraftAudioSections(value.audioSections, warnings);
  const questions = normalizeDraftQuestions(value.questions, warnings);
  const normalized: Record<string, unknown> = { ...value };
  missingDefault(normalized, 'title', 'Untitled listening draft', warnings, 'document.title is missing.');
  missingDefault(normalized, 'type', 'IELTS', warnings, 'document.type is missing.');
  missingDefault(normalized, 'skill', 'Listening', warnings, 'document.skill is missing.');
  missingDefault(normalized, 'duration', 0, warnings, 'document.duration is missing.');
  missingDefault(
    normalized,
    'difficulty',
    'Intermediate',
    warnings,
    'document.difficulty is missing.',
  );
  missingDefault(
    normalized,
    'questionCount',
    Array.isArray(questions) ? questions.length : 0,
    warnings,
    'document.questionCount is missing.',
  );
  missingDefault(normalized, 'isPublic', false, warnings, 'document.isPublic is missing.');
  missingDefault(normalized, 'isComplete', false, warnings, 'document.isComplete is missing.');
  missingDefault(normalized, 'displayMode', 'text', warnings, 'document.displayMode is missing.');
  normalized.metadata = metadata;
  normalized.audioSections = audioSections;
  normalized.questions = questions;
  normalized.settings = normalizeDraftSettings(value.settings, warnings);

  return {
    document: parseDocument(normalized),
    warnings,
  };
};

const parseRetainedPins = (
  value: unknown,
): Record<string, readonly string[]> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error('retainedPins must be an object when provided.');
  }

  const parsedEntries: Array<[string, readonly string[]]> = Object.entries(value).map(([key, entry]) => {
    if (!Array.isArray(entry) || !entry.every((item) => typeof item === 'string')) {
      throw new Error('retainedPins must map to string arrays.');
    }

    return [key, [...entry]];
  });

  return Object.fromEntries(parsedEntries);
};

const parseBaseBody = (body: unknown): Record<string, unknown> => {
  if (!isRecord(body)) {
    throw new Error('Listening authoring request body must be an object.');
  }

  rejectBrowserOwnerId(body);
  return body;
};

const parseSaveTrigger = (value: unknown): 'explicit' | 'autosave' => {
  if (value === undefined) {
    return 'explicit';
  }

  if (value === 'explicit' || value === 'autosave') {
    return value;
  }

  throw new Error('trigger must be explicit or autosave.');
};

export const parseSaveDraftRequest = (body: unknown): ParsedSaveListeningDraftRequest => {
  const request = parseBaseBody(body);
  assertAllowedFields(request, 'save draft request', [
    'idempotencyKey',
    'document',
    'draftId',
    'expectedConflictToken',
    'trigger',
  ]);
  const parsedDocument = parseDraftDocument(request.document);

  const parsed: ParsedSaveListeningDraftRequest = {
    idempotencyKey: requireString(request.idempotencyKey, 'idempotencyKey'),
    document: parsedDocument.document,
    trigger: parseSaveTrigger(request.trigger),
    warnings: parsedDocument.warnings,
  };

  const draftId = optionalString(request.draftId, 'draftId');
  if (draftId !== undefined) {
    parsed.draftId = draftId;
  }

  const expectedConflictToken = optionalPositiveInteger(
    request.expectedConflictToken,
    'expectedConflictToken',
  );
  if (expectedConflictToken !== undefined) {
    parsed.expectedConflictToken = expectedConflictToken;
  }

  return parsed;
};

export const parsePublishDraftRequest = (body: unknown): PublishListeningDraftRequest => {
  const request = parseBaseBody(body);
  const legacyTestId = optionalString(request.legacyTestId, 'legacyTestId');
  if (legacyTestId !== undefined) {
    assertAllowedFields(request, 'publish draft request', [
      'legacyTestId',
      'idempotencyKey',
    ]);
    return {
      legacyTestId,
      idempotencyKey: requireString(request.idempotencyKey, 'idempotencyKey'),
    };
  }

  assertAllowedFields(request, 'publish draft request', [
    'draftId',
    'expectedConflictToken',
    'idempotencyKey',
    'retainedPins',
  ]);
  const parsed: PublishListeningDraftRequest = {
    draftId: requireString(request.draftId, 'draftId'),
    expectedConflictToken: requirePositiveInteger(request.expectedConflictToken, 'expectedConflictToken'),
    idempotencyKey: requireString(request.idempotencyKey, 'idempotencyKey'),
  };

  const retainedPins = parseRetainedPins(request.retainedPins);
  if (retainedPins !== undefined) {
    parsed.retainedPins = retainedPins;
  }

  return parsed;
};

const parseLifecycleOperation = (value: unknown): ListeningLifecycleRequest['operation'] => {
  if (
    value === 'soft-delete' ||
    value === 'restore' ||
    value === 'archive' ||
    value === 'discard'
  ) {
    return value;
  }

  throw new Error('operation must be soft-delete, restore, archive, or discard.');
};

export const parseLifecycleRequest = (body: unknown): ListeningLifecycleRequest => {
  const request = parseBaseBody(body);
  assertAllowedFields(request, 'lifecycle request', [
    'operation',
    'targetId',
    'expectedConflictToken',
    'idempotencyKey',
    'reasonCode',
  ]);

  const parsed: ListeningLifecycleRequest = {
    operation: parseLifecycleOperation(request.operation),
    targetId: requireString(request.targetId, 'targetId'),
    idempotencyKey: requireString(request.idempotencyKey, 'idempotencyKey'),
  };

  const expectedConflictToken = optionalPositiveInteger(
    request.expectedConflictToken,
    'expectedConflictToken',
  );
  if (expectedConflictToken !== undefined) {
    parsed.expectedConflictToken = expectedConflictToken;
  }

  const reasonCode = optionalString(request.reasonCode, 'reasonCode');
  if (reasonCode !== undefined) {
    parsed.reasonCode = reasonCode;
  }

  return parsed;
};
