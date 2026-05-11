import type {
  ReadingV2CanonicalTaskType,
  ReadingV2EngineeringFamily,
} from '../../../types/readingV2Taxonomy';

export interface ReadingV2FixtureManifestEntry {
  canonicalSlug: ReadingV2CanonicalTaskType;
  family: ReadingV2EngineeringFamily;
  canonicalFixtureId: string;
  projectionFixtureId: string;
}

export const READING_V2_PROJECTION_FIXTURE_STRATEGY = {
  preview: 'preview',
  studentSafe: 'student-safe',
  sessionSafe: 'session-safe',
  review: 'review',
  analytics: 'analytics',
} as const;

export const READING_V2_FIXTURE_MANIFEST = {
  'sentence-completion': {
    canonicalSlug: 'sentence-completion',
    family: 'completion',
    canonicalFixtureId: 'canonical-sentence-completion',
    projectionFixtureId: 'projection-sentence-completion',
  },
  'summary-completion-text': {
    canonicalSlug: 'summary-completion-text',
    family: 'completion',
    canonicalFixtureId: 'canonical-summary-completion-text',
    projectionFixtureId: 'projection-summary-completion-text',
  },
  'summary-completion-list': {
    canonicalSlug: 'summary-completion-list',
    family: 'choice',
    canonicalFixtureId: 'canonical-summary-completion-list',
    projectionFixtureId: 'projection-summary-completion-list',
  },
  'note-completion': {
    canonicalSlug: 'note-completion',
    family: 'completion',
    canonicalFixtureId: 'canonical-note-completion',
    projectionFixtureId: 'projection-note-completion',
  },
  'table-completion': {
    canonicalSlug: 'table-completion',
    family: 'structured-layout',
    canonicalFixtureId: 'canonical-table-completion',
    projectionFixtureId: 'projection-table-completion',
  },
  'flowchart-completion': {
    canonicalSlug: 'flowchart-completion',
    family: 'structured-layout',
    canonicalFixtureId: 'canonical-flowchart-completion',
    projectionFixtureId: 'projection-flowchart-completion',
  },
  'diagram-labeling': {
    canonicalSlug: 'diagram-labeling',
    family: 'structured-layout',
    canonicalFixtureId: 'canonical-diagram-labeling',
    projectionFixtureId: 'projection-diagram-labeling',
  },
  'true-false-not-given': {
    canonicalSlug: 'true-false-not-given',
    family: 'binary-judgement',
    canonicalFixtureId: 'canonical-true-false-not-given',
    projectionFixtureId: 'projection-true-false-not-given',
  },
  'yes-no-not-given': {
    canonicalSlug: 'yes-no-not-given',
    family: 'binary-judgement',
    canonicalFixtureId: 'canonical-yes-no-not-given',
    projectionFixtureId: 'projection-yes-no-not-given',
  },
  'matching-headings': {
    canonicalSlug: 'matching-headings',
    family: 'matching',
    canonicalFixtureId: 'canonical-matching-headings',
    projectionFixtureId: 'projection-matching-headings',
  },
  'matching-information': {
    canonicalSlug: 'matching-information',
    family: 'matching',
    canonicalFixtureId: 'canonical-matching-information',
    projectionFixtureId: 'projection-matching-information',
  },
  'matching-features': {
    canonicalSlug: 'matching-features',
    family: 'matching',
    canonicalFixtureId: 'canonical-matching-features',
    projectionFixtureId: 'projection-matching-features',
  },
  'matching-sentence-endings': {
    canonicalSlug: 'matching-sentence-endings',
    family: 'matching',
    canonicalFixtureId: 'canonical-matching-sentence-endings',
    projectionFixtureId: 'projection-matching-sentence-endings',
  },
  'multiple-choice': {
    canonicalSlug: 'multiple-choice',
    family: 'choice',
    canonicalFixtureId: 'canonical-multiple-choice',
    projectionFixtureId: 'projection-multiple-choice',
  },
  'multiple-select': {
    canonicalSlug: 'multiple-select',
    family: 'choice',
    canonicalFixtureId: 'canonical-multiple-select',
    projectionFixtureId: 'projection-multiple-select',
  },
  'short-answer': {
    canonicalSlug: 'short-answer',
    family: 'completion',
    canonicalFixtureId: 'canonical-short-answer',
    projectionFixtureId: 'projection-short-answer',
  },
} as const satisfies Record<ReadingV2CanonicalTaskType, ReadingV2FixtureManifestEntry>;

export const assertReadingV2FixtureManifestCoverage = (): ReadingV2EngineeringFamily[] => {
  const families = new Set<ReadingV2EngineeringFamily>();

  Object.values(READING_V2_FIXTURE_MANIFEST).forEach((entry) => {
    families.add(entry.family);
  });

  const missingFamilies = (
    ['completion', 'choice', 'binary-judgement', 'matching', 'structured-layout'] as const
  ).filter((family) => !families.has(family));

  if (missingFamilies.length > 0) {
    throw new Error(
      `Reading V2 fixture manifest is missing family coverage for: ${missingFamilies.join(', ')}`,
    );
  }

  return Array.from(families);
};

export const READING_V2_FIXTURE_FAMILY_COVERAGE = assertReadingV2FixtureManifestCoverage();
