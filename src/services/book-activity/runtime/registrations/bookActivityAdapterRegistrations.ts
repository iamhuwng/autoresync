import type { BookActivityAdapterRegistration } from '../../adapters/bookActivityAdapter.types';
import { activityRendererManifest } from '../activityRendererManifest';

const isFamily = (
  value: string,
): value is BookActivityAdapterRegistration['family'] =>
  ['choice', 'text-entry', 'matching', 'ordering', 'long-response'].includes(value);

export const bookActivityAdapterRegistrations: readonly BookActivityAdapterRegistration[] =
  activityRendererManifest.registrations.map((registration) => {
    if (!registration.profile || !isFamily(registration.family)) {
      throw new TypeError('Book Activity adapter registration requires one profiled family.');
    }
    const adapterId = registration.profile.taxonomyId === 'ielts-reading'
      ? 'reading-v2-projection-v1'
      : registration.profile.taxonomyId === 'ielts-listening'
        ? 'listening-authoring-v1'
        : null;
    if (!adapterId) {
      throw new TypeError('Book Activity adapter registration requires a supported native taxonomy.');
    }
    return {
      profile: {
        taxonomyId: registration.profile.taxonomyId,
        typeId: registration.profile.typeId,
        taxonomyVersion: registration.profile.taxonomyVersion,
      },
      family: registration.family,
      variant: registration.variant,
      presentationMode: registration.presentationMode,
      responseCodec: registration.responseCodec,
      adapterId,
      publicExport: registration.profile.taxonomyId === 'ielts-reading'
        ? 'services/reading-v2/public'
        : 'features/assessment/listening/public',
    };
  });

export const ticket27BookActivityAdapterRegistrations =
  bookActivityAdapterRegistrations;
