import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifestSource from '../../src/services/book-activity/runtime/activityRendererManifest.json?raw';
import releaseCandidateConfigSource from '../wrangler.book-source.jsonc?raw';

const expectedRegistryVersion = 'activity-renderer-manifest-v1@sha256:7be1fce11aa2a739ec10ddab540b6af682db6e8ea9659916b1c9eb878ef690b5';

const stripJsoncLineComments = (source: string): string => {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      output += source[index] ?? '';
      continue;
    }
    output += character;
  }
  return output;
};

describe('prd0062 canonical Book Worker registry config', () => {
  it('binds the release-candidate Worker to the raw canonical renderer manifest digest', () => {
    const releaseCandidateConfig = JSON.parse(stripJsoncLineComments(releaseCandidateConfigSource)) as {
      vars: Record<string, unknown>;
    };
    const manifestDigest = createHash('sha256').update(manifestSource, 'utf8').digest('hex');

    expect(manifestDigest).toBe('7be1fce11aa2a739ec10ddab540b6af682db6e8ea9659916b1c9eb878ef690b5');
    expect(releaseCandidateConfig.vars.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION)
      .toBe(`activity-renderer-manifest-v1@sha256:${manifestDigest}`);
    expect(releaseCandidateConfig.vars.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION).toBe(expectedRegistryVersion);
  });
});
