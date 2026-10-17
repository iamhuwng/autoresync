import { describe, expect, it } from 'vitest';
import type { ListeningPublishedVersionRecord } from '../../../../features/assessment/listening/public';
import { adaptListeningVersionToBookActivities } from './listeningActivityAdapter';

const version = (
  overrides: Partial<ListeningPublishedVersionRecord> = {},
): ListeningPublishedVersionRecord => ({
  path: 'listening_authoring/versions',
  versionId: 'version-1',
  draftId: 'draft-1',
  ownerId: 'owner-1',
  testId: 'test-1',
  state: 'published',
  versionNumber: 1,
  sourceDraftPath: 'drafts',
  documentHash: 'hash',
  retainedPins: {},
  publishedAt: 1,
  document: {
    title: 'Listening fixture',
    type: 'IELTS',
    skill: 'Listening',
    duration: 30,
    difficulty: 'Intermediate',
    questionCount: 1,
    isPublic: false,
    isComplete: true,
    displayMode: 'text',
    metadata: {
      description: 'Fixture',
      instructions: 'Listen and answer.',
      tags: [],
    },
    audioSections: [{
      number: 1,
      name: 'Part 1',
      audioUrl: 'https://private.example/signed-audio?secret=do-not-copy',
      assetId: 'audio-asset-1',
      startQuestion: 1,
      endQuestion: 1,
    }],
    questions: [{
      number: 1,
      type: 'multiple-choice-single',
      question: 'What did the speaker choose?',
      options: ['Train', 'Bus'],
      answer: 'Train',
      sectionNumber: 1,
      points: 1,
    }],
    settings: {
      allowPause: false,
      showTimer: true,
      shuffleQuestions: false,
      showResults: 'after-submission',
      allowReview: true,
      passingScore: 1,
      allowReplay: false,
    },
  },
  ...overrides,
});

describe('Listening Book Activity adapter', () => {
  it('converts published authoring data using asset identity without copying answers or URLs', () => {
    const result = adaptListeningVersionToBookActivities({ version: version() });
    expect(result).toMatchObject({
      ok: true,
      projections: [{
        taskProfile: {
          taxonomyId: 'ielts-listening',
          typeId: 'listening-multiple-choice-single',
        },
        interaction: { family: 'choice', variant: 'single-choice' },
        assetRefs: [{ kind: 'audio', assetId: 'audio-asset-1' }],
      }],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('"answer"');
    expect(serialized).not.toContain('private.example');
    expect(serialized).not.toContain('do-not-copy');
    expect(serialized).not.toContain('owner-1');
  });

  it('requires Book-owned source and authorized image identity for source-assisted rows', () => {
    const sourceVersion = version({
      document: {
        ...version().document,
        questions: [{
          ...version().document.questions[0]!,
          type: 'map-plan-labelling',
          imageUrl: 'https://private.example/map',
        }],
      },
    });
    expect(adaptListeningVersionToBookActivities({ version: sourceVersion }))
      .toMatchObject({ ok: false, code: 'missing-source-context' });

    const result = adaptListeningVersionToBookActivities({
      version: sourceVersion,
      contextForQuestion: () => ({
        sourceContext: { available: true, sourcePartLabel: 'Book page 7' },
        authorizedAssetRefs: [{
          kind: 'image',
          assetId: 'book-image-1',
          sourceRef: 'listening-question:1',
        }],
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      projections: [{
        presentationMode: 'source-assisted',
        assetRefs: [
          { kind: 'audio', assetId: 'audio-asset-1' },
          { kind: 'image', assetId: 'book-image-1' },
        ],
      }],
    });
    expect(JSON.stringify(result)).not.toContain('private.example');
  });

  it('fails closed for drafts, unknown types, and legacy URL-only audio', () => {
    expect(adaptListeningVersionToBookActivities({
      version: version({ state: 'archived' }),
    })).toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptListeningVersionToBookActivities({
      version: version({
        document: {
          ...version().document,
          questions: [{ ...version().document.questions[0]!, type: 'mystery' }],
        },
      }),
    })).toMatchObject({ ok: false, code: 'unsupported-profile' });
    expect(adaptListeningVersionToBookActivities({
      version: version({
        document: {
          ...version().document,
          audioSections: [{
            ...version().document.audioSections[0]!,
            assetId: undefined,
          }],
        },
      }),
    })).toMatchObject({ ok: false, code: 'missing-authorized-asset' });
  });

  it('rejects URL-shaped asset identities and source references', () => {
    const sourceVersion = version({
      document: {
        ...version().document,
        questions: [{
          ...version().document.questions[0]!,
          type: 'map-plan-labelling',
        }],
      },
    });
    expect(adaptListeningVersionToBookActivities({
      version: sourceVersion,
      contextForQuestion: () => ({
        sourceContext: { available: true },
        authorizedAssetRefs: [{
          kind: 'image',
          assetId: 'https://private.example/image?token=secret',
          sourceRef: 'listening-question:1',
        }],
      }),
    })).toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptListeningVersionToBookActivities({
      version: sourceVersion,
      contextForQuestion: () => ({
        sourceContext: { available: true },
        authorizedAssetRefs: [{
          kind: 'image',
          assetId: 'book-image-1',
          sourceRef: 'https://private.example/source?token=secret',
        }],
      }),
    })).toMatchObject({ ok: false, code: 'malformed-export' });
  });

  it('requires caller-owned response authority for multiple choice and matching', () => {
    const multipleVersion = version({
      document: {
        ...version().document,
        questions: [{
          ...version().document.questions[0]!,
          type: 'multiple-choice-multiple',
        }],
      },
    });
    expect(adaptListeningVersionToBookActivities({ version: multipleVersion }))
      .toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptListeningVersionToBookActivities({
      version: multipleVersion,
      contextForQuestion: () => ({ requiredSelectionCount: 2 }),
    })).toMatchObject({
      ok: true,
      projections: [{
        answerRule: { requiredSelectionCount: 2 },
      }],
    });

    const matchingVersion = version({
      document: {
        ...version().document,
        questions: [{
          ...version().document.questions[0]!,
          type: 'matching',
        }],
      },
    });
    expect(adaptListeningVersionToBookActivities({ version: matchingVersion }))
      .toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptListeningVersionToBookActivities({
      version: matchingVersion,
      contextForQuestion: () => ({ allowOptionReuse: false }),
    })).toMatchObject({
      ok: true,
      projections: [{
        answerRule: { allowOptionReuse: false },
      }],
    });
  });
});
