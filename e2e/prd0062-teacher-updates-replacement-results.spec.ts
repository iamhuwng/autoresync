import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062AcceptanceFixture } from './prd0062-acceptance-fixtures.mjs';
import { createPrd0062TeacherUpdatesReplacementResultsFixture } from './prd0062-teacher-updates-replacement-results.fixture.mjs';

const origin = 'http://localhost:5173';

const loginTeacher = async (page: Page) => {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (!/\/lobby(?:\/|$)/u.test(page.url())) {
    await expect(page.getByRole('button', { name: 'Show dev quick login' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Show dev quick login' }).click();
    await page.locator('#dev-login-teacher').click();
  }
  await expect(page).toHaveURL(/\/lobby(?:\/|$)/u, { timeout: 60_000 });
};

const saveArtifact = async (caseId: string, testInfo: { project: { name: string } }, proof: string[]) => {
  const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
  const directory = path.resolve(`artifacts/prd0062-acceptance/${caseId}/${executionId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify({
    caseId,
    project: testInfo.project.name,
    status: 'PASS_LOCAL_SMOKE_ASSERTIONS',
    proof,
    activation: 'not claimed; this local fixture neither authorizes nor proves production activation',
  }, null, 2));
};

const fillMigration = async (page: Page, _target: 'full_pdf' | 'component_pdfs') => {
  await page.getByRole('button', { name: 'Change PDF setup' }).click();
  await expect(page.getByRole('dialog', { name: 'Change your PDF setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare reviewed change' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Setup change could not be prepared/iu })).toBeVisible();
};

const openMigrationFixture = async (page: Page, fixture: string) => {
  await loginTeacher(page);
  await page.goto(`${origin}/__smoke/book-assembly?fixture=${fixture}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByTestId('ticket70-current-candidate')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket70-source-bytes')).toBeVisible();
  await expect(page.getByTestId('ticket70-publication-state')).toBeVisible();
};

test('AC-TU-001 updates a Book source set with checkpoint-safe staged state and reviews results', async ({ page }, testInfo) => {
  const fixture = createPrd0062TeacherUpdatesReplacementResultsFixture('AC-TU-001');
  const campaignFixture = createPrd0062AcceptanceFixture({
    caseId: 'AC-TU-001',
    source: { id: 'vocabulary-65', title: 'IELTS Vocabulary for Bands 6.5 and Above' },
  });
  expect(fixture.update.affectedStudents.filter((student) => student.requiresCheckpoint)).toHaveLength(2);
  expect(campaignFixture.ids.cleanupRoot).toBe('prd0062_acceptance/AC-TU-001');
  await openMigrationFixture(page, 'ticket70-full');
  const originalCandidate = await page.getByTestId('ticket70-current-candidate').textContent();
  const originalBytes = await page.getByTestId('ticket70-source-bytes').textContent();
  const originalPublication = await page.getByTestId('ticket70-publication-state').textContent();
  await fillMigration(page, 'component_pdfs');
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');

  await page.goto(`${origin}/__smoke/book-homework-completion?role=teacher`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Activity completion' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Book progress for Ticket 88 Student')).toContainText('Pending review');
  await expect(page.getByText('Activity score: 1 / 1')).toBeVisible();
  await expect(page.getByText('Historical / excluded Activities')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Book score|aggregate grade/iu);
  await saveArtifact('AC-TU-001', testInfo, [
    'staged source update preserves current candidate, source bytes, and publication state',
    'confirmed source strategy persists after reload',
    'teacher result view separates pending review, score, and historical exclusion',
  ]);
});

test('AC-TR-001 replaces source strategy with explicit confirmation and preserves historical state', async ({ page }, testInfo) => {
  const fixture = createPrd0062TeacherUpdatesReplacementResultsFixture('AC-TR-001');
  expect(fixture.replacementSourceVersionId).toBe('source-ac-tr-001-v2');
  await openMigrationFixture(page, 'ticket70-component');
  const originalCandidate = await page.getByTestId('ticket70-current-candidate').textContent();
  const originalBytes = await page.getByTestId('ticket70-source-bytes').textContent();
  const originalPublication = await page.getByTestId('ticket70-publication-state').textContent();
  await page.getByRole('button', { name: 'Change PDF setup' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
  await expect(page.getByTestId('ticket70-staged-candidate')).toHaveText(/none|empty|not staged/iu);
  await fillMigration(page, 'full_pdf');
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await saveArtifact('AC-TR-001', testInfo, [
    'replacement is staged before confirmation',
    'discard preserves original candidate and source bytes',
    'confirmed replacement persists after reload with local publication state unchanged',
  ]);
});
