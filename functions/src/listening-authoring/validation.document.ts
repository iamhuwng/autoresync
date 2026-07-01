import type { ListeningAuthoringDocumentV1 } from './contracts';
import { parseQuestion } from './validation.questions';
import { parseSettings, parseStatistics } from './validation.settings';
import {
  assertAllowedFields,
  cloneJsonCompatibleValue,
  isPlainObject,
  isRecord,
  optionalNonNegativeInteger,
  optionalString,
  optionalText,
  requireBoolean,
  requireNonNegativeInteger,
  requireString,
  requireStringArray,
  requireText,
} from './validation.primitives';

const parseDocumentType = (value: unknown): ListeningAuthoringDocumentV1['type'] => {
  if (value === 'IELTS' || value === 'TOEFL' || value === 'Custom') {
    return value;
  }

  throw new Error('document.type must be IELTS, TOEFL, or Custom.');
};

const parseDifficulty = (
  value: unknown,
): ListeningAuthoringDocumentV1['difficulty'] => {
  if (value === 'Beginner' || value === 'Intermediate' || value === 'Advanced') {
    return value;
  }

  throw new Error('document.difficulty must be Beginner, Intermediate, or Advanced.');
};

const parseDisplayMode = (value: unknown): ListeningAuthoringDocumentV1['displayMode'] => {
  if (value === 'text' || value === 'image') {
    return value;
  }

  throw new Error('document.displayMode must be text or image.');
};

const parseMetadata = (value: unknown): ListeningAuthoringDocumentV1['metadata'] => {
  if (!isPlainObject(value)) {
    throw new Error('document.metadata must be a record.');
  }

  const metadata = cloneJsonCompatibleValue(value);
  assertAllowedFields(metadata, 'document.metadata', [
    'description',
    'instructions',
    'tags',
    'targetBand',
    'estimatedScore',
    'transcript',
  ]);

  const parsed: ListeningAuthoringDocumentV1['metadata'] = {
    description: requireText(metadata.description, 'document.metadata.description'),
    instructions: requireText(metadata.instructions, 'document.metadata.instructions'),
    tags: requireStringArray(metadata.tags, 'document.metadata.tags'),
  };
  const targetBand = optionalText(metadata.targetBand, 'document.metadata.targetBand');
  if (targetBand !== undefined) {
    parsed.targetBand = targetBand;
  }
  const estimatedScore = optionalText(
    metadata.estimatedScore,
    'document.metadata.estimatedScore',
  );
  if (estimatedScore !== undefined) {
    parsed.estimatedScore = estimatedScore;
  }
  const transcript = optionalText(metadata.transcript, 'document.metadata.transcript');
  if (transcript !== undefined) {
    parsed.transcript = transcript;
  }

  return parsed;
};

