import { expect, test, type Page } from '@playwright/test';

const fixtureUrl = 'http://localhost:5174/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture&strategy=components';

const signInAsStudent = async (page: Page) => {
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
};

test('student navigates one combined document through source-free Page Groups', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=page-group-source&activity=activity-source&page=2`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Page Group 2' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Combined book page')).toHaveValue('2');
  await expect(page.getByText('Combined page: 2')).toBeVisible();

  await page.getByRole('button', { name: 'Page Group 3' }).click();
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();
  await expect(page.getByLabel('Combined book page')).toHaveValue('4');
  await page.getByLabel('Combined book page').selectOption('5');
  await expect(page).toHaveURL(/page=5/u);
  await expect(page.getByText('Combined page: 5')).toBeVisible();

  await page.getByRole('button', { name: 'Previous Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Source detail' })).toBeVisible();
  await expect(page.getByLabel('Combined book page')).toHaveValue('2');

  expect(await page.locator('body').innerText()).not.toMatch(/(?:bucket|objectKey|provider|credential|source-component-v)/iu);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('combined page state survives mobile layout and reload; stale page is rejected', async ({ page }) => {
  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=page-group-source&activity=activity-source&page=2`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Collapse page navigator' }).click();
  await page.setViewportSize({ width: 320, height: 812 });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomWidth = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(zoomWidth.documentWidth).toBeLessThanOrEqual(zoomWidth.viewportWidth);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByLabel('Combined book page')).toHaveValue('2');
  await expect(page.getByRole('tab', { name: 'Book Page' })).toHaveAttribute('aria-selected', 'true');

  await page.goto(`${fixtureUrl}&pageGroup=page-group-source&activity=activity-source&page=99`, { waitUntil: 'networkidle' });
  await expect(page.getByLabel('Combined book page')).toHaveValue('2');
  await expect(page.getByText('Combined page: 2')).toBeVisible();
});
