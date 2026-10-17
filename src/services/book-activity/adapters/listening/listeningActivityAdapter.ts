import type {
  ListeningAuthoringQuestion,
  ListeningPublishedVersionRecord,
} from '../../../../features/assessment/listening/public';
import type { StudentActivityProjection } from '../../../../types/bookActivity.types';
import type {
  BookActivityAdapterContext,
  BookActivityAdapterResult,
  BookActivityAuthorizedAssetRef,
} from '../bookActivityAdapter.types';
import {
  createBookActivityAdapterProjection,
  type AdapterInteraction,
} from '../bookActivityAdapterProjection.service';

export interface ListeningBookActivityAdapterInput {
  readonly version: ListeningPublishedVersionRecord;
  readonly contextForQuestion?: (
    questionNumber: number,
  ) => ListeningQuestionAdapterContext | undefined;
}

export interface ListeningQuestionAdapterContext
  extends BookActivityAdapterContext {
  /** Required because the public Listening export intentionally omits answers. */
  readonly requiredSelectionCount?: number;
  /** Required because option-reuse authority is not present in the public export. */
  readonly allowOptionReuse?: boolean;
}

const failure = (
  code: Exclude<BookActivityAdapterResult, { ok: true }>['code'],
  path: string,
  message: string,
): BookActivityAdapterResult => ({ ok: false, code, path, message });

const TYPE_ALIASES: Readonly<Record<string, string>> = {
  'multiple-choice-single': 'listening-multiple-choice-single',
  'multiple-choice-multiple': 'listening-multiple-choice-multiple',
  matching: 'listening-matching',
  'map-plan-labelling': 'listening-map-plan-labelling',
  'map-plan-labeling': 'listening-map-plan-labelling',
  'diagram-labelling': 'listening-diagram-labelling',
  'diagram-labeling': 'listening-diagram-labelling',
  'form-completion': 'listening-form-completion',
  'note-completion': 'listening-note-completion',
  'table-completion': 'listening-table-completion',
  'flowchart-completion': 'listening-flowchart-completion',
  'summary-completion': 'listening-summary-completion',
  'sentence-completion': 'listening-sentence-completion',
  'short-answer': 'listening-short-answer',
};

const normalizeType = (value: string): string | null => {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized.startsWith('listening-')) return normalized;
  return TYPE_ALIASES[normalized] ?? null;
};

const familyFor = (
  typeId: string,
  question: ListeningAuthoringQuestion,
): AdapterInteraction['family'] => {
  if (typeId === 'listening-matching') return 'matching';
  if (
    typeId === 'listening-multiple-choice-single' ||
    typeId === 'listening-multiple-choice-multiple' ||
    (
      (
        typeId === 'listening-map-plan-labelling' ||
        typeId === 'listening-diagram-labelling' ||
        typeId === 'listening-summary-completion'
      ) &&
      (question.options?.length ?? 0) > 0
    )
  ) {
    return 'choice';
  }
  return 'text-entry';
};

const optionsFor = (
  question: ListeningAuthoringQuestion,
): { itemId: string; label: string }[] =>
  (question.options ?? []).map((label, index) => ({
    itemId: `q${question.number}-option-${index + 1}`,
    label,
  }));

const adaptInteraction = (
  typeId: string,
  question: ListeningAuthoringQuestion,
  context: ListeningQuestionAdapterContext,
): AdapterInteraction | null => {
  const interactionId = `listening-question-${question.number}`;
  const prompt = question.question.trim();
  const options = optionsFor(question);
  const family = familyFor(typeId, question);
  if (family === 'text-entry') {
    return {
      family,
      interactionId,
      prompt,
      questionLabel: String(question.number),
    };
  }
  if (options.length === 0) return null;
  if (family === 'choice') {
    return {
      family,
      interactionId,
      prompt,
      options,
      questionLabel: String(question.number),
      ...(typeId === 'listening-multiple-choice-multiple'
        ? { requiredSelectionCount: context.requiredSelectionCount }
        : {}),
    };
  }
  return {
    family,
    interactionId,
    prompt,
    questionLabel: String(question.number),
    leftItems: [{ itemId: interactionId, label: prompt }],
    rightItems: options,
    allowOptionReuse: context.allowOptionReuse,
  };
};

const contextFor = (
  input: ListeningBookActivityAdapterInput,
  question: ListeningAuthoringQuestion,
): ListeningQuestionAdapterContext => {
  const supplied = input.contextForQuestion?.(question.number) ?? {};
  const suppliedRefs = supplied.authorizedAssetRefs ?? [];
  const section = input.version.document.audioSections.find(
    (candidate) => candidate.number === question.sectionNumber,
  );
  const hasSuppliedAudio = suppliedRefs.some((ref) => ref.kind === 'audio');
  const sectionAudio: BookActivityAuthorizedAssetRef[] =
    !hasSuppliedAudio && section?.assetId
      ? [{
          kind: 'audio',
          assetId: section.assetId,
          sourceRef: `listening-section:${section.number}`,
        }]
      : [];
  return {
    ...supplied,
    authorizedAssetRefs: [...suppliedRefs, ...sectionAudio],
  };
};

export const adaptListeningVersionToBookActivities = (
  input: ListeningBookActivityAdapterInput,
): BookActivityAdapterResult => {
  const document = input.version?.document;
  if (
    input.version?.state !== 'published' ||
    document?.skill !== 'Listening' ||
    !Array.isArray(document.questions) ||
    !Array.isArray(document.audioSections)
  ) {
    return failure(
      'malformed-export',
      '$.version',
      'Listening export must be one published authoring version.',
    );
  }

  const projections: StudentActivityProjection[] = [];
  for (let index = 0; index < document.questions.length; index += 1) {
    const question = document.questions[index]!;
    if (
      !question ||
      typeof question.type !== 'string' ||
      typeof question.question !== 'string' ||
      !Number.isSafeInteger(question.number) ||
      !Number.isSafeInteger(question.sectionNumber) ||
      (question.options !== undefined && !Array.isArray(question.options))
    ) {
      return failure(
        'malformed-export',
        `$.version.document.questions[${index}]`,
        'Listening question shape is malformed.',
      );
    }
    const typeId = normalizeType(question.type);
    if (!typeId) {
      return failure(
        'unsupported-profile',
        `$.version.document.questions[${index}].type`,
        'Listening question type is not in canonical supported coverage.',
      );
    }
    const context = contextFor(input, question);
    const interaction = adaptInteraction(typeId, question, context);
    if (
      !interaction ||
      (
        typeId === 'listening-multiple-choice-multiple' &&
        (
          !Number.isSafeInteger(context.requiredSelectionCount) ||
          (context.requiredSelectionCount ?? 0) < 1
        )
      ) ||
      (
        typeId === 'listening-matching' &&
        typeof context.allowOptionReuse !== 'boolean'
      )
    ) {
      return failure(
        'malformed-export',
        `$.version.document.questions[${index}].options`,
        'Listening choice or matching question requires bounded options and explicit response authority.',
      );
    }
    const adapted = createBookActivityAdapterProjection({
      taxonomyId: 'ielts-listening',
      typeId,
      title: document.title,
      instructions: [document.metadata.instructions],
      stimulusText: question.question,
      interactions: [interaction],
      context,
      defaultPoints: question.points,
    });
    if (!adapted.ok) {
      return {
        ...adapted,
        path: `$.version.document.questions[${index}]${adapted.path === '$' ? '' : adapted.path.slice(1)}`,
      };
    }
    projections.push(...adapted.projections);
  }
  return { ok: true, projections };
};
