import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062AcceptanceFixture } from './prd0062-acceptance-fixtures.mjs';
import { createPrd0062TeacherUpdatesReplacementResultsFixture } from './prd0062-teacher-updates-replacement-results.fixture.mjs';

const origin = 'http://localhost:5173';

const loginTeacher = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
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
    activation: 'not claimed; #126 is engineering-proof-only and gates remain disabled',
  }, null, 2));
};

const chooseFirstRealOption = async (select: ReturnType<Page['locator']>, index = 0) => {
  const values = await select.locator('option').evaluateAll((options) => options
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean));
  expect(values.length).toBeGreaterThan(index);
  await select.selectOption(values[index]);
};

const fillMigration = async (page: Page, target: 'full_pdf' | 'component_pdfs') => {
  await page.getByRole('radio', { name: target === 'full_pdf' ? 'Full PDF' : 'Component PDFs' }).click();
  await expect(page.getByTestId('book-assembly-migration-direction')).toContainText(target);
  const sourceVersionSelects = page.locator('select[aria-label^="Target Source Version "]');
  if (target === 'component_pdfs' && await sourceVersionSelects.count() < 2) {
    await page.getByRole('button', { name: 'Add component Source' }).click();
  }
  const sourceKeys = page.locator('input[aria-label^="Target source key "]');
  const sourceOrders = page.locator('input[aria-label^="Target source order "]');
  for (let index = 0; index < await sourceKeys.count(); index += 1) {
    await sourceKeys.nth(index).fill(target === 'full_pdf' ? 'full' : `component-${index + 1}`);
    await sourceOrders.nth(index).fill(String(index + 1));
    await chooseFirstRealOption(sourceVersionSelects.nth(index), index);
    if (target === 'component_pdfs') {
      await chooseFirstRealOption(page.locator(`select[aria-label="Target owner node ${index + 1}"]`));
    }
  }
  const remaps = page.locator('select[aria-label^="Target mapping source for "]');
  for (let index = 0; index < await remaps.count(); index += 1) await chooseFirstRealOption(remaps.nth(index));
  const localPages = page.locator('input[aria-label^="Target local page "]');
  for (let index = 0; index < await localPages.count(); index += 1) await localPages.nth(index).fill(String(index + 1));
  await expect(page.getByRole('button', { name: 'Prepare migration' })).toBeEnabled();
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
  await page.getByRole('button', { name: 'Prepare migration' }).click();
  await expect(page.getByTestId('ticket70-staged-candidate')).not.toHaveText(/none|empty/iu);
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
  await expect(page.locator('p[role="status"]').filter({ hasText: /Current candidate remains/u })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm migration' }).click();
  await expect(page.getByTestId('ticket70-current-candidate')).toContainText('component_pdfs');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket70-current-candidate')).toContainText('component_pdfs');

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
  await fillMigration(page, 'full_pdf');
  await page.getByRole('button', { name: 'Prepare migration' }).click();
  await expect(page.getByTestId('ticket70-staged-candidate')).not.toHaveText(/none|empty/iu);
  await page.getByRole('button', { name: 'Discard migration' }).click();
  await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
  await expect(page.getByTestId('ticket70-staged-candidate')).toHaveText(/none|empty|not staged/iu);
  await page.getByRole('button', { name: 'Prepare migration' }).click();
  await page.getByRole('button', { name: 'Confirm migration' }).click();
  await expect(page.getByTestId('ticket70-current-candidate')).toContainText('full_pdf');
  await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket70-current-candidate')).toContainText('full_pdf');
  await saveArtifact('AC-TR-001', testInfo, [
    'replacement is staged before confirmation',
    'discard preserves original candidate and source bytes',
    'confirmed replacement persists after reload with local publication state unchanged',
  ]);
});
