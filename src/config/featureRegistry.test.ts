import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_REGISTRY,
  resolveFeatureFromRoute,
  validateFeatureId,
} from './featureRegistry';

describe('featureRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveFeatureFromRoute', () => {
    it('maps known student test routes to testTaking', () => {
      expect(resolveFeatureFromRoute('/student-test/ABC123')).toBe('testTaking');
    });

    it('maps known homework routes to homework', () => {
      expect(resolveFeatureFromRoute('/teacher/homework')).toBe('homework');
    });

    it('maps Reading V2 studio routes to readingV2Studio', () => {
      expect(resolveFeatureFromRoute('/teacher/reading-v2/create')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/import')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/drafts/draft-123')).toBe('readingV2Studio');
      expect(resolveFeatureFromRoute('/teacher/reading-v2/materials/material-123/revise')).toBe('readingV2Studio');
    });

    it('maps wildcard admin routes to adminPanel', () => {
      expect(resolveFeatureFromRoute('/admin/dashboard')).toBe('adminPanel');
    });

    it('maps result routes without params to results', () => {
      expect(resolveFeatureFromRoute('/guest-results')).toBe('results');
      expect(resolveFeatureFromRoute('/teacher/results')).toBe('results');
      expect(resolveFeatureFromRoute('/submission-complete')).toBe('results');
      expect(resolveFeatureFromRoute('/profile/complete')).toBe('results');
    });

    it('returns null for unknown routes', () => {
      expect(resolveFeatureFromRoute('/unknown/page')).toBeNull();
    });
  });

  describe('validateFeatureId', () => {
    it('returns true for a known feature id', () => {
      expect(validateFeatureId('testTaking')).toBe(true);
    });

    it('returns false for an unknown feature id', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(validateFeatureId('nonexistent')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('FEATURE_REGISTRY', () => {
    it('ensures every feature entry has the required fields', () => {
      FEATURE_REGISTRY.forEach((feature) => {
        expect(feature.id).toEqual(expect.any(String));
        expect(feature.name).toEqual(expect.any(String));
        expect(feature.routes).toEqual(expect.any(Array));
        expect(feature.actions).toEqual(expect.any(Array));
        expect(feature.description).toEqual(expect.any(String));
      });
    });

    it('registers integrity detail actions for homework and results workflows', () => {
      const homework = FEATURE_REGISTRY.find((feature) => feature.id === 'homework');
      const liveSessions = FEATURE_REGISTRY.find((feature) => feature.id === 'liveSessions');
      const results = FEATURE_REGISTRY.find((feature) => feature.id === 'results');
      const antiCheat = FEATURE_REGISTRY.find((feature) => feature.id === 'antiCheat');
      const readingV2Studio = FEATURE_REGISTRY.find((feature) => feature.id === 'readingV2Studio');
      const testTaking = FEATURE_REGISTRY.find((feature) => feature.id === 'testTaking');

      expect(homework?.actions).toContain('viewIntegrityDetails');
      expect(liveSessions?.actions).toContain('viewIntegrityDetails');
      expect(results?.actions).toContain('viewIntegrityDetails');
      expect(readingV2Studio?.actions).toEqual(
        expect.arrayContaining([
          'openStudio',
          'startBlankMaterial',
          'startImportMaterial',
          'resumeDraft',
          'revisePublishedMaterial',
          'operationalStateAction',
          'openFromTeacherLobbyCard',
          'openFromTeacherLobbyDraft',
        ]),
      );
      expect(testTaking?.actions).toEqual(
        expect.arrayContaining([
          'launchReadingV2Runtime',
          'readingV2LaunchBlocked',
          'submitReadingV2Attempt',
        ]),
      );
      expect(results?.actions).toEqual(
        expect.arrayContaining([
          'openReadingV2Review',
          'submitReadingV2Feedback',
          'createReadingV2Regrade',
          'readingV2OperationalError',
        ]),
      );
      expect(antiCheat?.actions).toEqual(
        expect.arrayContaining([
          'initializeProtection',
          'recordViolation',
          'flushIntegrityLogs',
          'persistSessionIntegrity',
          'persistHomeworkIntegrity',
        ]),
      );
    });

    it('tracks guest claim completion under results rather than profile', () => {
      const profile = FEATURE_REGISTRY.find((feature) => feature.id === 'profile');
      const results = FEATURE_REGISTRY.find((feature) => feature.id === 'results');

      expect(profile?.routes).not.toContain('/profile/complete');
      expect(results?.routes).toContain('/profile/complete');
    });

    it('keeps Reading V2 review ownership inside existing result surfaces', () => {
      const readingV2Studio = FEATURE_REGISTRY.find((feature) => feature.id === 'readingV2Studio');

      expect(readingV2Studio?.routes).not.toEqual(
        expect.arrayContaining([
          '/teacher/reading-v2/results/:resultId',
          '/student/reading-v2/results/:resultId',
        ]),
      );
    });
  });
});
