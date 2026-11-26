import type { ActivityRenderer, ActivityRendererRegistration } from '../activityRenderer.types';
import type { ActivityResponseCodec } from '../activityResponseCodec.types';
import {
  MultipleChoiceRenderer,
  SingleChoiceRenderer,
} from '../../../../components/book-runtime/interactions/choice';
import { TextEntryRenderer } from '../../../../components/book-runtime/interactions/text-entry';
import { MatchingRenderer } from '../../../../components/book-runtime/interactions/matching';
import { OrderingRenderer } from '../../../../components/book-runtime/interactions/ordering';
import { LongResponseRenderer } from '../../../../components/book-runtime/interactions/long-response';
import {
  choiceMultipleResponseCodec,
  choiceSingleResponseCodec,
  CHOICE_MULTIPLE_RESPONSE_CODEC_ID,
  CHOICE_SINGLE_RESPONSE_CODEC_ID,
} from '../codecs/choiceResponseCodec';
import {
  textEntryResponseCodec,
  TEXT_ENTRY_RESPONSE_CODEC_ID,
} from '../codecs/textEntryResponseCodec';
import {
  matchingResponseCodec,
  MATCHING_RESPONSE_CODEC_ID,
} from '../codecs/matchingResponseCodec';
import {
  orderingResponseCodec,
  ORDERING_RESPONSE_CODEC_ID,
} from '../codecs/orderingResponseCodec';
import {
  longResponseResponseCodec,
  LONG_RESPONSE_RESPONSE_CODEC_ID,
} from '../codecs/longResponseResponseCodec';
import { matchingOrderingRendererRegistrations } from './matchingOrderingRendererRegistrations';
type SupportedFamily = 'choice' | 'text-entry';
type SupportedMode = 'structured' | 'source-assisted';
type SupportedProfile = { taxonomyId: string; typeId: string; taxonomyVersion: 1 };

interface SupportedRegistrationSpec {
  family: SupportedFamily;
  variant: string;
  profile: SupportedProfile;
  presentationMode: SupportedMode;
  responseCodec: string;
  rendererId: string;
  codecId: string;
}

const asUnknownCodec = <Response>(
  codec: ActivityResponseCodec<Response>,
): ActivityResponseCodec<unknown> => codec as unknown as ActivityResponseCodec<unknown>;
const asUnknownRenderer = <Response>(
  renderer: ActivityRenderer<Response>,
): ActivityRenderer<unknown> => renderer as unknown as ActivityRenderer<unknown>;

const choiceCodecFor = (variant: string): ActivityResponseCodec<unknown> =>
  asUnknownCodec(['multiple-choice', 'multi-select'].includes(variant) ? choiceMultipleResponseCodec : choiceSingleResponseCodec);
const choiceRendererFor = (variant: string): ActivityRenderer<unknown> =>
  asUnknownRenderer(['multiple-choice', 'multi-select'].includes(variant) ? MultipleChoiceRenderer : SingleChoiceRenderer);

