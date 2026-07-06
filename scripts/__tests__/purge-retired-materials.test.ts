import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRetiredMaterialInventoryArgs } from '../inspect-retired-materials';
import {
  RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION,
  assertRetiredMaterialPurgeReadback,
  buildRetiredMaterialPurgePlan,
  executeRetiredMaterialPurgePlan,
  normalizeInventoryManifestSnapshot,
  normalizeReviewedPurgeManifest,
  parseRetiredMaterialPurgeArgs,
  parseReviewedPurgeManifestJson,
  readReviewedPurgeManifest,
  type RetiredMaterialPurgeDatabase,
  type RetiredMaterialPurgeManifestSnapshot,
} from '../purge-retired-materials';

const baseGeneratedAt = '2026-07-05T00:00:00.000Z';
const baseReviewedAt = '2026-07-05T00:05:00.000Z';
const baseNow = new Date('2026-07-05T00:10:00.000Z');

const emptyCandidateIdsByState = () => ({
  'retire-reading-v1': [],
  'retire-quiz': [],
  'retire-drive-backed-listening': [],
  'protect-reading-v2': [],
  'protect-thcs': [],
  'protect-r2-listening': [],
  'protect-supported-listening': [],
  'protect-non-candidate': [],
  'unknown-blocked': [],
});

const baseSnapshot = (
  overrides: Partial<RetiredMaterialPurgeManifestSnapshot> = {},
): RetiredMaterialPurgeManifestSnapshot => ({
  projectId: 'temp-a1437',
  generatedAt: baseGeneratedAt,
  sourceRevision: 'revision-1',
  classifierSchemaVersion: 'retired-material-classifier-phase-2-v2',
  candidateCountsByReason: {
    'canonical-or-explicit-quiz-reference': 1,
  },
  candidateIdsByState: {
    ...emptyCandidateIdsByState(),
    'retire-quiz': ['/quizzes/quiz-1'],
  },
  markerEvidence: [],
  plannedDeletionPaths: ['/quizzes/quiz-1'],
  retainedResultScrubPaths: [],
  driveUrlFieldPaths: [],
  unknownBlockedRecords: [],
  activeSessionCount: 0,
  protectedReadingV2CollisionCount: 0,
  plannedR2DeleteCount: 0,
  ...overrides,
});

const reviewedManifest = (
  overrides: Partial<ReturnType<typeof normalizeReviewedPurgeManifest>> = {},
) => normalizeReviewedPurgeManifest({
  schemaVersion: RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION,
  reviewStatus: 'approved-for-purge',
  reviewedAt: baseReviewedAt,
  reviewedBy: 'retirement-reviewer',
  ...baseSnapshot(),
  ...overrides,
});

const buildPlan = (
  manifestOverrides: Partial<ReturnType<typeof normalizeReviewedPurgeManifest>> = {},
  currentOverrides: Partial<RetiredMaterialPurgeManifestSnapshot> = {},
) => {
  const manifest = reviewedManifest(manifestOverrides);
  const current = normalizeInventoryManifestSnapshot(baseSnapshot(currentOverrides));
  return buildRetiredMaterialPurgePlan(manifest, current, { now: baseNow });
};

describe('retired material purge CLI parser', () => {
  it('requires project, reviewed manifest, and explicit apply', () => {
    expect(parseRetiredMaterialPurgeArgs([
      '--project',
      'temp-a1437',
      '--manifest',
      'reviewed.json',
      '--apply',
    ])).toEqual({
      projectId: 'temp-a1437',
      manifestPath: 'reviewed.json',
      apply: true,
      help: false,
    });

    expect(() => parseRetiredMaterialPurgeArgs([
      '--project',
      'temp-a1437',
      '--apply',
    ])).toThrow(/--manifest is required/i);
    expect(() => parseRetiredMaterialPurgeArgs([
      '--manifest',
      'reviewed.json',
      '--apply',
    ])).toThrow(/--project is required/i);
    expect(() => parseRetiredMaterialPurgeArgs([
      '--project',
      'temp-a1437',
      '--manifest',
      'reviewed.json',
    ])).toThrow(/--apply is required/i);
  });
});

