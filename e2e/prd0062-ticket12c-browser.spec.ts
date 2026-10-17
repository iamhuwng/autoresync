import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const ARTIFACT_DIR = 'artifacts/prd0062-ticket-12c/browser';
const CANDIDATE_ID = 'candidate-browser-proof';
const TARGET_ACTIVITY_ID = 'activity-browser-proof';

const activity = {
  schemaVersion: 1,
  title: 'Browser proof candidate',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: {
    defaultPoints: 1,
    normalization: 'exact',
    requiredSelectionCount: 1,
  },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    prompt: 'Pick one',
    options: ['A', 'B'],
    acceptedOptionIndexes: [0],
  }],
  scoring: { mode: 'auto-where-possible' },
};

interface FixtureCandidate {
  candidateId: string;
  targetActivityId: string;
  ownerId: string;
  targetRevision: number;
  revision: number;
  lifecycle: 'staged' | 'validated' | 'discarded';
  content: unknown;
  validation: { valid: true; errors: [] };
  diff: {
    classification: 'added';
    reasons: ['activity-added'];
    requiresRedo: false;
  };
  evidenceRefs: string[];
  sourceEvidenceRefs: string[];
  answerEvidenceRefs: string[];
  updatedAt: number;
}

test('ticket 12C stages, reloads, recovers a conflict, and discards without publication', async ({
  page,
}) => {
  let candidate: FixtureCandidate | null = null;
  const publishedState = {
    [TARGET_ACTIVITY_ID]: {
      revision: 7,
      lifecycle: 'published',
      versionId: 'activity-version-7',
    },
  };
  const publishedBefore = structuredClone(publishedState);

  await page.exposeFunction(
    '__prd0062ActivityAuthoringFixture',
    async (path: string, input?: Record<string, unknown>) => {
      if (path === `/book-activity-authoring/candidates/${CANDIDATE_ID}`) {
        if (!candidate) throw new Error('candidate_not_found');
        return { status: 'loaded', candidate: structuredClone(candidate) };
      }

      if (path === '/book-activity-authoring/stage') {
        if (candidate || input?.expectedRevision !== 0) {
          throw new Error('revision_conflict');
        }
        candidate = {
          candidateId: CANDIDATE_ID,
          targetActivityId: TARGET_ACTIVITY_ID,
          ownerId: 'teacher-browser-proof',
          targetRevision: 7,
          revision: 1,
          lifecycle: 'staged',
          content: structuredClone(input.content),
          validation: { valid: true, errors: [] },
          diff: {
            classification: 'added',
            reasons: ['activity-added'],
            requiresRedo: false,
          },
          evidenceRefs: [...(input.evidenceRefs as string[] ?? [])],
          sourceEvidenceRefs: [...(input.sourceEvidenceRefs as string[] ?? [])],
          answerEvidenceRefs: [...(input.answerEvidenceRefs as string[] ?? [])],
          updatedAt: 1,
        };
        return {
          status: 'staged',
          candidateId: candidate.candidateId,
          targetActivityId: candidate.targetActivityId,
          revision: candidate.revision,
          lifecycle: candidate.lifecycle,
          validation: candidate.validation,
          diff: candidate.diff,
          evidenceRefs: candidate.evidenceRefs,
          sourceEvidenceRefs: candidate.sourceEvidenceRefs,
          answerEvidenceRefs: candidate.answerEvidenceRefs,
        };
      }

      if (!candidate || input?.candidateId !== candidate.candidateId) {
        throw new Error('candidate_not_found');
      }
      if (input.expectedRevision !== candidate.revision) {
        throw new Error('revision_conflict');
      }

      if (path === '/book-activity-authoring/validate') {
        candidate = {
          ...candidate,
          revision: candidate.revision + 1,
          lifecycle: 'validated',
          updatedAt: candidate.updatedAt + 1,
        };
        return {
          status: 'validated',
          candidateId: candidate.candidateId,
          revision: candidate.revision,
          lifecycle: candidate.lifecycle,
          validation: candidate.validation,
          diff: candidate.diff,
          evidenceRefs: candidate.evidenceRefs,
          sourceEvidenceRefs: candidate.sourceEvidenceRefs,
          answerEvidenceRefs: candidate.answerEvidenceRefs,
        };
      }

      if (path === '/book-activity-authoring/discard') {
        candidate = {
          ...candidate,
          revision: candidate.revision + 1,
          lifecycle: 'discarded',
          content: null,
          updatedAt: candidate.updatedAt + 1,
        };
        return {
          status: 'discarded',
          candidateId: candidate.candidateId,
          revision: candidate.revision,
          lifecycle: candidate.lifecycle,
        };
      }

      throw new Error(`unsupported_fixture_path:${path}`);
    },
  );

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.getByRole('button', { name: 'Teacher', exact: true }).click();
  await expect(page).toHaveURL(/\/lobby$/u, { timeout: 30_000 });

  const staged = await page.evaluate(async (candidateActivity) => {
    const serviceModulePath =
      '/src/services/book-activity/activityAuthoring.service.ts';
    const repositoryModulePath =
      '/src/services/book-activity/activityAuthoring.repository.ts';
    const { createActivityAuthoringService } =
      await import(/* @vite-ignore */ serviceModulePath);
    const { createActivityAuthoringRepository } =
      await import(/* @vite-ignore */ repositoryModulePath);
    const fixture = (
      window as typeof window & {
        __prd0062ActivityAuthoringFixture: (
          path: string,
          input?: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).__prd0062ActivityAuthoringFixture;
    const repository = createActivityAuthoringRepository({
      mutate: fixture,
      read: fixture,
    });
    return createActivityAuthoringService(repository).stage({
      targetActivityId: 'activity-browser-proof',
      expectedRevision: 0,
      content: candidateActivity,
      evidenceRefs: ['browser:ticket-12c'],
      sourceEvidenceRefs: ['source:browser-proof'],
      answerEvidenceRefs: ['answer:browser-proof'],
    });
  }, activity);
  expect(staged).toMatchObject({
    status: 'staged',
    candidateId: CANDIDATE_ID,
    revision: 1,
    lifecycle: 'staged',
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/lobby$/u, { timeout: 30_000 });

  const reloadAndConflict = await page.evaluate(async (candidateId) => {
    const serviceModulePath =
      '/src/services/book-activity/activityAuthoring.service.ts';
    const repositoryModulePath =
      '/src/services/book-activity/activityAuthoring.repository.ts';
    const { createActivityAuthoringService } =
      await import(/* @vite-ignore */ serviceModulePath);
    const { createActivityAuthoringRepository } =
      await import(/* @vite-ignore */ repositoryModulePath);
    const fixture = (
      window as typeof window & {
        __prd0062ActivityAuthoringFixture: (
          path: string,
          input?: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).__prd0062ActivityAuthoringFixture;
    const service = createActivityAuthoringService(
      createActivityAuthoringRepository({ mutate: fixture, read: fixture }),
    );
    const loaded = await service.loadCandidate(candidateId);
    try {
      await service.validate({
        candidateId,
        expectedRevision: loaded.candidate.revision - 1,
      });
      return { loaded, conflict: null };
    } catch (error) {
      return {
        loaded,
        conflict: error instanceof Error ? error.message : String(error),
      };
    }
  }, CANDIDATE_ID);
  expect(reloadAndConflict.loaded.candidate).toMatchObject({
    revision: 1,
    lifecycle: 'staged',
  });
  expect(reloadAndConflict.conflict).toContain('revision_conflict');

  const recoveredAndDiscarded = await page.evaluate(async (candidateId) => {
    const serviceModulePath =
      '/src/services/book-activity/activityAuthoring.service.ts';
    const repositoryModulePath =
      '/src/services/book-activity/activityAuthoring.repository.ts';
    const { createActivityAuthoringService } =
      await import(/* @vite-ignore */ serviceModulePath);
    const { createActivityAuthoringRepository } =
      await import(/* @vite-ignore */ repositoryModulePath);
    const fixture = (
      window as typeof window & {
        __prd0062ActivityAuthoringFixture: (
          path: string,
          input?: Record<string, unknown>,
        ) => Promise<unknown>;
      }
    ).__prd0062ActivityAuthoringFixture;
    const service = createActivityAuthoringService(
      createActivityAuthoringRepository({ mutate: fixture, read: fixture }),
    );
    const current = await service.loadCandidate(candidateId);
    const validated = await service.validate({
      candidateId,
      expectedRevision: current.candidate.revision,
    });
    const discarded = await service.discard({
      candidateId,
      expectedRevision: validated.revision,
    });
    const tombstone = await service.loadCandidate(candidateId);
    return { validated, discarded, tombstone };
  }, CANDIDATE_ID);

  expect(recoveredAndDiscarded.validated).toMatchObject({
    status: 'validated',
    revision: 2,
  });
  expect(recoveredAndDiscarded.discarded).toMatchObject({
    status: 'discarded',
    revision: 3,
  });
  expect(recoveredAndDiscarded.tombstone.candidate).toMatchObject({
    lifecycle: 'discarded',
    content: null,
  });
  expect(publishedState).toEqual(publishedBefore);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(
    `${ARTIFACT_DIR}/workflow.json`,
    `${JSON.stringify({
      ticket: '12C',
      issue: 35,
      role: 'teacher@test.com',
      baseUrl: 'http://localhost:5173',
      staged: staged.status,
      reloadedRevision: reloadAndConflict.loaded.candidate.revision,
      conflict: 'revision_conflict',
      recovered: recoveredAndDiscarded.validated.status,
      discarded: recoveredAndDiscarded.discarded.status,
      publishedStateUnchanged: true,
      proofBoundary:
        'Fixture-backed browser domain seam only; #59 owns live top-level route and identity integration.',
    }, null, 2)}\n`,
    'utf8',
  );
});
