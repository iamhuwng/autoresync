import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-68/browser');

const loginTeacher = async (page: Page) => {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const captureErrors = (page: Page) => {
  const errors = { console: [] as string[], page: [] as string[], request: [] as string[] };
  const ignorable = (value: string) => value.includes('@firebase/analytics') || value.includes('google-analytics');
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignorable(message.text())) errors.console.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (!ignorable(error.message)) errors.page.push(error.message);
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    const detail = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`;
    if (!ignorable(detail)) errors.request.push(detail);
  });
  return errors;
};

const openFixture = async (page: Page) => {
  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly-activity-revision?fixture=ticket68`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByRole('heading', { name: 'Revise one Activity safely' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket68-current-version-summary')).toContainText('activity-68-v1');
};

const replacement = {
  schemaVersion: 1,
  title: 'Source-assisted replacement',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Use the mapped source page to complete each item.' }],
  interaction: { family: 'text-entry', variant: 'fill-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: { kind: 'book-page-context', text: 'The mapped page supplies the context.' },
  assetRefs: [],
  interactions: [
    {
      prompt: 'I _____ here.',
      acceptedAnswers: ['have lived'],
      sourceAssisted: {
        questionLabel: 'Question 1',
        accessiblePrompt: 'Complete the sentence.',
        responseShape: 'short-text',
        sourceExerciseLabel: 'Exercise 1',
        sourcePartLabel: 'Part A',
      },
    },
    {
      prompt: 'She _____ early.',
      acceptedAnswers: ['arrived'],
      sourceAssisted: {
        questionLabel: 'Question 2',
        accessiblePrompt: 'Complete the sentence.',
        responseShape: 'short-text',
        sourceExerciseLabel: 'Exercise 1',
        sourcePartLabel: 'Part A',
      },
    },
  ],
  scoring: { mode: 'auto-where-possible' },
};

const saveArtifact = async (page: Page, name: string, errors: ReturnType<typeof captureErrors>, proof: string[]) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const project = test.info().project.name;
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${project}-${name}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${project}-${name}.json`), JSON.stringify({
    project,
    route: page.url(),
    viewport: page.viewportSize(),
    proof,
    errors,
  }, null, 2));
};

const assertNoErrors = (errors: ReturnType<typeof captureErrors>) => {
  expect(errors.console, 'console errors').toEqual([]);
  expect(errors.page, 'page errors').toEqual([]);
  expect(errors.request, 'request failures').toEqual([]);
};

test('PRD0062 #68 teacher imports, previews, publishes, and recovers one Activity revision', async ({ page }) => {
  const errors = captureErrors(page);
  await openFixture(page);
  await expect(page.getByTestId('ticket68-prompt')).toContainText('Current editable Activity JSON');
  await expect(page.getByTestId('ticket68-prompt')).toContainText('Manual-copy fallback');
  await expect(page.getByTestId('ticket68-prompt')).toContainText('source:full:page:4');
  await expect(page.getByTestId('ticket68-publish')).toBeDisabled();

  await page.getByTestId('ticket68-replacement-json').fill(JSON.stringify(replacement, null, 2));
  await page.getByTestId('ticket68-preview').click();
  await expect(page.getByTestId('ticket68-revision-state')).toHaveText('Preview ready');
  await expect(page.getByTestId('ticket68-candidate-state')).toHaveText('Candidate persistence: saved-and-reloadable');
  await expect(page.getByTestId('ticket68-impact')).toHaveText('redo-required');
  await expect(page.getByTestId('ticket68-publish')).toBeEnabled();

  await page.getByTestId('ticket68-publish').click();
  await expect(page.getByTestId('ticket68-current-version-summary')).toContainText('activity-68-v2');
  await expect(page.getByTestId('ticket68-version-history')).toContainText('activity-68-v1, activity-68-v2');
  await expect(page.getByTestId('ticket68-lineage')).toContainText('compatible Placement placement-68');
  await expect(page.getByTestId('ticket68-context-handoff')).toContainText('mapping does not override presentation mode');
  await expect(page.getByTestId('ticket68-publication-state')).toHaveText('Publication state: revised');

  await page.getByTestId('ticket68-reload').click();
  await expect(page.getByTestId('ticket68-candidate-state')).toHaveText('Candidate persistence: reloaded-current');
  await expect(page.getByTestId('ticket68-last-action')).toContainText('conflict_reloaded');
  assertNoErrors(errors);
  await saveArtifact(page, 'publish-conflict-recovery', errors, [
    'teacher quick-login',
    'complete editable replacement import with presentationMode correction',
    'manual-copy prompt includes current JSON and evidence references',
    'exact source-context preview precedes publish',
    'immutable old/new Activity Versions and compatible Placement lineage retained',
    'candidate reload/conflict recovery control',
  ]);
});

test('PRD0062 #68 revision controls remain usable on mobile at 200% zoom', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await openFixture(page);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByTestId('ticket68-replacement-json')).toBeVisible();
  await expect(page.getByTestId('ticket68-preview')).toBeVisible();
  await expect(page.getByTestId('ticket68-reload')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8);
  assertNoErrors(errors);
  await saveArtifact(page, 'mobile-200-zoom', errors, [
    'teacher quick-login',
    'mobile viewport 375x900',
    'revision editor and controls remain visible at 200% browser zoom',
    'no horizontal document overflow',
  ]);
});
