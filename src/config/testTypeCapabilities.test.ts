import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  TEST_TYPE_CAPABILITIES,
  supportsTestAudio,
  type TestAudioResourceRef,
} from './testTypeCapabilities';
import type { AudioResourceRef } from '../types/assessmentAudio.types';

describe('test type audio capabilities', () => {
  it.each(['ielts-listening', 'thcs-thpt'] as const)(
    'registers one primary audio asset per section for %s',
    (testType) => {
      expect(TEST_TYPE_CAPABILITIES[testType].capabilities.audio).toEqual({
        enabled: true,
        scopes: ['section'],
        maxAssetsPerScope: 1,
      });
      expect(supportsTestAudio(testType, 'section')).toBe(true);
      expect(supportsTestAudio(testType, 'question')).toBe(false);
    },
  );

  it('uses the same section reference for IELTS Listening and THCS', () => {
    expectTypeOf<TestAudioResourceRef<'ielts-listening'>>().toEqualTypeOf<AudioResourceRef<'section'>>();
    expectTypeOf<TestAudioResourceRef<'thcs-thpt'>>().toEqualTypeOf<AudioResourceRef<'section'>>();
  });

  it.each(['ielts-reading', 'IELTS', 'THCS-THPT', 'toString', '__proto__', undefined])(
    'requires an explicit registration for %s',
    (testType) => {
      expect(supportsTestAudio(testType, 'section')).toBe(false);
      expect(supportsTestAudio(testType, 'question')).toBe(false);
    },
  );
});
