import type {
  ActivityInteractionFamily,
  StudentActivityInteraction,
  StudentActivityProjection,
} from '../../../types/bookActivity.types';
import { bookActivityAdapterRegistrations } from '../runtime/registrations/bookActivityAdapterRegistrations';
import type {
  BookActivityAdapterContext,
  BookActivityAdapterResult,
  BookActivityAuthorizedAssetRef,
} from './bookActivityAdapter.types';

const MAX_STRING_LENGTH = 4_000;
const MAX_INTERACTIONS = 50;
const MAX_ITEMS = 100;

export type AdapterInteraction =
  | {
      readonly family: 'text-entry';
      readonly interactionId: string;
      readonly prompt: string;
      readonly questionLabel?: string;
    }
  | {
      readonly family: 'choice';
      readonly interactionId: string;
      readonly prompt: string;
      readonly options: readonly { readonly itemId: string; readonly label: string }[];
      readonly requiredSelectionCount?: number;
      readonly questionLabel?: string;
    }
  | {
      readonly family: 'matching';
      readonly interactionId: string;
      readonly prompt: string;
      readonly leftItems: readonly { readonly itemId: string; readonly label: string }[];
      readonly rightItems: readonly { readonly itemId: string; readonly label: string }[];
      readonly allowOptionReuse?: boolean;
      readonly questionLabel?: string;
    };

export interface AdapterProjectionInput {
  readonly taxonomyId: 'ielts-reading' | 'ielts-listening';
  readonly typeId: string;
  readonly title: string;
  readonly instructions: readonly string[];
  readonly stimulusText?: string;
  readonly interactions: readonly AdapterInteraction[];
  readonly context: BookActivityAdapterContext;
  readonly defaultPoints?: number;
}

const failure = (
  code: Exclude<BookActivityAdapterResult, { ok: true }>['code'],
  path: string,
  message: string,
): BookActivityAdapterResult => ({ ok: false, code, path, message });

const boundedString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= MAX_STRING_LENGTH;

const opaqueStableId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value);

const uniqueStrings = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const requiredAssetKinds = (
  taxonomyId: AdapterProjectionInput['taxonomyId'],
  typeId: string,
): readonly ('image' | 'audio')[] => {
  const imageRequired = typeId.includes('diagram') || typeId.includes('map-plan');
  if (taxonomyId === 'ielts-listening') {
    return imageRequired ? ['audio', 'image'] : ['audio'];
  }
  return imageRequired ? ['image'] : [];
};

const authorizedAssets = (
  requiredKinds: readonly ('image' | 'audio')[],
  refs: readonly BookActivityAuthorizedAssetRef[] | undefined,
): BookActivityAuthorizedAssetRef[] | BookActivityAdapterResult => {
  const result: BookActivityAuthorizedAssetRef[] = [];
  for (const kind of requiredKinds) {
    const matches = (refs ?? []).filter((ref) => ref.kind === kind);
    if (matches.length === 0) {
      return failure(
        'missing-authorized-asset',
        '$.context.authorizedAssetRefs',
        `Authorized ${kind} asset identity is required.`,
      );
    }
    if (matches.length > 1) {
      return failure(
        'ambiguous-authorized-asset',
        '$.context.authorizedAssetRefs',
        `Exactly one authorized ${kind} asset identity is required.`,
      );
    }
    if (
      !opaqueStableId(matches[0]!.assetId) ||
      !opaqueStableId(matches[0]!.sourceRef)
    ) {
      return failure(
        'malformed-export',
        '$.context.authorizedAssetRefs',
        'Authorized asset identities must be bounded stable strings.',
      );
    }
    result.push(matches[0]!);
  }
  return result;
};

const interactionIsValid = (interaction: AdapterInteraction): boolean => {
  if (
    !boundedString(interaction.interactionId) ||
    !boundedString(interaction.prompt) ||
    (
      interaction.questionLabel !== undefined &&
      !boundedString(interaction.questionLabel)
    )
  ) {
    return false;
  }
  if (interaction.family === 'text-entry') return true;
  if (interaction.family === 'choice') {
    return interaction.options.length > 0 &&
      interaction.options.length <= MAX_ITEMS &&
      uniqueStrings(interaction.options.map((option) => option.itemId)) &&
      interaction.options.every(
        (option) => boundedString(option.itemId) && boundedString(option.label),
      ) &&
      (
        interaction.requiredSelectionCount === undefined ||
        (
          Number.isSafeInteger(interaction.requiredSelectionCount) &&
          interaction.requiredSelectionCount > 0 &&
          interaction.requiredSelectionCount <= interaction.options.length
        )
      );
  }
  return interaction.leftItems.length > 0 &&
    interaction.rightItems.length > 0 &&
    interaction.leftItems.length <= MAX_ITEMS &&
    interaction.rightItems.length <= MAX_ITEMS &&
    uniqueStrings(interaction.leftItems.map((item) => item.itemId)) &&
    uniqueStrings(interaction.rightItems.map((item) => item.itemId)) &&
    interaction.leftItems.every(
      (item) => boundedString(item.itemId) && boundedString(item.label),
    ) &&
    interaction.rightItems.every(
      (item) => boundedString(item.itemId) && boundedString(item.label),
    );
};

