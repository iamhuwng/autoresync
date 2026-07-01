"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLifecycleRequest = exports.parsePublishDraftRequest = exports.parseSaveDraftRequest = void 0;
const validation_document_1 = require("./validation.document");
const validation_primitives_1 = require("./validation.primitives");
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const recordOrDefault = (value, fieldName) => {
    if (value === undefined) {
        return {};
    }
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error(`${fieldName} must be a record.`);
    }
    return Object.assign({}, value);
};
const missingDefault = (record, key, value, warnings, warning) => {
    if (!hasOwn(record, key)) {
        record[key] = value;
        if (warning !== undefined) {
            warnings.push(warning);
        }
    }
};
const normalizeDraftAudioSections = (value, warnings) => {
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
        if (!(0, validation_primitives_1.isPlainObject)(entry)) {
            return entry;
        }
        const section = Object.assign({}, entry);
        const fieldName = `document.audioSections[${index}]`;
        missingDefault(section, 'number', index + 1, warnings, `${fieldName}.number is missing.`);
        missingDefault(section, 'name', '', warnings, `${fieldName}.name is missing.`);
        missingDefault(section, 'audioUrl', '', warnings, `${fieldName}.audioUrl is missing.`);
        missingDefault(section, 'startQuestion', 0, warnings, `${fieldName}.startQuestion is missing.`);
        missingDefault(section, 'endQuestion', 0, warnings, `${fieldName}.endQuestion is missing.`);
        return section;
    });
};
const normalizeDraftQuestions = (value, warnings) => {
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
        if (!(0, validation_primitives_1.isPlainObject)(entry)) {
            return entry;
        }
        const question = Object.assign({}, entry);
        const fieldName = `document.questions[${index}]`;
        missingDefault(question, 'number', index + 1, warnings, `${fieldName}.number is missing.`);
        missingDefault(question, 'type', 'short-answer', warnings, `${fieldName}.type is missing.`);
        missingDefault(question, 'question', '', warnings, `${fieldName}.question is missing.`);
        missingDefault(question, 'answer', '', warnings, `${fieldName}.answer is missing.`);
        missingDefault(question, 'sectionNumber', 0, warnings, `${fieldName}.sectionNumber is missing.`);
        missingDefault(question, 'points', 0, warnings, `${fieldName}.points is missing.`);
        return question;
    });
};
const normalizeDraftSettings = (value, warnings) => {
    const settings = recordOrDefault(value, 'document.settings');
    missingDefault(settings, 'allowPause', true, warnings, 'document.settings.allowPause is missing.');
    missingDefault(settings, 'showTimer', true, warnings, 'document.settings.showTimer is missing.');
    missingDefault(settings, 'shuffleQuestions', false, warnings, 'document.settings.shuffleQuestions is missing.');
    missingDefault(settings, 'showResults', 'after-submission', warnings, 'document.settings.showResults is missing.');
    missingDefault(settings, 'allowReview', true, warnings, 'document.settings.allowReview is missing.');
    missingDefault(settings, 'passingScore', 0, warnings, 'document.settings.passingScore is missing.');
    missingDefault(settings, 'allowReplay', true, warnings, 'document.settings.allowReplay is missing.');
    return settings;
};
const parseDraftDocument = (value) => {
    if (!(0, validation_primitives_1.isRecord)(value)) {
        throw new Error('document must be an object.');
    }
    const warnings = [];
    const metadata = recordOrDefault(value.metadata, 'document.metadata');
    missingDefault(metadata, 'description', '', warnings, 'document.metadata.description is missing.');
    missingDefault(metadata, 'instructions', '', warnings, 'document.metadata.instructions is missing.');
    missingDefault(metadata, 'tags', [], warnings);
    const audioSections = normalizeDraftAudioSections(value.audioSections, warnings);
    const questions = normalizeDraftQuestions(value.questions, warnings);
    const normalized = Object.assign({}, value);
    missingDefault(normalized, 'title', 'Untitled listening draft', warnings, 'document.title is missing.');
    missingDefault(normalized, 'type', 'IELTS', warnings, 'document.type is missing.');
    missingDefault(normalized, 'skill', 'Listening', warnings, 'document.skill is missing.');
    missingDefault(normalized, 'duration', 0, warnings, 'document.duration is missing.');
    missingDefault(normalized, 'difficulty', 'Intermediate', warnings, 'document.difficulty is missing.');
    missingDefault(normalized, 'questionCount', Array.isArray(questions) ? questions.length : 0, warnings, 'document.questionCount is missing.');
    missingDefault(normalized, 'isPublic', false, warnings, 'document.isPublic is missing.');
    missingDefault(normalized, 'isComplete', false, warnings, 'document.isComplete is missing.');
    missingDefault(normalized, 'displayMode', 'text', warnings, 'document.displayMode is missing.');
    normalized.metadata = metadata;
    normalized.audioSections = audioSections;
    normalized.questions = questions;
    normalized.settings = normalizeDraftSettings(value.settings, warnings);
    return {
        document: (0, validation_document_1.parseDocument)(normalized),
        warnings,
    };
};
const parseRetainedPins = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error('retainedPins must be an object when provided.');
    }
    const parsedEntries = Object.entries(value).map(([key, entry]) => {
        if (!Array.isArray(entry) || !entry.every((item) => typeof item === 'string')) {
            throw new Error('retainedPins must map to string arrays.');
        }
        return [key, [...entry]];
    });
    return Object.fromEntries(parsedEntries);
};
const parseBaseBody = (body) => {
    if (!(0, validation_primitives_1.isRecord)(body)) {
        throw new Error('Listening authoring request body must be an object.');
    }
    (0, validation_primitives_1.rejectBrowserOwnerId)(body);
    return body;
};
const parseSaveTrigger = (value) => {
    if (value === undefined) {
        return 'explicit';
    }
    if (value === 'explicit' || value === 'autosave') {
        return value;
    }
    throw new Error('trigger must be explicit or autosave.');
};
const parseSaveDraftRequest = (body) => {
    const request = parseBaseBody(body);
    (0, validation_primitives_1.assertAllowedFields)(request, 'save draft request', [
        'idempotencyKey',
        'document',
        'draftId',
        'expectedConflictToken',
        'trigger',
    ]);
    const parsedDocument = parseDraftDocument(request.document);
    const parsed = {
        idempotencyKey: (0, validation_primitives_1.requireString)(request.idempotencyKey, 'idempotencyKey'),
        document: parsedDocument.document,
        trigger: parseSaveTrigger(request.trigger),
        warnings: parsedDocument.warnings,
    };
    const draftId = (0, validation_primitives_1.optionalString)(request.draftId, 'draftId');
    if (draftId !== undefined) {
        parsed.draftId = draftId;
    }
    const expectedConflictToken = (0, validation_primitives_1.optionalPositiveInteger)(request.expectedConflictToken, 'expectedConflictToken');
    if (expectedConflictToken !== undefined) {
        parsed.expectedConflictToken = expectedConflictToken;
    }
    return parsed;
};
exports.parseSaveDraftRequest = parseSaveDraftRequest;
const parsePublishDraftRequest = (body) => {
    const request = parseBaseBody(body);
    const legacyTestId = (0, validation_primitives_1.optionalString)(request.legacyTestId, 'legacyTestId');
    if (legacyTestId !== undefined) {
        (0, validation_primitives_1.assertAllowedFields)(request, 'publish draft request', [
            'legacyTestId',
            'idempotencyKey',
        ]);
        return {
            legacyTestId,
            idempotencyKey: (0, validation_primitives_1.requireString)(request.idempotencyKey, 'idempotencyKey'),
        };
    }
    (0, validation_primitives_1.assertAllowedFields)(request, 'publish draft request', [
        'draftId',
        'expectedConflictToken',
        'idempotencyKey',
        'retainedPins',
    ]);
    const parsed = {
        draftId: (0, validation_primitives_1.requireString)(request.draftId, 'draftId'),
        expectedConflictToken: (0, validation_primitives_1.requirePositiveInteger)(request.expectedConflictToken, 'expectedConflictToken'),
        idempotencyKey: (0, validation_primitives_1.requireString)(request.idempotencyKey, 'idempotencyKey'),
    };
    const retainedPins = parseRetainedPins(request.retainedPins);
    if (retainedPins !== undefined) {
        parsed.retainedPins = retainedPins;
    }
    return parsed;
};
exports.parsePublishDraftRequest = parsePublishDraftRequest;
const parseLifecycleOperation = (value) => {
    if (value === 'soft-delete' ||
        value === 'restore' ||
        value === 'archive' ||
        value === 'discard') {
        return value;
    }
    throw new Error('operation must be soft-delete, restore, archive, or discard.');
};
const parseLifecycleRequest = (body) => {
    const request = parseBaseBody(body);
    (0, validation_primitives_1.assertAllowedFields)(request, 'lifecycle request', [
        'operation',
        'targetId',
        'expectedConflictToken',
        'idempotencyKey',
        'reasonCode',
    ]);
    const parsed = {
        operation: parseLifecycleOperation(request.operation),
        targetId: (0, validation_primitives_1.requireString)(request.targetId, 'targetId'),
        idempotencyKey: (0, validation_primitives_1.requireString)(request.idempotencyKey, 'idempotencyKey'),
    };
    const expectedConflictToken = (0, validation_primitives_1.optionalPositiveInteger)(request.expectedConflictToken, 'expectedConflictToken');
    if (expectedConflictToken !== undefined) {
        parsed.expectedConflictToken = expectedConflictToken;
    }
    const reasonCode = (0, validation_primitives_1.optionalString)(request.reasonCode, 'reasonCode');
    if (reasonCode !== undefined) {
        parsed.reasonCode = reasonCode;
    }
    return parsed;
};
exports.parseLifecycleRequest = parseLifecycleRequest;
//# sourceMappingURL=validation.js.map