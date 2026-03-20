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

    it('maps wildcard admin routes to adminPanel', () => {
      expect(resolveFeatureFromRoute('/admin/dashboard')).toBe('adminPanel');
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
      const results = FEATURE_REGISTRY.find((feature) => feature.id === 'results');
      const antiCheat = FEATURE_REGISTRY.find((feature) => feature.id === 'antiCheat');

      expect(homework?.actions).toContain('viewIntegrityDetails');
      expect(results?.actions).toContain('viewIntegrityDetails');
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
  });
});
