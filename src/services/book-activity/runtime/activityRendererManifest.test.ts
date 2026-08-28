import { describe, expect, it } from 'vitest';
import { isActivityRendererManifest } from './activityRendererManifest';

const manifest = {
  schemaVersion: 1,
  kind: 'prd0062-activity-runtime-registration-manifest',
  registrations: [{
    profile: { taxonomyId: 'language-reading', typeId: 'selection', taxonomyVersion: 1 },
    family: 'choice',
    variant: 'v1',
    presentationMode: 'structured',
    responseCodec: 'choice-v1',
    rendererId: 'choice-v1',
    codecId: 'choice-v1',
  }],
};

describe('Activity renderer manifest', () => {
  it('accepts only the exact manifest envelope and registration shape', () => {
    expect(isActivityRendererManifest(manifest)).toBe(true);
    expect(isActivityRendererManifest({ ...manifest, ignored: true })).toBe(false);
    expect(isActivityRendererManifest({
      kind: manifest.kind,
      registrations: manifest.registrations,
    })).toBe(false);
    expect(isActivityRendererManifest({
      schemaVersion: manifest.schemaVersion,
      registrations: manifest.registrations,
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      schemaVersion: 2,
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      kind: 'other-manifest',
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: {},
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [{ ...manifest.registrations[0], ignored: true }],
    })).toBe(false);
    const { codecId: _codecId, ...missingRegistrationField } = manifest.registrations[0];
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [missingRegistrationField],
    })).toBe(false);
  });

  it('rejects invalid values, incomplete profiles, and overlapping selectors', () => {
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [{
        ...manifest.registrations[0],
        profile: { taxonomyId: 'invalid', typeId: 'selection', taxonomyVersion: 0 },
      }],
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [{
        ...manifest.registrations[0],
        profile: { taxonomyId: 'language-reading', typeId: 'selection' },
      }],
    })).toBe(false);
    for (const field of ['family', 'variant', 'responseCodec', 'rendererId', 'codecId'] as const) {
      expect(isActivityRendererManifest({
        ...manifest,
        registrations: [{ ...manifest.registrations[0], [field]: '   ' }],
      })).toBe(false);
    }
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [{ ...manifest.registrations[0], family: 'invented' }],
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [
        manifest.registrations[0],
        { ...manifest.registrations[0], rendererId: 'duplicate' },
      ],
    })).toBe(false);
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [
        { ...manifest.registrations[0], profile: null },
        manifest.registrations[0],
      ],
    })).toBe(false);
  });

  it('allows the same renderer selector in distinct presentation modes', () => {
    expect(isActivityRendererManifest({
      ...manifest,
      registrations: [
        manifest.registrations[0],
        { ...manifest.registrations[0], presentationMode: 'source-assisted' },
      ],
    })).toBe(true);
  });
});