describe('inspection and purge tooling boundary', () => {
  it('keeps inspection read-only and rejects inspection apply', () => {
    expect(() => parseRetiredMaterialInventoryArgs([
      '--project',
      'temp-a1437',
      '--out',
      'inventory.json',
      '--apply',
    ])).toThrow(/does not accept --apply/i);

    const inspectionSource = readFileSync(
      resolve('scripts/inspect-retired-materials.ts'),
      'utf8',
    );
    const inventorySource = readFileSync(
      resolve('scripts/lib/retiredMaterialInventory.ts'),
      'utf8',
    );
    const combined = `${inspectionSource}\n${inventorySource}`;
    expect(combined).not.toMatch(/database:(?:set|update|remove|delete|push)/i);
    expect(combined).not.toMatch(/from ['"]firebase\/database['"]/);
    expect(combined).not.toMatch(/\b(?:set|update|remove|push)\s*\(\s*ref\s*\(/);
  });

  it('uses the same inventory module from inspection and purge', () => {
    const inspectionSource = readFileSync(
      resolve('scripts/inspect-retired-materials.ts'),
      'utf8',
    );
    const purgeSource = readFileSync(
      resolve('scripts/purge-retired-materials.ts'),
      'utf8',
    );

    expect(inspectionSource).toMatch(/from ['"]\.\/lib\/retiredMaterialInventory['"]/);
    expect(purgeSource).toMatch(/from ['"]\.\/lib\/retiredMaterialInventory['"]/);
    expect(purgeSource).toMatch(/buildRetiredMaterialInventory/);
  });
});

describe('reviewed purge manifest validation', () => {
  it('rejects missing, malformed, wrong-project, and stale manifests', async () => {
    await expect(readReviewedPurgeManifest('__missing-retired-material-manifest__.json'))
      .rejects.toThrow(/Missing purge manifest/i);
    expect(() => parseReviewedPurgeManifestJson('{')).toThrow(/Malformed JSON/i);
    expect(() => normalizeReviewedPurgeManifest({})).toThrow(/schemaVersion/i);
    expect(() => normalizeReviewedPurgeManifest({
      schemaVersion: RETIRED_MATERIAL_PURGE_MANIFEST_SCHEMA_VERSION,
      reviewStatus: 'draft',
      reviewedAt: baseReviewedAt,
      reviewedBy: 'reviewer',
      ...baseSnapshot(),
    })).toThrow(/reviewStatus/i);

    expect(() => buildRetiredMaterialPurgePlan(
      reviewedManifest({ projectId: 'wrong-project' }),
      baseSnapshot(),
      { now: baseNow },
    )).toThrow(/project must be temp-a1437/i);

    expect(() => buildRetiredMaterialPurgePlan(
      reviewedManifest({ generatedAt: '2026-07-03T00:00:00.000Z' }),
      baseSnapshot({ generatedAt: '2026-07-05T00:00:00.000Z' }),
      { now: baseNow },
    )).toThrow(/stale/i);
  });

  it('aborts when recomputed candidates differ from the reviewed manifest', () => {
    expect(() => buildRetiredMaterialPurgePlan(
      reviewedManifest(),
      baseSnapshot({
        candidateIdsByState: {
          ...emptyCandidateIdsByState(),
          'retire-quiz': ['/quizzes/quiz-2'],
        },
        plannedDeletionPaths: ['/quizzes/quiz-2'],
      }),
      { now: baseNow },
    )).toThrow(/differs from recomputed current inventory/i);
  });
});

describe('purge hard-fail safety boundaries', () => {
  it('rejects active sessions, unknown shapes, Reading V2 collisions, completed result deletes, and R2 deletes', () => {
    expect(() => buildPlan({ activeSessionCount: 1 }, { activeSessionCount: 1 }))
      .toThrow(/active sessions/i);
    expect(() => buildPlan(
      { unknownBlockedRecords: ['/tests/malformed'] },
      { unknownBlockedRecords: ['/tests/malformed'] },
    )).toThrow(/unknown or malformed/i);
    expect(() => buildPlan(
      { protectedReadingV2CollisionCount: 1 },
      { protectedReadingV2CollisionCount: 1 },
    )).toThrow(/Reading V2/i);
    expect(() => buildPlan(
      { plannedDeletionPaths: ['/test_results/result-1'] },
      { plannedDeletionPaths: ['/test_results/result-1'] },
    )).toThrow(/protected root/i);
    expect(() => buildPlan(
      { plannedR2DeleteCount: 1 },
      { plannedR2DeleteCount: 1 },
    )).toThrow(/R2 delete/i);
  });

  it('rejects Reading V2 roots, parent classes/courses/modules, closed session records, result indexes, and R2 asset registry paths', () => {
    const unsafePaths = [
      '/reading_v2/material-1',
      '/classes/class-1',
      '/courses/course-1',
      '/modules/module-1',
      '/game_sessions/session-1',
      '/test_results_by_student/student-1/result-1',
      '/media_assets/asset-1',
    ];

    unsafePaths.forEach((path) => {
      expect(() => buildPlan(
        { plannedDeletionPaths: [path] },
        { plannedDeletionPaths: [path] },
      )).toThrow(/protected root|root is not purge-allowlisted/i);
    });
  });
});

describe('retired material purge plan', () => {
  it('builds bounded idempotent Firebase updates from manifest-reviewed deletes and retained result scrubs', () => {
    const candidateIdsByState = {
      ...emptyCandidateIdsByState(),
      'retire-quiz': ['/quizzes/quiz-1'],
      'retire-reading-v1': ['/tests/reading-v1'],
      'retire-drive-backed-listening': ['/drafts/listening-drive'],
    };
    const manifestOverrides = {
      candidateIdsByState,
      plannedDeletionPaths: [
        '/quizzes/quiz-1',
        '/tests/reading-v1',
        '/drafts/listening-drive',
        '/session_test_payloads/payload-1',
      ],
      retainedResultScrubPaths: [
        '/test_results/result-1/sourceSnapshot/originalUrl',
        '/test_results/result-1/listeningAudio/audioUrl',
      ],
      driveUrlFieldPaths: [
        '/test_results/result-1/sourceSnapshot/originalUrl',
        '/test_results/result-1/listeningAudio/audioUrl',
      ],
    };

    const plan = buildPlan(manifestOverrides, manifestOverrides);

    expect(plan.updateCount).toBe(7);
    expect(plan.updateCount).toBeLessThanOrEqual(500);
    expect(plan.deletionPaths).toEqual([
      '/drafts/listening-drive',
      '/quizzes/quiz-1',
      '/session_test_payloads/payload-1',
      '/tests/reading-v1',
    ]);
    expect(plan.retainedResultRoots).toEqual(['/test_results/result-1']);
    expect(plan.readBeforeMutationPaths).toEqual([
      '/drafts/listening-drive',
      '/quizzes/quiz-1',
      '/session_test_payloads/payload-1',
      '/test_results/result-1',
      '/tests/reading-v1',
    ]);
    expect(plan.firebaseUpdates).toEqual({
      'drafts/listening-drive': null,
      'quizzes/quiz-1': null,
      'session_test_payloads/payload-1': null,
      'test_results/result-1/listeningAudio/audioUrl': null,
      'test_results/result-1/sourceMaterialRemoved': true,
      'test_results/result-1/sourceSnapshot/originalUrl': null,
      'tests/reading-v1': null,
    });
    expect(Object.values(plan.firebaseUpdates).every((value) =>
      value === null || value === true)).toBe(true);
    expect(plan.readbackExpectations).toContain('R2 delete count zero');
  });

  it('re-reads all candidates immediately before mutation and aborts on late Reading V2 marker drift', async () => {
    const plan = buildPlan();
    const reads: string[] = [];
    const updates: Array<{ path: string; values: Record<string, unknown> }> = [];
    const database: RetiredMaterialPurgeDatabase = {
      read: async (path) => {
        reads.push(path);
        return {
          id: 'quiz-1',
          title: 'Retired quiz',
          questions: [{ id: 'q1' }],
        };
      },
      update: async (path, values) => {
        updates.push({ path, values });
      },
    };

    await executeRetiredMaterialPurgePlan(database, plan);

    expect(reads).toEqual(['quizzes/quiz-1']);
    expect(updates).toEqual([{
      path: '/',
      values: { 'quizzes/quiz-1': null },
    }]);

    const driftedDatabase: RetiredMaterialPurgeDatabase = {
      read: async () => ({
        id: 'quiz-1',
        title: 'Reading V2 collision',
        questions: [{ id: 'q1' }],
        deliveryEngine: 'reading-v2',
      }),
      update: async () => {
        throw new Error('must not update');
      },
    };

    await expect(executeRetiredMaterialPurgePlan(driftedDatabase, plan))
      .rejects.toThrow(/Reading V2 marker/i);
  });

  it('fails apply readback when retired candidates, result-count changes, result Drive URLs, Reading V2 count drift, or R2 deletes remain', () => {
    type InventoryReadbackReport = Parameters<typeof assertRetiredMaterialPurgeReadback>[0];
    const before = {
      readFailures: [],
      manifest: {
        candidateIdsByState: {
          ...emptyCandidateIdsByState(),
        },
        plannedDeletionPaths: [],
        activeSessionCount: 0,
        plannedR2DeleteCount: 0,
      },
      driveUrlFieldPaths: [],
      results: {
        records: 2,
        indexes: { '/test_results_by_student': 2 },
      },
      routingMetadata: {
        explicitReadingV2PayloadCount: 3,
        readingV2MarkerOccurrences: [{ field: 'deliveryEngine', count: 3 }],
      },
    } as unknown as InventoryReadbackReport;

    expect(() => assertRetiredMaterialPurgeReadback(before, {
      ...before,
      manifest: {
        ...before.manifest,
        candidateIdsByState: {
          ...emptyCandidateIdsByState(),
          'retire-quiz': ['/quizzes/quiz-1'],
        },
        plannedDeletionPaths: ['/quizzes/quiz-1'],
      },
    } as unknown as InventoryReadbackReport)).toThrow(/retired material/i);

    expect(() => assertRetiredMaterialPurgeReadback(before, {
      ...before,
      results: {
        records: 1,
        indexes: { '/test_results_by_student': 2 },
      },
    } as unknown as InventoryReadbackReport)).toThrow(/retained result record count/i);

    expect(() => assertRetiredMaterialPurgeReadback(before, {
      ...before,
      driveUrlFieldPaths: ['/test_results/result-1/sourceSnapshot/originalUrl'],
    } as unknown as InventoryReadbackReport)).toThrow(/Drive URLs/i);

    expect(() => assertRetiredMaterialPurgeReadback(before, {
      ...before,
      routingMetadata: {
        explicitReadingV2PayloadCount: 2,
        readingV2MarkerOccurrences: [{ field: 'deliveryEngine', count: 2 }],
      },
    } as unknown as InventoryReadbackReport)).toThrow(/Reading V2 count/i);

    expect(() => assertRetiredMaterialPurgeReadback(before, {
      ...before,
      manifest: {
        ...before.manifest,
        plannedR2DeleteCount: 1,
      },
    } as unknown as InventoryReadbackReport)).toThrow(/R2 delete count/i);
  });
});
