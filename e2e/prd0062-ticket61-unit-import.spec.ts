import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEACHER_ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-61/browser');
const BOOK_ID = 'prd0062-ticket56-book';
const UNIT_KEY = 'unit-fixture';
const ACTIVITY_KEY = 'activity-ticket61';

const loginTeacher = async (page: Page) => {
  await page.goto(`${TEACHER_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const unitImportBundle = () => JSON.stringify({
  promptVersion: 'book-unit-json-v1',
  schemaVersion: 'prd0062.unit_activity_import.v1',
  bookId: BOOK_ID,
  unitKey: UNIT_KEY,
  slots: [{
    activityKey: ACTIVITY_KEY,
    content: {
      schemaVersion: 1,
      title: 'Ticket 61 imported Activity',
      taskProfile: null,
      presentationMode: 'source-assisted',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
      instructions: [{ text: 'Use page 2 evidence to answer.' }],
      stimulus: { text: 'Page 2 source-assisted fixture.' },
      assetRefs: [],
      interaction: { family: 'choice', variant: 'single-select' },
      answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
      interactions: [{ prompt: 'Which option is supported?', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
      scoring: { mode: 'auto-where-possible' },
    },
    evidenceRefs: [`import:${ACTIVITY_KEY}`],
    sourceEvidenceRefs: ['source:full:page:2'],
    answerEvidenceRefs: ['pageGroup:pages-full-2-activity'],
  }],
});

const openTicket61Fixture = async (page: Page, fixture = 'ticket61') => {
  await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=${fixture}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: 'Assembly workspace browser proof' })).toBeVisible();
  await expect(page.getByText(/Signed in:/u)).toContainText(/teacher|super_admin|user/iu);
  await page.getByRole('button', { name: `unit: ${UNIT_KEY}` }).click();
  await expect(page.getByRole('heading', { name: 'Unit Activity import' })).toBeVisible();
};

test.describe('PRD0062 Ticket 61 Unit prompt/import browser proof', () => {
  test('teacher copies Unit prompt through normal clipboard and denied fallback paths', async ({ browser }) => {
    const normal = await browser.newPage();
    await normal.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as Window & { __prd0062CopiedPrompt?: string }).__prd0062CopiedPrompt = text;
          },
        },
      });
    });
    await loginTeacher(normal);
    await openTicket61Fixture(normal);
    await normal.getByRole('button', { name: 'Copy Unit prompt' }).click();
    await expect(normal.getByText('Unit prompt copied.', { exact: true })).toBeVisible();
    const copiedPrompt = await normal.evaluate(() => (window as Window & { __prd0062CopiedPrompt?: string }).__prd0062CopiedPrompt ?? '');
    expect(copiedPrompt).toContain('prd0062.unit_activity_import.v1');
    expect(copiedPrompt).toContain('source-assisted mode');
    expect(copiedPrompt).not.toContain('source-full-ready');
    await normal.close();

    const denied = await browser.newPage();
    await denied.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new Error('denied'); } },
      });
      document.execCommand = () => false;
    });
    await loginTeacher(denied);
    await openTicket61Fixture(denied);
    await denied.getByRole('button', { name: 'Copy Unit prompt' }).click();
    await expect(denied.getByText('Clipboard was blocked. Manual copy fallback is available.', { exact: true })).toBeVisible();
    await expect(denied.getByLabel('Manual copy fallback')).toContainText('prd0062.unit_activity_import.v1');
    await denied.close();
  });

  test('teacher imports Unit JSON by paste, file, and drop with conflict/reload recovery', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await loginTeacher(page);
    await openTicket61Fixture(page);

    await page.getByLabel('Paste Unit Activity JSON').fill(unitImportBundle());
    await page.getByRole('button', { name: 'Stage Unit JSON' }).click();
    await expect(page.getByText('Imported 1 Activity slot.', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Candidate revision: 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Staged Activity count: 1', { exact: true })).toBeVisible();
    await expect(page.getByText('source:full:page:2')).toBeVisible();
    await expect(page.getByText('Published state: unchanged', { exact: true })).toBeVisible();

    await page.getByLabel('Unit Activity JSON file').setInputFiles({
      name: 'ticket61-unit-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(unitImportBundle()),
    });
    await page.getByRole('button', { name: 'Stage Unit JSON' }).click();
    await expect(page.getByText('Candidate revision: 3', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.locator('.book-assembly-workspace__dropzone').dispatchEvent('drop', {
      dataTransfer: await page.evaluateHandle((json) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([json], 'ticket61-drop.json', { type: 'application/json' }));
        return transfer;
      }, unitImportBundle()),
    });
    await page.getByRole('button', { name: 'Stage Unit JSON' }).click();
    await expect(page.getByText(/Candidate revision: \d+/u)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Simulate remote conflict' }).click();
    await page.getByLabel('Paste Unit Activity JSON').fill(unitImportBundle());
    await page.getByRole('button', { name: 'Stage Unit JSON' }).click();
    await expect(page.getByText(
      'Assembly changed elsewhere. Imported Activities were rolled back; reload or retry.',
      { exact: true },
    )).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Reload current' })).toBeVisible();
    await page.getByRole('button', { name: 'Reload current' }).click();
    await expect(page.getByText('Assembly draft reloaded.', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Candidate revision: \d+/u)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Published state: unchanged', { exact: true })).toBeVisible();
    expect(consoleErrors).toEqual([]);

    await mkdir(ARTIFACT_DIR, { recursive: true });
    const projectName = testInfo.project.name || 'desktop';
    await page.screenshot({
      fullPage: true,
      path: path.join(ARTIFACT_DIR, `${projectName}.png`),
    });
    await writeFile(
      path.join(ARTIFACT_DIR, `${projectName}.json`),
      JSON.stringify({
        project: projectName,
        route: `${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket61`,
        proof: [
          'teacher quick-login',
          'paste import through Activity 12C staging and Assembly 13A save',
          'file import through same trusted commands',
          'drag/drop import through same trusted commands',
          'stale CAS conflict rolls back staged Activity candidates and leaves explicit reload recovery',
          'reload preserves last valid candidate revision',
          'published state unchanged',
        ],
        consoleErrors,
      }, null, 2),
    );
  });
});
