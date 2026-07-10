import type {
  BookActivityStudentSafeInteraction,
  BookActivityStudentSafeProjection,
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';

export class BookActivityProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookActivityProjectionError';
  }
}

const FORBIDDEN_PROJECTION_KEYS = [
  'answerKey',
  'answerKeys',
  'correctAnswers',
  'answerRule',
  'teacherNotes',
  'authoringData',
  'candidates',
  'provenance',
  'origin',
  'hiddenInteractionId',
  'publishedBy',
];

const containsForbiddenKey = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = containsForbiddenKey(entry);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (value === null || typeof value !== 'object') {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PROJECTION_KEYS.includes(key)) {
      return key;
    }
    const result = containsForbiddenKey(child);
    if (result) {
      return result;
    }
  }

  return null;
};

export const assertStudentSafeActivityProjection = (
  projection: BookActivityStudentSafeProjection,
): void => {
  const forbiddenKey = containsForbiddenKey(projection);
  if (forbiddenKey) {
    throw new BookActivityProjectionError(`Student-safe projection contains forbidden field: ${forbiddenKey}.`);
  }
};

export const createStudentSafeActivityProjection = (
  version: BookActivityVersionRecord,
  now: string,
): BookActivityStudentSafeProjection => {
  const interactions: BookActivityStudentSafeInteraction[] =
    version.content.interactions.map((interaction, index) => ({
      clientInteractionKey: `i${index + 1}`,
      family: interaction.family,
      prompt: interaction.prompt,
      choices: interaction.choices,
      pairs: interaction.pairs?.map((pair) => ({ left: pair.left })),
      orderingItems: interaction.orderingItems,
      responseShape: interaction.responseShape,
      source: interaction.source,
    }));

  const projection: BookActivityStudentSafeProjection = {
    projectionKind: 'student-safe',
    activityId: version.activityId,
    versionId: version.versionId,
    ownerId: version.ownerId,
    title: version.content.title,
    presentationMode: version.content.presentationMode,
    contextRequirement: version.content.contextRequirement,
    instructions: version.content.instructions,
    stimulus: version.content.stimulus,
    interactions,
    generatedAt: now,
  };

  assertStudentSafeActivityProjection(projection);
  return projection;
};