const supportedRegistrationSpecs: readonly SupportedRegistrationSpec[] = [
  {
    family: 'text-entry', variant: 'inline-blank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'sentence-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'summary-blank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'summary-completion-text', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'shared-option-bank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'summary-completion-list', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'note-blank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'note-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'table-cell-blank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'table-completion', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'flow-node-blank',
    profile: { taxonomyId: 'ielts-reading', typeId: 'flowchart-completion', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'diagram-label-choice',
    profile: { taxonomyId: 'ielts-reading', typeId: 'diagram-labeling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'diagram-label-text',
    profile: { taxonomyId: 'ielts-reading', typeId: 'diagram-labeling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'judgement-tfng',
    profile: { taxonomyId: 'ielts-reading', typeId: 'true-false-not-given', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'judgement-ynng',
    profile: { taxonomyId: 'ielts-reading', typeId: 'yes-no-not-given', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'single-choice',
    profile: { taxonomyId: 'ielts-reading', typeId: 'multiple-choice', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'multiple-choice',
    profile: { taxonomyId: 'ielts-reading', typeId: 'multiple-select', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_MULTIPLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_MULTIPLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'short-answer',
    profile: { taxonomyId: 'ielts-reading', typeId: 'short-answer', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'single-choice',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-multiple-choice-single', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'multiple-choice',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-multiple-choice-multiple', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_MULTIPLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_MULTIPLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'map-plan-letter-choice',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-map-plan-labelling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'map-plan-typed',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-map-plan-labelling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'diagram-label-text',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-diagram-labelling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'diagram-label-letter-choice',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-diagram-labelling', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'form-field',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-form-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'note-blank',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-note-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'table-cell-blank',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-table-completion', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'flow-node-blank',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-flowchart-completion', taxonomyVersion: 1 },
    presentationMode: 'source-assisted', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'summary-blank',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-summary-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'choice', variant: 'summary-dropdown-list',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-summary-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1', codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'inline-blank',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-sentence-completion', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
  {
    family: 'text-entry', variant: 'short-answer',
    profile: { taxonomyId: 'ielts-listening', typeId: 'listening-short-answer', taxonomyVersion: 1 },
    presentationMode: 'structured', responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
    rendererId: 'text-entry-v1', codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
  },
];

const createRegistration = (
  spec: SupportedRegistrationSpec,
): ActivityRendererRegistration<unknown> => ({
  family: spec.family,
  variant: spec.variant,
  taskProfile: spec.profile,
  presentationMode: spec.presentationMode,
  responseCodec: spec.responseCodec,
  rendererId: spec.rendererId,
  codecId: spec.codecId,
  renderer: spec.family === 'choice'
    ? choiceRendererFor(spec.variant)
    : asUnknownRenderer(TextEntryRenderer),
  codec: spec.family === 'choice'
    ? choiceCodecFor(spec.variant)
    : asUnknownCodec(textEntryResponseCodec),
});

export const ticket23ActivityRendererRegistrations: readonly ActivityRendererRegistration<unknown>[] =
  supportedRegistrationSpecs.map(createRegistration);

export const activityRendererRegistrations: readonly ActivityRendererRegistration<unknown>[] = [
  ...ticket23ActivityRendererRegistrations,
  ...matchingOrderingRendererRegistrations,
  ...(['single-select', 'multi-select'] as const).flatMap((variant) =>
    (['structured', 'source-assisted'] as const).map((presentationMode) => ({
      family: 'choice' as const,
      variant,
      presentationMode,
      responseCodec: variant === 'multi-select' ? CHOICE_MULTIPLE_RESPONSE_CODEC_ID : CHOICE_SINGLE_RESPONSE_CODEC_ID,
      rendererId: 'choice-v1',
      codecId: variant === 'multi-select' ? CHOICE_MULTIPLE_RESPONSE_CODEC_ID : CHOICE_SINGLE_RESPONSE_CODEC_ID,
      renderer: choiceRendererFor(variant),
      codec: choiceCodecFor(variant),
    })),
  ),
  ...(['short-text', 'sentence-completion'] as const).flatMap((variant) =>
    (['structured', 'source-assisted'] as const).map((presentationMode) => ({
      family: 'text-entry' as const,
      variant,
      presentationMode,
      responseCodec: TEXT_ENTRY_RESPONSE_CODEC_ID,
      rendererId: 'text-entry-v1',
      codecId: TEXT_ENTRY_RESPONSE_CODEC_ID,
      renderer: asUnknownRenderer(TextEntryRenderer),
      codec: asUnknownCodec(textEntryResponseCodec),
    })),
  ),
  ...(['structured', 'source-assisted'] as const).map((presentationMode) => ({
    family: 'matching' as const,
    variant: 'matching-pairs',
    presentationMode,
    responseCodec: MATCHING_RESPONSE_CODEC_ID,
    rendererId: 'matching-v1',
    codecId: MATCHING_RESPONSE_CODEC_ID,
    renderer: asUnknownRenderer(MatchingRenderer),
    codec: asUnknownCodec(matchingResponseCodec),
  })),
  ...(['structured', 'source-assisted'] as const).map((presentationMode) => ({
    family: 'ordering' as const,
    variant: 'sequence',
    presentationMode,
    responseCodec: ORDERING_RESPONSE_CODEC_ID,
    rendererId: 'ordering-v1',
    codecId: ORDERING_RESPONSE_CODEC_ID,
    renderer: asUnknownRenderer(OrderingRenderer),
    codec: asUnknownCodec(orderingResponseCodec),
  })),
  {
    family: 'choice',
    variant: 'v1',
    presentationMode: 'structured',
    responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1',
    codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    renderer: asUnknownRenderer(SingleChoiceRenderer),
    codec: asUnknownCodec(choiceSingleResponseCodec),
  },
  {
    family: 'choice',
    variant: 'v1',
    presentationMode: 'source-assisted',
    responseCodec: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    rendererId: 'choice-v1',
    codecId: CHOICE_SINGLE_RESPONSE_CODEC_ID,
    renderer: asUnknownRenderer(SingleChoiceRenderer),
    codec: asUnknownCodec(choiceSingleResponseCodec),
  },
  ...(['v1', 'draft-response'] as const).flatMap((variant) =>
    (['structured', 'source-assisted'] as const).map((presentationMode) => ({
      family: 'long-response' as const,
      variant,
      presentationMode,
      responseCodec: LONG_RESPONSE_RESPONSE_CODEC_ID,
      rendererId: 'long-response-v1',
      codecId: LONG_RESPONSE_RESPONSE_CODEC_ID,
      renderer: asUnknownRenderer(LongResponseRenderer),
      codec: asUnknownCodec(longResponseResponseCodec),
    })),
  ),
];

export const ticket25LongResponseRendererRegistration = activityRendererRegistrations.find((entry) => (
  entry.family === 'long-response' && entry.presentationMode === 'structured'
))!;
