import { describe, expect, it } from 'vitest';
import type { ActivityResponseCodec } from './activityResponseCodec.types';
import { createActivityRendererRegistry } from './activityRendererRegistry';
import {
  registerActivityRenderer,
  type ActivityRendererRegistration,
} from './activityRenderer.types';

const codec: ActivityResponseCodec<string> = {
  maxSerializedBytes: 100,
  createEmpty: () => '',
  decode: (input) =>
    typeof input === 'string' && input.length <= 32
      ? { valid: true, value: input, diagnostics: [] }
      : { valid: false, diagnostics: [{ code: 'malformed-response', path: '$', message: 'Expected short text.' }] },
  validate: (response) =>
    response.length <= 32
      ? { valid: true, value: response, diagnostics: [] }
      : { valid: false, diagnostics: [{ code: 'response-too-large', path: '$', message: 'Too long.' }] },
  serialize: (response) => response.trim(),
  equals: (left, right) => left === right,
  toReviewProjection: (response) => ({ text: response }),
};

const renderer = () => null;

const registration = (variant = 'v1'): ActivityRendererRegistration<string> => ({
  family: 'choice',
  variant,
  presentationMode: 'structured',
  responseCodec: 'short-text-v1',
  rendererId: `choice-${variant}`,
  codecId: 'short-text-v1',
  renderer,
  codec,
});

const projection = () => ({
  schemaVersion: 1,
  title: 'Choose one',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
  instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice' as const, variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'interaction-1',
    family: 'choice' as const,
    prompt: 'Choose one.',
    options: [{ itemId: 'a', label: 'A' }, { itemId: 'b', label: 'B' }],
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
});

