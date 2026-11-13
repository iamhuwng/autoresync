import { describe, expect, it } from 'vitest';
import { isQualificationHost, selectFirebaseRuntimeConfig } from './firebaseRuntimeConfig.js';

const production = { projectId: 'temp-a1437', databaseURL: 'https://temp-a1437-default-rtdb.firebaseio.com', apiKey: 'production-key' };
const qualification = { hostingSite: 'kahut1-qualification', projectId: 'qualification-project', databaseURL: 'https://qualification-default-rtdb.firebaseio.com', apiKey: 'qualification-key' };

describe('Firebase runtime configuration binding', () => {
  it('selects production for the live host and qualification only for controlled channels', () => {
    expect(isQualificationHost('kahut1.web.app')).toBe(false);
    expect(isQualificationHost('kahut1-qualification--qualification-release-123-abc.web.app', 'kahut1-qualification')).toBe(true);
    expect(selectFirebaseRuntimeConfig({ hostname: 'kahut1.web.app', production, qualification }).environment).toBe('production');
    expect(selectFirebaseRuntimeConfig({ hostname: 'kahut1-qualification--qualification-release-123-abc.web.app', production, qualification })).toEqual({ environment: 'qualification', config: qualification });
  });

  it('fails closed when a qualification host lacks a complete backend binding', () => {
    expect(() => selectFirebaseRuntimeConfig({ hostname: 'kahut1-qualification--qualification-release-123-abc.web.app', production, qualification: {} })).toThrow(/complete qualification Firebase configuration/u);
  });

  it('recognizes the workflow channel marker without treating the production site as qualification', () => {
    expect(isQualificationHost('kahut1.web.app')).toBe(false);
    expect(isQualificationHost('kahut1--qualification-release-123-abc.web.app')).toBe(true);
    expect(isQualificationHost('kahut1--preview-123-abc.web.app')).toBe(false);
  });
});
