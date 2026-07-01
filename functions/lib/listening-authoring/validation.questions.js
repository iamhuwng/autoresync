"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseQuestion = void 0;
const validation_primitives_1 = require("./validation.primitives");
const parseQuestionAnswer = (value, fieldName) => {
    if (value === undefined) {
        throw new Error(`${fieldName} is required.`);
    }
    if (typeof value === 'string') {
        return value;
    }
    if (!Array.isArray(value)) {
        if (!(0, validation_primitives_1.isPlainObject)(value)) {
            throw new Error(`${fieldName} must be a string, string array, or string map.`);
        }
        const entries = Object.entries(value).map(([key, entry]) => {
            if (typeof entry !== 'string') {
                throw new Error(`${fieldName} map values must be strings.`);
            }
            return [key, entry];
        });
        return Object.fromEntries(entries);
    }
    if (!value.every((entry) => typeof entry === 'string')) {
        throw new Error(`${fieldName} array values must be strings.`);
    }
    return [...value];
};
const parseQuestionContext = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error(`${fieldName} must be a record.`);
    }
    const context = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(context, fieldName, [
        'sectionHeading',
        'subsectionLabel',
        'contextLines',
        'currentLineIndex',
    ]);
    const parsed = {};
    const sectionHeading = (0, validation_primitives_1.optionalText)(context.sectionHeading, `${fieldName}.sectionHeading`);
    if (sectionHeading !== undefined) {
        parsed.sectionHeading = sectionHeading;
    }
    const subsectionLabel = (0, validation_primitives_1.optionalText)(context.subsectionLabel, `${fieldName}.subsectionLabel`);
    if (subsectionLabel !== undefined) {
        parsed.subsectionLabel = subsectionLabel;
    }
    const contextLines = (0, validation_primitives_1.parseStringArray)(context.contextLines, `${fieldName}.contextLines`);
    if (contextLines !== undefined) {
        parsed.contextLines = contextLines;
    }
    const currentLineIndex = (0, validation_primitives_1.optionalNonNegativeInteger)(context.currentLineIndex, `${fieldName}.currentLineIndex`);
    if (currentLineIndex !== undefined) {
        parsed.currentLineIndex = currentLineIndex;
    }
    return parsed;
};
const parseQuestion = (value, fieldName) => {
    if (!(0, validation_primitives_1.isPlainObject)(value)) {
        throw new Error(`${fieldName} must be a record.`);
    }
    const question = (0, validation_primitives_1.cloneJsonCompatibleValue)(value);
    (0, validation_primitives_1.assertAllowedFields)(question, fieldName, [
        'number',
        'type',
        'question',
        'options',
        'answer',
        'sectionNumber',
        'points',
        'explanation',
        'acceptableAnswers',
        'imageUrl',
        'context',
    ]);
    const parsed = {
        number: (0, validation_primitives_1.requireNonNegativeInteger)(question.number, `${fieldName}.number`),
        type: (0, validation_primitives_1.requireString)(question.type, `${fieldName}.type`),
        question: (0, validation_primitives_1.requireText)(question.question, `${fieldName}.question`),
        answer: parseQuestionAnswer(question.answer, `${fieldName}.answer`),
        sectionNumber: (0, validation_primitives_1.requireNonNegativeInteger)(question.sectionNumber, `${fieldName}.sectionNumber`),
        points: (0, validation_primitives_1.requireNonNegativeInteger)(question.points, `${fieldName}.points`),
    };
    const options = (0, validation_primitives_1.parseStringArray)(question.options, `${fieldName}.options`);
    if (options !== undefined) {
        parsed.options = options;
    }
    const explanation = (0, validation_primitives_1.optionalText)(question.explanation, `${fieldName}.explanation`);
    if (explanation !== undefined) {
        parsed.explanation = explanation;
    }
    const acceptableAnswers = (0, validation_primitives_1.parseStringArray)(question.acceptableAnswers, `${fieldName}.acceptableAnswers`);
    if (acceptableAnswers !== undefined) {
        parsed.acceptableAnswers = acceptableAnswers;
    }
    const imageUrl = (0, validation_primitives_1.optionalText)(question.imageUrl, `${fieldName}.imageUrl`);
    if (imageUrl !== undefined) {
        parsed.imageUrl = imageUrl;
    }
    const context = parseQuestionContext(question.context, `${fieldName}.context`);
    if (context !== undefined) {
        parsed.context = context;
    }
    return parsed;
};
exports.parseQuestion = parseQuestion;
//# sourceMappingURL=validation.questions.js.map