describe('Book Activity renderer registry', () => {
  it('binds one renderer and canonical codec per deterministic registration key', () => {
    const registry = createActivityRendererRegistry([
      registerActivityRenderer(registration('z')),
      registerActivityRenderer(registration('a')),
      registerActivityRenderer(registration()),
    ]);
    expect(registry.registrations().map((entry) => entry.variant)).toEqual(['a', 'v1', 'z']);
    expect(registry.resolve(projection(), { surface: 'student-runtime', mode: 'editable' }))
      .toMatchObject({ supported: true, registration: { variant: 'v1' } });
    expect(() => createActivityRendererRegistry([
      registerActivityRenderer(registration()),
      registerActivityRenderer(registration()),
    ])).toThrow('Duplicate Activity renderer registration');
  });

  it('treats presentation mode as part of renderer identity', () => {
    const sourceAssisted = registerActivityRenderer({
      ...registration(),
      presentationMode: 'source-assisted',
    });
    const registry = createActivityRendererRegistry([
      registerActivityRenderer(registration()),
      sourceAssisted,
    ]);
    const sourceProjection = projection();
    sourceProjection.presentationMode = 'source-assisted';
    sourceProjection.contextRequirement = { mode: 'required', acceptedKinds: ['book-pages'] };
    sourceProjection.interactions[0]!.sourceAssisted = {
      questionLabel: '1.1',
      accessiblePrompt: 'Choose answer 1.1.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 1',
    };

    expect(registry.resolve(sourceProjection, {
      surface: 'assembly-preview',
      mode: 'editable',
      sourceContext: { available: true, description: 'PDF page 1.' },
    })).toMatchObject({
      supported: true,
      registration: { presentationMode: 'source-assisted', variant: 'v1' },
    });
  });

  it('returns a typed unknown-renderer diagnostic for an unregistered variant', () => {
    const registry = createActivityRendererRegistry([
      registerActivityRenderer(registration()),
    ]);
    const unknownVariant = projection();
    unknownVariant.interaction.variant = 'not-registered';

    expect(registry.resolve(
      unknownVariant,
      { surface: 'student-runtime', mode: 'editable' },
    )).toMatchObject({
      supported: false,
      diagnostic: {
        code: 'unknown-renderer',
        path: '$.interaction',
      },
    });
  });

  it('rejects overlapping Task Profile selectors instead of arbitrarily choosing a renderer', () => {
    const generic = registerActivityRenderer(registration());
    const exact = registerActivityRenderer({
      ...registration(),
      taskProfile: { taxonomyId: 'language-reading', typeId: 'selection', taxonomyVersion: 1 },
    });
    expect(() => createActivityRendererRegistry([generic, exact])).toThrow('Overlapping Activity renderer registration');
  });

  it('rejects manifest identity drift for mode, codec, renderer, and codec identity', () => {
    const registered = registerActivityRenderer(registration());
    expect(() => createActivityRendererRegistry([registered], [{
      family: 'choice', variant: 'v1', profile: null, presentationMode: 'source-assisted',
      responseCodec: 'wrong', rendererId: 'wrong', codecId: 'wrong',
    }])).toThrow('Activity renderer registrations do not match registration manifest');
  });

  it('fails closed for malformed source-assisted metadata, missing source description, duplicate IDs, and UTF-8 byte overflow', () => {
    const registry = createActivityRendererRegistry([registerActivityRenderer(registration())]);
    const sourceAssisted = projection();
    sourceAssisted.presentationMode = 'source-assisted';
    sourceAssisted.contextRequirement = { mode: 'required', acceptedKinds: ['book-pages'] };
    sourceAssisted.interactions[0]!.sourceAssisted = {
      questionLabel: '1.1', accessiblePrompt: 'Choose answer 1.1.', responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 1',
    };
    expect(registry.resolve(sourceAssisted, { surface: 'student-runtime', mode: 'editable', sourceContext: { available: true } }))
      .toMatchObject({ supported: false, diagnostic: { code: 'missing-required-source-context', path: '$.sourceContext.description' } });

    expect(registry.resolve(sourceAssisted, { surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: '   ' } }))
      .toMatchObject({ supported: false, diagnostic: { code: 'missing-required-source-context', path: '$.sourceContext.description' } });

    const missingSourceMetadata = projection();
    missingSourceMetadata.presentationMode = 'source-assisted';
    missingSourceMetadata.contextRequirement = { mode: 'required', acceptedKinds: ['book-pages'] };
    expect(registry.resolve(missingSourceMetadata, { surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: 'PDF page 3.' } }))
      .toMatchObject({ supported: false, diagnostic: { path: '$.interactions[0].sourceAssisted' } });

    const duplicateInteraction = projection();
    duplicateInteraction.interactions.push({ ...duplicateInteraction.interactions[0]! });
    expect(registry.resolve(duplicateInteraction, { surface: 'student-runtime', mode: 'editable' }))
      .toMatchObject({ supported: false, diagnostic: { path: '$.interactions[1].interactionId' } });

    const duplicateOption = projection();
    duplicateOption.interactions[0]!.options.push({ itemId: 'a', label: 'Again' });
    expect(registry.resolve(duplicateOption, { surface: 'student-runtime', mode: 'editable' }))
      .toMatchObject({ supported: false, diagnostic: { path: '$.interactions[0].options[2].itemId' } });

    const byteOverflow = projection();
    byteOverflow.title = '😀'.repeat(25_000);
    expect(registry.resolve(byteOverflow, { surface: 'student-runtime', mode: 'editable' }))
      .toMatchObject({ supported: false, diagnostic: { code: 'malformed-projection', path: '$' } });
  });

  it('does not require optional book-page context for structured projections', () => {
    const registry = createActivityRendererRegistry([registerActivityRenderer(registration())]);
    const optionalContext = {
      ...projection(),
      contextRequirement: { mode: 'optional' as const, acceptedKinds: ['book-pages'] },
    };
    expect(registry.resolve(optionalContext, {
      surface: 'student-runtime',
      mode: 'editable',
    })).toMatchObject({ supported: true });
  });

  it('rejects unsupported schema versions and canonical projection contradictions', () => {
    const registry = createActivityRendererRegistry([registerActivityRenderer(registration())]);
    const context = { surface: 'student-runtime' as const, mode: 'editable' as const };

    expect(registry.resolve({ ...projection(), schemaVersion: 2 }, context))
      .toMatchObject({ supported: false, diagnostic: { code: 'malformed-projection', path: '$' } });
    expect(registry.resolve({
      ...projection(),
      contextRequirement: { mode: 'none', acceptedKinds: ['book-pages'] },
    }, context)).toMatchObject({ supported: false, diagnostic: { path: '$.contextRequirement' } });
    expect(registry.resolve({
      ...projection(),
      answerRule: { defaultPoints: -1, normalization: 'exact' },
    }, context)).toMatchObject({ supported: false, diagnostic: { path: '$.answerRule' } });
    expect(registry.resolve({
      ...projection(),
      interaction: { family: 'long-response', variant: 'v1' },
      interactions: [{ interactionId: 'interaction-1', family: 'long-response', prompt: 'Explain.' }],
      scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
    }, context)).toMatchObject({ supported: false, diagnostic: { path: '$.scoring.mode' } });

    const mixedFamily = projection();
    mixedFamily.interactions[0]!.family = 'text-entry' as 'choice';
    expect(registry.resolve(mixedFamily, context))
      .toMatchObject({ supported: false, diagnostic: { code: 'mixed-interaction-family' } });

    const conflictingFamilyRule = projection();
    conflictingFamilyRule.answerRule = {
      ...conflictingFamilyRule.answerRule,
      allowOptionReuse: true,
    } as typeof conflictingFamilyRule.answerRule;
    expect(registry.resolve(conflictingFamilyRule, context))
      .toMatchObject({ supported: false, diagnostic: { code: 'conflicting-answer-rule' } });

    const impossibleChoice = projection();
    impossibleChoice.answerRule.requiredSelectionCount = 3;
    expect(registry.resolve(impossibleChoice, context))
      .toMatchObject({
        supported: false,
        diagnostic: {
          code: 'conflicting-answer-rule',
          path: '$.answerRule.requiredSelectionCount',
        },
      });

    const contradictorySourceShape = projection();
    contradictorySourceShape.presentationMode = 'source-assisted';
    contradictorySourceShape.contextRequirement = {
      mode: 'required',
      acceptedKinds: ['book-pages'],
    };
    contradictorySourceShape.answerRule.requiredSelectionCount = 2;
    contradictorySourceShape.interactions[0]!.sourceAssisted = {
      questionLabel: '1.1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 1',
    };
    expect(registry.resolve(contradictorySourceShape, {
      ...context,
      sourceContext: { available: true, description: 'Page 3, Exercise 1.' },
    })).toMatchObject({
      supported: false,
      diagnostic: {
        code: 'conflicting-answer-rule',
        path: '$.interactions[0].sourceAssisted.responseShape',
      },
    });
  });

  it('rejects invalid Task Profile selectors and codec serialization bounds', () => {
    expect(() => createActivityRendererRegistry([registerActivityRenderer({
      ...registration(),
      taskProfile: { taxonomyId: 'invalid', typeId: 'selection', taxonomyVersion: 1 },
    })])).toThrow('Invalid Activity renderer registration');
    expect(() => createActivityRendererRegistry([registerActivityRenderer({
      ...registration(),
      taskProfile: {
        taxonomyId: 'language-reading',
        typeId: 'selection',
      } as never,
    })])).toThrow('Invalid Activity renderer registration');

    const bounded = registerActivityRenderer({
      ...registration(),
      codec: { ...codec, maxSerializedBytes: 4, serialize: () => 'long' },
    });
    expect(() => bounded.codec.serialize('value')).toThrow('serialization limit');

    const utf8BoundedCodec: ActivityResponseCodec<string> = {
      ...codec,
      maxSerializedBytes: 5,
      decode: (value) => typeof value === 'string'
        ? { valid: true, value, diagnostics: [] }
        : { valid: false, diagnostics: [{ code: 'malformed-response', path: '$', message: 'Expected text.' }] },
      validate: (value) => ({ valid: true, value, diagnostics: [] }),
      serialize: (value) => value,
    };
    const normalizedRegistry = createActivityRendererRegistry([registerActivityRenderer({
      ...registration(),
      codec: utf8BoundedCodec,
    })]);
    const normalized = normalizedRegistry.registrations()[0]!;
    expect(normalized.codec.decode('\u{1F600}')).toMatchObject({
      valid: false,
      diagnostics: [{ code: 'response-too-large' }],
    });
    expect(() => normalized.codec.serialize('\u{1F600}')).toThrow('serialization limit');

    const invalidEmpty = registerActivityRenderer({
      ...registration(),
      codec: {
        ...utf8BoundedCodec,
        createEmpty: () => '\u{1F600}',
      },
    });
    expect(() => invalidEmpty.codec.createEmpty()).toThrow('invalid empty state');

    const oversizedReview = registerActivityRenderer({
      ...registration(),
      codec: {
        ...codec,
        maxSerializedBytes: 20,
        toReviewProjection: () => ({ text: 'x'.repeat(40) }),
      },
    });
    expect(oversizedReview.codec.toReviewProjection('ok')).toEqual({ text: '' });

    const malformedReview = registerActivityRenderer({
      ...registration(),
      codec: {
        ...codec,
        toReviewProjection: () => ({
          text: 42,
          items: ['safe', 7],
        }) as never,
      },
    });
    expect(malformedReview.codec.toReviewProjection('ok')).toEqual({ text: '' });

    const sparseItems = new Array<string>(2);
    sparseItems[1] = 'visible';
    const sparseReview = registerActivityRenderer({
      ...registration(),
      codec: {
        ...codec,
        toReviewProjection: () => ({ text: 'Review', items: sparseItems }),
      },
    });
    expect(sparseReview.codec.toReviewProjection('ok')).toEqual({ text: '' });
  });

  it('validates decoded response state before invoking a registered renderer', () => {
    const semanticCodec: ActivityResponseCodec<string> = {
      ...codec,
      decode: (input) => typeof input === 'string'
        ? { valid: true, value: input, diagnostics: [] }
        : {
            valid: false,
            diagnostics: [{
              code: 'malformed-response',
              path: '$',
              message: 'Expected text.',
            }],
          },
      validate: (response) => response === 'allowed'
        ? { valid: true, value: response, diagnostics: [] }
        : {
            valid: false,
            diagnostics: [{
              code: 'unsupported-response',
              path: '$',
              message: 'Unsupported response.',
            }],
          },
    };
    const registered = registerActivityRenderer({
      ...registration(),
      codec: semanticCodec,
    });

    expect(registered.renderer({
      interaction: projection().interactions[0]!,
      answerRule: projection().answerRule,
      stimulus: null,
      response: 'decoded-but-invalid',
      validation: { status: 'valid' },
      mode: 'editable',
      onChange: () => undefined,
    })).toBeNull();
  });

  it('keeps codec round trips, malformed rejection, bounds, equality, and review display within codec ownership', () => {
    const registered = registerActivityRenderer(registration());
    expect(registered.codec.createEmpty()).toBe('');
    expect(registered.codec.decode(registered.codec.serialize(' answer '))).toEqual({ valid: true, value: 'answer', diagnostics: [] });
    expect(registered.codec.decode('x'.repeat(33))).toMatchObject({ valid: false, diagnostics: [{ code: 'malformed-response' }] });
    expect(registered.codec.validate('x'.repeat(33))).toMatchObject({ valid: false, diagnostics: [{ code: 'malformed-response' }] });
    expect(registered.codec.equals('same', 'same')).toBe(true);
    expect(registered.codec.toReviewProjection('answer')).toEqual({ text: 'answer' });
  });
});
