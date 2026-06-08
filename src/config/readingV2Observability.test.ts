import { describe, expect, it } from 'vitest';
import { FEATURE_REGISTRY } from './featureRegistry';
import {
  READING_V2_OBSERVABILITY_EVENTS,
  assertReadingV2ObservabilityCatalogRegistered,
} from './readingV2Observability';

const FORBIDDEN_PROPERTY_TOKENS = [
  /answer/i,
  /correct/i,
  /key/i,
  /diagnostic/i,
  /evidence/i,
  /provenance/i,
  /studentName/i,
  /email/i,
];

describe('readingV2Observability', () => {
  it('registers every catalog action in the existing feature registry', () => {
    expect(() => assertReadingV2ObservabilityCatalogRegistered()).not.toThrow();
  });

  it('covers the PRD-0048 studio, runtime, result, feedback, regrade, and error workflows', () => {
    expect(READING_V2_OBSERVABILITY_EVENTS.map((event) => event.eventName)).toEqual(
      expect.arrayContaining([
        'reading_v2_studio_create',
        'reading_v2_studio_import',
        'reading_v2_studio_metadata_edit',
        'reading_v2_studio_save',
        'reading_v2_studio_validate',
        'reading_v2_studio_preview',
        'reading_v2_studio_publish',
        'reading_v2_studio_extract',
        'reading_v2_runtime_launch',
        'reading_v2_runtime_submit',
        'reading_v2_result_review',
        'reading_v2_result_feedback',
        'reading_v2_result_regrade',
        'reading_v2_operational_error',
      ]),
    );
  });

  it('covers PRD-0048 canonical anchor foundation diagnostics', () => {
    expect(READING_V2_OBSERVABILITY_EVENTS.map((event) => event.eventName)).toEqual(
      expect.arrayContaining([
        'canonical_anchor_guard_failed',
        'duplicate_structured_layout_question',
        'structured_layout_anchor_cardinality_mismatch',
        'studio_import_candidate_rejected',
        'publish_canonical_validation_blocked',
        'passage_extraction_canonical_validation_blocked',
        'backfill_canonical_validation_blocked',
      ]),
    );
  });

  it('uses privacy-safe required properties and identifiers', () => {
    READING_V2_OBSERVABILITY_EVENTS.forEach((event) => {
      expect(event.requiredProperties).toContain('outcome');
      expect(event.allowedOutcomes.length).toBeGreaterThan(0);
      [...event.requiredProperties, ...event.privacySafeIdentifiers].forEach((property) => {
        expect(FORBIDDEN_PROPERTY_TOKENS.some((pattern) => pattern.test(property))).toBe(false);
      });
    });
  });

  it('does not create a detached analytics feature owner', () => {
    const featureIds = new Set(FEATURE_REGISTRY.map((feature) => feature.id));

    READING_V2_OBSERVABILITY_EVENTS.forEach((event) => {
      expect(featureIds.has(event.featureId)).toBe(true);
    });
    expect([...featureIds]).not.toContain('readingV2Analytics');
  });
});
