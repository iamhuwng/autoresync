import { expect, test } from '@playwright/test';

const origin = 'http://localhost:5173';

test('teacher candidate preview uses one combined page map without component identity', async ({ page }) => {
  test.setTimeout(120_000);
  const documentRoutes: string[] = [];
  await page.route(/\/v1\/book-delivery\/teacher-assembly\/.*\/student-document\/\d+\/\d+$/u, async (route) => {
    documentRoutes.push(route.request().url());
    await route.fulfill({ status: 404, body: '{}' });
  });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby(?:\/|$)/u, { timeout: 60_000 });

  await page.goto(`${origin}/__smoke/book-assembly?fixture=ticket66-component-pdf&d1Preview=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Student Book preview' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(page.getByLabel('Combined book page')).toHaveValue('1');
  await page.getByRole('button', { name: 'Page Group 2' }).click();
  await expect(page.getByLabel('Combined book page')).toHaveValue('17');
  await expect(page.getByTestId('book-runtime-component-selector')).toHaveCount(0);
  expect(await page.getByTestId('book-runtime-shell').innerText()).not.toMatch(/source-component-a|source-component-b|providerObjectKey|bucket/iu);
  await expect.poll(() => documentRoutes.length).toBeGreaterThan(0);
  expect(documentRoutes.every((url) => !/source-component|\/component-a\/|\/component-b\//iu.test(url))).toBe(true);
});
