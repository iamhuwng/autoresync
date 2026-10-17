import type { ActivityRenderer, ActivityRendererRegistration } from '../activityRenderer.types';
import type { ActivityResponseCodec } from '../activityResponseCodec.types';
import { MatchingRenderer } from '../../../../components/book-runtime/interactions/matching';
import { matchingResponseCodec, MATCHING_RESPONSE_CODEC_ID } from '../codecs/matchingResponseCodec';

type MatchingProfile = {
  taxonomyId: string;
  typeId: string;
  taxonomyVersion: 1;
};

interface MatchingRegistrationSpec {
  variant: string;
  profile: MatchingProfile;
}

const asUnknownCodec = <Response>(
  codec: ActivityResponseCodec<Response>,
): ActivityResponseCodec<unknown> => codec as unknown as ActivityResponseCodec<unknown>;

const asUnknownRenderer = <Response>(
  renderer: ActivityRenderer<Response>,
): ActivityRenderer<unknown> => renderer as unknown as ActivityRenderer<unknown>;

const supportedMatchingSpecs: readonly MatchingRegistrationSpec[] = [
  {
    variant: 'heading-to-section',
    profile: { taxonomyId: 'ielts-reading', typeId: 'matching-headings', taxonomyVersion: 1 },
  },
  {
    variant: 'statement-to-section',
    profile: { taxonomyId: 'ielts-reading', typeId: 'matching-information', taxonomyVersion: 1 },
  },
  {
    variant: 'feature-assignment',
    profile: { taxonomyId: 'ielts-reading', typeId: 'matching-features', taxonomyVersion: 1 },
  },
  {
    variant: 'sentence-ending-pair',
    profile: { taxonomyId: 'ielts-reading', typeId: 'matching-sentence-endings', taxonomyVersion: 1 },
  },
  {
    variant: 'audio-option-assignment',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-matching', taxonomyVersion: 1 },
  },
];

export const matchingOrderingRendererRegistrations: readonly ActivityRendererRegistration<unknown>[] =
  supportedMatchingSpecs.map((spec) => ({
    family: 'matching',
    variant: spec.variant,
    taskProfile: spec.profile,
    presentationMode: 'structured',
    responseCodec: MATCHING_RESPONSE_CODEC_ID,
    rendererId: 'matching-v1',
    codecId: MATCHING_RESPONSE_CODEC_ID,
    renderer: asUnknownRenderer(MatchingRenderer),
    codec: asUnknownCodec(matchingResponseCodec),
  }));

export const ticket24MatchingOrderingRendererRegistrations = matchingOrderingRendererRegistrations;
