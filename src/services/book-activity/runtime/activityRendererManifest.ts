import manifestJson from './activityRendererManifest.json';
import {
  ACTIVITY_INTERACTION_FAMILIES,
  type ActivityInteractionFamily,
} from '../../../types/bookActivity.types';
import { activityRendererRegistrations } from './registrations/activityRendererRegistrations';

export interface ActivityRendererManifestEntry {
  profile: {
    taxonomyId: string;
    typeId: string;
    taxonomyVersion: number;
  } | null;
  family: string;
  variant: string;
  presentationMode: 'structured' | 'source-assisted';
  responseCodec: string;
  rendererId: string;
  codecId: string;
}

export interface ActivityRendererManifest {
  schemaVersion: 1;
  kind: 'prd0062-activity-runtime-registration-manifest';
  registrations: readonly ActivityRendererManifestEntry[];
}

const PROFILE_NAMESPACE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const PROFILE_TYPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FAMILY_SET = new Set<ActivityInteractionFamily>(ACTIVITY_INTERACTION_FAMILIES);
const MAX_MANIFEST_STRING_LENGTH = 4_000;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const hasExactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  isPlainRecord(value) &&
  Reflect.ownKeys(value).every(
    (key) =>
      typeof key === 'string' &&
      keys.includes(key) &&
      Object.prototype.propertyIsEnumerable.call(value, key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'),
  ) &&
  keys.every((key) => Object.hasOwn(value, key));

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const boundedString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= MAX_MANIFEST_STRING_LENGTH;

const isManifestEntry = (value: unknown): value is ActivityRendererManifestEntry => {
  if (!hasExactKeys(value, [
    'profile', 'family', 'variant', 'presentationMode', 'responseCodec', 'rendererId', 'codecId',
  ])) return false;
  const record = value;
  const profile = record.profile;
  const profileValid = profile === null || (
    hasExactKeys(profile, ['taxonomyId', 'typeId', 'taxonomyVersion']) &&
    boundedString(profile.taxonomyId) && PROFILE_NAMESPACE.test(profile.taxonomyId) &&
    boundedString(profile.typeId) && PROFILE_TYPE.test(profile.typeId) &&
    positiveSafeInteger(profile.taxonomyVersion)
  );
  return profileValid &&
    boundedString(record.family) &&
    FAMILY_SET.has(record.family as ActivityInteractionFamily) &&
    boundedString(record.variant) &&
    (record.presentationMode === 'structured' || record.presentationMode === 'source-assisted') &&
    boundedString(record.responseCodec) &&
    boundedString(record.rendererId) &&
    boundedString(record.codecId);
};

const manifestEntriesOverlap = (
  left: ActivityRendererManifestEntry,
  right: ActivityRendererManifestEntry,
): boolean => {
  if (left.family !== right.family || left.variant !== right.variant ||
      left.presentationMode !== right.presentationMode) return false;
  if (left.profile === null || right.profile === null) return true;
  return left.profile.taxonomyId === right.profile.taxonomyId &&
    left.profile.typeId === right.profile.typeId &&
    left.profile.taxonomyVersion === right.profile.taxonomyVersion;
};

export const isActivityRendererManifest = (value: unknown): value is ActivityRendererManifest => {
  if (!hasExactKeys(value, ['schemaVersion', 'kind', 'registrations'])) return false;
  const record = value;
  const registrations = record.registrations;
  if (!(record.schemaVersion === 1 &&
    record.kind === 'prd0062-activity-runtime-registration-manifest' &&
    Array.isArray(registrations) &&
    registrations.every(isManifestEntry))) {
    return false;
  }
  return !registrations.some((entry, index) =>
    registrations.some(
      (candidate, candidateIndex) =>
        candidateIndex > index && manifestEntriesOverlap(entry, candidate),
    ),
  );
};

if (!isActivityRendererManifest(manifestJson)) {
  throw new Error('Invalid Activity renderer registration manifest.');
}

export const activityRendererManifest: ActivityRendererManifest = manifestJson;

export { activityRendererRegistrations };
