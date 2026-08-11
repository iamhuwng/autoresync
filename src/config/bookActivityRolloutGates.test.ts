import { describe, expect, it } from 'vitest';
import {
  BOOK_ACTIVITY_ROLLOUT_GATE_ENV,
  BOOK_ACTIVITY_ROLLOUT_GATE_MODES,
  BOOK_ACTIVITY_ROLLOUT_GATE_MODES_BY_SURFACE,
  BOOK_ACTIVITY_ROLLOUT_GATES,
  getBookActivityRolloutGateModes,
  isBookActivityRolloutGateEnabled,
  normalizeBookActivityRolloutGateMode,
} from './bookActivityRolloutGates';

describe('bookActivityRolloutGates', () => {
  it('exposes six presentation actions and denies all by default', () => {
    expect(BOOK_ACTIVITY_ROLLOUT_GATES).toEqual({
      create: 'create',
      upload: 'upload',
      publish: 'publish',
      assignPlace: 'assign-place',
      launchDelivery: 'launch-delivery',
      mutation: 'mutation',
    });
    expect(Object.values(BOOK_ACTIVITY_ROLLOUT_GATES)).toHaveLength(6);
    expect(BOOK_ACTIVITY_ROLLOUT_GATE_MODES_BY_SURFACE).toEqual({
      create: 'disabled',
      upload: 'disabled',
      publish: 'disabled',
      'assign-place': 'disabled',
      'launch-delivery': 'disabled',
      mutation: 'disabled',
    });
    Object.values(BOOK_ACTIVITY_ROLLOUT_GATES).forEach((gate) => {
      expect(isBookActivityRolloutGateEnabled(gate)).toBe(false);
      expect(BOOK_ACTIVITY_ROLLOUT_GATE_ENV[gate]).toContain('_PRESENTATION');
    });
  });

  it('accepts only explicit enabled values and fails closed for malformed input', () => {
    expect(BOOK_ACTIVITY_ROLLOUT_GATE_MODES).toEqual({ disabled: 'disabled', enabled: 'enabled' });
    expect(normalizeBookActivityRolloutGateMode(' enabled ')).toBe('enabled');
    expect(normalizeBookActivityRolloutGateMode('true')).toBe('disabled');
    expect(normalizeBookActivityRolloutGateMode('public')).toBe('disabled');
    expect(normalizeBookActivityRolloutGateMode(undefined)).toBe('disabled');
  });

  it('keeps each presentation action independent', () => {
    const modes = getBookActivityRolloutGateModes({
      [BOOK_ACTIVITY_ROLLOUT_GATE_ENV[BOOK_ACTIVITY_ROLLOUT_GATES.create]]: 'enabled',
      [BOOK_ACTIVITY_ROLLOUT_GATE_ENV[BOOK_ACTIVITY_ROLLOUT_GATES.publish]]: 'unexpected',
    });
    expect(modes).toEqual({
      create: 'enabled',
      upload: 'disabled',
      publish: 'disabled',
      'assign-place': 'disabled',
      'launch-delivery': 'disabled',
      mutation: 'disabled',
    });
    expect(isBookActivityRolloutGateEnabled(BOOK_ACTIVITY_ROLLOUT_GATES.create, modes)).toBe(true);
    expect(isBookActivityRolloutGateEnabled(BOOK_ACTIVITY_ROLLOUT_GATES.publish, modes)).toBe(false);
  });
});
