import { describe, expect, it } from 'vitest';
import { READING_V2_STUDIO_OPERATIONAL_STATES, type ReadingV2StudioOperationalStateId } from './ReadingV2StudioOperationalStates';

const REQUIRED_STATES: readonly ReadingV2StudioOperationalStateId[] = [
  'ready',
  'loading',
  'empty',
  'error',
  'retry',
  'conflict',
  'permission-denied',
  'save-success',
  'import-idle',
  'import-analyzing',
  'import-ready',
  'import-failure',
  'validation-failure',
  'publish-success',
  'publish-failure',
];

describe('READING_V2_STUDIO_OPERATIONAL_STATES', () => {
  it('defines every required Studio operational state', () => {
    expect(Object.keys(READING_V2_STUDIO_OPERATIONAL_STATES).sort()).toEqual([...REQUIRED_STATES].sort());
  });

  it('uses existing shell patterns and does not define a detached notification system', () => {
    REQUIRED_STATES.forEach((stateId) => {
      expect(READING_V2_STUDIO_OPERATIONAL_STATES[stateId]).toMatchObject({
        id: stateId,
        usesExistingShellPattern: true,
        createsNewNotificationSystem: false,
      });
    });
  });
});
