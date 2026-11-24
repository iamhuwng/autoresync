import type { AudioResourceRef, AudioScope } from '../types/assessmentAudio.types';

interface TestTypeCapabilities {
  readonly capabilities: {
    readonly audio: {
      readonly enabled: true;
      readonly scopes: readonly [AudioScope, ...AudioScope[]];
      readonly maxAssetsPerScope: number;
    };
  };
}

/** Register each audio-capable assessment family here using its canonical key. */
export const TEST_TYPE_CAPABILITIES = {
  'ielts-listening': {
    capabilities: { audio: { enabled: true, scopes: ['section'], maxAssetsPerScope: 1 } },
  },
  'thcs-thpt': {
    capabilities: { audio: { enabled: true, scopes: ['section'], maxAssetsPerScope: 1 } },
  },
} as const satisfies Readonly<Record<string, TestTypeCapabilities>>;

type TestTypeCapabilityRegistry = typeof TEST_TYPE_CAPABILITIES;
export type AudioTestType = keyof TestTypeCapabilityRegistry;

export type TestAudioResourceRef<TestType extends AudioTestType> = AudioResourceRef<
  TestTypeCapabilityRegistry[TestType]['capabilities']['audio']['scopes'][number]
>;

export function supportsTestAudio(testType: unknown, scope: AudioScope): boolean {
  if (typeof testType !== 'string' || !Object.hasOwn(TEST_TYPE_CAPABILITIES, testType)) return false;
  const { audio } = TEST_TYPE_CAPABILITIES[testType as AudioTestType].capabilities;
  return audio.scopes.some((supportedScope) => supportedScope === scope);
}
