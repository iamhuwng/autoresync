import { expect, test, type Page } from '@playwright/test';

const fixtureUrl = '/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture&strategy=components';

const signInAsStudent = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
};

const componentButtons = (page: Page) => page.locator(
  '[data-testid="book-runtime-component-selector"] button[data-component-id]',
);

test('student traverses only authorized components in immutable order', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=group-1&activity=activity-source&component=component-pdf-1&componentPage=2`, {
    waitUntil: 'networkidle',
  });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible();
  await expect(componentButtons(page)).toHaveCount(2);
  await expect(componentButtons(page).nth(0)).toHaveAttribute('data-component-id', 'component-pdf-1');
  await expect(componentButtons(page).nth(1)).toHaveAttribute('data-component-id', 'component-pdf-2');
  await expect(componentButtons(page).nth(0)).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Page in Component 1')).toHaveValue('2');
  await expect(page.getByText('Component: component-pdf-1')).toBeVisible();

  await componentButtons(page).nth(1).click();
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();
  await expect(page).toHaveURL(/component=component-pdf-2/u);
  await expect(page.getByLabel('Page in Component 2')).toHaveValue('1');
  await expect(page.getByText('Source: source-component-v2')).toBeVisible();

  await page.getByLabel('Page in Component 2').fill('2');
  await expect(page).toHaveURL(/componentPage=2/u);
  await expect(page.getByText('Component page: 2')).toBeVisible();

  await page.getByRole('button', { name: 'Previous Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Source detail' })).toBeVisible();
  await expect(page).toHaveURL(/component=component-pdf-1/u);
  await expect(page.getByLabel('Page in Component 1')).toHaveValue('2');

  await page.goto(`${fixtureUrl}&component=component-pdf-2&componentPage=2`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Written response' })).toBeVisible();
  await expect(page.getByLabel('Page in Component 2')).toHaveValue('2');
  await expect(page.getByText('Source: source-component-v2')).toBeVisible();

  expect(await page.locator('body').innerText()).not.toMatch(/(?:bucket|objectKey|provider|credential)/iu);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('component page state survives mobile layout, reload, zoom, and stale IDs fail closed', async ({ page }) => {
  await signInAsStudent(page);
  await page.goto(`${fixtureUrl}&pageGroup=group-1&activity=activity-source&component=component-pdf-1&componentPage=2`, {
    waitUntil: 'networkidle',
  });

  await page.getByRole('button', { name: 'Collapse page navigator' }).click();
  await page.setViewportSize({ width: 320, height: 812 });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    controls: [...document.querySelectorAll<HTMLElement>('[data-component-id], [aria-label^="Page in Component"]')]
      .map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.controls.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomWidth = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(zoomWidth.documentWidth).toBeLessThanOrEqual(zoomWidth.viewportWidth);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByLabel('Page in Component 1')).toHaveValue('2');
  await expect(page.getByRole('tab', { name: 'Book Page' })).toHaveAttribute('aria-selected', 'true');

  await page.goto(`${fixtureUrl}&component=component-secret&componentPage=99`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('book-runtime-component-selector')).toBeVisible();
  await expect(page.locator('[data-component-id="component-secret"]')).toHaveCount(0);
  await expect(page.getByLabel('Page in Component 1')).toHaveValue('1');
  await expect(page.getByText('Component: component-pdf-1')).toBeVisible();
});
