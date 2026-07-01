import type { ListeningAuthoringDocumentV1 } from './contracts';
import {
  assertAllowedFields,
  cloneJsonCompatibleValue,
  isPlainObject,
  optionalNonNegativeInteger,
  optionalText,
  parseStringArray,
  requireNonNegativeInteger,
  requireString,
  requireText,
} from './validation.primitives';

const parseQuestionAnswer = (
  value: unknown,
  fieldName: string,
): ListeningAuthoringDocumentV1['questions'][number]['answer'] => {
  if (value === undefined) {
    throw new Error(`${fieldName} is required.`);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    if (!isPlainObject(value)) {
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

const parseQuestionContext = (
  value: unknown,
  fieldName: string,
): ListeningAuthoringDocumentV1['questions'][number]['context'] => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be a record.`);
  }

  const context = cloneJsonCompatibleValue(value);
  assertAllowedFields(context, fieldName, [
    'sectionHeading',
    'subsectionLabel',
    'contextLines',
    'currentLineIndex',
  ]);

  const parsed: NonNullable<ListeningAuthoringDocumentV1['questions'][number]['context']> = {};
  const sectionHeading = optionalText(context.sectionHeading, `${fieldName}.sectionHeading`);
  if (sectionHeading !== undefined) {
    parsed.sectionHeading = sectionHeading;
  }
  const subsectionLabel = optionalText(context.subsectionLabel, `${fieldName}.subsectionLabel`);
  if (subsectionLabel !== undefined) {
    parsed.subsectionLabel = subsectionLabel;
  }
  const contextLines = parseStringArray(context.contextLines, `${fieldName}.contextLines`);
  if (contextLines !== undefined) {
    parsed.contextLines = contextLines;
  }
  const currentLineIndex = optionalNonNegativeInteger(
    context.currentLineIndex,
    `${fieldName}.currentLineIndex`,
  );
  if (currentLineIndex !== undefined) {
    parsed.currentLineIndex = currentLineIndex;
  }

  return parsed;
};

export const parseQuestion = (
  value: unknown,
  fieldName: string,
): ListeningAuthoringDocumentV1['questions'][number] => {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be a record.`);
  }

  const question = cloneJsonCompatibleValue(value);
  assertAllowedFields(question, fieldName, [
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

  const parsed: ListeningAuthoringDocumentV1['questions'][number] = {
    number: requireNonNegativeInteger(question.number, `${fieldName}.number`),
    type: requireString(question.type, `${fieldName}.type`),
    question: requireText(question.question, `${fieldName}.question`),
    answer: parseQuestionAnswer(question.answer, `${fieldName}.answer`),
    sectionNumber: requireNonNegativeInteger(question.sectionNumber, `${fieldName}.sectionNumber`),
    points: requireNonNegativeInteger(question.points, `${fieldName}.points`),
  };
  const options = parseStringArray(question.options, `${fieldName}.options`);
  if (options !== undefined) {
    parsed.options = options;
  }
  const explanation = optionalText(question.explanation, `${fieldName}.explanation`);
  if (explanation !== undefined) {
    parsed.explanation = explanation;
  }
  const acceptableAnswers = parseStringArray(
    question.acceptableAnswers,
    `${fieldName}.acceptableAnswers`,
  );
  if (acceptableAnswers !== undefined) {
    parsed.acceptableAnswers = acceptableAnswers;
  }
  const imageUrl = optionalText(question.imageUrl, `${fieldName}.imageUrl`);
  if (imageUrl !== undefined) {
    parsed.imageUrl = imageUrl;
  }
  const context = parseQuestionContext(question.context, `${fieldName}.context`);
  if (context !== undefined) {
    parsed.context = context;
  }

  return parsed;
};
