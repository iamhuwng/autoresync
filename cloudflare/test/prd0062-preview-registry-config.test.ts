import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifestSource from '../../src/services/book-activity/runtime/activityRendererManifest.json?raw';
import releaseCandidateConfigSource from '../wrangler.book-source.jsonc?raw';

const expectedRegistryVersion = 'activity-renderer-manifest-v1@sha256:8024a3676ee93496c00ca1f958385e86a4ab78560153e856c18eb219ef34323f';

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

    expect(manifestDigest).toBe('8024a3676ee93496c00ca1f958385e86a4ab78560153e856c18eb219ef34323f');
    expect(releaseCandidateConfig.vars.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION)
      .toBe(`activity-renderer-manifest-v1@sha256:${manifestDigest}`);
    expect(releaseCandidateConfig.vars.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION).toBe(expectedRegistryVersion);
  });

  it('binds the existing runtime identity and enables the shared homework completion projection', () => {
    const config = JSON.parse(stripJsoncLineComments(releaseCandidateConfigSource)) as {
      vars: Record<string, unknown>;
      secrets: { required: string[] };
    };
    expect(config.vars.BOOK_RUNTIME_SERVICE_IDENTITY).toBe('book-runtime-runtime@temp-a1437.iam.gserviceaccount.com');
    expect(config.vars.BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED).toBe('enabled');
    expect(config.vars.BOOK_DELIVERY_READ_ROUTES_ENABLED).toBe('enabled');
    expect(config.secrets.required).toContain('BOOK_RUNTIME_GOOGLE_SA_KEY');
  });
});