const parseAudioSection = (
  value: unknown,
  fieldName: string,
): ListeningAuthoringDocumentV1['audioSections'][number] => {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be a record.`);
  }

  const section = cloneJsonCompatibleValue(value);
  assertAllowedFields(section, fieldName, [
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

  const parsed: ListeningAuthoringDocumentV1['audioSections'][number] = {
    number: requireNonNegativeInteger(section.number, `${fieldName}.number`),
    name: requireText(section.name, `${fieldName}.name`),
    audioUrl: requireText(section.audioUrl, `${fieldName}.audioUrl`),
    startQuestion: requireNonNegativeInteger(section.startQuestion, `${fieldName}.startQuestion`),
    endQuestion: requireNonNegativeInteger(section.endQuestion, `${fieldName}.endQuestion`),
  };
  const assetId = optionalString(section.assetId, `${fieldName}.assetId`);
  if (assetId !== undefined) {
    parsed.assetId = assetId;
  }
  const streamUrl = optionalText(section.streamUrl, `${fieldName}.streamUrl`);
  if (streamUrl !== undefined) {
    parsed.streamUrl = streamUrl;
  }
  const playLimit = optionalNonNegativeInteger(section.playLimit, `${fieldName}.playLimit`);
  if (playLimit !== undefined) {
    parsed.playLimit = playLimit;
  }
  const waitTimeBefore = optionalNonNegativeInteger(
    section.waitTimeBefore,
    `${fieldName}.waitTimeBefore`,
  );
  if (waitTimeBefore !== undefined) {
    parsed.waitTimeBefore = waitTimeBefore;
  }

  return parsed;
};

const parseQuestionImage = (
  value: unknown,
  fieldName: string,
): NonNullable<ListeningAuthoringDocumentV1['questionImages']>[number] => {
  if (!isPlainObject(value)) {
    throw new Error(`${fieldName} must be a record.`);
  }

  const image = cloneJsonCompatibleValue(value);
  assertAllowedFields(image, fieldName, [
    'sectionNumber',
    'imageUrl',
    'imageCaption',
    'questionRange',
  ]);

  const parsed: NonNullable<ListeningAuthoringDocumentV1['questionImages']>[number] = {
    sectionNumber: requireNonNegativeInteger(image.sectionNumber, `${fieldName}.sectionNumber`),
    imageUrl: requireText(image.imageUrl, `${fieldName}.imageUrl`),
  };
  const imageCaption = optionalText(image.imageCaption, `${fieldName}.imageCaption`);
  if (imageCaption !== undefined) {
    parsed.imageCaption = imageCaption;
  }
  if (image.questionRange !== undefined) {
    if (!isPlainObject(image.questionRange)) {
      throw new Error(`${fieldName}.questionRange must be a record.`);
    }
    const questionRange = cloneJsonCompatibleValue(image.questionRange);
    assertAllowedFields(questionRange, `${fieldName}.questionRange`, ['start', 'end']);
    parsed.questionRange = {};
    const start = optionalNonNegativeInteger(
      questionRange.start,
      `${fieldName}.questionRange.start`,
    );
    if (start !== undefined) {
      parsed.questionRange.start = start;
    }
    const end = optionalNonNegativeInteger(questionRange.end, `${fieldName}.questionRange.end`);
    if (end !== undefined) {
      parsed.questionRange.end = end;
    }
  }

  return parsed;
};

export const parseDocument = (value: unknown): ListeningAuthoringDocumentV1 => {
  if (!isRecord(value)) {
    throw new Error('document must be an object.');
  }

  if (value.skill !== 'Listening') {
    throw new Error('document.skill must be Listening.');
  }

  assertAllowedFields(value, 'document', [
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
  const audioSections = value.audioSections.map((entry, index) =>
    parseAudioSection(entry, `document.audioSections[${index}]`),
  );
  const questions = value.questions.map((entry, index) =>
    parseQuestion(entry, `document.questions[${index}]`),
  );

  const parsed: ListeningAuthoringDocumentV1 = {
    title: requireString(value.title, 'document.title'),
    type: parseDocumentType(value.type),
    skill: 'Listening',
    duration: requireNonNegativeInteger(value.duration, 'document.duration'),
    difficulty: parseDifficulty(value.difficulty),
    questionCount: requireNonNegativeInteger(value.questionCount, 'document.questionCount'),
    isPublic: requireBoolean(value.isPublic, 'document.isPublic'),
    isComplete: requireBoolean(value.isComplete, 'document.isComplete'),
    displayMode: parseDisplayMode(value.displayMode),
    metadata,
    audioSections,
    questions,
    settings: parseSettings(value.settings),
  };

  const missingAnswerCount = optionalNonNegativeInteger(
    value.missingAnswerCount,
    'document.missingAnswerCount',
  );
  if (missingAnswerCount !== undefined) {
    parsed.missingAnswerCount = missingAnswerCount;
  }
  if (value.questionImages !== undefined) {
    if (!Array.isArray(value.questionImages)) {
      throw new Error('document.questionImages must be an array.');
    }
    parsed.questionImages = value.questionImages.map((entry, index) =>
      parseQuestionImage(entry, `document.questionImages[${index}]`),
    );
  }
  const statistics = parseStatistics(value.statistics);
  if (statistics !== undefined) {
    parsed.statistics = statistics;
  }

  return parsed;
};
