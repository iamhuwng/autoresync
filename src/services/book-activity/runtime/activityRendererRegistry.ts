import type {
  ActivityInteractionFamily,
  ActivityTaskProfile,
} from '../../../types/bookActivity.types';
import { validateStudentActivityProjection } from '../activityProjectionValidation.service';
import {
  activityRendererManifest,
  activityRendererRegistrations,
} from './activityRendererManifest';
import { MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES } from './activityResponseCodec.types';
import type {
  ActivityRendererRegistration,
  ActivityRendererContext,
  ActivityRendererDiagnostic,
  ActivityRendererResolution,
  ActivityRendererTaskProfileSelector,
  RegisteredActivityRenderer,
} from './activityRenderer.types';
import { registerActivityRenderer } from './activityRenderer.types';

const FAMILY_SET = new Set<ActivityInteractionFamily>([
  'choice',
  'text-entry',
  'matching',
  'ordering',
  'long-response',
]);
const PRESENTATION_MODE_SET = new Set(['structured', 'source-assisted']);
const PROFILE_NAMESPACE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const PROFILE_TYPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_STRING_LENGTH = 4_000;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const diagnostic = (
  code: ActivityRendererDiagnostic['code'],
  path: string,
  message: string,
): ActivityRendererResolution => ({
  supported: false,
  diagnostic: { code, path, message },
});

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const boundedString = (value: unknown): value is string =>
  nonEmptyString(value) && value.length <= MAX_STRING_LENGTH;

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const taskProfileMatches = (
  selector: ActivityRendererTaskProfileSelector | undefined,
  profile: ActivityTaskProfile | null,
): boolean => {
  if (!selector) return true;
  return (
    profile !== null &&
    selector.taxonomyId === profile.taxonomyId &&
    selector.typeId === profile.typeId &&
    selector.taxonomyVersion === profile.taxonomyVersion
  );
};

const registrationKey = (registration: RegisteredActivityRenderer): string => {
  const profile = registration.taskProfile;
  return [
    registration.family,
    registration.variant,
    profile?.taxonomyId ?? '',
    profile?.typeId ?? '',
    profile?.taxonomyVersion ?? '',
  ].join('\u0000');
};

const registrationsOverlap = (
  left: RegisteredActivityRenderer,
  right: RegisteredActivityRenderer,
): boolean => {
  if (left.family !== right.family || left.variant !== right.variant) return false;
  if (!left.taskProfile || !right.taskProfile) return true;
  if (
    left.taskProfile.taxonomyId !== right.taskProfile.taxonomyId ||
    left.taskProfile.typeId !== right.taskProfile.typeId
  ) return false;
  return (
    left.taskProfile.taxonomyVersion === right.taskProfile.taxonomyVersion
  );
};

const hasCodecContract = (registration: RegisteredActivityRenderer): boolean => {
  const codec: unknown = registration.codec;
  if (!isPlainRecord(codec)) return false;
  return [
    'createEmpty',
    'decode',
    'validate',
    'serialize',
    'equals',
    'toReviewProjection',
  ].every((method) => typeof codec[method] === 'function') &&
    positiveSafeInteger(codec.maxSerializedBytes) &&
    codec.maxSerializedBytes <= MAX_ACTIVITY_RESPONSE_SERIALIZED_BYTES;
};

const taskProfileSelectorIsValid = (
  selector: ActivityRendererTaskProfileSelector | undefined,
): boolean =>
  selector === undefined ||
  (boundedString(selector.taxonomyId) &&
    PROFILE_NAMESPACE.test(selector.taxonomyId) &&
    boundedString(selector.typeId) &&
    PROFILE_TYPE.test(selector.typeId) &&
    positiveSafeInteger(selector.taxonomyVersion));

export interface ActivityRendererRegistry {
  resolve(projection: unknown, context: ActivityRendererContext): ActivityRendererResolution;
  registrations(): readonly RegisteredActivityRenderer[];
}

