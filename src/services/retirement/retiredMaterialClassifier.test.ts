import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRetiredMaterialInventory } from '../../../scripts/lib/retiredMaterialInventory';
import {
  RETIREMENT_CLASSIFIER_SCHEMA_VERSION,
  classifyRetirementCandidate,
  hasGoogleDriveAudio,
  isQuizMaterial,
  isReadingV1Material,
  isReadingV2Material,
} from './retiredMaterialClassifier';

const legacyReadingV1 = () => ({
  id: 'legacy-reading',
  type: 'IELTS',
  skill: 'Reading',
  passages: [{
    id: 'passage-1',
    title: 'Passage 1',
    content: 'private passage',
    questionStart: 1,
    questionEnd: 3,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'private question',
    answer: 'private answer',
    passageId: 'passage-1',
  }],
  metadata: { instructions: 'private instructions' },
  settings: { allowReview: true, showTimer: true },
});

describe('retired material classifier', () => {
  it('delegates Reading V2 detection to the canonical helper', () => {
    const source = readFileSync(
      resolve('src/services/retirement/retiredMaterialClassifier.ts'),
      'utf8',
    );

    expect(isReadingV2Material({ deliveryEngine: 'reading-v2' })).toBe(true);
    expect(isReadingV2Material({ skill: 'Reading' })).toBe(false);
    expect(source).toContain("from '../../config/readingV2FeatureFlags'");
    expect(source).toContain('return isReadingV2Payload(value);');
    expect(source).not.toMatch(/READING_V2_ENGINE_FIELDS\.some/);
  });

  it('protects Reading V2 before any retired reading evidence is considered', () => {
    const decision = classifyRetirementCandidate({
      ...legacyReadingV1(),
      deliveryEngine: 'reading-v2',
    }, { path: '/tests/reading-v2', root: 'tests' });

    expect(decision.state).toBe('protect-reading-v2');
    expect(decision.plannedDeletionPaths).toEqual([]);
    expect(decision.markerEvidence).toContain('/tests/reading-v2/deliveryEngine=reading-v2');
  });

  it('does not classify Reading labels or missing markers as Reading V1', () => {
    expect(isReadingV1Material(
      { id: 'label-only', type: 'IELTS', skill: 'Reading' },
      { path: '/tests/label-only', root: 'tests' },
    )).toBe(false);
    expect(classifyRetirementCandidate(
      { id: 'content-kind-only', contentKind: 'ielts_reading' },
      { path: '/tests/content-kind-only', root: 'tests' },
    ).state).toBe('unknown-blocked');
    expect(classifyRetirementCandidate(
      { id: 'missing-marker', type: 'IELTS', skill: 'Reading' },
      { path: '/tests/missing-marker', root: 'tests' },
    ).state).toBe('unknown-blocked');
  });

  it('retires only the approved positive legacy Reading V1 producer signature', () => {
    const decision = classifyRetirementCandidate(legacyReadingV1(), {
      path: '/tests/legacy-reading',
      root: 'tests',
    });

    expect(isReadingV1Material(legacyReadingV1(), {
      path: '/tests/legacy-reading',
      root: 'tests',
    })).toBe(true);
    expect(decision.state).toBe('retire-reading-v1');
    expect(decision.reason).toBe('approved-legacy-reading-v1-producer-signature');
    expect(decision.plannedDeletionPaths).toEqual(['/tests/legacy-reading']);
    expect(JSON.stringify(decision)).not.toContain('private answer');

    const nearMatch = legacyReadingV1();
    delete (nearMatch.questions[0] as Record<string, unknown>).passageId;
    expect(classifyRetirementCandidate(nearMatch, {
      path: '/tests/near-match',
      root: 'tests',
    }).state).toBe('unknown-blocked');
  });

  it('protects THCS reading-comprehension and R2 Listening shapes', () => {
    expect(classifyRetirementCandidate(
      { type: 'THCS-THPT', skill: 'Reading', readingComprehension: true },
      { path: '/tests/thcs-reading', root: 'tests' },
    ).state).toBe('protect-thcs');

    expect(classifyRetirementCandidate(
      {
        skill: 'Listening',
        audioSections: [{ r2Key: 'audio/object.mp3', audioUrl: 'https://cdn.test/audio.mp3' }],
      },
      { path: '/tests/r2-listening', root: 'tests' },
    ).state).toBe('protect-r2-listening');
  });

  it('classifies canonical quizzes and explicit quiz references only', () => {
    expect(isQuizMaterial(
      { id: 'quiz-1', title: 'Quiz', questions: [{ id: 'q1' }] },
      { path: '/quizzes/quiz-1', root: 'quizzes' },
    )).toBe(true);
    expect(classifyRetirementCandidate(
      { contentType: 'quiz', quizId: 'quiz-1' },
      { path: '/course_materials/course-1/module-1/material-1', root: 'course_materials' },
    ).state).toBe('retire-quiz');
    expect(isQuizMaterial(
      { title: 'Quiz-shaped but no context', questions: [{ id: 'q1' }] },
      { path: '/tests/not-quiz', root: 'tests' },
    )).toBe(false);
  });

  it('classifies Drive-backed Listening and ignores ordinary Google or HTTPS URLs', () => {
    expect(hasGoogleDriveAudio({
      skill: 'Listening',
      audioSections: [
        { audioUrl: 'https://drive.google.com/file/d/private-id/view' },
        { streamUrl: 'https://drive.usercontent.google.com/download?id=private-id' },
        { originalUrl: 'https://docs.google.com/file/d/private-id/view' },
      ],
    })).toBe(true);
    expect(classifyRetirementCandidate(
      { skill: 'Listening', audioSections: [{ audioUrl: 'https://drive.google.com/file/d/x' }] },
      { path: '/tests/drive-listening', root: 'tests' },
    ).state).toBe('retire-drive-backed-listening');
    expect(hasGoogleDriveAudio({ audioUrl: 'https://fonts.googleapis.com/css2?family=Inter' }))
      .toBe(false);
    expect(hasGoogleDriveAudio({ audioUrl: 'https://generativelanguage.googleapis.com/v1beta' }))
      .toBe(false);
    expect(classifyRetirementCandidate(
      { skill: 'Listening', audioSections: [{ audioUrl: 'https://cdn.example.test/audio.mp3' }] },
      { path: '/tests/ordinary-listening', root: 'tests' },
    ).state).toBe('unknown-blocked');
  });

  it('blocks malformed and unknown records', () => {
    expect(classifyRetirementCandidate('not-object', {
      path: '/tests/bad',
      root: 'tests',
    }).state).toBe('unknown-blocked');
    expect(classifyRetirementCandidate({ title: 'Unknown' }, {
      path: '/materials/unknown',
      root: 'materials',
    }).state).toBe('unknown-blocked');
  });
});

