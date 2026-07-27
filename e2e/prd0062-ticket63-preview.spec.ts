import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-63/browser');

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

test('PRD0062 #63 keeps candidate preview local, accessible, and non-persistent', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket63-preview`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
  await expect(page.getByText('Ticket 63 fixture')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Candidate runtime preview' })).toBeVisible();
  await expect(page.getByText(/Preview answers stay in memory/u)).toBeVisible();
  await expect(page.getByText('Candidate source context: full page 2.')).toBeVisible();
  await expect(page.getByText('Use the candidate source context before choosing.')).toBeVisible();
  const preview = page.locator('.book-assembly-unit-preview');
  const answer = preview.getByRole('radio', { name: 'A', exact: true });
  await answer.focus();
  await page.keyboard.press('Space');
  await expect(answer).toBeChecked();
  await preview.getByRole('button', { name: 'Exit preview' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate runtime preview' })).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate runtime preview' })).toBeVisible();
  await expect(page.locator('.book-assembly-unit-preview').getByRole('radio', { name: 'A', exact: true })).not.toBeChecked();
  const exitHeight = await page.locator('.book-assembly-unit-preview').getByRole('button', { name: 'Exit preview' })
    .evaluate((element) => element.getBoundingClientRect().height);
  if (testInfo.project.name !== 'desktop-1440') expect(exitHeight).toBeGreaterThanOrEqual(44);
  const viewport = page.viewportSize();
  if (viewport) await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: viewport.height });
  const overflow = await page.locator('.book-assembly-workspace').evaluate((element) => {
    const viewportRight = element.getBoundingClientRect().right;
    return [...element.querySelectorAll<HTMLElement>('*')]
      .filter((child) => child.getBoundingClientRect().right > viewportRight + 1)
      .slice(0, 5)
      .map((child) => ({ className: child.className, tagName: child.tagName, text: child.innerText.slice(0, 80) }));
  });
  expect(overflow).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`), JSON.stringify({
    project: testInfo.project.name,
    route: `${ORIGIN}/__smoke/book-assembly?fixture=ticket63-preview`,
    proof: [
      'teacher quick-login local fixture',
      'candidate-scoped source-assisted shared runtime frame',
      'keyboard response selection and isolated response clear on exit/reload',
      'mobile 44px target and 200%-reflow overflow safety',
      'no canonical route, delivery, publication, or persistence claim',
    ],
    consoleErrors,
  }, null, 2));
});
