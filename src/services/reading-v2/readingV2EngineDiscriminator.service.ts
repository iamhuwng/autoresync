import { READING_V2_ENGINE, isReadingV2Payload } from '../../config/readingV2FeatureFlags';

export interface ReadingV2EngineDiscriminated {
  readonly deliveryEngine?: string;
  readonly engine?: string;
  readonly contentEngine?: string;
  readonly runtimeEngine?: string;
}

export const hasReadingV2EngineDiscriminator = (value: unknown): boolean =>
  isReadingV2Payload(value) ||
  (typeof value === 'object' &&
    value !== null &&
    'deliveryEngine' in value &&
    (value as ReadingV2EngineDiscriminated).deliveryEngine === READING_V2_ENGINE);

export const assertReadingV2EngineDiscriminator = (value: unknown): void => {
  if (!hasReadingV2EngineDiscriminator(value)) {
    throw new Error('Reading V2 platform branches require an explicit engine discriminator.');
  }
};

export const rejectReadingV2ShapeSniffingFallback = (value: unknown): void => {
  if (hasReadingV2EngineDiscriminator(value)) {
    return;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    ('taskGroups' in value || 'sectionIds' in value || 'stimuli' in value)
  ) {
    throw new Error('Reading V2 branching must use an explicit engine discriminator, not shape sniffing.');
  }
};