describe('retired material preliminary manifest', () => {
  it('adds classifier/schema version, counts, candidates, protected collisions, scrub paths, and zero R2 deletes', async () => {
    const report = await buildRetiredMaterialInventory({
      read: async (path) => {
        if (path === 'tests') {
          return {
            legacyReading: legacyReadingV1(),
            readingV2Collision: {
              ...legacyReadingV1(),
              deliveryEngine: 'reading-v2',
            },
            driveListening: {
              skill: 'Listening',
              audioSections: [{ audioUrl: 'https://drive.google.com/file/d/private-id/view' }],
            },
            unknown: { skill: 'Reading' },
          };
        }
        if (path === 'quizzes') {
          return {
            quiz1: { id: 'quiz1', title: 'Quiz', questions: [{ id: 'q1' }] },
          };
        }
        if (path === 'test_results') {
          return {
            result1: {
              resultId: 'result1',
              sourceSnapshot: {
                originalUrl: 'https://drive.google.com/file/d/private-id/view',
              },
              questionResults: [{ answer: 'must-not-leak' }],
            },
          };
        }
        if (path === 'game_sessions') {
          return {
            active: { status: 'in-progress', testId: 'legacyReading' },
          };
        }
        return null;
      },
    }, {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.schemaVersion).toBe('retired-material-inventory-phase-2-v1');
    expect(report.classifierSchemaVersion).toBe(RETIREMENT_CLASSIFIER_SCHEMA_VERSION);
    expect(report.classificationStatus).toBe('preliminary-reviewed-manifest-required');
    expect(report.manifest.candidateCountsByReason).toEqual({
      'approved-legacy-reading-v1-producer-signature': 1,
      'canonical-or-explicit-quiz-reference': 1,
      'google-drive-audio-url': 1,
    });
    expect(report.manifest.candidateIdsByState['retire-reading-v1']).toEqual([
      '/tests/legacyReading',
    ]);
    expect(report.manifest.candidateIdsByState['retire-quiz']).toEqual(['/quizzes/quiz1']);
    expect(report.manifest.plannedDeletionPaths).toEqual([
      '/quizzes/quiz1',
      '/tests/driveListening',
      '/tests/legacyReading',
    ]);
    expect(report.manifest.retainedResultScrubPaths).toEqual([
      '/test_results/result1/sourceSnapshot/originalUrl',
    ]);
    expect(report.manifest.driveUrlFieldPaths).toEqual([
      '/test_results/result1/sourceSnapshot/originalUrl',
      '/tests/driveListening/audioSections/0/audioUrl',
    ]);
    expect(report.manifest.unknownBlockedRecords).toEqual(['/tests/unknown']);
    expect(report.manifest.activeSessionCount).toBe(1);
    expect(report.manifest.protectedReadingV2CollisionCount).toBe(1);
    expect(report.manifest.plannedR2DeleteCount).toBe(0);
    expect(report.manifest.markerEvidence).toContain(
      '/tests/readingV2Collision/deliveryEngine=reading-v2',
    );
    expect(JSON.stringify(report)).not.toContain('private-id');
    expect(JSON.stringify(report)).not.toContain('must-not-leak');
  });
});