export const createActivityRendererRegistry = (
  registrations: readonly ActivityRendererRegistration<unknown>[],
  manifestRegistrations?: readonly {
    family: string;
    variant: string;
    profile: { taxonomyId: string; typeId: string; taxonomyVersion: number } | null;
    presentationMode: 'structured' | 'source-assisted';
    responseCodec: string;
    rendererId: string;
    codecId: string;
  }[],
): ActivityRendererRegistry => {
  const seen = new Set<string>();
  const ordered = registrations
    .map((registration) => registerActivityRenderer(registration))
    .sort((left, right) => registrationKey(left).localeCompare(registrationKey(right)));
  for (const registration of ordered) {
    const key = registrationKey(registration);
    if (seen.has(key)) throw new Error(`Duplicate Activity renderer registration: ${key}.`);
    if (!FAMILY_SET.has(registration.family) || !nonEmptyString(registration.variant) ||
        !PRESENTATION_MODE_SET.has(registration.presentationMode) ||
        !nonEmptyString(registration.responseCodec) || !nonEmptyString(registration.rendererId) ||
        !nonEmptyString(registration.codecId) || typeof registration.renderer !== 'function' ||
        !hasCodecContract(registration) || !taskProfileSelectorIsValid(registration.taskProfile)) {
      throw new Error(`Invalid Activity renderer registration: ${key}.`);
    }
    if (ordered.some((candidate) =>
      candidate !== registration && registrationKey(candidate) !== key &&
      registrationsOverlap(candidate, registration),
    )) {
      throw new Error(`Overlapping Activity renderer registration: ${key}.`);
    }
    seen.add(key);
  }
  if (manifestRegistrations !== undefined) {
    const manifestByKey = new Map(manifestRegistrations.map((entry) => [[
      entry.family, entry.variant, entry.profile?.taxonomyId ?? '', entry.profile?.typeId ?? '',
      entry.profile?.taxonomyVersion ?? '',
    ].join('\u0000'), entry]));
    if (manifestByKey.size !== manifestRegistrations.length || manifestByKey.size !== seen.size) {
      throw new Error('Activity renderer registrations do not match registration manifest.');
    }
    for (const registration of ordered) {
      const manifest = manifestByKey.get(registrationKey(registration));
      if (!manifest || manifest.presentationMode !== registration.presentationMode ||
          manifest.responseCodec !== registration.responseCodec ||
          manifest.rendererId !== registration.rendererId || manifest.codecId !== registration.codecId) {
        throw new Error('Activity renderer registrations do not match registration manifest.');
      }
    }
  }

  return {
    registrations: () => ordered,
    resolve: (projection, context) => {
      const validation = validateStudentActivityProjection(projection);
      if (!validation.valid) return { supported: false, diagnostic: validation.diagnostic };
      const validated = validation.value;
      const needsSource = validated.presentationMode === 'source-assisted' ||
        (validated.contextRequirement.mode === 'required' &&
          validated.contextRequirement.acceptedKinds.includes('book-pages'));
      if (needsSource && (context.sourceContext?.available !== true ||
          !nonEmptyString(context.sourceContext.description))) {
        return diagnostic('missing-required-source-context', '$.sourceContext.description', 'Required source context is unavailable.');
      }
      const registration = ordered.find((candidate) =>
        candidate.family === validated.interaction.family &&
        candidate.variant === validated.interaction.variant &&
        candidate.presentationMode === validated.presentationMode &&
        taskProfileMatches(candidate.taskProfile, validated.taskProfile),
      );
      return registration
        ? { supported: true, registration, projection: validated }
        : diagnostic('unknown-renderer', '$.interaction', 'No renderer is registered for this Activity.');
    },
  };
};

export const bookActivityRendererRegistry = createActivityRendererRegistry(
  activityRendererRegistrations,
  activityRendererManifest.registrations,
);
