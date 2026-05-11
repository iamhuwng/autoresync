import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  assertReadingV2EngineDiscriminator,
  hasReadingV2EngineDiscriminator,
  rejectReadingV2ShapeSniffingFallback,
} from './readingV2EngineDiscriminator.service';

describe('readingV2EngineDiscriminator.service', () => {
  it('branches only from explicit Reading V2 engine fields', () => {
    expect(hasReadingV2EngineDiscriminator({ deliveryEngine: READING_V2_ENGINE })).toBe(true);
    expect(hasReadingV2EngineDiscriminator({ engine: READING_V2_ENGINE })).toBe(true);
    expect(hasReadingV2EngineDiscriminator({ taskGroups: {} })).toBe(false);
  });

  it('rejects shape-sniffing fallback for V2-looking payloads without engine markers', () => {
    expect(() => rejectReadingV2ShapeSniffingFallback({ taskGroups: {}, stimuli: {} })).toThrow(
      /shape sniffing/,
    );
  });

  it('requires an explicit engine discriminator before shared platform branching', () => {
    expect(() => assertReadingV2EngineDiscriminator({ deliveryEngine: READING_V2_ENGINE })).not.toThrow();
    expect(() => assertReadingV2EngineDiscriminator({ taskGroups: {} })).toThrow(/explicit engine/);
  });
});