const projectInteractions = (
  interactions: readonly AdapterInteraction[],
  sourceAssisted: boolean,
  context: BookActivityAdapterContext,
): StudentActivityInteraction[] =>
  interactions.map((interaction) => {
    const shared = {
      family: interaction.family,
      interactionId: interaction.interactionId,
      prompt: interaction.prompt,
      ...(sourceAssisted
        ? {
            sourceAssisted: {
              questionLabel: interaction.questionLabel ?? interaction.interactionId,
              accessiblePrompt: interaction.prompt,
              responseShape: interaction.family === 'choice'
                ? (
                    interaction.requiredSelectionCount &&
                    interaction.requiredSelectionCount > 1
                      ? 'multiple-choice'
                      : 'single-choice'
                  )
                : interaction.family === 'matching'
                  ? 'matching'
                  : 'short-text',
              ...(context.sourceContext?.sourceExerciseLabel
                ? { sourceExerciseLabel: context.sourceContext.sourceExerciseLabel }
                : {}),
              ...(context.sourceContext?.sourcePartLabel
                ? { sourcePartLabel: context.sourceContext.sourcePartLabel }
                : {}),
            },
          }
        : {}),
    };
    if (interaction.family === 'choice') {
      return { ...shared, family: 'choice' as const, options: [...interaction.options] };
    }
    if (interaction.family === 'matching') {
      return {
        ...shared,
        family: 'matching' as const,
        leftItems: [...interaction.leftItems],
        rightItems: [...interaction.rightItems],
      };
    }
    return { ...shared, family: 'text-entry' as const };
  });

export const createBookActivityAdapterProjection = (
  input: AdapterProjectionInput,
): BookActivityAdapterResult => {
  if (
    !boundedString(input.typeId) ||
    !boundedString(input.title) ||
    !Array.isArray(input.instructions) ||
    input.instructions.length === 0 ||
    input.instructions.length > MAX_ITEMS ||
    !input.instructions.every(boundedString) ||
    !Array.isArray(input.interactions) ||
    input.interactions.length === 0 ||
    input.interactions.length > MAX_INTERACTIONS ||
    !input.interactions.every(interactionIsValid) ||
    (
      input.defaultPoints !== undefined &&
      (
        !Number.isFinite(input.defaultPoints) ||
        input.defaultPoints < 0 ||
        input.defaultPoints > 100
      )
    )
  ) {
    return failure('malformed-export', '$', 'External projection is malformed or outside bounds.');
  }

  const families = new Set(input.interactions.map((interaction) => interaction.family));
  if (families.size !== 1) {
    return failure(
      'unsupported-shape',
      '$.interactions',
      'One adapted Activity may contain only one interaction family.',
    );
  }
  const family = [...families][0] as ActivityInteractionFamily;
  const registration = bookActivityAdapterRegistrations.find(
    (entry) =>
      entry.profile.taxonomyId === input.taxonomyId &&
      entry.profile.typeId === input.typeId &&
      entry.family === family,
  );
  if (!registration) {
    return failure(
      'unsupported-profile',
      '$.typeId',
      'External task has no supported Activity coverage registration.',
    );
  }

  const sourceAssisted = registration.presentationMode === 'source-assisted';
  if (sourceAssisted && input.context.sourceContext?.available !== true) {
    return failure(
      'missing-source-context',
      '$.context.sourceContext',
      'Source-assisted Activity requires Book-owned source context.',
    );
  }

  const assets = authorizedAssets(
    requiredAssetKinds(input.taxonomyId, input.typeId),
    input.context.authorizedAssetRefs,
  );
  if (!Array.isArray(assets)) return assets;

  const first = input.interactions[0]!;
  const answerRule = {
    defaultPoints: input.defaultPoints ?? 1,
    normalization: 'trim-case-and-spacing' as const,
    ...(first.family === 'choice' && first.requiredSelectionCount !== undefined
      ? { requiredSelectionCount: first.requiredSelectionCount }
      : {}),
    ...(first.family === 'matching'
      ? { allowOptionReuse: first.allowOptionReuse === true }
      : {}),
  };

  const projection = {
    schemaVersion: 1,
    title: input.title,
    taskProfile: registration.profile,
    presentationMode: registration.presentationMode,
    contextRequirement: {
      mode: 'required' as const,
      acceptedKinds: input.taxonomyId === 'ielts-listening'
        ? (sourceAssisted ? ['audio', 'book-pages'] : ['audio'])
        : ['book-pages'],
    },
    instructions: input.instructions.map((text) => ({ text })),
    stimulus: sourceAssisted
      ? null
      : {
          kind: 'external-projection',
          text: boundedString(input.stimulusText)
            ? input.stimulusText
            : input.instructions.join('\n'),
        },
    assetRefs: assets.map(({ kind, assetId }) => ({ kind, assetId })),
    interaction: { family, variant: registration.variant },
    answerRule,
    interactions: projectInteractions(input.interactions, sourceAssisted, input.context),
    scoring: {
      mode: 'auto-where-possible' as const,
      feedbackVisibility: 'none' as const,
    },
  };

  return {
    ok: true,
    projections: [projection as StudentActivityProjection],
  };
};
