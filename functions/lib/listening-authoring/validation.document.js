"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocument = void 0;
const validation_questions_1 = require("./validation.questions");
const validation_settings_1 = require("./validation.settings");
const validation_primitives_1 = require("./validation.primitives");
const parseDocumentType = (value) => {
    if (value === 'IELTS' || value === 'TOEFL' || value === 'Custom') {
        return value;
    }
    throw new Error('document.type must be IELTS, TOEFL, or Custom.');
};
const parseDifficulty = (value) => {
    if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
        return value;
    }
    throw new Error('document.difficulty must be Beginner, Intermediate, or Advanced.');
};
const parseDisplayMode = (value) => {
    if (value === 'text' || value === 'image') {
        return value;
    }
    throw new Error('document.displayMode must be text or image.');
};
const parseMetadata = (value) => {
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error('document.metadata must be a record.');
    }
    const metadata = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(metadata, 'document.metadata', [
        'description',
        'instructions',
        'tags',
        'targetBand',
        'estimatedScore',
        'transcript',
    ]);
    const parsed = {
        description: (0, validation_primitives_1.requireText)(metadata.description, 'document.metadata.description'),
        instructions: (0, validation_primitives_1.requireText)(metadata.instructions, 'document.metadata.instructions'),
        tags: (0, validation_primitives_1.requireStringArray)(metadata.tags, 'document.metadata.tags'),
    };
    const targetBand = (0, validation_primitives_1.optionalText)(metadata.targetBand, 'document.metadata.targetBand');
    if (targetBand !== undefined) {
        parsed.targetBand = targetBand;
    }
    const estimatedScore = (0, validation_primitives_1.optionalText)(metadata.estimatedScore, 'document.metadata.estimatedScore');
    if (estimatedScore !== undefined) {
        parsed.estimatedScore = estimatedScore;
    }
    const transcript = (0, validation_primitives_1.optionalText)(metadata.transcript, 'document.metadata.transcript');
    if (transcript !== undefined) {
        parsed.transcript = transcript;
    }
    return parsed;
};
const parseAudioSection = (value, fieldName) => {
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error(`${fieldName} must be a record.`);
    }
    const section = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(section, fieldName, [
        'number',
        'name',
        'assetId',
        'audioUrl',
        'streamUrl',
        'startQuestion',
        'endQuestion',
        'playLimit',
        'waitTimeBefore',
    ]);
    const parsed = {
        number: (0, validation_primitives_1.requireNonNegativeInteger)(section.number, `${fieldName}.number`),
        name: (0, validation_primitives_1.requireText)(section.name, `${fieldName}.name`),
        audioUrl: (0, validation_primitives_1.requireText)(section.audioUrl, `${fieldName}.audioUrl`),
        startQuestion: (0, validation_primitives_1.requireNonNegativeInteger)(section.startQuestion, `${fieldName}.startQuestion`),
        endQuestion: (0, validation_primitives_1.requireNonNegativeInteger)(section.endQuestion, `${fieldName}.endQuestion`),
    };
    const assetId = (0, validation_primitives_1.optionalString)(section.assetId, `${fieldName}.assetId`);
    if (assetId !== undefined) {
        parsed.assetId = assetId;
    }
    const streamUrl = (0, validation_primitives_1.optionalText)(section.streamUrl, `${fieldName}.streamUrl`);
    if (streamUrl !== undefined) {
        parsed.streamUrl = streamUrl;
    }
    const playLimit = (0, validation_primitives_1.optionalNonNegativeInteger)(section.playLimit, `${fieldName}.playLimit`);
    if (playLimit !== undefined) {
        parsed.playLimit = playLimit;
    }
    const waitTimeBefore = (0, validation_primitives_1.optionalNonNegativeInteger)(section.waitTimeBefore, `${fieldName}.waitTimeBefore`);
    if (waitTimeBefore !== undefined) {
        parsed.waitTimeBefore = waitTimeBefore;
    }
    return parsed;
};
const parseQuestionImage = (value, fieldName) => {
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error(`${fieldName} must be a record.`);
    }
    const image = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(image, fieldName, [
        'sectionNumber',
        'imageUrl',
        'imageCaption',
        'questionRange',
    ]);
    const parsed = {
        sectionNumber: (0, validation_primitives_1.requireNonNegativeInteger)(image.sectionNumber, `${fieldName}.sectionNumber`),
        imageUrl: (0, validation_primitives_1.requireText)(image.imageUrl, `${fieldName}.imageUrl`),
    };
    const imageCaption = (0, validation_primitives_1.optionalText)(image.imageCaption, `${fieldName}.imageCaption`);
    if (imageCaption !== undefined) {
        parsed.imageCaption = imageCaption;
    }
    if (image.questionRange !== undefined) {
        if (!(0, validation_primitives_1.isPlainObject)(image.questionRange)) {
            throw new Error(`${fieldName}.questionRange must be a record.`);
        }
        const questionRange = (0, validation_primitives_1.cloneJsonCompatibleValue)(image.questionRange);
        (0, validation_primitives_1.assertAllowedFields)(questionRange, `${fieldName}.questionRange`, ['start', 'end']);
        parsed.questionRange = {};
        const start = (0, validation_primitives_1.optionalNonNegativeInteger)(questionRange.start, `${fieldName}.questionRange.start`);
        if (start !== undefined) {
            parsed.questionRange.start = start;
        }
        const end = (0, validation_primitives_1.optionalNonNegativeInteger)(questionRange.end, `${fieldName}.questionRange.end`);
        if (end !== undefined) {
            parsed.questionRange.end = end;
        }
    }
    return parsed;
};
const parseDocument = (value) => {
    if (!(0, validation_primitives_1.isRecord)(value)) {
        throw new Error('document must be an object.');
    }
    if (value.skill !== 'Listening') {
        throw new Error('document.skill must be Listening.');
    }
    (0, validation_primitives_1.assertAllowedFields)(value, 'document', [
        'title',
        'type',
        'skill',
        'duration',
        'difficulty',
        'questionCount',
        'isPublic',
        'isComplete',
        'missingAnswerCount',
        'displayMode',
        'metadata',
        'audioSections',
        'questionImages',
        'questions',
        'settings',
        'statistics',
    ]);
    const metadata = parseMetadata(value.metadata);
    if (!Array.isArray(value.audioSections)) {
        throw new Error('document.audioSections must be an array.');
    }
    if (!Array.isArray(value.questions)) {
        throw new Error('document.questions must be an array.');
    }
    const audioSections = value.audioSections.map((entry, index) => parseAudioSection(entry, `document.audioSections[${index}]`));
    const questions = value.questions.map((entry, index) => (0, validation_questions_1.parseQuestion)(entry, `document.questions[${index}]`));
    const parsed = {
        title: (0, validation_primitives_1.requireString)(value.title, 'document.title'),
        type: parseDocumentType(value.type),
        skill: 'Listening',
        duration: (0, validation_primitives_1.requireNonNegativeInteger)(value.duration, 'document.duration'),
        difficulty: parseDifficulty(value.difficulty),
        questionCount: (0, validation_primitives_1.requireNonNegativeInteger)(value.questionCount, 'document.questionCount'),
        isPublic: (0, validation_primitives_1.requireBoolean)(value.isPublic, 'document.isPublic'),
        isComplete: (0, validation_primitives_1.requireBoolean)(value.isComplete, 'document.isComplete'),
        displayMode: parseDisplayMode(value.displayMode),
        metadata,
        audioSections,
        questions,
        settings: (0, validation_settings_1.parseSettings)(value.settings),
    };
    const missingAnswerCount = (0, validation_primitives_1.optionalNonNegativeInteger)(value.missingAnswerCount, 'document.missingAnswerCount');
    if (missingAnswerCount !== undefined) {
        parsed.missingAnswerCount = missingAnswerCount;
    }
    if (value.questionImages !== undefined) {
        if (!Array.isArray(value.questionImages)) {
            throw new Error('document.questionImages must be an array.');
        }
        parsed.questionImages = value.questionImages.map((entry, index) => parseQuestionImage(entry, `document.questionImages[${index}]`));
    }
    const statistics = (0, validation_settings_1.parseStatistics)(value.statistics);
    if (statistics !== undefined) {
        parsed.statistics = statistics;
    }
    return parsed;
};
exports.parseDocument = parseDocument;
//# sourceMappingURL=validation.document.js.map